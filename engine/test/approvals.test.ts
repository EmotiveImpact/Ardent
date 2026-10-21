// The office manager: the log of who did what, Ardent's drafts waiting for a yes, and the morning brief.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ukDay } from '../kit/format.ts'
import { dayBefore } from '../src/office.ts'
import { demo } from './helpers.ts'

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

test('every change goes in the log by name, and only the office can read it', async () => {
  const { as } = demo()
  const jo = as('jo').client
  const c = await jo.customers.create({ name: 'Priya Shah', kind: 'homeowner', phone: '07700 900777' })
  await as('kofi').client.operators.setLocation('opr_02', { lat: 53.45, lng: -2.2, at: new Date().toISOString() })
  await as('kofi').client.jobs.setStatus('job_1045', 'on_site')
  const log = await jo.log.list()
  assert.equal(log[0].summary, 'J-1045 on site')
  assert.deepEqual(log[0].by, { kind: 'person', name: 'Kofi Asante', userId: 'usr_kofi' })
  assert.equal(log[0].jobId, 'job_1045')
  assert.equal(log[1].summary, `Added ${c.name} as a customer`)
  assert.ok(!log.some((e) => e.action === 'operators.setLocation'), 'van locations are not news')
  assert.deepEqual((await jo.log.list({ jobId: 'job_1045' })).map((e) => e.summary), ['J-1045 on site'])
  await assert.rejects(as('kofi').client.log.list(), { code: 'forbidden' })
})

test("Ardent's drafts wait for a yes, and a yes sends them", async () => {
  const { as } = demo()
  const jo = as('jo').client
  const waiting = await jo.approvals.list()
  const byKind = Object.fromEntries(waiting.map((a) => [`${a.kind}:${a.invoiceId ?? a.quoteId}`, a]))
  const send = byKind['send_invoice:inv_2208']
  assert.ok(send, 'the draft invoice for the finished radiator job')
  assert.match(send.why, /J-1039 Radiator valves x6, finished/)
  assert.ok(byKind['chase_invoice:inv_2198'], 'the overdue void checks invoice')
  assert.match(byKind['chase_invoice:inv_2198'].preview, /overdue\. Please pay it this week/, 'firmer after two weeks')
  assert.ok(byKind['send_quote:quo_312'])
  await assert.rejects(as('kofi').client.approvals.list(), { code: 'forbidden' })

  await assert.rejects(jo.approvals.approve(send.id, 'old'), { code: 'invalid' }, 'a stale look is refused')
  const yes = await jo.approvals.approve(send.id, send.version)
  assert.equal(yes.status, 'approved')
  assert.equal(yes.decidedBy, 'Jo Pickering')
  assert.equal((await jo.invoices.forJob('job_1039'))[0].status, 'sent')
  assert.ok(!(await jo.approvals.list()).some((a) => a.id === send.id))
  assert.equal((await jo.log.list())[0].summary, "Said yes to Ardent's draft: Send INV-2208 to " + send.title.split(' to ')[1])
  assert.equal((await jo.log.list())[0].level, 'approve')

  const chase = byKind['chase_invoice:inv_2198']
  await jo.approvals.approve(chase.id, chase.version)
  const inv = (await jo.invoices.list()).find((i) => i.id === 'inv_2198')!
  assert.equal(inv.reminders?.length, 1)
  assert.ok(!(await jo.approvals.list()).some((a) => a.kind === 'chase_invoice' && a.invoiceId === 'inv_2198'), 'no second reminder within a week')
})

test('a no stays a no until the record changes, and doing it by hand makes the draft stale', async () => {
  const { as } = demo()
  const jo = as('jo').client
  const chase = (await jo.approvals.list()).find((a) => a.kind === 'chase_invoice' && a.invoiceId === 'inv_2198')!
  await jo.approvals.reject(chase.id, 'They pay at month end')
  assert.ok(!(await jo.approvals.list()).some((a) => a.kind === 'chase_invoice' && a.invoiceId === 'inv_2198'))
  await jo.invoices.recordPayment('inv_2198', 50000, 'bank_transfer')
  const again = (await jo.approvals.list()).find((a) => a.kind === 'chase_invoice' && a.invoiceId === 'inv_2198')
  assert.ok(again && again.id !== chase.id, 'a part payment changes what is owed, so it asks again')

  const quote = (await jo.approvals.list()).find((a) => a.kind === 'send_quote')!
  await jo.quotes.update(quote.quoteId!, { lines: [{ kind: 'other', description: 'Cylinder thermostat and immersion', quantity: 1, unitPrice: 41000 }] })
  const moved = (await jo.approvals.list()).find((a) => a.id === quote.id)!
  assert.notEqual(moved.version, quote.version, 'a waiting draft follows its record')
  await assert.rejects(jo.approvals.approve(quote.id, quote.version), /changed since you looked/)

  await jo.quotes.send(quote.quoteId!, 'email')
  const done = (await jo.approvals.list({ status: ['stale'] })).find((a) => a.id === quote.id)
  assert.equal(done?.status, 'stale')
  await assert.rejects(jo.approvals.approve(quote.id, moved.version), /no longer needed/)
})

test('finishing a job drafts the invoice from its parts and the time on site', async () => {
  const { as, engine } = demo()
  const jo = as('jo').client
  const job = await jo.jobs.create({
    title: 'Leak under sink', trade: 'plumbing', status: 'booked', priority: 'normal', customerId: 'cus_01', siteId: 'sit_01',
    operatorIds: ['opr_04'], start: hoursAgo(3), end: hoursAgo(1), lines: [], checks: [],
  })
  const tom = as('tom').client
  await tom.jobs.addLine(job.id, { kind: 'material', description: '15mm isolating valve', quantity: 2, unitPrice: 650, itemId: 'itm_08' })
  const t = await tom.time.start({ jobId: job.id, operatorId: 'opr_04', kind: 'labour', start: hoursAgo(2.6) })
  await tom.time.stop(t.id, hoursAgo(1))
  await tom.jobs.setStatus(job.id, 'complete')

  const [inv] = await jo.invoices.forJob(job.id)
  assert.equal(inv.status, 'draft')
  assert.deepEqual(inv.lines.map((l) => [l.kind, l.quantity, l.unitPrice]), [['material', 2, 650], ['labour', 1.75, 5500]], '1 hr 36 min rounds up to the quarter')
  const entry = (await jo.log.list({ jobId: job.id })).find((e) => e.by.kind === 'ardent')!
  assert.match(entry.summary, /^Drafted INV-\d+ for J-\d+ from 1 part and 1\.75 hours on site, waiting for a yes$/)
  assert.equal(entry.level, 'draft')
  assert.ok((await jo.approvals.list()).some((a) => a.kind === 'send_invoice' && a.invoiceId === inv.id))

  await jo.jobs.setStatus(job.id, 'on_site')
  await jo.jobs.setStatus(job.id, 'complete')
  assert.equal((await jo.invoices.forJob(job.id)).length, 1, 'never a second draft')
  assert.equal(engine.data.actions.filter((a) => a.by.kind === 'ardent' && a.orgId === 'org_demo').length, 1)
})

test('the morning brief adds up yesterday, what is late and what is on today', async () => {
  const { as, engine } = demo()
  const jo = as('jo').client
  const today = ukDay(new Date().toISOString())
  const yesterday = dayBefore(today)
  for (const j of engine.data.jobs) if (j.id === 'job_1039') j.end = `${yesterday}T15:00:00Z`
  const inv = engine.data.invoices.find((i) => i.id === 'inv_2207')!
  inv.issuedAt = `${yesterday}T16:00:00Z`
  inv.payments = [{ amount: 10000, method: 'card', at: `${yesterday}T17:00:00Z` }]
  inv.paidAmount = 10000

  const brief = await jo.brief.get()
  const n = Object.fromEntries(brief.numbers.map((x) => [x.key, x.value]))
  assert.equal(brief.day, today)
  assert.equal(n.done, 1)
  assert.equal(n.invoiced, 31200, 'INV-2207 with VAT')
  assert.equal(n.cash, 10000)
  assert.equal(n.overdue, 206500, 'INV-2198 with VAT, and what is left on INV-2201')
  assert.match(brief.headline, /^Yesterday 1 job finished, £312 invoiced and £100 came in\. £2,065 is overdue on 2 invoices\./)
  assert.match(brief.headline, /waiting for your yes\.$/)
  assert.equal(brief.waiting, (await jo.approvals.list()).length)
  await assert.rejects(jo.brief.get({ day: 'monday' }), { code: 'invalid' })
  await assert.rejects(as('kofi').client.brief.get(), { code: 'forbidden' })
})

test("the firm's rules decide what Ardent drafts, and only the owner changes them", async () => {
  const { as } = demo()
  const dan = as('dan').client
  const jo = as('jo').client
  const { settings, jobs } = await jo.automation.get()
  assert.equal(settings.tone, 'friendly')
  assert.equal(jobs.find((j) => j.key === 'invoice_chasing')?.level, 3)
  assert.equal(jobs.find((j) => j.key === 'cert_prefill')?.level, 4)
  await assert.rejects(jo.automation.set({ tone: 'formal' }), { code: 'forbidden' })
  await assert.rejects(dan.automation.set({ levels: { cert_prefill: 3 } }), /only be set to L4/)
  await assert.rejects(dan.automation.set({ chase: { firmer: 40 } }), /first, then firmer, then the statement/)

  await dan.automation.set({ tone: 'formal', signOff: 'The Mercer team' })
  const chase = (await jo.approvals.list()).find((a) => a.kind === 'chase_invoice' && a.invoiceId === 'inv_2198')!
  assert.match(chase.preview, /^Dear Sir or Madam, .* The Mercer team$/)

  await dan.automation.set({ levels: { invoice_chasing: 0 } })
  assert.ok(!(await jo.approvals.list()).some((a) => a.kind === 'chase_invoice'), 'L0: just tells you, drafts nothing')
  await dan.automation.set({ levels: { invoice_chasing: 3 }, areas: { money: false } })
  const left = await jo.approvals.list()
  assert.ok(!left.some((a) => a.kind === 'chase_invoice' || a.kind === 'send_quote'), 'money switched off')
  assert.ok(left.some((a) => a.kind === 'send_invoice'), 'paperwork still on')
  assert.equal((await jo.log.list())[0].summary, 'Switched money off, set Invoice chasing to L3 Auto')
})

test('usage is counted against the plan, and AI pauses at the cap', async () => {
  const { as, engine } = demo()
  const dan = as('dan').client
  const org = 'org_demo'
  await dan.automation.set({ limits: { aiPence: 1000 }, officeHours: { from: '08:00', to: '17:30', days: [1, 2, 3, 4, 5] } })
  const sunday = '2026-10-18T22:00:00Z'
  const monday = '2026-10-19T10:00:00Z'
  assert.equal(engine.allowance(org, 'call', monday).allowed, false, 'office hours answering is Ardent Voice')
  assert.equal(engine.allowance(org, 'call', sunday).allowed, true)
  engine.meter(org, 'call', 149, sunday)
  engine.meter(org, 'call', 3, sunday)
  assert.equal(engine.allowance(org, 'call', sunday).allowed, false, '150 after-hours minutes used')
  await dan.automation.set({ voice: true })
  engine.meter(org, 'call', 300, monday)
  const u = await dan.usage.get({ month: '2026-10' })
  const line = Object.fromEntries(u.lines.map((l) => [l.key, l]))
  assert.equal(line.voice.used, 300)
  assert.equal(line.voice.overCost, 50 * 35, '50 minutes past 250 at 35p')

  engine.meter(org, 'text', 1510, monday)
  assert.equal((await dan.usage.get({ month: '2026-10' })).lines.find((l) => l.key === 'texts')!.over, 10)

  engine.meter(org, 'ai', 999)
  assert.equal(engine.allowance(org, 'ai').allowed, true)
  engine.meter(org, 'ai', 5)
  assert.equal(engine.allowance(org, 'ai').allowed, false)
  assert.equal((await dan.usage.get()).aiPaused, true)
  assert.match((await dan.log.list())[0].summary, /^AI paused: this month's £10 cap is reached/)
  await assert.rejects(as('kofi').client.usage.get(), { code: 'forbidden' })
})
