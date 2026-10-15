/**
 * Tiny localStorage-backed offline action queue. Used by the field engineer
 * view to defer status updates and photo uploads when the device is offline.
 *
 * Each item carries a `kind` discriminator and a JSON-safe payload. The view
 * drains the queue when `online` events fire.
 */

export type QueuedAction =
  | { id: string; kind: 'job-status'; jobId: string; status: string; createdAt: number }
  // `rowId` is a stable, client-generated uuid stamped at enqueue time. The
  // drain keys both the storage object path and the job_photos row insert on it
  // so re-syncing the same queued photo is idempotent (no duplicate object/row).
  | { id: string; kind: 'job-photo'; jobId: string; fileDataUrl: string; fileName: string; mimeType: string; createdAt: number; rowId: string }

const KEY = 'haumea_field_offline_queue'

function read(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : []
  } catch {
    return []
  }
}

function write(items: QueuedAction[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* quota exhausted — silently drop */
  }
}

export function getQueue(): QueuedAction[] {
  return read()
}

type EnqueueInput =
  | { kind: 'job-status'; jobId: string; status: string }
  | { kind: 'job-photo'; jobId: string; fileDataUrl: string; fileName: string; mimeType: string }

function newRowId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    /* fall through to a non-crypto fallback */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function enqueue(action: EnqueueInput): QueuedAction {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  // Stamp a stable rowId for photos so a retried drain de-duplicates.
  const extra = action.kind === 'job-photo' ? { rowId: newRowId() } : {}
  const item = { ...action, ...extra, id, createdAt: Date.now() } as QueuedAction
  const next = [...read(), item]
  write(next)
  return item
}

export function removeFromQueue(id: string): void {
  write(read().filter((i) => i.id !== id))
}

export function clearQueue(): void {
  write([])
}

export function queueLength(): number {
  return read().length
}

/** Subscribe to queue size changes. Polls because storage events don't fire on same tab. */
export function subscribeQueue(listener: (count: number) => void): () => void {
  let last = queueLength()
  listener(last)
  const interval = window.setInterval(() => {
    const c = queueLength()
    if (c !== last) {
      last = c
      listener(c)
    }
  }, 1500)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener(queueLength())
  }
  window.addEventListener('storage', onStorage)
  return () => {
    window.clearInterval(interval)
    window.removeEventListener('storage', onStorage)
  }
}
