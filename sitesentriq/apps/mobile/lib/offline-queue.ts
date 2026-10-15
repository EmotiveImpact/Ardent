import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'

/**
 * Lightweight FIFO mutation queue for the field-engineer mobile app.
 *
 * Why this exists:
 *   The previous offline story was display-only — `useOffline` rendered a
 *   banner but the actual mutations (check-in, check-out, signature save,
 *   photo metadata insert) hit Supabase directly and silently failed when
 *   the device was offline. Engineers in basements, lifts, and rural sites
 *   were losing work.
 *
 * What this is:
 *   A small AsyncStorage-backed FIFO array of pending actions. When a write
 *   site detects we're offline (or simply wants to be safe), it calls
 *   `enqueue(action)` instead of touching Supabase. When NetInfo reports
 *   the device is online again, `drainOfflineQueue()` walks the queue and
 *   applies each action in order, removing successes and leaving failures
 *   for the next drain pass.
 *
 * What this is NOT:
 *   Not a full sync framework. No conflict resolution. No optimistic UI
 *   merge. Just the minimum to stop silent data loss for the four
 *   field-critical writes. Photo uploads are the one binary exception:
 *   we store the compressed image bytes as base64 and replay the storage
 *   upload before its queued metadata insert.
 *
 * Dependency rule:
 *   Database writes that truly need ACID semantics still use one transactional
 *   RPC (see failAccess). Cross-service workflows (Storage → Postgres, or
 *   Postgres → Edge Function) cannot share a database transaction, so they use
 *   one `sequence` entry. A sequence only advances in order and is removed only
 *   after every step succeeds; each step must therefore be replay-idempotent.
 *   This prevents a later dependent step landing when an earlier one failed.
 */

const STORAGE_KEY = 'haumea:offline-queue:v1'
// Poison actions (permanently failing — e.g. RLS reject after a role change, or
// a reference to a since-deleted row) are moved here after MAX_ATTEMPTS so they
// stop inflating pendingCount() / the OfflineBanner forever. Kept (capped) for
// diagnostics rather than silently dropped.
const DEAD_LETTER_KEY = 'haumea:offline-queue:deadletter:v1'
const MAX_ATTEMPTS = 8
const DEAD_LETTER_CAP = 50

export type OfflineActionKind = 'update' | 'insert' | 'storage_upload' | 'function_invoke' | 'rpc' | 'sequence'

interface OfflineActionBase {
  /** Stable client-generated id so we can dedupe + track retries. */
  id: string
  /** What to do. */
  kind: OfflineActionKind
  /** ISO timestamp of when the queue entry was created. */
  createdAt: string
  /** Number of failed drain attempts so far. */
  attempts: number
  /** Last error message, for debugging in the UI / Sentry later. */
  lastError?: string
}

export interface OfflineDbAction extends OfflineActionBase {
  kind: 'update' | 'insert'
  /** Postgres table name (public schema only). */
  table: string
  /** Insert row OR update patch. */
  payload: Record<string, unknown>
  /** For UPDATE: column -> value pairs that identify the row. */
  where?: Record<string, unknown>
}

export interface OfflineStorageUploadPayload {
  bucket: string
  path: string
  base64_data: string
  content_type: string
  metadata_insert?: {
    table: string
    payload: Record<string, unknown>
  }
}

export interface OfflineStorageUploadAction extends OfflineActionBase {
  kind: 'storage_upload'
  payload: OfflineStorageUploadPayload
}

/** Invoke a Supabase Edge Function once the queue drains (e.g. fire the
 *  customer completion email after an offline check-out's status update has
 *  synced). The function must be server-side idempotent — a replay may invoke
 *  it more than once. */
export interface OfflineFunctionInvokeAction extends OfflineActionBase {
  kind: 'function_invoke'
  /** Edge function slug. */
  fn: string
  /** JSON body passed to the function. */
  body: Record<string, unknown>
}

/** Call a Postgres RPC once the queue drains. This is THE mechanism for any
 *  write pair that must land atomically (e.g. failed-access = status update +
 *  reason note): one queue entry → one function call → one transaction, so the
 *  split-outcome failure mode of enqueueing two dependent actions can't occur.
 *  The function must be replay-idempotent — callers stamp row PKs (e.g.
 *  p_note_id) into `args` at enqueue time so a replayed call converges. */
export interface OfflineRpcAction extends OfflineActionBase {
  kind: 'rpc'
  /** Postgres function name (public schema). */
  fn: string
  /** Named arguments passed to supabase.rpc(). */
  args: Record<string, unknown>
}

export interface OfflineSequenceAction extends OfflineActionBase {
  kind: 'sequence'
  /** Ordered, replay-idempotent steps. Nested sequences are unnecessary. */
  actions: NewOfflineLeafAction[]
}

export type OfflineAction =
  | OfflineDbAction
  | OfflineStorageUploadAction
  | OfflineFunctionInvokeAction
  | OfflineRpcAction
  | OfflineSequenceAction

export type NewOfflineLeafAction =
  | Omit<OfflineDbAction, 'id' | 'createdAt' | 'attempts'>
  | Omit<OfflineStorageUploadAction, 'id' | 'createdAt' | 'attempts'>
  | Omit<OfflineFunctionInvokeAction, 'id' | 'createdAt' | 'attempts'>
  | Omit<OfflineRpcAction, 'id' | 'createdAt' | 'attempts'>

export type NewOfflineSequenceAction = Omit<OfflineSequenceAction, 'id' | 'createdAt' | 'attempts'>

/** What callers pass to enqueue (id/createdAt/attempts are assigned here).
 *  The Omit is distributed over each union member so `table`/`where`/`payload`
 *  stay correctly typed per kind (a plain Omit<union> would drop them). */
export type NewOfflineAction =
  | NewOfflineLeafAction
  | NewOfflineSequenceAction

let inFlightDrain: Promise<void> | null = null
const queueListeners = new Set<() => void>()

function notifyQueueListeners() {
  queueListeners.forEach(listener => listener())
}

export function subscribeOfflineQueue(listener: () => void): () => void {
  queueListeners.add(listener)
  return () => queueListeners.delete(listener)
}

// Serialize every read-modify-write queue mutation so concurrent enqueues (and
// the drain's re-write) can't clobber each other — that was silently dropping a
// field write during a rapid offline burst (photo + signature + check-out).
let queueLock: Promise<unknown> = Promise.resolve()
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueLock.then(fn, fn)
  queueLock = run.then(() => undefined, () => undefined)
  return run
}

async function readQueue(): Promise<OfflineAction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OfflineAction[]) : []
  } catch {
    return []
  }
}

async function writeQueue(items: OfflineAction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  notifyQueueListeners()
}

function newId(): string {
  // Crypto-quality not required — just collision-free in a single device's
  // queue. Date.now()+random is plenty for FIFO dedupe purposes.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// A v4-shaped UUID for use as a row PRIMARY KEY. We assign this client-side at
// enqueue time so a replayed insert (DB commit succeeded but the response was
// lost — the exact offline scenario) targets the same id and is rejected by the
// PK as a duplicate instead of creating a second row. Not cryptographically
// strong, but collision-free in practice for a single device's writes.
// Exported so callers building `rpc` actions can pre-stamp row PKs into args.
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// PostgREST surfaces a unique-violation as code 23505. On an insert REPLAY this
// means the row already landed on a previous attempt, so we treat it as success
// (the offline-queue's whole job is to make replays safe). We match on the code
// only — never on message text — so a test/business "unique constraint" message
// without the code is still correctly retried.
function isDuplicateKey(err: unknown): boolean {
  return !!(err && typeof err === 'object' && 'code' in err &&
    (err as { code?: unknown }).code === '23505')
}

function decodeBase64(base64Data: string): Uint8Array {
  const normalized = base64Data.includes(',')
    ? base64Data.slice(base64Data.indexOf(',') + 1)
    : base64Data

  const atobFn = (globalThis as { atob?: (value: string) => string }).atob
  if (typeof atobFn === 'function') {
    const binary = atobFn(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  const bufferCtor = (globalThis as {
    Buffer?: { from: (value: string, encoding: 'base64') => Uint8Array }
  }).Buffer
  if (bufferCtor) {
    return bufferCtor.from(normalized, 'base64')
  }

  throw new Error('No base64 decoder available')
}

export function base64ToBlob(base64Data: string, contentType: string): Blob {
  const bytes = decodeBase64(base64Data)
  // `bytes.buffer` is a plain ArrayBuffer (a valid BlobPart) — newer TS lib
  // types the generic Uint8Array as not-a-BlobPart directly.
  return new Blob([bytes.buffer as ArrayBuffer], { type: contentType })
}

async function applyAction(action: OfflineAction | NewOfflineAction): Promise<void> {
  if (action.kind === 'sequence') {
    for (const step of action.actions) await applyAction(step)
    return
  }
  if (action.kind === 'storage_upload') {
    const blob = base64ToBlob(action.payload.base64_data, action.payload.content_type)
    const { error } = await supabase.storage
      .from(action.payload.bucket)
      .upload(action.payload.path, blob, {
        contentType: action.payload.content_type,
        upsert: true,
      })
    if (error) throw error
    if (action.payload.metadata_insert) {
      const { error: insertError } = await supabase
        .from(action.payload.metadata_insert.table)
        .insert(action.payload.metadata_insert.payload)
      // Replay-safe: a duplicate-key means the metadata row already landed.
      if (insertError && !isDuplicateKey(insertError)) throw insertError
    }
    return
  }

  if (action.kind === 'insert') {
    const { error } = await supabase.from(action.table).insert(action.payload)
    // Replay-safe: a duplicate-key means this row already landed on an earlier
    // attempt (commit succeeded, response lost) — treat as success, not a dupe.
    if (error && !isDuplicateKey(error)) throw error
    return
  }

  if (action.kind === 'function_invoke') {
    // Fire-and-forget edge function (must be server-side idempotent — a replay
    // may invoke it again). Used e.g. for the customer completion email after an
    // offline check-out's status update has synced.
    const { error } = await supabase.functions.invoke(action.fn, { body: action.body })
    if (error) throw error
    return
  }

  if (action.kind === 'rpc') {
    // Atomic multi-write via a Postgres function — one transaction server-side.
    // The function is replay-idempotent (client-stamped PKs in args), so a
    // replayed call after a lost response converges instead of duplicating.
    const { error } = await supabase.rpc(action.fn, action.args)
    if (error) throw error
    return
  }

  // 'update' — must have a `where`
  if (!action.where || Object.keys(action.where).length === 0) {
    throw new Error('update action missing `where`')
  }
  let q = supabase.from(action.table).update(action.payload)
  for (const [col, val] of Object.entries(action.where)) {
    q = q.eq(col, val)
  }
  const { error } = await q
  if (error) throw error
}

function errorMessage(err: unknown): string {
  // Supabase errors arrive as plain `{ message, details, ... }` objects,
  // not Error instances. Pull `.message` first so we don't end up
  // persisting "[object Object]" and losing the useful debug clue.
  if (err instanceof Error) {
    return err.message
  }
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}

/**
 * Add an action to the back of the queue. Returns the assigned id.
 * Safe to call concurrently — AsyncStorage writes are atomic per key.
 */
export async function enqueue(action: NewOfflineAction): Promise<string> {
  const entry = {
    ...action,
    id: newId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
  } as OfflineAction

  // Stamp a deterministic row PRIMARY KEY on insert payloads (and the metadata
  // insert that follows a storage upload) so a replay is idempotent — see
  // uuidv4()/isDuplicateKey(). Updates are naturally idempotent (same patch,
  // same row) so they need no id. We never overwrite an id the caller supplied.
  function stampReplayIds(item: OfflineAction | NewOfflineAction) {
    if (item.kind === 'sequence') {
      item.actions.forEach(stampReplayIds)
    } else if (item.kind === 'insert') {
      if (item.payload && item.payload.id == null) item.payload.id = uuidv4()
    } else if (item.kind === 'storage_upload' && item.payload.metadata_insert) {
      const mi = item.payload.metadata_insert
      if (mi.payload && mi.payload.id == null) mi.payload.id = uuidv4()
    }
  }
  stampReplayIds(entry)
  // Read-modify-write under the lock so a concurrent enqueue can't clobber.
  await withQueueLock(async () => {
    const queue = await readQueue()
    queue.push(entry)
    await writeQueue(queue)
  })
  return entry.id
}

/**
 * Apply pending actions in order. Successes are removed. Failures stay
 * with `attempts++` so the next drain (next reconnect or next foreground)
 * tries again. Reentrancy-safe — concurrent calls share the same drain.
 */
export async function drainOfflineQueue(): Promise<void> {
  if (inFlightDrain) return inFlightDrain
  inFlightDrain = (async () => {
    try {
      const snapshot = await readQueue()
      if (snapshot.length === 0) return
      const succeeded = new Set<string>()
      const failed = new Map<string, OfflineAction>()
      const deadLettered: OfflineAction[] = []
      const deadLetteredIds = new Set<string>()
      for (const action of snapshot) {
        try {
          await applyAction(action)
          succeeded.add(action.id)
        } catch (err) {
          const bumped: OfflineAction = {
            ...action,
            attempts: action.attempts + 1,
            lastError: errorMessage(err),
          }
          if (bumped.attempts >= MAX_ATTEMPTS) {
            // Poison item — it has failed too many times to be transient. Move
            // it to the dead-letter store so it stops blocking pendingCount()
            // and the OfflineBanner can return to a clean state.
            deadLettered.push(bumped)
            deadLetteredIds.add(action.id)
          } else {
            failed.set(action.id, bumped)
            // Preserve FIFO across failures: if an older job update is waiting,
            // a newer direct/queued write must not leapfrog it.
            break
          }
        }
      }
      // Rebuild from the CURRENT queue under the lock: drop successes AND
      // dead-lettered poison items, bump failed attempts, and KEEP anything
      // enqueued mid-drain (no clobber). We deliberately don't clear upfront —
      // a crash mid-drain leaves the full queue (re-applied next launch) rather
      // than losing in-flight actions.
      await withQueueLock(async () => {
        const current = await readQueue()
        const next = current
          .filter((a) => !succeeded.has(a.id) && !deadLetteredIds.has(a.id))
          .map((a) => failed.get(a.id) ?? a)
        await writeQueue(next)
      })
      if (deadLettered.length > 0) {
        await withQueueLock(async () => {
          let dead: OfflineAction[] = []
          try {
            const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY)
            const parsed = raw ? JSON.parse(raw) : []
            if (Array.isArray(parsed)) dead = parsed as OfflineAction[]
          } catch {
            dead = []
          }
          // Newest-first, capped — old diagnostics matter less than recent ones.
          const merged = [...deadLettered, ...dead].slice(0, DEAD_LETTER_CAP)
          await AsyncStorage.setItem(DEAD_LETTER_KEY, JSON.stringify(merged))
          notifyQueueListeners()
        })
        for (const a of deadLettered) {
          console.warn(`[offline-queue] dropped poison action after ${a.attempts} attempts:`, a.lastError)
        }
      }
    } finally {
      inFlightDrain = null
    }
  })()
  return inFlightDrain
}

/** Attempt a complete action now, falling back to one durable queue entry. */
export async function applyOrEnqueue(action: NewOfflineAction): Promise<{ queued: boolean }> {
  try {
    await applyAction(action)
    return { queued: false }
  } catch {
    await enqueue(action)
    return { queued: true }
  }
}

/** How many actions are pending? Cheap — used by the OfflineBanner. */
export async function pendingCount(): Promise<number> {
  return (await readQueue()).length
}

/** Wipe the queue (and dead-letter store). Only used by sign-out / dev tools. */
export async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
  await AsyncStorage.removeItem(DEAD_LETTER_KEY)
  notifyQueueListeners()
}

/** How many poison actions have been dead-lettered? For diagnostics/dev tools. */
export async function deadLetterCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

export async function listPendingActions(): Promise<OfflineAction[]> {
  return readQueue()
}

export async function listDeadLetterActions(): Promise<OfflineAction[]> {
  try {
    const raw = await AsyncStorage.getItem(DEAD_LETTER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed as OfflineAction[] : []
  } catch {
    return []
  }
}

/** Move failed work back to the FRONT so newer writes cannot overtake it. */
export async function retryDeadLetters(): Promise<void> {
  await withQueueLock(async () => {
    const [dead, current] = await Promise.all([listDeadLetterActions(), readQueue()])
    if (dead.length === 0) return
    const revived = dead
      .slice()
      .reverse()
      .map(action => ({ ...action, attempts: 0, lastError: undefined }))
    await writeQueue([...revived, ...current])
    await AsyncStorage.removeItem(DEAD_LETTER_KEY)
    notifyQueueListeners()
  })
}
