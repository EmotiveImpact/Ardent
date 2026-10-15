import { vi, type Mock } from 'vitest'

/**
 * Result returned by every terminal `.then()` / `await` on a Supabase query
 * builder. Tests configure this via `setResult` on the mock builder.
 */
export interface SupabaseResult<T = unknown> {
  data: T | null
  error: { message: string } | null
}

/**
 * Lightweight mock of a Supabase query builder that supports the common
 * chainable methods used in this codebase: `from`, `select`, `insert`,
 * `update`, `delete`, `eq`, `in`, `order`, `limit`, `range`, `single`,
 * `maybeSingle`, `match`, `or`, `gte`, `lte`, `not`, `ilike`.
 *
 * Each chainable returns `this` until you `await` (which resolves the
 * configured result). This mirrors the surface @supabase/supabase-js exposes
 * without bringing the whole client (and its WebSocket / fetch deps) into the
 * jsdom environment.
 *
 * Usage:
 *   const sb = createSupabaseMock()
 *   sb.setResult({ data: [{ id: '1' }], error: null })
 *   vi.mock('@/lib/supabase', () => ({ supabase: sb }))
 */
export interface SupabaseMockBuilder {
  from: Mock
  select: Mock
  insert: Mock
  update: Mock
  delete: Mock
  upsert: Mock
  eq: Mock
  neq: Mock
  in: Mock
  is: Mock
  match: Mock
  or: Mock
  ilike: Mock
  like: Mock
  gte: Mock
  lte: Mock
  gt: Mock
  lt: Mock
  not: Mock
  contains: Mock
  order: Mock
  limit: Mock
  range: Mock
  single: Mock
  maybeSingle: Mock
  then: Mock
  /** Configure the result the next awaited terminal will resolve with. */
  setResult: <T = unknown>(result: SupabaseResult<T>) => void
  /**
   * Configure a FIFO queue of results — each terminal call (single,
   * maybeSingle, then) shifts the next one off. Falls back to the
   * value last set by setResult once the queue is empty. Use this for
   * mutations that fire multiple sequential supabase calls.
   */
  queueResults: <T = unknown>(results: SupabaseResult<T>[]) => void
  /** Reset all mock call histories. */
  reset: () => void
}

export function createSupabaseMock(): SupabaseMockBuilder {
  let result: SupabaseResult = { data: null, error: null }
  // Queue of results consumed in FIFO order by terminal calls. When
  // empty, `result` (set by setResult) is used instead. This lets a
  // single mutation that hits supabase 4-5 times in sequence get a
  // tailored response per call without inventing a per-table dispatch.
  let queue: SupabaseResult[] = []

  const next = (): SupabaseResult => (queue.length > 0 ? queue.shift()! : result)

  // Lazy holder so `this`-returning methods always reference the same proxy.
  const builder = {} as SupabaseMockBuilder

  const chainable = (): SupabaseMockBuilder => builder

  builder.from = vi.fn(chainable)
  builder.select = vi.fn(chainable)
  builder.insert = vi.fn(chainable)
  builder.update = vi.fn(chainable)
  builder.delete = vi.fn(chainable)
  builder.upsert = vi.fn(chainable)
  builder.eq = vi.fn(chainable)
  builder.neq = vi.fn(chainable)
  builder.in = vi.fn(chainable)
  builder.is = vi.fn(chainable)
  builder.match = vi.fn(chainable)
  builder.or = vi.fn(chainable)
  builder.ilike = vi.fn(chainable)
  builder.like = vi.fn(chainable)
  builder.gte = vi.fn(chainable)
  builder.lte = vi.fn(chainable)
  builder.gt = vi.fn(chainable)
  builder.lt = vi.fn(chainable)
  builder.not = vi.fn(chainable)
  builder.contains = vi.fn(chainable)
  builder.order = vi.fn(chainable)
  builder.limit = vi.fn(chainable)
  builder.range = vi.fn(chainable)
  builder.single = vi.fn(() => Promise.resolve(next()))
  builder.maybeSingle = vi.fn(() => Promise.resolve(next()))

  // The builder is "thenable" — awaiting it resolves the next queued
  // result (or the sticky `result` if the queue is empty).
  builder.then = vi.fn((onFulfilled?: (v: SupabaseResult) => unknown) =>
    Promise.resolve(next()).then(onFulfilled),
  )

  builder.setResult = <T = unknown>(r: SupabaseResult<T>) => {
    result = r as SupabaseResult
  }

  builder.queueResults = <T = unknown>(rs: SupabaseResult<T>[]) => {
    queue = rs.slice() as SupabaseResult[]
  }

  builder.reset = () => {
    Object.values(builder).forEach(v => {
      if (typeof v === 'function' && 'mockClear' in (v as object)) {
        ;(v as Mock).mockClear()
      }
    })
    result = { data: null, error: null }
    queue = []
  }

  return builder
}

/**
 * Build a fully mocked Supabase client object suitable for `vi.mock` returning
 * `{ supabase }`. Includes the methods this app actually uses.
 */
export function createSupabaseClientMock() {
  const builder = createSupabaseMock()
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({
      data: { session: null, user: null },
      error: null,
    })),
    signUp: vi.fn(async () => ({
      data: { session: null, user: null },
      error: null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  }
  return {
    builder,
    client: {
      from: builder.from,
      auth,
      storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn() })) },
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
      removeChannel: vi.fn(),
    },
  }
}
