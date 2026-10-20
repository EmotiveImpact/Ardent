// The one Connection both apps hold: live over HTTP, or the engine running in the app for demos.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { connectDemo, connectLive, demoPeople, type KeyValue } from '../src/connect.ts'
import { createEngine } from '../src/engine.ts'
import { nodePlatform } from '../src/platform-node.ts'
import { createServer } from '../src/server.ts'
import { memoryStore } from '../src/store.ts'
import { freshDemoData } from './helpers.ts'

const memory = (): KeyValue & { map: Map<string, string> } => {
  const map = new Map<string, string>()
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) }
}
const settle = () => new Promise((r) => setTimeout(r, 200))

test('demo: sign in, change things, keep them across a reload, reset', async () => {
  const storage = memory()
  const demo = await connectDemo(storage)
  assert.equal(await demo.restore(), undefined)
  await assert.rejects(demo.client.jobs.list(), { code: 'unauthenticated' })

  const jo = demoPeople.find((p) => p.role === 'office')!
  const me = await demo.signIn(jo.email, jo.password)
  assert.equal(me.role, 'office')
  assert.equal(me.organisation.name, 'Mercer Heating & Electrical')
  const before = (await demo.client.jobs.list()).length
  await demo.client.customers.create({ name: 'Demo Customer', kind: 'homeowner', phone: '07700 900000' })
  await settle()

  const again = await connectDemo(storage)
  assert.equal((await again.restore())?.user.email, jo.email, 'still signed in after a reload')
  assert.ok((await again.client.customers.list()).some((c) => c.name === 'Demo Customer'), 'changes kept')
  assert.equal((await again.client.jobs.list()).length, before)

  await again.reset!()
  assert.ok(!(await again.client.customers.list()).some((c) => c.name === 'Demo Customer'), 'back to the start')
  assert.equal((await again.restore())?.user.email, jo.email, 'reset keeps you signed in')

  await again.signOut()
  await assert.rejects(again.client.jobs.list(), { code: 'unauthenticated' })
})

test('demo: field sign-in only sees their own work', async () => {
  const demo = await connectDemo(memory())
  await demo.signIn('kofi@demo.ardent.local', 'ardent-demo')
  assert.deepEqual((await demo.client.jobs.list()).map((j) => j.id).sort(), ['job_0998', 'job_1022', 'job_1036', 'job_1040', 'job_1045'])
  assert.equal(((await demo.call('jobs.setStatus', ['job_1045', 'en_route'], 'r1')) as { status: string }).status, 'en_route')
  const note = { jobId: 'job_1045', operatorId: 'opr_02', body: 'Parking round the back', at: '2026-10-18T09:50:00Z' }
  const first = await demo.call('notes.add', [note], 'r2')
  assert.deepEqual(await demo.call('notes.add', [note], 'r2'), first, 'a replayed change lands once')
  assert.equal((await demo.client.notes.forJob('job_1045')).length, 1)
  await assert.rejects(demo.admin('addOperator', { name: 'New Starter', role: 'engineer', initials: 'NS', trades: [], registrations: [] }), { code: 'forbidden' })
})

test('live: sign in, restore from storage, sign out', async (t) => {
  const filesDir = mkdtempSync(join(tmpdir(), 'ardent-files-'))
  const server = createServer(createEngine(memoryStore(freshDemoData()), nodePlatform), { filesDir })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => {
    server.close()
    rmSync(filesDir, { recursive: true })
  })
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const storage = memory()
  const live = connectLive(baseUrl, storage)
  await assert.rejects(live.signIn('jo@demo.ardent.local', 'nope'), { code: 'unauthenticated' })
  const me = await live.signIn('jo@demo.ardent.local', 'ardent-demo')
  assert.equal(me.role, 'office')
  assert.ok((await live.client.jobs.list()).length > 5)
  assert.ok(((await live.admin<unknown[]>('members')) ?? []).length >= 5)

  const first = await live.call('customers.create', [{ name: 'Once Only', kind: 'homeowner', phone: '0161 000 0000' }], 'replay-1')
  const again = await live.call('customers.create', [{ name: 'Once Only', kind: 'homeowner', phone: '0161 000 0000' }], 'replay-1')
  assert.deepEqual(again, first, 'a replayed request is applied once')
  assert.equal((await live.client.customers.list()).filter((c) => c.name === 'Once Only').length, 1)

  const reopened = connectLive(baseUrl, storage)
  assert.equal((await reopened.restore())?.user.email, 'jo@demo.ardent.local')
  await reopened.signOut()
  assert.equal(await connectLive(baseUrl, storage).restore(), undefined)
})

test('the demo opens on today, keeping UK times across the clocks changing', async () => {
  const { shiftDemo } = await import('../src/seed.ts')
  const moved = shiftDemo({ start: '2026-10-18T08:30:00Z', due: '2026-10-30', note: 'not a date' }, '2026-11-02')
  assert.deepEqual(moved, { start: '2026-11-02T09:30:00Z', due: '2026-11-14', note: 'not a date' }, '09:30 BST becomes 09:30 GMT')
  const demo = await connectDemo(memory(), { today: '2026-11-02' })
  await demo.signIn('jo@demo.ardent.local', 'ardent-demo')
  const live = await demo.client.jobs.get('job_1042')
  assert.equal(live?.start.slice(0, 10), '2026-11-02')
})
