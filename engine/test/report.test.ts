// The job report Field writes from what the engineer said: plain rules, no AI, nothing added.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { priceList, stock } from '../../core/src/data/mock.ts'
import { buildReport, digits, keepFixes, spoken, tidy, tradeWords } from '../kit/report.ts'
import { demo } from './helpers.ts'

const at = '2026-10-21T15:00:00Z'
const said = (...texts: string[]) => texts.map((text) => ({ text, at }))
const van = (operatorId: string) => stock.filter((s) => s.operatorId === operatorId)

test('numbers and units come out the way a report writes them', () => {
  assert.equal(digits('Right, job twenty-four seventeen.'), 'Right, job 2417.')
  assert.equal(spoken("Zs on the shower's nought point three eight"), "Zs on the shower's 0.38")
  assert.equal(spoken('two thirty-two amp breakers'), '2 32A breakers')
  assert.equal(spoken('about two metres of sixteen mil tails'), 'about 2 m of 16mm tails')
  assert.equal(spoken('two and a half mil twin and earth'), '2.5mm twin and earth')
  assert.equal(spoken('ratio nought point nought nought zero four'), 'ratio 0.0004')
  assert.equal(spoken('two hundred and fifty'), '250')
  assert.equal(spoken('a ten way board'), 'a 10-way board')
  assert.equal(spoken('swapped the old one for a new one'), 'swapped the old one for a new one')
  assert.equal(tidy('er, right, so the tap was dripping'), 'The tap was dripping.')
})

const electrician = said(
  'Right, job twenty-four seventeen.',
  'Swapped the old fuse board for a ten-way dual RCD unit. Added two thirty-two amp breakers for the kitchen and the shower circuit.',
  'Took the board and the breakers off the van, plus about two metres of two point five mil twin and earth.',
  "Tested everything. Zs on the shower's nought point three eight, RCDs tripping at twenty-two and twenty-five milliseconds, insulation's over two hundred meg on all circuits.",
  "Er, one thing, the bathroom light's got no earth at the fitting. I've left it as it was and told her.",
  'She wants a quote for an extra socket in the garage.',
)

test("an electrician's report: the work, the parts off the van, the readings as said", () => {
  const r = buildReport({ trade: 'electrical', priceList, van: van('opr_02'), segments: electrician })
  const of = (t: string) => r.sections.find((s) => s.topic === t)?.lines.map((l) => l.text) ?? []
  assert.deepEqual(of('work'), ['Swapped the old fuse board for a 10-way dual RCD unit.', 'Added 2 32A breakers for the kitchen and the shower circuit.'])
  assert.ok(!of('work').some((l) => /2417/.test(l)), 'chatter about the job number stays out')
  assert.deepEqual(r.parts.map((p) => [p.itemId, p.quantity, p.quantitySaid, p.fromVan]), [['itm_11', 2, true, true], ['itm_12', 2, true, true]])
  assert.deepEqual(r.readings.map((x) => [x.label, x.value]), [['RCD trip time', '22 ms, 25 ms'], ['Insulation resistance', '> 200 MΩ'], ['Zs', '0.38 Ω']])
  assert.deepEqual(of('left'), ["One thing, the bathroom light's got no earth at the fitting.", "I've left it as it was and told her."])
  assert.deepEqual(of('next'), ['She wants a quote for an extra socket in the garage.'])
  assert.ok(!r.parts.some((p) => /socket/i.test(p.description)), 'what they want next is not a part used')
  assert.deepEqual(r.missing, [])
  // Every line points at the words it came from.
  for (const s of r.sections) for (const l of s.lines) assert.ok(electrician[l.from.segment].text.slice(l.from.start, l.from.end).length > 0)
  const zs = r.readings.find((x) => x.label === 'Zs')!
  assert.match(electrician[zs.from.segment].text.slice(zs.from.start, zs.from.end), /Zs on the shower's nought point three eight/)
})

test('a plumber: one valve off the van, a leak check, nothing left, advice given', () => {
  const r = buildReport({
    trade: 'plumbing',
    priceList,
    van: van('opr_03'),
    segments: said(
      'Leak under the kitchen sink. The cold feed isolation valve was weeping so I swapped it for a new fifteen mil isolating valve off the van.',
      'Turned the water back on, no leaks.',
      'Nothing left to do.',
      'Told her to keep an eye on the cupboard for a day or two.',
    ),
  })
  assert.deepEqual(r.parts.map((p) => [p.itemId, p.quantity, p.fromVan, p.sourceSaid]), [['itm_08', 1, true, true]])
  assert.deepEqual(r.readings.map((x) => [x.label, x.value]), [['Leak check', 'No leaks']])
  assert.deepEqual(r.missing, [])
})

test('a gas engineer: readings kept to what was said, and nothing invented for what was not', () => {
  const r = buildReport({
    trade: 'gas',
    priceList,
    van: van('opr_01'),
    segments: said('Fitted the new Worcester Bosch 4000 combi and a magnetic filter.', 'Used one flue extension from the van.', 'Working pressure twenty millibar, tightness test passed. CO2 nine point two percent, ratio nought point nought nought zero four.'),
  })
  assert.deepEqual(r.readings.map((x) => [x.label, x.value]), [['Working pressure', '20 mbar'], ['Tightness test', 'Passed'], ['CO2', '9.2%'], ['CO/CO2 ratio', '0.0004']])
  const combi = r.parts.find((p) => p.itemId === 'itm_01')!
  assert.equal(combi.fromVan, false, "the combi isn't on the van")
  const filter = r.parts.find((p) => p.itemId === 'itm_02')!
  assert.deepEqual([filter.fromVan, filter.sourceSaid], [true, false], "on the van, but they didn't say so: shown as a guess")
  assert.deepEqual(r.missing, ['left', 'next'], 'not said, so still needed')
})

test('words that fit two parts ask which, and "didn\'t need" is not a part', () => {
  const r = buildReport({ trade: 'plumbing', priceList, van: van('opr_03'), segments: said("Replaced two elbows under the bath. Didn't need a new isolating valve in the end.") })
  assert.equal(r.parts.length, 1)
  assert.deepEqual([r.parts[0].itemId, r.parts[0].choices, r.parts[0].quantity], [undefined, ['itm_03', 'itm_04'], 2])
  const none = buildReport({ trade: 'electrical', priceList, van: [], segments: said('Had a look at the lights, all working now.') })
  assert.deepEqual(none.readings, [], 'no numbers said, no readings')
  assert.deepEqual(none.parts, [])
})

test('the phone listens for the firm\'s own parts and the trade\'s words', () => {
  const words = tradeWords({ trade: 'electrical', priceList, van: van('opr_02') })
  assert.ok(words.includes('RCBO') && words.includes('Zs') && words.includes('2.5mm twin and earth'))
  assert.ok(words.length <= 100)
})

test('the engine works the report out again, and signing puts the parts on the job and takes them off the van', async () => {
  const { as, engine } = demo()
  const kofi = as('kofi').client
  const jo = as('jo').client
  const draft = await kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: electrician })
  assert.equal(draft.status, 'draft')
  assert.deepEqual(draft.parts.map((p) => [p.itemId, p.quantity]), [['itm_11', 2], ['itm_12', 2]])
  assert.equal(draft.readings.length, 3)
  const again = await kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: electrician.slice(0, 4) })
  assert.equal(again.id, draft.id, 'one draft per job, replaced as they add to it')
  assert.deepEqual(again.missing, ['left', 'next'])

  await assert.rejects(as('ryan').client.reports.save('job_1045', { operatorId: 'opr_02', segments: electrician }), { code: 'not_found' })
  await assert.rejects(kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: [] }), { code: 'invalid' })
  const madeUp = { ...draft.parts[0], from: { segment: 9, start: 0, end: 5 } }
  await assert.rejects(kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: electrician, parts: [madeUp] }), /point at the words/)

  // The engineer says three breakers, not two, and the cable came from the merchant.
  const [rcbo, cable] = draft.parts
  const mine = await kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: electrician, parts: [{ ...rcbo, quantity: 3 }, { ...cable, fromVan: false }] })
  const vanBefore = Object.fromEntries((await kofi.stock.list()).map((x) => [x.itemId, x.quantity]))
  const signed = await kofi.reports.sign(mine.id)
  assert.equal(signed.status, 'signed')
  assert.equal(signed.signedBy, 'Kofi Asante')
  const job = (await jo.jobs.get('job_1045'))!
  assert.deepEqual(job.lines.slice(-2).map((l) => [l.itemId, l.quantity, l.unitPrice, l.fromVan]), [['itm_11', 3, 3200, 'opr_02'], ['itm_12', 2, 180, undefined]])
  const vanAfter = Object.fromEntries((await kofi.stock.list()).map((x) => [x.itemId, x.quantity]))
  assert.equal(vanAfter.itm_11, vanBefore.itm_11 - 3)
  assert.equal(vanAfter.itm_12, vanBefore.itm_12, 'merchant cable leaves the van alone')
  assert.match((await jo.log.list({ jobId: 'job_1045' }))[0].summary, /^Kofi Asante signed off the job report for J-1045, 2 parts added$/)
  await assert.rejects(kofi.reports.sign(mine.id), /already signed off/)
  await assert.rejects(kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: electrician }), /already signed off/)
  assert.equal((await jo.reports.forJob('job_1045')).length, 1, 'the office reads it too')
  assert.equal(engine.data.reports.filter((r) => r.jobId === 'job_1045').length, 1)
})

test('a part that could be two items has to be picked before signing', async () => {
  const { as } = demo()
  const tom = as('tom').client
  const job = await as('jo').client.jobs.create({
    title: 'Bath waste', trade: 'plumbing', status: 'on_site', priority: 'normal', customerId: 'cus_01', siteId: 'sit_01',
    operatorIds: ['opr_04'], start: new Date().toISOString(), end: new Date(Date.now() + 3_600_000).toISOString(), lines: [], checks: [],
  })
  const r = await tom.reports.save(job.id, { operatorId: 'opr_04', segments: said('Replaced two elbows under the bath.') })
  await assert.rejects(tom.reports.sign(r.id), /Pick which part/)
  const picked = await tom.reports.save(job.id, { operatorId: 'opr_04', segments: r.segments, parts: [{ ...r.parts[0], itemId: 'itm_04', choices: undefined }] })
  const signed = await tom.reports.sign(picked.id)
  assert.equal(signed.parts[0].description, '15mm compression elbow')
})

test("talking some more keeps the engineer's fixes to the parts already said", () => {
  const input = { trade: 'plumbing' as const, priceList, van: van('opr_03') }
  const first = said('Swapped the cold feed isolating valve for a new fifteen mil isolating valve.')
  const before = buildReport({ ...input, segments: first }).parts
  const fixed = before.map((p) => ({ ...p, quantity: 2, quantitySaid: true, fromVan: false }))
  const more = [...first, ...said('Also replaced two elbows under the bath.')]
  const after = keepFixes(buildReport({ ...input, segments: more }).parts, fixed)
  assert.deepEqual(after[0], fixed[0], 'the fixed valve stays fixed')
  assert.deepEqual(after[1].choices, ['itm_03', 'itm_04'], 'the new part is worked out as said')
})

test('a heating job: testing a valve is not using one', () => {
  const r = buildReport({
    trade: 'heating',
    priceList,
    van: van('opr_03'),
    segments: said('Drained the system down and fitted six new Drayton TRVs off the van.', 'Refilled, bled the radiators and checked every valve, no leaks. System pressure one point two bar.'),
  })
  assert.deepEqual(r.parts.map((p) => [p.itemId, p.quantity, p.fromVan]), [['itm_07', 6, true]])
  assert.deepEqual(r.readings.map((x) => [x.label, x.value]), [['Leak check', 'No leaks'], ['Pressure', '1.2 bar']])
})

test('a parts sentence stays in the report even when it names things the price list does not have', () => {
  const r = buildReport({ trade: 'electrical', priceList, van: van('opr_02'), segments: electrician })
  const parts = r.sections.find((s) => s.topic === 'parts')
  assert.ok(parts?.lines.some((l) => l.text.startsWith('Took the board and the breakers off the van')))
})

test('a service uses no parts: "serviced the boiler" is not a new boiler', () => {
  const r = buildReport({ trade: 'gas', priceList, van: van('opr_01'), segments: said('Serviced the boiler and cleaned the condensate trap.') })
  assert.deepEqual(r.parts, [])
  const fitted = buildReport({ trade: 'gas', priceList, van: van('opr_01'), segments: said('Fitted a new combi boiler.') })
  assert.equal(fitted.parts[0]?.itemId, 'itm_01')
})
