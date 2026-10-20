/**
 * The engine over HTTP, so Ardent Core (browser) and Ardent Field (phone)
 * can reach it. One route carries every call:
 *
 *   POST /api/rpc   { "method": "jobs.setStatus", "args": ["job_1045", "on_site"] }
 *   GET  /api/me    who you are and which firms you belong to
 *
 * Methods are the ArdentClient methods (jobs.list, invoices.recordPayment ...)
 * plus admin.* for firm admin.
 *
 * Sign-in is not built yet. Until it is, the caller names themselves in an
 * x-ardent-user header (their email) and picks a firm with x-ardent-org.
 * That is only safe on your own machine, so the server listens on localhost
 * only and refuses to start otherwise.
 *
 * Run it:  npm start   (from engine/; data is kept in engine/.data/ardent.json)
 */
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createEngine, type Engine, EngineError } from './engine.ts'
import { demoData } from './seed.ts'
import { fileStore } from './store.ts'

const STATUS: Record<EngineError['code'], number> = { unauthenticated: 401, forbidden: 403, not_found: 404, invalid: 400 }
const MAX_BODY = 1_000_000
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new EngineError('invalid', 'request too large')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new EngineError('invalid', 'body is not JSON')
  }
}

export function createServer(engine: Engine): Server {
  const userFor = (req: IncomingMessage) => {
    const email = String(req.headers['x-ardent-user'] ?? '').trim().toLowerCase()
    const user = engine.data.users.find((u) => u.email === email)
    if (!user) throw new EngineError('unauthenticated', 'sign in first')
    return user
  }

  return createHttpServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && LOCAL_ORIGIN.test(origin)) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('access-control-allow-headers', 'content-type, x-ardent-user, x-ardent-org')
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    }
    if (req.method === 'OPTIONS') return void res.writeHead(204).end()

    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true })

      if (req.method === 'GET' && url.pathname === '/api/me') {
        const user = userFor(req)
        return send(res, 200, { user, organisations: engine.organisationsFor(user.id) })
      }

      if (req.method === 'POST' && url.pathname === '/api/rpc') {
        const user = userFor(req)
        const body = (await readJson(req)) as { method?: unknown; args?: unknown }
        const [area, name] = typeof body.method === 'string' ? body.method.split('.') : []
        const args = Array.isArray(body.args) ? body.args : []
        const orgId = String(req.headers['x-ardent-org'] ?? engine.organisationsFor(user.id)[0]?.id ?? '')
        const session = engine.as({ userId: user.id, orgId })
        const group: Record<string, unknown> | undefined =
          area === 'admin' ? session.admin : Object.hasOwn(session.client, area) ? (session.client as never)[area] : undefined
        const fn = group && Object.hasOwn(group, name) ? group[name] : undefined
        if (typeof fn !== 'function') throw new EngineError('not_found', `no method ${String(body.method)}`)
        const result = await fn(...args)
        return send(res, 200, { result: result ?? null })
      }

      send(res, 404, { error: { code: 'not_found', message: 'no such route' } })
    } catch (e) {
      if (e instanceof EngineError) return send(res, STATUS[e.code], { error: { code: e.code, message: e.message } })
      console.error(e)
      send(res, 500, { error: { code: 'internal', message: 'something went wrong' } })
    }
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST ?? '127.0.0.1'
  const port = Number(process.env.PORT ?? 8787)
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    console.error('The engine has no sign-in yet, so it only listens on this machine (HOST=127.0.0.1).')
    process.exit(1)
  }
  const path = process.env.ARDENT_DATA ?? fileURLToPath(new URL('../.data/ardent.json', import.meta.url))
  const engine = createEngine(fileStore(path, demoData))
  createServer(engine).listen(port, host, () => {
    console.log(`Ardent engine on http://${host}:${port}  (data: ${path})`)
    console.log('Demo sign-ins: dan@ / jo@ / kofi@ / ryan@ / tom@demo.ardent.local')
  })
}
