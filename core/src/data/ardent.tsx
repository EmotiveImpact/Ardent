/**
 * Ardent Core's line to the engine. One Connection for the whole app:
 * a running engine when VITE_ARDENT_ENGINE is set (e.g. http://127.0.0.1:8787),
 * otherwise the engine running in the browser on the demo firm, which is what
 * the published prototype uses.
 *
 * Screens read with useQuery and change things through useArdent().client.
 * Every change refreshes every query, so the whole screen agrees.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { connectDemo, connectLive, type Connection, type KeyValue, type Me } from '@engine/connect.ts'
import { isRead } from '@engine/http-client.ts'
import type { ArdentClient } from './client'

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
let connecting: Promise<Connection> | undefined
const connection = () => (connecting ??= ENGINE ? Promise.resolve(connectLive(ENGINE, storage)) : connectDemo(storage))

type Phase = 'starting' | 'signed_out' | 'signed_in'

interface ArdentState {
  phase: Phase
  mode: Connection['mode']
  me?: Me
  client: ArdentClient
  admin: Connection['admin']
  signIn(email: string, password: string): Promise<Me>
  signOut(): Promise<void>
  reset?: () => Promise<void>
  /** Bumped after every change, so queries reload. */
  version: number
  refresh(): void
}

const Ctx = createContext<ArdentState | null>(null)

/** Wrap a client so every change bumps the version once it lands. */
function watched(client: ArdentClient, changed: () => void): ArdentClient {
  return new Proxy(client, {
    get: (target, area: string) => {
      const group = (target as never as Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>)[area]
      return new Proxy(group, {
        get: (g, name: string) =>
          isRead(`${area}.${name}`)
            ? g[name]
            : async (...args: unknown[]) => {
                try {
                  return await g[name](...args)
                } finally {
                  changed()
                }
              },
      })
    },
  })
}

export function ArdentProvider({ children }: { children: ReactNode }) {
  const [conn, setConn] = useState<Connection>()
  const [phase, setPhase] = useState<Phase>('starting')
  const [me, setMe] = useState<Me>()
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
      .catch(() => live && setPhase('signed_out'))
    return () => {
      live = false
    }
  }, [])

  // A live engine is shared with the field, so look again every 20 seconds.
  useEffect(() => {
    if (conn?.mode !== 'live' || phase !== 'signed_in') return
    const id = setInterval(refresh, 20_000)
    return () => clearInterval(id)
  }, [conn, phase, refresh])

  const value = useMemo<ArdentState | null>(() => {
    if (!conn) return null
    return {
      phase,
      mode: conn.mode,
      me,
      client: watched(conn.client, refresh),
      admin: async (name, ...args) => {
        try {
          return await conn.admin(name, ...args)
        } finally {
          if (!/^(members|role|photoLink)$/.test(name)) refresh()
        }
      },
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

  if (!value) return <Starting />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function Starting() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="caps animate-pulse text-faint">Ardent</span>
    </div>
  )
}

export function useArdent() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useArdent outside ArdentProvider')
  return v
}

/**
 * Read from the engine. Keeps the last answer on screen while it reloads, and
 * reloads after any change anywhere in the app.
 */
export function useQuery<T>(load: (client: ArdentClient) => Promise<T>, deps: unknown[] = []) {
  const { client, version, phase } = useArdent()
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true })
  const loader = useRef(load)
  loader.current = load
  useEffect(() => {
    if (phase !== 'signed_in') return
    let live = true
    setState((s) => ({ ...s, loading: true }))
    loader
      .current(client)
      .then((data) => live && setState({ data, loading: false }))
      .catch((error: Error) => live && setState((s) => ({ ...s, error, loading: false })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, phase, ...deps])
  return state
}

/** Everything most screens need at once: the firm's records, loaded together. */
export function useBook() {
  return useQuery(async (c) => {
    const [jobs, customers, sites, operators, invoices, quotes, certificates] = await Promise.all([
      c.jobs.list(),
      c.customers.list(),
      c.sites.list(),
      c.operators.list(),
      c.invoices.list(),
      c.quotes.list(),
      c.certificates.list(),
    ])
    return { jobs, customers, sites, operators, invoices, quotes, certificates }
  })
}

export type Book = NonNullable<ReturnType<typeof useBook>['data']>

export const byId = <T extends { id: string }>(list: T[] | undefined, id: string | undefined) => (id ? list?.find((x) => x.id === id) : undefined)
