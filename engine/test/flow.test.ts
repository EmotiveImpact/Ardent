// One job, end to end: booked in the office, worked on the phone, invoiced
// and paid on the doorstep, and back in the office.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demo } from './helpers.ts'

test('a job flows from Core to Field and back', async () => {
  const { as } = demo()
  const jo = as('jo').client
  const kofi = as('kofi').client

  const job = await jo.jobs.create({
    title: 'Boiler service', trade: 'gas', status: 'booked', priority: 'normal',
    customerId: 'cus_04', siteId: 'sit_04', operatorIds: ['opr_02'],
    start: '2026-10-21T09:00:00Z', end: '2026-10-21T10:00:00Z',
    lines: [{ id: 'li_svc', kind: 'labour', description: 'Annual service', quantity: 1, unitPrice: 8500 }],
    checks: [],
  })
  assert.equal(job.ref, 'J-1053')

  // On the phone.
  assert.ok((await kofi.jobs.list({ from: '2026-10-21T00:00:00Z', to: '2026-10-22T00:00:00Z' })).some((j) => j.id === job.id))
  await kofi.jobs.setStatus(job.id, 'en_route')
  await kofi.jobs.setStatus(job.id, 'on_site')
  await kofi.jobs.addLine(job.id, { kind: 'material', description: 'Seal kit', quantity: 1, unitPrice: 1500 })
  await kofi.jobs.setCheck(job.id, 'gas_tightness', 'pass')
  await kofi.signatures.add({ jobId: job.id, operatorId: 'opr_02', signedBy: 'Imran Haq', svg: 'M0 0', at: '2026-10-21T09:55:00Z' })
  await kofi.jobs.setStatus(job.id, 'complete')

  // Invoice and payment on the doorstep.
  const inv = await kofi.invoices.create(job.id)
  assert.equal(inv.ref, 'INV-2209')
  assert.equal(inv.lines.length, 2)
  await kofi.invoices.send(inv.id, 'sms')
  const paid = await kofi.invoices.recordPayment(inv.id, 12000, 'card') // £100 net + 20% VAT
  assert.equal(paid.status, 'paid')

  // Back in the office.
  const seen = await jo.jobs.get(job.id)
  assert.equal(seen?.status, 'paid')
  assert.equal(seen?.checks.find((c) => c.key === 'gas_tightness')?.state, 'pass')
  assert.equal((await jo.signatures.forJob(job.id)).length, 1)
  assert.equal((await jo.invoices.forJob(job.id))[0].paidAmount, 12000)
})

test('a part payment leaves the job invoiced', async () => {
  const { as } = demo()
  const jo = as('jo').client
  const inv = await jo.invoices.create('job_1039')
  await jo.invoices.send(inv.id, 'email')
  assert.equal((await jo.invoices.recordPayment(inv.id, 5000, 'bank_transfer')).status, 'part_paid')
  assert.equal((await jo.jobs.get('job_1039'))?.status, 'invoiced')
  await assert.rejects(jo.invoices.recordPayment(inv.id, -5, 'cash'), { code: 'invalid' })
})

test('the office books, and only owners manage people', async () => {
  const { as } = demo()
  await assert.rejects(
    as('jo').client.jobs.create({ title: 'x', trade: 'gas', status: 'booked', priority: 'normal', customerId: 'cus_01', siteId: 'sit_02', operatorIds: [], start: '2026-10-21T09:00:00Z', end: '2026-10-21T10:00:00Z', lines: [], checks: [] }),
    { code: 'invalid' },
    "a job's site must belong to its customer",
  )
  await assert.rejects(as('jo').admin.setRole('usr_kofi', 'owner'), { code: 'forbidden' })
  await assert.rejects(as('dan').admin.setRole('usr_dan', 'field'), { code: 'forbidden' }, "owners can't demote themselves")
  await as('dan').admin.setRole('usr_kofi', 'office')
  assert.equal((await as('kofi').client.jobs.list()).length, 26, 'promoted to office, Kofi now sees every job')
})

test('the file store keeps records between restarts', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createEngine } = await import('../src/engine.ts')
  const { fileStore } = await import('../src/store-file.ts')
  const { nodePlatform } = await import('../src/platform-node.ts')
  const { freshDemoData } = await import('./helpers.ts')
  const dir = mkdtempSync(join(tmpdir(), 'ardent-'))
  try {
    const path = join(dir, 'ardent.json')
    const first = createEngine(fileStore(path, freshDemoData), nodePlatform).as({ userId: 'usr_jo', orgId: 'org_demo' })
    await first.client.jobs.setStatus('job_1052', 'booked')
    const again = createEngine(fileStore(path, freshDemoData), nodePlatform).as({ userId: 'usr_jo', orgId: 'org_demo' })
    assert.equal((await again.client.jobs.get('job_1052'))?.status, 'booked')
  } finally {
    rmSync(dir, { recursive: true })
  }
})
