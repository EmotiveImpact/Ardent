/**
 * How Ardent HQ reaches the engine: a running engine over HTTP, or the same
 * engine inside the page on the demo firms, as connect.ts does for Core and
 * Field. Only Ardent staff can sign in.
 */
import type { HqClient, StaffMe, StaffRole } from '../../core/src/data/hq.ts'
import { demoStore, type KeyValue } from './connect.ts'
import { createEngine, EngineError, type ErrorCode } from './engine.ts'
import { HQ_METHODS } from './hq.ts'
import { signIn as httpSignIn } from './http-client.ts'
import { DEMO_PASSWORD } from './seed.ts'
import { staffUsers } from './seed-firms.ts'

export interface HqConnection {
  mode: 'live' | 'demo'
  /** Signed in already from an earlier visit? */
  restore(): Promise<StaffMe | undefined>
  signIn(email: string, password: string): Promise<StaffMe>
  signOut(): Promise<void>
  hq: HqClient
  /** For demo mode: every firm back as it started. */
  reset?(): Promise<void>
}

const TOKEN = 'ardent.hq.session'


/** Build an HqClient from one function that makes any call by name. */
function byName(call: (method: string, args: unknown[]) => Promise<unknown>): HqClient {
  const client: Record<string, unknown> = {}
  for (const m of HQ_METHODS) {
    const [area, name] = m.includes('.') ? m.split('.') : [undefined, m]
    const fn = (...args: unknown[]) => call(m, args)
    if (area) (client[area] ??= {} as Record<string, unknown>), ((client[area] as Record<string, unknown>)[name] = fn)
    else client[name] = fn
  }
  return client as unknown as HqClient
}

/** Calls made while signed out fail the same way in both modes. */
const signedOut = () => Promise.reject(new EngineError('unauthenticated', 'sign in first'))

/** A running engine over HTTP. */
export function connectHqLive(baseUrl: string, storage: KeyValue, doFetch?: typeof fetch): HqConnection {
  let token: string | undefined
  const send = async (method: string, args: unknown[]) => {
    if (!token) return signedOut()
    const res = await (doFetch ?? fetch)(`${baseUrl}/api/hq`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, args }),
    })
    const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: { code: ErrorCode; message: string } }
    if (!res.ok) throw new EngineError(body.error?.code ?? 'invalid', body.error?.message ?? `the engine said ${res.status}`)
    return body.result
  }
  const hq = byName(send)
  return {
    mode: 'live',
    async restore() {
      token = (await storage.get(TOKEN)) ?? undefined
      if (!token) return undefined
      try {
        return await hq.me()
      } catch (e) {
        if (e instanceof EngineError && (e.code === 'unauthenticated' || e.code === 'forbidden')) {
          token = undefined
          await storage.remove(TOKEN)
        }
        return undefined
      }
    },
    async signIn(email, password) {
      const s = await httpSignIn(baseUrl, email, password, doFetch)
      token = s.token
      try {
        const me = await hq.me()
        await storage.set(TOKEN, s.token)
        return me
      } catch (e) {
        token = undefined
        throw e
      }
    },
    async signOut() {
      if (token) await (doFetch ?? fetch)(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => undefined)
      token = undefined
      await storage.remove(TOKEN)
    },
    hq,
  }
}

/** Ardent's team in the demo, for a "try it as" picker. */
export const hqDemoPeople: { email: string; name: string; role: StaffRole; password: string }[] = staffUsers.map(({ email, name, role }) => ({ email, name, role, password: DEMO_PASSWORD }))

/** The engine inside the page, on the demo firms. */
export async function connectHqDemo(storage: KeyValue, opts: { today?: string } = {}): Promise<HqConnection> {
  const { store, fresh, save, platform } = await demoStore(storage, opts)
  let engine = createEngine(store, platform)
  let userId: string | undefined

  const open = (token: string) => {
    const user = engine.userForToken(token)
    if (!user || !engine.isStaff(user.id)) return undefined
    userId = user.id
    return engine.hq(user.id).me()
  }
  const hq = byName(async (method, args) => {
    if (!userId) return signedOut()
    const [area, name] = method.includes('.') ? method.split('.') : [undefined, method]
    const client = engine.hq(userId) as unknown as Record<string, unknown>
    const fn = (area ? (client[area] as Record<string, unknown>)[name] : client[name]) as (...a: unknown[]) => Promise<unknown>
    return fn(...args)
  })

  return {
    mode: 'demo',
    async restore() {
      const token = await storage.get(TOKEN)
      return token ? open(token) : undefined
    },
    async signIn(email, password) {
      const { token, user } = engine.login(email, password)
      if (!engine.isStaff(user.id)) {
        engine.logout(token)
        throw new EngineError('forbidden', 'Ardent HQ is for Ardent staff. Firms sign in to Ardent Core.')
      }
      await storage.set(TOKEN, token)
      return (await open(token))!
    },
    async signOut() {
      const token = await storage.get(TOKEN)
      if (token) engine.logout(token)
      userId = undefined
      await storage.remove(TOKEN)
    },
    hq,
    async reset() {
      const token = await storage.get(TOKEN)
      const who = token ? engine.userForToken(token) : undefined
      store.data = fresh()
      engine = createEngine(store, platform)
      await save()
      userId = undefined
      await storage.remove(TOKEN)
      if (who) {
        const { token: again } = engine.login(who.email, DEMO_PASSWORD)
        await storage.set(TOKEN, again)
        await open(again)
      }
    },
  }
}
