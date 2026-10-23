// One firm can never see or touch another firm's records.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demo, ids } from './helpers.ts'

function withRival() {
  const d = demo()
  const owner = d.engine.addUser({ email: 'owner@rival.test', name: 'Rival Owner' })
  const org = d.engine.createOrganisation(owner.id, { name: 'Rival Plumbing', slug: 'rival-plumbing' })
  const rival = d.engine.as({ userId: owner.id, orgId: org.id })
  return { ...d, owner, org, rival }
}

test('a new firm starts empty, owned by whoever created it', async () => {
  const { engine, owner, org, rival } = withRival()
  assert.equal(await rival.admin.role(), 'owner')
  assert.deepEqual(await rival.client.jobs.list(), [])
  assert.deepEqual(await rival.client.customers.list(), [])
  assert.deepEqual(await rival.client.operators.list(), [])
  assert.deepEqual(engine.organisationsFor(owner.id).map((o) => o.id), [org.id])
})

test("another firm's records read as not found", async () => {
  const { rival } = withRival()
  assert.equal(await rival.client.jobs.get('job_1042'), undefined)
  assert.equal(await rival.client.customers.get('cus_01'), undefined)
  assert.equal(await rival.client.sites.get('sit_01'), undefined)
  await assert.rejects(rival.client.notes.forJob('job_1042'), { code: 'not_found' })
  await assert.rejects(rival.client.jobs.setStatus('job_1042', 'cancelled'), { code: 'not_found' })
  await assert.rejects(rival.client.invoices.recordPayment('inv_2207', 100, 'cash'), { code: 'not_found' })
})

test("a firm can't book work against another firm's customer", async () => {
  const { rival } = withRival()
  await assert.rejects(
    rival.client.jobs.create({ title: 'x', trade: 'gas', status: 'booked', priority: 'normal', customerId: 'cus_01', siteId: 'sit_01', operatorIds: [], start: '2026-10-21T09:00:00Z', end: '2026-10-21T10:00:00Z', lines: [], checks: [] }),
    { code: 'not_found' },
  )
})

test("you can't act in a firm you don't belong to", async () => {
  const { engine, owner } = withRival()
  const sneaky = engine.as({ userId: owner.id, orgId: 'org_demo' })
  await assert.rejects(sneaky.client.jobs.list(), { code: 'forbidden' })
  await assert.rejects(sneaky.client.operators.list(), { code: 'forbidden' })
})

test('job numbers are per firm: a new firm starts at J-1001, the demo firm carries on', async () => {
  const { engine, org, owner, as } = withRival()
  const rival = engine.as({ userId: owner.id, orgId: org.id })
  // The shared client can't add customers yet, so put the rival's first one straight in.
  engine.data.customers.push({ id: 'cus_r', orgId: org.id, name: 'R', kind: 'homeowner', phone: '0', balance: 0 })
  engine.data.sites.push({ id: 'sit_r', orgId: org.id, customerId: 'cus_r', line1: '1 Elm St', town: 'Salford', postcode: 'M5 4AA', lat: 0, lng: 0 })
  const base = { title: 'Leak', trade: 'plumbing', status: 'booked', priority: 'normal', operatorIds: [], start: '2026-10-21T09:00:00Z', end: '2026-10-21T10:00:00Z', lines: [], checks: [] } as const
  assert.equal((await rival.client.jobs.create({ ...base, customerId: 'cus_r', siteId: 'sit_r', lines: [], checks: [], operatorIds: [] })).ref, 'J-1001')
  assert.equal((await as('jo').client.jobs.create({ ...base, customerId: 'cus_01', siteId: 'sit_01', lines: [], checks: [], operatorIds: [] })).ref, 'J-1053')
})

test('nothing internal leaks out of the engine', async () => {
  const { as } = demo()
  const [op] = await as('dan').client.operators.list()
  const job = await as('dan').client.jobs.get('job_1042')
  assert.ok(!('orgId' in op) && !('userId' in op))
  assert.ok(job && !('orgId' in job))
})

test('slugs are unique and tidy', () => {
  const { engine, owner } = withRival()
  assert.throws(() => engine.createOrganisation(owner.id, { name: 'Again', slug: 'rival-plumbing' }), { code: 'invalid' })
  assert.throws(() => engine.createOrganisation(owner.id, { name: 'Bad', slug: 'Bad Slug' }), { code: 'invalid' })
  assert.throws(() => engine.createOrganisation('usr_nobody', { name: 'Ghost', slug: 'ghost' }), { code: 'unauthenticated' })
})

test('the demo firm sees all of its own jobs', async () => {
  const { as } = demo()
  assert.equal((await as('dan').client.jobs.list()).length, 26)
  assert.deepEqual(ids(await as('jo').client.customers.list()), ['cus_01', 'cus_02', 'cus_03', 'cus_04', 'cus_05', 'cus_06'])
})
