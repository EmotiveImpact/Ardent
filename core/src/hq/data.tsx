/**
 * Ardent HQ's line to the engine. One HqConnection for the whole app: a
 * running engine when VITE_ARDENT_ENGINE is set, otherwise the engine running
 * in the browser on the demo firms, which is what the published prototype uses.
 *
 * Screens read with useHqQuery and change things through useHq().hq.
 * Every change refreshes every query, so the whole screen agrees.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { connectHqDemo, connectHqLive, type HqConnection } from '@engine/connect-hq.ts'
import type { KeyValue } from '@engine/connect.ts'
import type { HqClient, StaffMe } from '@/data/hq'

const storage: KeyValue = {
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private window: the session lasts until the tab closes */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* nothing to remove */
    }
  },
}

const ENGINE = import.meta.env.VITE_ARDENT_ENGINE as string | undefined
let connecting: Promise<HqConnection> | undefined
const connection = () => (connecting ??= ENGINE ? Promise.resolve(connectHqLive(ENGINE, storage)) : connectHqDemo(storage))

type Phase = 'starting' | 'signed_out' | 'signed_in'

interface HqState {
  phase: Phase
  mode: HqConnection['mode']
  me?: StaffMe
  hq: HqClient
  signIn(email: string, password: string): Promise<StaffMe>
  signOut(): Promise<void>
  reset?: () => Promise<void>
  /** Bumped after every change, so queries reload. */
  version: number
  refresh(): void
}

const Ctx = createContext<HqState | null>(null)

/** The calls that change something; everything else only reads. */
const WRITES = new Set(['playbook.save', 'playbook.switch', 'playbook.discard', 'playbook.publish', 'shared.adopt', 'shared.decline'])

/** Wrap the client so every change bumps the version once it lands. */
function watched(client: HqClient, changed: () => void): HqClient {
  const wrap = (group: Record<string, unknown>, area: string): unknown =>
    new Proxy(group, {
      get: (g, name: string) => {
        const v = g[name]
        if (typeof v !== 'function') return v && typeof v === 'object' ? wrap(v as Record<string, unknown>, `${area}${name}.`) : v
        const fn = v as (...a: unknown[]) => Promise<unknown>
        if (!WRITES.has(`${area}${name}`)) return fn.bind(g)
        return async (...args: unknown[]) => {
          try {
            return await fn.apply(g, args)
          } finally {
            changed()
          }
        }
      },
    })
  return wrap(client as never, '') as HqClient
}

export function HqProvider({ children }: { children: ReactNode }) {
  const [conn, setConn] = useState<HqConnection>()
  const [phase, setPhase] = useState<Phase>('starting')
  const [me, setMe] = useState<StaffMe>()
  const [failed, setFailed] = useState<string>()
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let live = true
    connection()
      .then(async (c) => {
        const who = await c.restore().catch(() => undefined)
        if (!live) return
        setConn(c)
        setMe(who)
        setPhase(who ? 'signed_in' : 'signed_out')
      })
      .catch((e: unknown) => live && setFailed(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [])

  const value = useMemo<HqState | null>(() => {
    if (!conn) return null
    return {
      phase,
      mode: conn.mode,
      me,
      hq: watched(conn.hq, refresh),
      async signIn(email, password) {
        const who = await conn.signIn(email, password)
        setMe(who)
        setPhase('signed_in')
        refresh()
        return who
      },
      async signOut() {
        await conn.signOut()
        setMe(undefined)
        setPhase('signed_out')
      },
      reset: conn.reset
        ? async () => {
            await conn.reset!()
            setMe(await conn.restore())
            refresh()
          }
        : undefined,
      version,
      refresh,
    }
  }, [conn, phase, me, version, refresh])

  if (!value) return <Starting failed={failed} />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function Starting({ failed }: { failed?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className={failed ? 'caps text-muted' : 'caps animate-pulse text-faint'}>Ardent HQ</span>
      {failed && <span className="max-w-[46ch] text-[13px] text-muted">Could not reach the engine: {failed}</span>}
    </div>
  )
}

export function useHq() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useHq outside HqProvider')
  return v
}

/**
 * Read from the engine. Keeps the last answer on screen while it reloads, and
 * reloads after any change anywhere in the app.
 */
export function useHqQuery<T>(load: (hq: HqClient) => Promise<T>, deps: unknown[] = []) {
  const { hq, version, phase } = useHq()
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true })
  const loader = useRef(load)
  loader.current = load
  const key = JSON.stringify(deps)
  const last = useRef(key)
  useEffect(() => {
    if (phase !== 'signed_in') return
    let live = true
    // A different thing to load (another firm) starts empty; a refresh keeps the last answer up.
    const fresh = last.current !== key
    last.current = key
    setState((s) => (fresh ? { loading: true } : { ...s, loading: true }))
    loader
      .current(hq)
      .then((data) => live && setState({ data, loading: false }))
      .catch((error: Error) => live && setState((s) => ({ ...s, error, loading: false })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, phase, key])
  return state
}

/** Look again every so often while a screen is open: the field keeps moving. */
export function useEvery(ms: number) {
  const { refresh, phase } = useHq()
  useEffect(() => {
    if (phase !== 'signed_in') return
    const id = setInterval(refresh, ms)
    return () => clearInterval(id)
  }, [ms, refresh, phase])
}
