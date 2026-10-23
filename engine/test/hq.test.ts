// Ardent HQ: Ardent's own team looking after every firm.
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { connectHqDemo, connectHqLive } from '../src/connect-hq.ts'
import type { KeyValue } from '../src/connect.ts'
import { createServer } from '../src/server.ts'
import { demo } from './helpers.ts'

const memory = (): KeyValue => {
  const m = new Map<string, string>()
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) }
}

test('only Ardent staff get HQ; firms never do', async () => {
  const { engine } = demo()
  assert.equal(engine.isStaff('usr_edem'), true)
  assert.equal(engine.isStaff('usr_dan'), false)
  await assert.rejects(engine.hq('usr_dan').overview(), { code: 'forbidden' })
  assert.equal((await engine.hq('usr_edem').me()).role, 'admin')
  // Staff aren't members of any firm, so Core shows them nothing.
  assert.deepEqual(engine.organisationsFor('usr_edem'), [])
})

test('the overview: every firm, how each is doing, and what needs Ardent', async () => {
  const { engine } = demo()
  const o = await engine.hq('usr_edem').overview()
  assert.equal(o.totals.firms, 4)
  assert.equal(o.totals.live, 3)
  assert.equal(o.totals.settingUp, 1)
  const by = Object.fromEntries(o.firms.map((f) => [f.id, f]))
  assert.equal(by.org_hollins.health.label, 'Sync failing')
  assert.match(by.org_hollins.health.note, /2 phones have not synced since 07:40: Connor and Jake/)
  assert.equal(by.org_ashby.health.label, 'Near AI cap')
  assert.equal(by.org_calder.health.label, 'Setting up')
  assert.equal(by.org_demo.health.tone, 'ok')
  // £299 with 5 engineers in; Hollins has 6, Ashby has Ardent Voice.
  assert.equal(by.org_hollins.bill.total, 29900 + 3500)
  assert.equal(by.org_ashby.bill.total, 29900 + 9900)
  assert.equal(o.totals.monthly, by.org_demo.bill.total + by.org_hollins.bill.total + by.org_ashby.bill.total, 'firms setting up pay nothing yet')
  assert.ok(o.needs.some((n) => n.go === 'shared' && /2 questions shared/.test(n.title)))
  assert.ok(o.needs.some((n) => n.firmId === 'org_hollins' && n.tone === 'bad'))
})

test('the live board has every firm\'s jobs and vans on the map, or one firm\'s', async () => {
  const { engine } = demo()
  const hq = engine.hq('usr_edem')
  const all = await hq.live()
  const firms = new Set(all.jobs.map((j) => j.firmId))
  for (const f of ['org_hollins', 'org_ashby']) assert.ok(firms.has(f), `${f} on the board`)
  assert.ok(all.jobs.every((j) => Number.isFinite(j.lat) && Number.isFinite(j.lng) && j.area))
  assert.ok(!firms.has('org_calder'), 'Calder starts in a fortnight')
  const connor = all.vans.find((v) => v.name === 'Connor Walsh')!
  assert.equal(connor.from, 'van')
  assert.equal(all.vans.some((v) => v.firmId === 'org_calder'), false, 'off shift vans are not on the map')
  const emergency = all.jobs.find((j) => j.ref === 'J-2145')!
  assert.match(emergency.flag!, /Emergency, 14 min away/)
  const one = await hq.live('org_ashby')
  assert.ok(one.jobs.length && one.jobs.every((j) => j.firmId === 'org_ashby'))
  await assert.rejects(hq.live('org_nobody'), { code: 'not_found' })
})

test('opening a firm\'s account shows everything and is written in the firm\'s own log', async () => {
  const { engine, as } = demo()
  const hq = engine.hq('usr_edem')
  const account = await hq.firm('org_demo')
  assert.ok(account.jobs.length > 5 && account.operators.length && account.customers.length)
  assert.ok(!('orgId' in account.jobs[0]), 'records leave the engine without their firm id')
  await hq.firm('org_demo')
  const seen = (await as('dan').client.log.list()).filter((e) => /Ardent support \(Edem\) opened your account/.test(e.summary))
  assert.equal(seen.length, 1, 'once an hour, not on every look')
  assert.equal((await as('dan').client.log.list()).filter((e) => e.action === 'hq.opened').length, 1)
})

test('the playbook: change it in a draft, publish to every firm, phones get it', async () => {
  const { engine, as } = demo()
  const hq = engine.hq('usr_edem')
  let p = await hq.playbook.get()
  assert.equal(p.version, 1)
  assert.equal(p.draft, null)
  assert.equal(p.rules.length, 16)

  p = await hq.playbook.switch('benchmark', false)
  assert.deepEqual(p.draft?.changes, ['Switched "Benchmark after a new boiler" off for everyone'])
  assert.equal(p.rules.find((r) => r.id === 'benchmark')!.state, 'off')
  p = await hq.playbook.switch('benchmark', true)
  assert.equal(p.draft, null, 'switching it back leaves nothing to send')

  const rule = p.rules.find((r) => r.id === 'customer-told')!
  p = await hq.playbook.save({ ...rule, ask: 'Did you tell the customer what you found?' })
  assert.equal(p.rules.find((r) => r.id === 'customer-told')!.state, 'changed')
  await assert.rejects(hq.playbook.save({ ...rule, replies: [] }), /2 to 4 buttons/)
  await hq.playbook.switch('benchmark', false)
  assert.equal((await as('dan').client.followUps.get()).playbook.length, 16, 'firms keep what was published until Ardent publishes')

  p = await hq.playbook.publish('Clearer customer question; Benchmark off while we check it')
  assert.equal(p.version, 2)
  assert.equal(p.draft, null)
  assert.equal(p.history[0].note, 'Clearer customer question; Benchmark off while we check it')
  const phones = await as('kofi').client.followUps.get()
  assert.equal(phones.playbook.some((r) => r.id === 'benchmark'), false)
  assert.equal(phones.playbook.find((r) => r.id === 'customer-told')!.ask, 'Did you tell the customer what you found?')
  await assert.rejects(hq.playbook.publish('again'), /nothing to publish/)
})

test('questions firms share: add one to the playbook, or keep it theirs with a note', async () => {
  const { engine, as } = demo()
  const hq = engine.hq('usr_edem')
  const shared = await hq.shared.list()
  assert.deepEqual(shared.map((s) => s.firmName).sort(), ['Ashby Plumbing & Heating', 'Hollins Electrical'])

  let p = await hq.shared.adopt('org_ashby', 'own-loft-hatch-closed')
  const added = p.rules.find((r) => r.id === 'loft-hatch-closed')!
  assert.equal(added.state, 'new')
  assert.deepEqual(added.from, { firmId: 'org_ashby', firmName: 'Ashby Plumbing & Heating' })
  await assert.rejects(hq.shared.adopt('org_ashby', 'own-loft-hatch-closed'), /dealt with/)
  p = await hq.playbook.publish('Loft hatch from Ashby')
  assert.ok((await as('dan').client.followUps.get()).playbook.some((r) => r.id === 'loft-hatch-closed'), 'every firm gets it')
  assert.ok(engine.data.actions.some((a) => a.orgId === 'org_ashby' && /now in Ardent's playbook/.test(a.summary)))

  const after = await hq.shared.decline('org_hollins', 'own-out-of-hours-signature', 'Only some firms charge out of hours')
  assert.equal(after.find((s) => s.firmId === 'org_hollins')!.review!.state, 'declined')
  assert.ok(engine.data.actions.some((a) => a.orgId === 'org_hollins' && /kept "Signature for out-of-hours work" as your own question: Only some firms/.test(a.summary)))
})

test('support staff can look but only an admin changes the playbook', async () => {
  const { engine } = demo()
  engine.data.users.push({ id: 'usr_sup', email: 'sup@ardent.local', name: 'Lee' })
  engine.data.staff.push({ userId: 'usr_sup', role: 'support' })
  const sup = engine.hq('usr_sup')
  assert.equal((await sup.firms()).length, 4)
  await assert.rejects(sup.playbook.switch('benchmark', false), { code: 'forbidden' })
  await assert.rejects(sup.shared.adopt('org_ashby', 'own-loft-hatch-closed'), { code: 'forbidden' })
})

test('HQ over HTTP and in the demo: staff only', async (t) => {
  const { engine } = demo()
  const server = createServer(engine, { filesDir: '/nonexistent' })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  t.after(() => server.close())
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const dan = connectHqLive(baseUrl, memory())
  await assert.rejects(dan.signIn('dan@demo.ardent.local', 'ardent-demo'), { code: 'forbidden' })
  const live = connectHqLive(baseUrl, memory())
  assert.equal((await live.signIn('edem@ardent.local', 'ardent-demo')).name, 'Edem')
  assert.equal((await live.hq.firms()).length, 4)
  assert.equal((await live.hq.playbook.get()).version, 1)
  await live.signOut()
  await assert.rejects(live.hq.firms(), { code: 'unauthenticated' })

  const storage = memory()
  const d = await connectHqDemo(storage, { today: '2026-10-21' })
  await assert.rejects(d.signIn('jo@demo.ardent.local', 'ardent-demo'), /Ardent HQ is for Ardent staff/)
  await d.signIn('edem@ardent.local', 'ardent-demo')
  assert.equal((await d.hq.live()).day.length, 10)
  // The demo saves a moment after each change.
  await new Promise((r) => setTimeout(r, 300))
  const again = await connectHqDemo(storage, { today: '2026-10-21' })
  assert.equal((await again.restore())?.name, 'Edem', 'a reload stays signed in')
})
