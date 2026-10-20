/**
 * ArdentClient over HTTP: what Ardent Core and Ardent Field swap in for the
 * mock to talk to a running engine. Errors come back as EngineError with the
 * engine's code (forbidden, not_found ...).
 */
import type { ArdentClient } from '../../core/src/data/client.ts'
import { EngineError, type ErrorCode } from './engine.ts'

export interface HttpClientOptions {
  /** e.g. http://127.0.0.1:8787 */
  baseUrl: string
  /** Who is signed in. Replaced by a sign-in token once sign-in lands. */
  email: string
  /** Which firm; defaults to the person's first. */
  orgId?: string
  fetch?: typeof fetch
}

const METHODS = {
  jobs: ['list', 'get', 'create', 'setStatus', 'addLine', 'removeLine', 'setCheck'],
  customers: ['list', 'get'],
  sites: ['get'],
  operators: ['list', 'me', 'setState'],
  time: ['start', 'stop', 'forJob'],
  photos: ['add', 'forJob'],
  notes: ['add', 'forJob'],
  quotes: ['forJob'],
  signatures: ['add', 'forJob'],
  invoices: ['forJob', 'create', 'send', 'recordPayment'],
} as const satisfies { [K in keyof ArdentClient]: readonly (keyof ArdentClient[K])[] }

export function createHttpClient(opts: HttpClientOptions): ArdentClient {
  const doFetch = opts.fetch ?? fetch
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-ardent-user': opts.email }
  if (opts.orgId) headers['x-ardent-org'] = opts.orgId

  async function call(method: string, args: unknown[]) {
    const res = await doFetch(`${opts.baseUrl}/api/rpc`, { method: 'POST', headers, body: JSON.stringify({ method, args }) })
    const body = (await res.json()) as { result?: unknown; error?: { code: ErrorCode; message: string } }
    if (!res.ok || body.error) throw new EngineError(body.error?.code ?? 'invalid', body.error?.message ?? `HTTP ${res.status}`)
    return body.result ?? undefined
  }

  return Object.fromEntries(
    Object.entries(METHODS).map(([area, names]) => [
      area,
      Object.fromEntries(names.map((name) => [name, (...args: unknown[]) => call(`${area}.${name}`, args)])),
    ]),
  ) as unknown as ArdentClient
}
