// The office's own records: customers, sites, bookings, quotes, certificates, balances.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { certificateState } from '../src/engine.ts'
import { demo } from './helpers.ts'

test('the office adds a customer and site, then books, quotes and wins the job', async () => {
  const jo = demo().as('jo').client
  const c = await jo.customers.create({ name: 'Priya Shah', kind: 'homeowner', phone: '07700 900777' })
  assert.equal(c.balance, 0)
  const site = await jo.sites.create({ customerId: c.id, line1: '3 Fog Lane', town: 'Didsbury', postcode: 'm20 6aj', lat: 40, lng: 60 })
  assert.equal(site.postcode, 'M20 6AJ')
  assert.deepEqual((await jo.sites.list({ customerId: c.id })).map((s) => s.id), [site.id])

  const job = await jo.jobs.create({ title: 'New radiator', trade: 'heating', status: 'enquiry', priority: 'normal', customerId: c.id, siteId: site.id, operatorIds: [], start: '2026-10-23T09:00:00Z', end: '2026-10-23T12:00:00Z', lines: [], checks: [] })
  const q = await jo.quotes.create(job.id, { lines: [{ kind: 'other', description: 'Supply and fit 600x1000 radiator', quantity: 1, unitPrice: 42000 }] })
  assert.match(q.ref, /^Q-\d+$/)
  await jo.quotes.send(q.id, 'email')
  assert.equal((await jo.jobs.get(job.id))?.status, 'quoted')
  await jo.quotes.respond(q.id, 'accepted')
  const won = await jo.jobs.get(job.id)
  assert.equal(won?.status, 'booked')
  assert.equal(won?.lines[0].unitPrice, 42000, 'the accepted quote becomes the job lines')
  await assert.rejects(jo.quotes.respond(q.id, 'declined'), { code: 'invalid' })

  const moved = await jo.jobs.update(job.id, { start: '2026-10-24T09:00:00Z', end: '2026-10-24T12:00:00Z', operatorIds: ['opr_03'] })
  assert.equal(moved.start, '2026-10-24T09:00:00Z')
  await assert.rejects(jo.jobs.update(job.id, { start: '2026-10-25T09:00:00Z' }), { code: 'invalid' }, 'would end before it starts')
  await assert.rejects(jo.jobs.update(job.id, { status: 'paid' } as never), { code: 'invalid' })
})

test("field can't add customers, quote, or rebook", async () => {
  const kofi = demo().as('kofi').client
  await assert.rejects(kofi.customers.create({ name: 'x', kind: 'homeowner', phone: '0' }), { code: 'forbidden' })
  await assert.rejects(kofi.quotes.list(), { code: 'forbidden' })
  await assert.rejects(kofi.invoices.list(), { code: 'forbidden' })
  await assert.rejects(kofi.jobs.update('job_1045', { start: '2026-10-19T09:00:00Z' }), { code: 'forbidden' })
  assert.ok((await kofi.certificates.list()).every((c) => ['sit_04', 'sit_05'].includes(c.siteId)))
})

test("a customer's balance is what they owe on sent invoices", async () => {
  const jo = demo().as('jo').client
  // Northgate: INV-2198 £1,533.33 net + VAT, overdue, nothing paid.
  assert.equal((await jo.customers.get('cus_02'))?.balance, 184000)
  // Crown & Anchor: INV-2201 part paid (£425.00 total, £200 paid); INV-2204 paid.
  assert.equal((await jo.customers.get('cus_03'))?.balance, 22500)
})

test('certificate status comes from the dates', () => {
  assert.equal(certificateState({ issued: '2025-10-01', expires: '2026-10-01' }, '2026-10-20'), 'overdue')
  assert.equal(certificateState({ issued: '2025-11-01', expires: '2026-11-10' }, '2026-10-20'), 'due_soon')
  assert.equal(certificateState({ issued: '2026-01-01', expires: '2027-01-01' }, '2026-10-20'), 'valid')
  assert.equal(certificateState({ expires: '2027-01-01' }, '2026-10-20'), 'draft')
})

test('sign-in locks an email after ten wrong passwords', () => {
  const { engine } = demo()
  for (let i = 0; i < 10; i++) assert.throws(() => engine.login('jo@demo.ardent.local', 'nope'), { code: 'unauthenticated' })
  assert.throws(() => engine.login('jo@demo.ardent.local', 'ardent-demo'), /too many attempts/)
  assert.ok(engine.login('dan@demo.ardent.local', 'ardent-demo').token, 'other people are unaffected')
})

test('the attention list is worked out from the records', async () => {
  const { as } = demo()
  const items = await as('jo').client.attention.list()
  const rules = new Set(items.map((i) => i.rule))
  assert.ok(rules.has('Running late'), 'Ryan is delayed in the demo')
  assert.ok(rules.has('EICR overdue'))
  assert.ok(rules.has('Invoice overdue'))
  await assert.rejects(as('kofi').client.attention.list(), { code: 'forbidden' })
})
