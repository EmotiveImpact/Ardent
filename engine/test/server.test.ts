// Core and Field talking to a running engine over HTTP.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { createEngine } from '../src/engine.ts'
import { adminCall, callEngine, type Connection, createHttpClient, photoLink, signIn, signOut, uploadPhoto } from '../src/http-client.ts'
import { nodePlatform } from '../src/platform-node.ts'
import { createServer } from '../src/server.ts'
import { memoryStore } from '../src/store.ts'
import { freshDemoData } from './helpers.ts'

async function start(t: TestContext) {
  const filesDir = mkdtempSync(join(tmpdir(), 'ardent-files-'))
  const engine = createEngine(memoryStore(freshDemoData()), nodePlatform)
  const server = createServer(engine, { filesDir })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => {
    server.close()
    rmSync(filesDir, { recursive: true })
  })
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const connect = async (email: string): Promise<Connection> => ({ baseUrl, token: (await signIn(baseUrl, email, 'ardent-demo')).token })
  return { baseUrl, engine, connect }
}

test('sign in, work, sign out', async (t) => {
  const { baseUrl, connect } = await start(t)
  await assert.rejects(signIn(baseUrl, 'kofi@demo.ardent.local', 'wrong-password'), { code: 'unauthenticated' })
  await assert.rejects(createHttpClient({ baseUrl, token: 'made-up' }).jobs.list(), { code: 'unauthenticated' })

  const kofiConn = await connect('kofi@demo.ardent.local')
  const kofi = createHttpClient(kofiConn)
  assert.deepEqual((await kofi.jobs.list()).map((j) => j.id).sort(), ['job_1036', 'job_1045'])
  assert.equal(await kofi.jobs.get('job_1042'), undefined)
  assert.equal((await kofi.jobs.setStatus('job_1045', 'on_site')).status, 'on_site')
  await assert.rejects(kofi.jobs.setStatus('job_1045', 'paid'), { code: 'forbidden' })

  const jo = createHttpClient(await connect('jo@demo.ardent.local'))
  assert.equal((await jo.jobs.get('job_1045'))?.status, 'on_site', 'the office sees the change')

  await signOut(kofiConn)
  await assert.rejects(kofi.jobs.list(), { code: 'unauthenticated' })
})

test('a retried change is applied once', async (t) => {
  const { connect } = await start(t)
  const conn = await connect('kofi@demo.ardent.local')
  const line = { kind: 'material', description: 'Seal kit', quantity: 1, unitPrice: 1500 }
  const first = (await callEngine(conn, 'jobs.addLine', ['job_1045', line], 'req-1')) as { lines: unknown[] }
  const again = (await callEngine(conn, 'jobs.addLine', ['job_1045', line], 'req-1')) as { lines: unknown[] }
  assert.equal(first.lines.length, 3)
  assert.equal(again.lines.length, 3)
  assert.equal((await createHttpClient(conn).jobs.get('job_1045'))?.lines.length, 3)
})

test('only real client methods can be called', async (t) => {
  const { baseUrl, connect } = await start(t)
  const { token } = (await connect('jo@demo.ardent.local')) as { token: string }
  for (const method of ['jobs.constructor', 'jobs.__proto__', 'nothing.here', 'admin.toString']) {
    const res = await fetch(`${baseUrl}/api/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, args: [] }),
    })
    assert.equal(res.status, 404, method)
  }
})

test('a new firm signs up and invites an engineer', async (t) => {
  const { baseUrl } = await start(t)
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'sam@holtandsons.test', password: 'long-enough-pw', name: 'Sam Holt', firm: 'Holt & Sons', slug: 'holt-sons' }),
  })
  const owner = (await res.json()) as { token: string; organisations: { role: string }[] }
  assert.equal(owner.organisations[0].role, 'owner')
  const conn = { baseUrl, token: owner.token }
  const op = await adminCall<{ id: string }>(conn, 'addOperator', { name: 'Lee Park', initials: 'LP', role: 'operator', trades: ['plumbing'], van: 'VX20 ABC', registrations: [] })
  await adminCall(conn, 'invite', { email: 'lee@holtandsons.test', name: 'Lee Park', role: 'field', password: 'temporary-pass', operatorId: op.id })
  const lee = createHttpClient({ baseUrl, token: (await signIn(baseUrl, 'lee@holtandsons.test', 'temporary-pass')).token })
  assert.equal((await lee.operators.me()).name, 'Lee Park')
  assert.deepEqual(await lee.jobs.list(), [])
})

test('photos upload against their record and show through expiring links', async (t) => {
  const { connect } = await start(t)
  const conn = await connect('kofi@demo.ardent.local')
  const kofi = createHttpClient(conn)
  const photo = await kofi.photos.add({ jobId: 'job_1045', operatorId: 'opr_02', stage: 'before', uri: 'file:///board.jpg', takenAt: '2026-10-18T10:05:00Z' })
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9])
  await assert.rejects(uploadPhoto(conn, photo.id, jpeg, 'text/plain'), { code: 'invalid' })
  assert.equal((await uploadPhoto(conn, photo.id, jpeg, 'image/jpeg')).uri, `ardent:photo/${photo.id}`)

  const tom = await connect('tom@demo.ardent.local')
  await assert.rejects(uploadPhoto(tom, photo.id, jpeg, 'image/jpeg'), { code: 'not_found' }, "Tom isn't on that job")
  await assert.rejects(photoLink(tom, photo.id), { code: 'not_found' })

  const jo = await connect('jo@demo.ardent.local')
  const link = await photoLink(jo, photo.id)
  const img = await fetch(link)
  assert.equal(img.status, 200)
  assert.equal(img.headers.get('content-type'), 'image/jpeg')
  assert.deepEqual(new Uint8Array(await img.arrayBuffer()), jpeg)
  assert.equal((await fetch(link.replace(/sig=[^&]+/, 'sig=forged'))).status, 404)
})
