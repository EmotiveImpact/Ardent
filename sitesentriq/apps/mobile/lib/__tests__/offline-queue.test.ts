// Sprint 1.5 / H1 — Tests for the offline mutation queue.
//
// The queue itself is small but the failure modes (reentrancy, partial
// drains, malformed updates, AsyncStorage corruption) are exactly the
// kind of thing that bites in the field. Each test below exercises one
// of those paths in isolation.
//
// We mock both AsyncStorage and the supabase client so these tests run
// in plain Node — no Expo runtime, no network, no React Native.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------

// AsyncStorage: in-memory backing map keyed by storage key.
const storage = new Map<string, string>()

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key)
    }),
  },
}))

// Supabase: a programmable fake. Each test sets `nextResponses` to
// dictate what `.insert()` / `.update()` should return for the upcoming
// drain pass. The shape mimics the postgrest-js builder chain just
// enough for the queue's needs.
type FakeResponse = { error: { message: string; code?: string } | null }
const nextResponses: FakeResponse[] = []
const storageUploadResponses: FakeResponse[] = []
const rpcResponses: FakeResponse[] = []
const functionResponses: FakeResponse[] = []
const insertCalls: { table: string; payload: unknown }[] = []
const updateCalls: { table: string; payload: unknown; where: Record<string, unknown> }[] = []
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
const functionCalls: { fn: string; body: Record<string, unknown> }[] = []
const storageUploadCalls: {
  bucket: string
  path: string
  body: Blob
  options: { contentType?: string; upsert?: boolean }
}[] = []

vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    let pendingUpdate: unknown | null = null
    const where: Record<string, unknown> = {}
    const chain = {
      insert: vi.fn(async (payload: unknown) => {
        insertCalls.push({ table, payload })
        return nextResponses.shift() ?? { error: null }
      }),
      update: vi.fn((payload: unknown) => {
        pendingUpdate = payload
        return chain
      }),
      eq: vi.fn((col: string, val: unknown) => {
        where[col] = val
        // Return a thenable so `await q` after the final eq() resolves.
        return {
          ...chain,
          then: (resolve: (r: FakeResponse) => void) => {
            updateCalls.push({ table, payload: pendingUpdate, where: { ...where } })
            resolve(nextResponses.shift() ?? { error: null })
          },
        }
      }),
    }
    return chain
  }
  return {
    supabase: {
      from: vi.fn((table: string) => builder(table)),
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args })
        return rpcResponses.shift() ?? { error: null }
      }),
      functions: {
        invoke: vi.fn(async (fn: string, options: { body: Record<string, unknown> }) => {
          functionCalls.push({ fn, body: options.body })
          return functionResponses.shift() ?? { error: null }
        }),
      },
      storage: {
        from: vi.fn((bucket: string) => ({
          upload: vi.fn(async (
            path: string,
            body: Blob,
            options: { contentType?: string; upsert?: boolean },
          ) => {
            storageUploadCalls.push({ bucket, path, body, options })
            return storageUploadResponses.shift() ?? { error: null }
          }),
        })),
      },
    },
  }
})

// ---- Fresh module per test ------------------------------------------

// The queue holds an in-flight drain promise at module scope, so we
// reset modules between tests to start clean.
async function loadQueue() {
  vi.resetModules()
  return await import('../offline-queue')
}

beforeEach(() => {
  storage.clear()
  nextResponses.length = 0
  storageUploadResponses.length = 0
  rpcResponses.length = 0
  functionResponses.length = 0
  insertCalls.length = 0
  updateCalls.length = 0
  rpcCalls.length = 0
  functionCalls.length = 0
  storageUploadCalls.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---- Tests -----------------------------------------------------------

describe('offline-queue', () => {
  it('enqueue() returns an id and persists the action', async () => {
    const q = await loadQueue()
    const id = await q.enqueue({
      kind: 'insert',
      table: 'job_photos',
      payload: { job_id: 'j1', file_url: 'https://example/p.jpg' },
    })
    expect(id).toMatch(/^\d+-[a-z0-9]+$/)
    expect(await q.pendingCount()).toBe(1)
  })

  it('pendingCount() reflects multiple enqueues in FIFO order', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { id: '1' } })
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { id: '2' } })
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { id: '3' } })
    expect(await q.pendingCount()).toBe(3)
  })

  it('enqueue() persists storage uploads with base64 payloads', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'storage_upload',
      payload: {
        bucket: 'job-photos',
        path: 'job-photos/j1/local.jpg',
        base64_data: 'aGVsbG8=',
        content_type: 'image/jpeg',
      },
    })

    expect(await q.pendingCount()).toBe(1)
    const raw = storage.get('haumea:offline-queue:v1')!
    const arr = JSON.parse(raw) as Array<{ kind: string; payload: Record<string, string> }>
    expect(arr[0].kind).toBe('storage_upload')
    expect(arr[0].payload).toMatchObject({
      bucket: 'job-photos',
      path: 'job-photos/j1/local.jpg',
      content_type: 'image/jpeg',
    })
  })

  it('drain() uploads queued photo bytes before inserting metadata', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'storage_upload',
      payload: {
        bucket: 'job-photos',
        path: 'job-photos/j1/photo.jpg',
        base64_data: 'cGhvdG8tYnl0ZXM=',
        content_type: 'image/jpeg',
        metadata_insert: {
          table: 'job_photos',
          payload: { job_id: 'j1', file_url: 'https://example/photo.jpg' },
        },
      },
    })

    await q.drainOfflineQueue()

    expect(storageUploadCalls).toHaveLength(1)
    expect(storageUploadCalls[0]).toMatchObject({
      bucket: 'job-photos',
      path: 'job-photos/j1/photo.jpg',
      options: { contentType: 'image/jpeg', upsert: true },
    })
    expect(await storageUploadCalls[0].body.text()).toBe('photo-bytes')
    expect(insertCalls).toHaveLength(1)
    expect(insertCalls[0].table).toBe('job_photos')
    expect(await q.pendingCount()).toBe(0)
  })

  it('drain() preserves failed storage uploads for retry', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'storage_upload',
      payload: {
        bucket: 'job-photos',
        path: 'job-photos/j1/retry.jpg',
        base64_data: 'cmV0cnk=',
        content_type: 'image/jpeg',
      },
    })
    storageUploadResponses.push({ error: { message: 'network down' } })

    await q.drainOfflineQueue()

    expect(storageUploadCalls).toHaveLength(1)
    expect(await q.pendingCount()).toBe(1)
    const raw = storage.get('haumea:offline-queue:v1')!
    const arr = JSON.parse(raw) as { attempts: number; lastError: string }[]
    expect(arr[0].attempts).toBe(1)
    expect(arr[0].lastError).toContain('network down')
  })

  it('drain() does not insert photo metadata when the storage upload fails', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'storage_upload',
      payload: {
        bucket: 'job-photos',
        path: 'job-photos/j1/blocked.jpg',
        base64_data: 'YmxvY2tlZA==',
        content_type: 'image/jpeg',
        metadata_insert: {
          table: 'job_photos',
          payload: { job_id: 'j1', file_url: 'https://example/blocked.jpg' },
        },
      },
    })
    storageUploadResponses.push({ error: { message: 'storage timeout' } })

    await q.drainOfflineQueue()

    expect(insertCalls).toHaveLength(0)
    expect(await q.pendingCount()).toBe(1)
    const raw = storage.get('haumea:offline-queue:v1')!
    const arr = JSON.parse(raw) as Array<{ kind: string; attempts: number }>
    expect(arr[0]).toMatchObject({ kind: 'storage_upload', attempts: 1 })
  })

  it('drain() preserves the storage action when photo metadata insert fails', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'storage_upload',
      payload: {
        bucket: 'job-photos',
        path: 'job-photos/j1/metadata-fail.jpg',
        base64_data: 'bWV0YWRhdGE=',
        content_type: 'image/jpeg',
        metadata_insert: {
          table: 'job_photos',
          payload: { job_id: 'j1', file_url: 'https://example/metadata-fail.jpg' },
        },
      },
    })
    nextResponses.push({ error: { message: 'insert timeout' } })

    await q.drainOfflineQueue()

    expect(storageUploadCalls).toHaveLength(1)
    expect(insertCalls).toHaveLength(1)
    expect(await q.pendingCount()).toBe(1)
    const raw = storage.get('haumea:offline-queue:v1')!
    const arr = JSON.parse(raw) as Array<{ kind: string; attempts: number; lastError: string }>
    expect(arr[0]).toMatchObject({ kind: 'storage_upload', attempts: 1 })
    expect(arr[0].lastError).toContain('insert timeout')
  })

  it('drain() applies inserts in order and clears them on success', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'a' } })
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'b' } })

    await q.drainOfflineQueue()

    expect(insertCalls.map((c) => (c.payload as { tag: string }).tag)).toEqual(['a', 'b'])
    expect(await q.pendingCount()).toBe(0)
  })

  it('drain() applies updates with the supplied where clause', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'update',
      table: 'jobs',
      payload: { status: 'in_progress', actual_start: '2026-05-09T10:00:00Z' },
      where: { id: 'job-123' },
    })

    await q.drainOfflineQueue()

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].table).toBe('jobs')
    expect(updateCalls[0].where).toEqual({ id: 'job-123' })
    expect(updateCalls[0].payload).toMatchObject({ status: 'in_progress' })
    expect(await q.pendingCount()).toBe(0)
  })

  it('drain() leaves failed actions in the queue with attempts++', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'fail' } })
    nextResponses.push({ error: { message: 'transient network error' } })

    await q.drainOfflineQueue()

    expect(await q.pendingCount()).toBe(1)
    // Re-read the persisted action to verify attempts was incremented.
    const raw = storage.get('haumea:offline-queue:v1')!
    const arr = JSON.parse(raw) as { attempts: number; lastError: string }[]
    expect(arr[0].attempts).toBe(1)
    expect(arr[0].lastError).toContain('transient network error')
  })

  it('drain() stops at the first failure so newer writes cannot leapfrog it', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'ok-1' } })
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'fail' } })
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'ok-2' } })
    nextResponses.push({ error: null })
    nextResponses.push({ error: { message: 'unique constraint violation' } })
    nextResponses.push({ error: null })

    await q.drainOfflineQueue()

    expect(await q.pendingCount()).toBe(2)
    const raw = storage.get('haumea:offline-queue:v1')!
    const arr = JSON.parse(raw) as { payload: { tag: string } }[]
    expect(arr[0].payload.tag).toBe('fail')
    expect(arr[1].payload.tag).toBe('ok-2')
    expect(insertCalls.map((c) => (c.payload as { tag: string }).tag)).toEqual(['ok-1', 'fail'])
  })

  it('drain() rejects update actions missing a where clause', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'update',
      table: 'jobs',
      payload: { status: 'completed' },
      // No `where` — must not be allowed to wipe the table.
    })

    await q.drainOfflineQueue()

    // Action stays in the queue with the safety error recorded.
    expect(await q.pendingCount()).toBe(1)
    const raw = storage.get('haumea:offline-queue:v1')!
    const arr = JSON.parse(raw) as { lastError: string }[]
    expect(arr[0].lastError).toContain('missing `where`')
    // And no UPDATE was actually issued to supabase.
    expect(updateCalls).toHaveLength(0)
  })

  it('drain() is reentrancy-safe — concurrent calls share one drain', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'once' } })

    // Fire two drains in the same tick — both should resolve, but the
    // underlying insert must run exactly once.
    await Promise.all([q.drainOfflineQueue(), q.drainOfflineQueue()])

    expect(insertCalls).toHaveLength(1)
    expect(await q.pendingCount()).toBe(0)
  })

  it('clearOfflineQueue() wipes everything', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'x' } })
    await q.enqueue({ kind: 'insert', table: 'job_photos', payload: { tag: 'y' } })
    expect(await q.pendingCount()).toBe(2)

    await q.clearOfflineQueue()

    expect(await q.pendingCount()).toBe(0)
  })

  it('enqueue() stamps a deterministic row id on insert payloads (idempotency)', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'notes', payload: { content: 'hi' } })
    const raw = storage.get('haumea:offline-queue:v1')!
    const arr = JSON.parse(raw) as Array<{ payload: { id?: string } }>
    expect(arr[0].payload.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('enqueue() does not overwrite a caller-supplied id', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'notes', payload: { id: 'mine-123', content: 'hi' } })
    const arr = JSON.parse(storage.get('haumea:offline-queue:v1')!) as Array<{ payload: { id?: string } }>
    expect(arr[0].payload.id).toBe('mine-123')
  })

  it('enqueue() stamps an id on the storage_upload metadata insert', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'storage_upload',
      payload: {
        bucket: 'job-photos',
        path: 'job-photos/j1/x.jpg',
        base64_data: 'eA==',
        content_type: 'image/jpeg',
        metadata_insert: { table: 'job_photos', payload: { job_id: 'j1' } },
      },
    })
    const arr = JSON.parse(storage.get('haumea:offline-queue:v1')!) as Array<{
      payload: { metadata_insert?: { payload: { id?: string } } }
    }>
    expect(arr[0].payload.metadata_insert!.payload.id).toMatch(/^[0-9a-f]{8}-/)
  })

  it('drain() treats a duplicate-key (23505) replay as success, not a failure', async () => {
    const q = await loadQueue()
    await q.enqueue({ kind: 'insert', table: 'notes', payload: { content: 'replayed' } })
    // The row already landed on a previous attempt; Postgres rejects with 23505.
    nextResponses.push({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })

    await q.drainOfflineQueue()

    // Treated as success → removed from the queue (no duplicate row, no stuck item).
    expect(await q.pendingCount()).toBe(0)
  })

  it('drain() dead-letters a poison action after MAX_ATTEMPTS so it stops blocking the queue', async () => {
    const q = await loadQueue()
    // Seed an action that has already failed 7 times (one short of the cap of 8).
    storage.set(
      'haumea:offline-queue:v1',
      JSON.stringify([
        {
          id: 'poison-1',
          kind: 'insert',
          table: 'actions',
          payload: { id: '00000000-0000-4000-8000-000000000000', title: 'x' },
          createdAt: '2026-01-01T00:00:00Z',
          attempts: 7,
        },
      ]),
    )
    // A permanent failure (e.g. RLS reject) — NOT a duplicate-key, so it throws.
    nextResponses.push({ error: { message: 'permission denied for table actions' } })

    await q.drainOfflineQueue()

    // The 8th failure crosses MAX_ATTEMPTS → moved to dead-letter, queue is clean.
    expect(await q.pendingCount()).toBe(0)
    expect(await q.deadLetterCount()).toBe(1)
  })

  it('clearOfflineQueue() also wipes the dead-letter store', async () => {
    const q = await loadQueue()
    storage.set(
      'haumea:offline-queue:v1',
      JSON.stringify([
        { id: 'p', kind: 'insert', table: 'actions', payload: { id: 'a', title: 'x' }, createdAt: 'now', attempts: 7 },
      ]),
    )
    nextResponses.push({ error: { message: 'permission denied' } })
    await q.drainOfflineQueue()
    expect(await q.deadLetterCount()).toBe(1)

    await q.clearOfflineQueue()
    expect(await q.deadLetterCount()).toBe(0)
  })

  it('readQueue tolerates corrupted storage (returns empty)', async () => {
    storage.set('haumea:offline-queue:v1', 'not-valid-json{{{')
    const q = await loadQueue()
    // Should not throw, just behave as if the queue were empty.
    expect(await q.pendingCount()).toBe(0)
    await q.drainOfflineQueue()
    expect(insertCalls).toHaveLength(0)
  })

  // ---- rpc actions (transactional multi-write — see "Atomicity rule") ----

  it('drain() applies rpc actions and clears them on success', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'rpc',
      fn: 'record_failed_access',
      args: { p_job_id: 'j1', p_note_id: 'n1', p_note_content: 'Failed access — no answer', p_user_name: 'Eng' },
    })

    await q.drainOfflineQueue()

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('record_failed_access')
    expect(rpcCalls[0].args).toMatchObject({ p_job_id: 'j1', p_note_id: 'n1' })
    expect(await q.pendingCount()).toBe(0)
  })

  it('drain() keeps a failed rpc action intact with attempts++ — the status/note pair cannot split', async () => {
    // REGRESSION (BLOCKERS.md split-outcome): failAccess used to enqueue TWO
    // independent actions (jobs update + notes insert) which could diverge
    // across drain passes. As a single rpc action, a failure leaves ONE intact
    // unit — and crucially, no direct table writes ever happen client-side.
    const q = await loadQueue()
    await q.enqueue({
      kind: 'rpc',
      fn: 'record_failed_access',
      args: { p_job_id: 'j1', p_note_id: 'n1', p_note_content: 'Failed access — no answer', p_user_name: 'Eng' },
    })
    rpcResponses.push({ error: { message: 'network down' } })

    await q.drainOfflineQueue()

    // Zero direct jobs/notes writes — atomicity lives server-side.
    expect(updateCalls).toHaveLength(0)
    expect(insertCalls).toHaveLength(0)
    // The single action survives as a unit, ready for the next pass.
    expect(await q.pendingCount()).toBe(1)
    const arr = JSON.parse(storage.get('haumea:offline-queue:v1')!) as Array<{
      kind: string; attempts: number; lastError: string; args: Record<string, unknown>
    }>
    expect(arr[0]).toMatchObject({ kind: 'rpc', attempts: 1 })
    expect(arr[0].lastError).toContain('network down')
    expect(arr[0].args).toMatchObject({ p_job_id: 'j1', p_note_id: 'n1' })
  })

  it('drain() replays an rpc action with identical args (idempotency contract)', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'rpc',
      fn: 'record_failed_access',
      args: { p_job_id: 'j1', p_note_id: 'stamped-once', p_note_content: 'x', p_user_name: 'Eng' },
    })
    rpcResponses.push({ error: { message: 'response lost' } }) // pass 1 fails
    await q.drainOfflineQueue()
    await q.drainOfflineQueue() // pass 2 succeeds (default { error: null })

    expect(rpcCalls).toHaveLength(2)
    // Same p_note_id both times — the server's `on conflict (id) do nothing`
    // makes the replay converge instead of duplicating the note.
    expect(rpcCalls[0].args.p_note_id).toBe('stamped-once')
    expect(rpcCalls[1].args).toEqual(rpcCalls[0].args)
    expect(await q.pendingCount()).toBe(0)
  })

  it('drain() dead-letters a poison rpc action as a single unit', async () => {
    const q = await loadQueue()
    storage.set(
      'haumea:offline-queue:v1',
      JSON.stringify([
        {
          id: 'rpc-poison',
          kind: 'rpc',
          fn: 'record_failed_access',
          args: { p_job_id: 'deleted-job', p_note_id: 'n9', p_note_content: 'x', p_user_name: 'Eng' },
          createdAt: '2026-01-01T00:00:00Z',
          attempts: 7,
        },
      ]),
    )
    rpcResponses.push({ error: { message: 'job not found or not permitted' } })

    await q.drainOfflineQueue()

    // The whole unit dead-letters together — never half a failed-access.
    expect(await q.pendingCount()).toBe(0)
    expect(await q.deadLetterCount()).toBe(1)
  })

  it('sequence does not invoke completion email when the preceding job update fails', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'sequence',
      actions: [
        { kind: 'update', table: 'jobs', payload: { status: 'completed' }, where: { id: 'j1' } },
        { kind: 'function_invoke', fn: 'job-completion-email', body: { job_id: 'j1' } },
      ],
    })
    nextResponses.push({ error: { message: 'update failed' } })

    await q.drainOfflineQueue()

    expect(functionCalls).toHaveLength(0)
    expect(await q.pendingCount()).toBe(1)
  })

  it('sequence does not write a signature URL when its storage upload fails', async () => {
    const q = await loadQueue()
    await q.enqueue({
      kind: 'sequence',
      actions: [
        {
          kind: 'storage_upload',
          payload: { bucket: 'field-signatures', path: 'j1/eng.png', base64_data: 'eA==', content_type: 'image/png' },
        },
        { kind: 'update', table: 'jobs', payload: { engineer_signature_url: 'j1/eng.png' }, where: { id: 'j1' } },
      ],
    })
    storageUploadResponses.push({ error: { message: 'upload failed' } })

    await q.drainOfflineQueue()

    expect(updateCalls).toHaveLength(0)
    expect(await q.pendingCount()).toBe(1)
  })
})
