/**
 * The engine over HTTP, for Ardent Core (browser) and Ardent Field (phone).
 *
 *   POST /api/auth/login    { email, password }            -> { token, user, organisations }
 *   POST /api/auth/signup   { email, password, name, firm, slug }
 *   POST /api/auth/logout
 *   GET  /api/me
 *   POST /api/rpc           { method: "jobs.setStatus", args: [...], requestId? }
 *   PUT  /api/photos/:id/file   the image for a photo record (JPEG, PNG, WebP or HEIC, up to 12MB)
 *   GET  /files/photos/:id?exp&sig   a photo, through a signed link from admin.photoLink
 *
 * Everything except sign-in and signed photo links needs "Authorization:
 * Bearer <token>". x-ardent-org picks the firm (default: the person's first).
 *
 * Run it:  npm start   (from engine/; data in engine/.data/)
 * It listens on this machine only. ARDENT_PUBLIC=1 opens it to the local
 * network so a phone can reach it; there's no HTTPS yet, so only on a network
 * you trust.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEngine, type Engine, EngineError } from './engine.ts'
import { isRead } from './http-client.ts'
import { nodePlatform } from './platform-node.ts'
import { demoData, shiftDemo } from './seed.ts'
import { fileStore } from './store-file.ts'

const STATUS: Record<EngineError['code'], number> = { unauthenticated: 401, forbidden: 403, not_found: 404, invalid: 400 }
const MAX_JSON = 1_000_000
const MAX_PHOTO = 12_000_000
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }
const EXT_TYPES = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([t, e]) => [e, t]))

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new EngineError('invalid', 'request too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8') || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch (e) {
    if (e instanceof EngineError) throw e
    throw new EngineError('invalid', 'body is not JSON')
  }
}

export interface ServerOptions {
  /** Where photo files are kept. */
  filesDir: string
  /** Browser origins allowed to call the engine. Default: any localhost port. */
  allowOrigin?: (origin: string) => boolean
}

const localOrigin = (o: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(o)

export function createServer(engine: Engine, opts: ServerOptions): Server {
  const allowOrigin = opts.allowOrigin ?? localOrigin

  const bearer = (req: IncomingMessage) => /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1]
  const userFor = (req: IncomingMessage) => {
    const user = engine.userForToken(bearer(req))
    if (!user) throw new EngineError('unauthenticated', 'sign in first')
    return user
  }
  const sessionFor = (req: IncomingMessage) => {
    const user = userFor(req)
    const orgId = String(req.headers['x-ardent-org'] ?? engine.organisationsFor(user.id)[0]?.id ?? '')
    return { user, session: engine.as({ userId: user.id, orgId }) }
  }

  return createHttpServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && allowOrigin(origin)) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('access-control-allow-headers', 'content-type, authorization, x-ardent-org')
      res.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS')
      res.setHeader('vary', 'origin')
    }
    if (req.method === 'OPTIONS') return void res.writeHead(204).end()

    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const path = url.pathname
      const route = `${req.method} ${path}`

      if (route === 'GET /health') return send(res, 200, { ok: true })

      if (route === 'POST /api/auth/login') {
        const body = await readJson(req)
        return send(res, 200, engine.login(String(body.email ?? ''), String(body.password ?? '')))
      }
      if (route === 'POST /api/auth/signup') {
        const b = await readJson(req)
        return send(res, 200, engine.signUp({ email: String(b.email ?? ''), password: String(b.password ?? ''), name: String(b.name ?? ''), firm: String(b.firm ?? ''), slug: String(b.slug ?? '') }))
      }
      if (route === 'POST /api/auth/logout') {
        const token = bearer(req)
        if (token) engine.logout(token)
        return send(res, 200, { result: true })
      }
      if (route === 'GET /api/me') {
        const user = userFor(req)
        return send(res, 200, { user, organisations: engine.organisationsFor(user.id) })
      }

      if (route === 'POST /api/rpc') {
        const { user, session } = sessionFor(req)
        const body = await readJson(req)
        const method = typeof body.method === 'string' ? body.method : ''
        const [area, name] = method.split('.')
        const args = Array.isArray(body.args) ? body.args : []
        const group: Record<string, unknown> | undefined =
          area === 'admin' ? session.admin : Object.hasOwn(session.client, area) ? (session.client as never)[area] : undefined
        const fn = group && Object.hasOwn(group, name) ? group[name] : undefined
        if (typeof fn !== 'function') throw new EngineError('not_found', `no method ${method}`)

        const requestId = typeof body.requestId === 'string' && body.requestId && !isRead(method) ? `${user.id}:${body.requestId}` : undefined
        const before = requestId ? engine.recall(requestId) : undefined
        if (before) return send(res, 200, { result: before.result, replayed: true })
        const result = (await fn(...args)) ?? null
        if (requestId) engine.remember(requestId, result)
        return send(res, 200, { result })
      }

      const upload = /^\/api\/photos\/([\w-]+)\/file$/.exec(path)
      if (upload && req.method === 'PUT') {
        const { session } = sessionFor(req)
        const ext = IMAGE_TYPES[String(req.headers['content-type'] ?? '').split(';')[0].trim()]
        if (!ext) throw new EngineError('invalid', 'send a JPEG, PNG, WebP or HEIC image')
        const bytes = await readBody(req, MAX_PHOTO)
        if (!bytes.length) throw new EngineError('invalid', 'the image is empty')
        // Check permission before writing anything to disk.
        await session.admin.photoLink(upload[1])
        const { file, uri } = await session.admin.photoUploaded(upload[1], ext)
        const dest = join(opts.filesDir, file)
        mkdirSync(join(dest, '..'), { recursive: true })
        writeFileSync(`${dest}.tmp`, bytes)
        renameSync(`${dest}.tmp`, dest)
        return send(res, 200, { result: { uri } })
      }

      const link = /^\/files\/photos\/([\w-]+)$/.exec(path)
      if (link && req.method === 'GET') {
        const photo = engine.photoForLink(link[1], url.searchParams.get('exp') ?? '', url.searchParams.get('sig') ?? '')
        const dir = photo && join(opts.filesDir, photo.orgId)
        const file = dir && existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${photo!.id}.`)) : undefined
        if (!photo || !file) throw new EngineError('not_found', 'photo not found or link expired')
        res.writeHead(200, { 'content-type': EXT_TYPES[file.split('.').pop()!] ?? 'application/octet-stream', 'cache-control': 'private, max-age=3600' })
        return void createReadStream(join(dir!, file)).pipe(res)
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
  const open = process.env.ARDENT_PUBLIC === '1'
  const host = process.env.HOST ?? (open ? '0.0.0.0' : '127.0.0.1')
  const port = Number(process.env.PORT ?? 8787)
  const dataDir = process.env.ARDENT_DATA ?? fileURLToPath(new URL('../.data', import.meta.url))
  // A fresh data file opens on the demo firm, with its busy day moved to today (UK).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const engine = createEngine(fileStore(join(dataDir, 'ardent.json'), () => shiftDemo(demoData(nodePlatform), today)), nodePlatform)
  const allowOrigin = open ? () => true : undefined
  createServer(engine, { filesDir: join(dataDir, 'photos'), allowOrigin }).listen(port, host, () => {
    console.log(`Ardent engine on http://${host}:${port}  (data: ${dataDir})`)
    if (open) console.log('Open to the local network: plain HTTP, so only on a network you trust.')
    console.log('Demo sign-ins: dan@ / jo@ / kofi@ / ryan@ / tom@demo.ardent.local, password ardent-demo')
  })
}
