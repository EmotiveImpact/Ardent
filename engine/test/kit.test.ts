// The price list, van stock, quote options and gas safety records.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gasGaps } from '../src/engine.ts'
import { demo } from './helpers.ts'

test('the price list keeps costs in the office', async () => {
  const { as } = demo()
  const jo = as('jo').client
  const ryan = as('ryan').client
  const combi = (await jo.priceList.list()).find((i) => i.id === 'itm_01')
  assert.equal(combi?.cost, 98000)
  const seen = await ryan.priceList.list()
  assert.ok(seen.length > 10)
  assert.ok(seen.every((i) => i.cost === undefined), 'field never sees what parts cost the firm')

  const item = await jo.priceList.create({ name: ' Pump, Grundfos UPS3 ', kind: 'material', unit: 'each', price: 18500, cost: 11000, stocked: true })
  assert.equal(item.name, 'Pump, Grundfos UPS3')
  await jo.priceList.update(item.id, { archived: true })
  assert.ok(!(await jo.priceList.list()).some((i) => i.id === item.id), 'archived items drop off the list')
  assert.ok((await jo.priceList.list({ archived: true })).some((i) => i.id === item.id))
  await assert.rejects(jo.priceList.create({ name: 'x', kind: 'material', unit: 'each', price: 12.5, stocked: false }), { code: 'invalid' })
  await assert.rejects(ryan.priceList.create({ name: 'x', kind: 'material', unit: 'each', price: 100, stocked: false }), { code: 'forbidden' })
})

test('parts used from the van come off its stock, and go back if removed', async () => {
  const { as } = demo()
  const jo = as('jo').client
  const ryan = as('ryan').client
  const elbows = async () => (await ryan.stock.list()).find((x) => x.itemId === 'itm_03')?.quantity
  assert.equal(await elbows(), 9)
  assert.ok((await ryan.stock.list()).every((x) => x.operatorId === 'opr_03'), 'field sees only its own van')
  await assert.rejects(ryan.stock.list({ operatorId: 'opr_01' }), { code: 'forbidden' })

  const job = await ryan.jobs.addLine('job_1047', { kind: 'material', description: '22mm compression elbow', quantity: 3, unitPrice: 450, itemId: 'itm_03', fromVan: 'opr_03' })
  assert.equal(await elbows(), 6)
  await assert.rejects(ryan.jobs.addLine('job_1047', { kind: 'material', description: 'x', quantity: 1, unitPrice: 450, itemId: 'itm_03', fromVan: 'opr_01' }), { code: 'forbidden' }, "can't take from someone else's van")
  await ryan.jobs.removeLine('job_1047', job.lines.at(-1)!.id)
  assert.equal(await elbows(), 9)

  await jo.stock.set('opr_03', 'itm_03', 20, 6)
  assert.equal(await elbows(), 20)
  await assert.rejects(jo.stock.set('opr_03', 'itm_01', 1), { code: 'invalid' }, 'boilers are not carried on the vans')
  await assert.rejects(jo.stock.set('opr_03', 'itm_03', -1), { code: 'invalid' })
  await assert.rejects(ryan.stock.set('opr_03', 'itm_03', 50), { code: 'forbidden' })
})

test('a low van shows on the attention list', async () => {
  const jo = demo().as('jo').client
  const low = (await jo.attention.list()).find((a) => a.rule === 'Van stock low' && a.who === 'Dan Mercer')
  assert.match(low?.detail ?? '', /22mm compression elbow \(2 left\)/)
})

test('a quote with options is won on the option the customer picks', async () => {
  const jo = demo().as('jo').client
  const a = [{ kind: 'labour' as const, description: 'Like for like', quantity: 1, unitPrice: 100000 }]
  const b = [{ kind: 'labour' as const, description: 'Walk-in shower', quantity: 1, unitPrice: 180000 }]
  await assert.rejects(jo.quotes.create('job_1052', { options: [{ key: 'A', label: 'Only one', lines: a }] }), { code: 'invalid' })
  await assert.rejects(jo.quotes.create('job_1052', { options: [{ key: 'B', label: 'x', lines: a }, { key: 'A', label: 'y', lines: b }] }), { code: 'invalid' })
  const q = await jo.quotes.create('job_1052', { options: [{ key: 'A', label: 'Like for like', lines: a }, { key: 'B', label: 'Walk-in', lines: b }] })
  assert.equal(q.lines[0].unitPrice, 100000, 'the headline lines are option A')
  await jo.quotes.send(q.id, 'email')
  await assert.rejects(jo.quotes.update(q.id, { lines: b }), { code: 'invalid' }, 'a sent quote is fixed')
  await assert.rejects(jo.quotes.respond(q.id, 'accepted'), /say which option/)
  const won = await jo.quotes.respond(q.id, 'accepted', 'B')
  assert.equal(won.chosen, 'B')
  assert.equal((await jo.jobs.get('job_1052'))?.lines[0].unitPrice, 180000)
})

test("a CP12 starts from last year's appliances and is issued only when finished", async () => {
  const { as } = demo()
  const dan = as('dan').client
  const rec = await dan.gasRecords.create('job_1048', 'opr_01')
  assert.match(rec.ref, /^CP-\d+$/)
  assert.equal(rec.appliances.length, 4, "copied from last year's record")
  assert.ok(rec.appliances.every((a) => a.co === undefined && a.checks.flue === 'pending'), 'with fresh readings')
  assert.equal((await dan.gasRecords.create('job_1048', 'opr_01')).id, rec.id, 'one draft per job')
  await assert.rejects(dan.gasRecords.issue(rec.id), /not finished/)

  let r = rec
  for (const a of rec.appliances) {
    r = await dan.gasRecords.saveAppliance(rec.id, { ...a, co: 10, co2: 9, ratio: 0.0001, checks: { flue: 'pass', ventilation: 'pass', safetyDevice: 'pass', spillage: 'n/a' }, safe: true })
  }
  assert.deepEqual(gasGaps(r), ['finish the installation checks'])
  for (const k of ['tightness', 'ecv', 'bonding', 'pipework', 'coAlarm'] as const) r = await dan.gasRecords.setInstallation(rec.id, k, 'pass')
  await assert.rejects(dan.gasRecords.saveAppliance(rec.id, { ...r.appliances[0], co: -1 }), { code: 'invalid' })

  const issued = await dan.gasRecords.issue(rec.id)
  assert.equal(issued.status, 'issued')
  assert.equal(issued.expires, `${Number(issued.issuedAt!.slice(0, 4)) + 1}${issued.issuedAt!.slice(4, 10)}`)
  const cert = (await dan.certificates.list({ siteId: 'sit_03' })).find((c) => c.id === issued.certificateId)
  assert.equal(cert?.kind, 'CP12')
  assert.equal((await dan.jobs.get('job_1048'))?.checks.find((c) => c.key === 'gas_tightness')?.state, 'pass')
  await assert.rejects(dan.gasRecords.setInstallation(rec.id, 'ecv', 'fail'), /already issued/)
})

test('an unsafe appliance needs its defect written down and flags the office', async () => {
  const { as } = demo()
  const dan = as('dan').client
  const jo = as('jo').client
  const rec = await dan.gasRecords.create('job_1048', 'opr_01')
  for (const a of rec.appliances) await dan.gasRecords.saveAppliance(rec.id, { ...a, checks: { flue: 'pass', ventilation: 'pass', safetyDevice: 'pass', spillage: 'pass' }, safe: true })
  for (const k of ['tightness', 'ecv', 'bonding', 'pipework', 'coAlarm'] as const) await dan.gasRecords.setInstallation(rec.id, k, 'pass')
  const fire = rec.appliances.find((a) => a.type === 'Gas fire')!
  const r = await dan.gasRecords.saveAppliance(rec.id, { ...fire, checks: { flue: 'fail', ventilation: 'pass', safetyDevice: 'pass', spillage: 'fail' }, safe: false, unsafe: 'immediately_dangerous' })
  assert.deepEqual(gasGaps(r), ["say what's wrong with the Gas fire in the bar"])
  await dan.gasRecords.saveAppliance(rec.id, { ...fire, checks: { flue: 'fail', ventilation: 'pass', safetyDevice: 'pass', spillage: 'fail' }, safe: false, unsafe: 'immediately_dangerous', defects: 'Spillage at the canopy. Capped and labelled.' })
  await dan.gasRecords.issue(rec.id)
  const flag = (await jo.attention.list()).find((a) => a.rule === 'Immediately dangerous')
  assert.match(flag?.detail ?? '', /Gas fire, Bar/)
})

test("field can't start a gas record on someone else's job", async () => {
  const kofi = demo().as('kofi').client
  await assert.rejects(kofi.gasRecords.create('job_1048', 'opr_02'))
  assert.deepEqual(await kofi.gasRecords.list({ siteId: 'sit_03' }), [], "nor see records for sites they've never worked")
})

test('emptying a cost, code or trade clears it, as it would over the wire', async () => {
  const jo = demo().as('jo').client
  const wire = JSON.parse(JSON.stringify({ cost: null, code: null, trade: null }))
  const item = await jo.priceList.update('itm_02', wire)
  assert.equal(item.cost, undefined)
  assert.equal(item.code, undefined)
  assert.equal(item.trade, undefined)
  assert.equal(item.price, 14500, 'the rest is kept')
})
