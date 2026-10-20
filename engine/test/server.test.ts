// Core and Field talking to a running engine over HTTP.
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { createEngine } from '../src/engine.ts'
import { createHttpClient } from '../src/http-client.ts'
import { demoData } from '../src/seed.ts'
import { createServer } from '../src/server.ts'
import { memoryStore } from '../src/store.ts'

test('the HTTP client behaves like the engine, rules included', async (t) => {
  const server = createServer(createEngine(memoryStore(demoData())))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => server.close())
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const kofi = createHttpClient({ baseUrl, email: 'kofi@demo.ardent.local' })
  assert.deepEqual((await kofi.jobs.list()).map((j) => j.id).sort(), ['job_1036', 'job_1045'])
  assert.equal(await kofi.jobs.get('job_1042'), undefined)
  assert.equal((await kofi.jobs.setStatus('job_1045', 'on_site')).status, 'on_site')
  await assert.rejects(kofi.jobs.setStatus('job_1045', 'paid'), { code: 'forbidden' })

  const jo = createHttpClient({ baseUrl, email: 'jo@demo.ardent.local' })
  assert.equal((await jo.jobs.get('job_1045'))?.status, 'on_site', 'the office sees the change')

  const stranger = createHttpClient({ baseUrl, email: 'nobody@example.com' })
  await assert.rejects(stranger.jobs.list(), { code: 'unauthenticated' })

  const res = await fetch(`${baseUrl}/api/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ardent-user': 'jo@demo.ardent.local' },
    body: JSON.stringify({ method: 'jobs.constructor', args: [] }),
  })
  assert.equal(res.status, 404, 'only real client methods can be called')

  const me: any = await (await fetch(`${baseUrl}/api/me`, { headers: { 'x-ardent-user': 'dan@demo.ardent.local' } })).json()
  assert.equal(me.organisations[0].role, 'owner')
})
