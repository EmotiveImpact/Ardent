// Field users (engineers and subbies on the phone) see their own jobs and
// change only what an engineer changes on site.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demo, ids } from './helpers.ts'

test('Kofi sees only his jobs, and only their customers and sites', async () => {
  const kofi = demo().as('kofi').client
  assert.deepEqual(ids(await kofi.jobs.list()), ['job_1036', 'job_1045'])
  assert.deepEqual(ids(await kofi.customers.list()), ['cus_04', 'cus_05'])
  assert.ok(await kofi.sites.get('sit_04'))
  assert.equal(await kofi.sites.get('sit_01'), undefined)
  assert.equal(await kofi.jobs.get('job_1042'), undefined)
  assert.equal(await kofi.customers.get('cus_01'), undefined)
  assert.equal((await kofi.operators.list()).length, 4, 'the whole crew is visible')
  assert.equal((await kofi.operators.me()).id, 'opr_02')
})

test('Tom the subbie sees his one job and nothing else', async () => {
  const tom = demo().as('tom').client
  assert.deepEqual(ids(await tom.jobs.list()), ['job_1049'])
  assert.deepEqual((await tom.customers.list()).map((c) => c.name), ['Brindle Street Dental'])
})

test('field moves a job through the day but cannot invoice it by hand or reopen it', async () => {
  const kofi = demo().as('kofi').client
  assert.equal((await kofi.jobs.setStatus('job_1045', 'on_site')).status, 'on_site')
  assert.equal((await kofi.jobs.setStatus('job_1045', 'complete')).status, 'complete')
  await assert.rejects(kofi.jobs.setStatus('job_1045', 'paid'), { code: 'forbidden' })
  await assert.rejects(kofi.jobs.setStatus('job_1045', 'cancelled'), { code: 'forbidden' })
  await assert.rejects(kofi.jobs.setStatus('job_1036', 'complete'), { code: 'forbidden' }, 'job_1036 is already invoiced')
  await assert.rejects(kofi.jobs.setStatus('job_1042', 'on_site'), { code: 'not_found' }, "Dan's job")
})

test("field can't book work", async () => {
  const kofi = demo().as('kofi').client
  await assert.rejects(
    kofi.jobs.create({ title: 'Free work', trade: 'electrical', status: 'booked', priority: 'normal', customerId: 'cus_04', siteId: 'sit_04', operatorIds: ['opr_02'], start: '2026-10-21T09:00:00Z', end: '2026-10-21T10:00:00Z', lines: [], checks: [] }),
    { code: 'forbidden' },
  )
})

test('lines and checks on site, until the job is invoiced', async () => {
  const kofi = demo().as('kofi').client
  const job = await kofi.jobs.addLine('job_1045', { kind: 'material', description: '2x RCBO 32A', quantity: 2, unitPrice: 1850 })
  assert.equal(job.lines.length, 3)
  const added = job.lines.at(-1)!
  assert.equal((await kofi.jobs.removeLine('job_1045', added.id)).lines.length, 2)
  assert.equal((await kofi.jobs.setCheck('job_1045', 'rams', 'pass', 'Signed 10:04')).checks.find((c) => c.key === 'rams')?.state, 'pass')
  await assert.rejects(kofi.jobs.addLine('job_1036', { kind: 'labour', description: 'x', quantity: 1, unitPrice: 100 }), { code: 'forbidden' })
  await assert.rejects(kofi.jobs.addLine('job_1042', { kind: 'labour', description: 'x', quantity: 1, unitPrice: 100 }), { code: 'not_found' })
  await assert.rejects(kofi.jobs.addLine('job_1045', { kind: 'labour', description: 'x', quantity: 0, unitPrice: 100 }), { code: 'invalid' })
})

test('Kofi sets his own state, never anyone else’s', async () => {
  const kofi = demo().as('kofi').client
  const me = await kofi.operators.setState('opr_02', 'on_site', 'job_1045')
  assert.equal(me.state, 'on_site')
  assert.equal(me.currentJobId, 'job_1045')
  await assert.rejects(kofi.operators.setState('opr_03', 'off_shift'), { code: 'forbidden' })
  await assert.rejects(kofi.operators.setState('opr_02', 'on_site', 'job_1042'), { code: 'not_found' })
})

test('time, notes, photos and signatures only in his own name, on his own jobs', async () => {
  const kofi = demo().as('kofi').client
  const t = await kofi.time.start({ operatorId: 'opr_02', jobId: 'job_1045', kind: 'labour', start: '2026-10-18T10:00:00Z' })
  assert.equal((await kofi.time.stop(t.id, '2026-10-18T11:30:00Z')).end, '2026-10-18T11:30:00Z')
  await assert.rejects(kofi.time.stop(t.id, '2026-10-18T09:00:00Z'), { code: 'invalid' })
  await assert.rejects(kofi.time.start({ operatorId: 'opr_03', kind: 'admin', start: '2026-10-18T10:00:00Z' }), { code: 'forbidden' })
  await assert.rejects(kofi.time.start({ operatorId: 'opr_02', jobId: 'job_1042', kind: 'labour', start: '2026-10-18T10:00:00Z' }), { code: 'not_found' })

  await kofi.notes.add({ jobId: 'job_1045', operatorId: 'opr_02', body: 'Old board had no RCD', at: '2026-10-18T10:20:00Z' })
  await kofi.photos.add({ jobId: 'job_1045', operatorId: 'opr_02', stage: 'before', uri: 'file:///board.jpg', takenAt: '2026-10-18T10:05:00Z' })
  await kofi.signatures.add({ jobId: 'job_1045', operatorId: 'opr_02', signedBy: 'Imran Haq', svg: 'M0 0 L10 10', at: '2026-10-18T13:50:00Z' })
  assert.equal((await kofi.notes.forJob('job_1045')).length, 1)
  assert.equal((await kofi.photos.forJob('job_1045')).length, 1)
  assert.equal((await kofi.signatures.forJob('job_1045')).length, 1)

  await assert.rejects(kofi.notes.add({ jobId: 'job_1042', operatorId: 'opr_02', body: 'x', at: '2026-10-18T10:20:00Z' }), { code: 'not_found' })
  await assert.rejects(kofi.notes.add({ jobId: 'job_1045', operatorId: 'opr_03', body: 'x', at: '2026-10-18T10:20:00Z' }), { code: 'forbidden' })
})

test("Ryan's clock is his own: Kofi can't see or stop it", async () => {
  const { as } = demo()
  const t = await as('ryan').client.time.start({ operatorId: 'opr_03', jobId: 'job_1047', kind: 'travel', start: '2026-10-18T09:00:00Z' })
  await assert.rejects(as('kofi').client.time.stop(t.id), { code: 'not_found' })
})

test('someone removed from the firm loses access straight away', async () => {
  const { as } = demo()
  await as('dan').admin.setRole('usr_kofi', null)
  await assert.rejects(as('kofi').client.jobs.list(), { code: 'forbidden' })
  await assert.rejects(as('kofi').client.operators.setState('opr_02', 'on_call'), { code: 'forbidden' })
  assert.ok((await as('jo').client.operators.list()).some((o) => o.id === 'opr_02'), 'his crew record and history stay')
})
