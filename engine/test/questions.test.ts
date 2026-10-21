// Follow-up questions: one plain rule each, and every question says why it was asked.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ReportSegment, ReportTick, ReportTopic, Trade } from '../../core/src/data/model.ts'
import { priceList, stock } from '../../core/src/data/mock.ts'
import { applyReply, explain, FOLLOW_UPS, MAX_PER_ANSWER, nextFollowUp, ruleProblem, type FollowUpContext } from '../kit/questions.ts'
import { buildReport, TICKS, withTicks } from '../kit/report.ts'

const at = '2026-10-21T15:00:00Z'
const van = stock.filter((s) => s.operatorId === 'opr_02')

/** The report as the screen holds it after these answers. */
function ctx(trade: Trade, ticked: ReportTick[], answering: ReportTopic, segments: ReportSegment[]): FollowUpContext {
  const built = buildReport({ segments, trade, priceList, van })
  return { trade, answering, segments, report: withTicks(built, built.parts, ticked) }
}
const answer = (topic: ReportTopic, text: string): ReportSegment => ({ text, at, topic })

test('every rule is well formed: a unique id, a reason, a question and a way out', () => {
  const ids = FOLLOW_UPS.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const r of FOLLOW_UPS) {
    assert.match(r.id, /^[a-z0-9-]{1,60}$/)
    assert.equal(ruleProblem(r), undefined, `${r.id} passes the same check as a firm's own`)
    assert.ok(r.why.length > 10, `${r.id} says why`)
    assert.ok(r.replies.length >= 2, `${r.id} has a way out`)
    assert.ok(!r.ask.includes('{said}') || r.when.some((c) => 'says' in c), `${r.id} only quotes when it listens for words`)
    for (const reply of r.replies) if (reply.does === 'tick') assert.ok(TICKS.some((t) => t.tick === reply.tick))
  }
})

test('an electrical test with no numbers asks for readings, and says why', () => {
  const c = ctx('electrical', ['repair', 'tests'], 'tests', [answer('work', 'Replaced the socket in the kitchen.'), answer('tests', 'Tested it all, everything working fine.')])
  const f = nextFollowUp(c, [])
  assert.equal(f?.rule.id, 'electrical-readings')
  assert.ok(f!.checks.every((x) => x.ok))
  assert.deepEqual(
    f!.checks.map((x) => x.text),
    ['For electrical', 'After “tests”', 'No readings yet'],
  )
  // With numbers, nothing to ask.
  const said = ctx('electrical', ['repair', 'tests'], 'tests', [answer('tests', 'Zs nought point three eight ohms, RCD tripped at twenty-two milliseconds.')])
  assert.equal(nextFollowUp(said, []), undefined)
})

test('"No readings" writes the line and the follow-up never asks twice', () => {
  const segs = [answer('tests', 'Tested it all, everything working fine.')]
  const c = ctx('electrical', ['tests'], 'tests', segs)
  const f = nextFollowUp(c, [])!
  const out = applyReply(segs, ['tests'], f, f.rule.replies[1], at)
  assert.deepEqual(out.segments.at(-1), { text: 'No readings taken.', at, topic: 'tests', followUp: 'electrical-readings' })
  assert.equal(nextFollowUp(ctx('electrical', ['tests'], 'tests', out.segments), [f.rule.id]), undefined)
})

test("a fault said but not ticked: asks, and Yes ticks it and moves that sentence under faults", () => {
  const segs = [answer('work', "Replaced the kitchen light. The bathroom light's got no earth at the fitting.")]
  const c = ctx('electrical', ['repair'], 'work', segs)
  const f = nextFollowUp(c, [])!
  assert.equal(f.rule.id, 'fault-not-ticked')
  assert.equal(f.question, 'You said “The bathroom light’s got no earth at the fitting.” Add that as something left or wrong?'.replace('’', "'"))
  const out = applyReply(segs, ['repair'], f, f.rule.replies[0], at)
  assert.deepEqual(out.ticked, ['repair', 'left'])
  const r = buildReport({ segments: out.segments, trade: 'electrical', priceList, van })
  const of = (t: string) => r.sections.find((s) => s.topic === t)?.lines.map((l) => l.text) ?? []
  assert.deepEqual(of('work'), ['Replaced the kitchen light.'])
  assert.deepEqual(of('left'), ["The bathroom light's got no earth at the fitting."])
  // Fixing a fault isn't a fault left behind.
  assert.notEqual(nextFollowUp(ctx('electrical', ['repair'], 'work', [answer('work', 'Replaced the cracked socket.')]), [])?.rule.id, 'fault-not-ticked')
})

test('a new boiler asks which one and for the Benchmark, unless they already said', () => {
  const segs = [answer('work', 'Took out the old back boiler and fitted a new combi.')]
  const c = ctx('gas', ['fitted', 'parts'], 'work', segs)
  const first = nextFollowUp(c, [])!
  assert.equal(first.rule.id, 'which-boiler')
  const said = applyReply(segs, ['fitted', 'parts'], first, first.rule.replies[0], at, 'A Worcester Bosch Greenstar 4000.')
  const second = nextFollowUp(ctx('gas', ['fitted', 'parts'], 'work', said.segments), [first.rule.id], 1)!
  assert.equal(second.rule.id, 'benchmark')
  const notYet = applyReply(said.segments, ['fitted', 'parts'], second, second.rule.replies[1], at)
  const r = buildReport({ segments: notYet.segments, trade: 'gas', priceList, van })
  assert.deepEqual(r.sections.find((s) => s.topic === 'left')?.lines.map((l) => l.text), ['Benchmark checklist still to do.'])
  // A short note a follow-up wrote still goes in.
  const eic = FOLLOW_UPS.find((x) => x.id === 'electrical-certificate')!
  const done = applyReply([], [], { ...first, rule: eic }, eic.replies[0], at)
  assert.deepEqual(buildReport({ segments: done.segments, trade: 'electrical', priceList, van }).sections[0].lines.map((l) => l.text), ['EIC done.'])
  // A plumber fitting a new tap gets neither.
  assert.equal(nextFollowUp(ctx('plumbing', ['fitted', 'parts'], 'work', [answer('work', 'Fitted a new boiler filling loop.')]), [])?.rule.id === 'which-boiler', false)
})

test('an unsafe gas appliance asks how it was classed, then for the warning notice', () => {
  const segs = [answer('work', 'Serviced the fire.'), answer('left', 'The fire is spilling so I capped it.')]
  const c = ctx('gas', ['service', 'left'], 'left', segs)
  const first = nextFollowUp(c, [])!
  assert.equal(first.rule.id, 'gas-unsafe-class')
  const classed = applyReply(segs, ['service', 'left'], first, first.rule.replies[0], at)
  const second = nextFollowUp(ctx('gas', ['service', 'left'], 'left', classed.segments), [first.rule.id], 1)!
  assert.equal(second.rule.id, 'gas-warning-notice')
})

test('fitting something with no parts asks; Yes ticks parts so the parts question comes next', () => {
  const segs = [answer('work', 'Swapped the washer on the bathroom tap.')]
  const c = ctx('plumbing', ['repair'], 'work', segs)
  const f = nextFollowUp(c, [])!
  assert.equal(f.rule.id, 'parts-for-fitting')
  assert.deepEqual(applyReply(segs, ['repair'], f, f.rule.replies[0], at).ticked, ['repair', 'parts'])
})

test('a rule names exactly which check stopped it', () => {
  const c = ctx('gas', ['fitted', 'parts'], 'work', [answer('work', 'Fitted a new Vaillant combi.')])
  const e = explain(FOLLOW_UPS.find((r) => r.id === 'which-boiler')!, c)
  assert.equal(e.asks, false)
  assert.deepEqual(e.checks.filter((x) => !x.ok).map((x) => x.text), ['The report already says “vaillant”'])
})

test('no answer gets more than the cap, and reports without ticks get none', () => {
  const c = ctx('electrical', ['tests'], 'tests', [answer('tests', 'Tested it all.')])
  assert.equal(nextFollowUp(c, [], MAX_PER_ANSWER), undefined)
  assert.equal(nextFollowUp({ ...c, report: { ...c.report, ticked: undefined } }, []), undefined)
})

test('the engine keeps a moved sentence and which follow-up asked, and turns away bad ones', async () => {
  const { demo } = await import('./helpers.ts')
  const kofi = demo().as('kofi').client
  const text = "Replaced the kitchen light. The bathroom light's got no earth at the fitting."
  const start = text.indexOf('The bathroom')
  const segments: ReportSegment[] = [
    { text, at, topic: 'work', moved: [{ start, end: text.length, topic: 'left' }] },
    { text: 'Customer told.', at, topic: 'left', followUp: 'customer-told' },
  ]
  const r = await kofi.reports.save('job_1045', { operatorId: 'opr_02', segments, ticked: ['repair', 'left'] })
  assert.deepEqual(r.segments, segments)
  assert.deepEqual(r.sections.find((s) => s.topic === 'left')?.lines.map((l) => l.text), ["The bathroom light's got no earth at the fitting.", 'Customer told.'])
  await assert.rejects(kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: [{ text, at, moved: [{ start: 0, end: 999, topic: 'left' }] }] }), /moved sentence/)
  await assert.rejects(kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: [{ text, at, followUp: 'Not A Rule!' }] }), /unknown follow-up/)
})

test("a firm's own questions: the office adds and switches them, phones read them, engineers can't change them", async () => {
  const { demo } = await import('./helpers.ts')
  const { activeRules } = await import('../kit/questions.ts')
  const d = demo()
  const jo = d.as('jo').client
  const kofi = d.as('kofi').client
  const start = await kofi.followUps.get()
  assert.equal(start.playbook.length, FOLLOW_UPS.length)
  assert.deepEqual([start.own, start.off], [[], []])

  const rule = {
    name: 'Gas meter left off',
    why: 'A customer left without gas rings the office first.',
    trades: ['gas' as const],
    after: 'any' as const,
    when: [{ says: ['off at the meter', 'meter off'] }, { nowhere: ['back on'] }],
    ask: 'You said “{said}” Did you turn it back on?',
    replies: [
      { label: 'Yes', does: 'note' as const, topic: 'work' as const, note: 'Gas turned back on at the meter.' },
      { label: 'No', does: 'note' as const, topic: 'left' as const, note: 'Gas left off at the meter.' },
    ],
  }
  await assert.rejects(kofi.followUps.save(rule), /only the office/)
  await assert.rejects(jo.followUps.save({ ...rule, replies: rule.replies.slice(0, 1) }), /2 to 4 buttons/)
  await assert.rejects(jo.followUps.save({ ...rule, when: [{ nowhere: ['back on'] }], ask: 'You said “{said}”?' }), /Only quote/)
  const saved = await jo.followUps.save(rule)
  assert.equal(saved.own[0].id, 'own-gas-meter-left-off')
  assert.equal(saved.own[0].by, 'Jo Pickering')
  await jo.followUps.switch('benchmark', false)

  // The engineer's phone gets the firm's set: playbook first, own after, minus what's off.
  const phone = await kofi.followUps.get()
  const rules = activeRules(phone)
  assert.ok(!rules.some((r) => r.id === 'benchmark'))
  assert.equal(rules.at(-1)!.id, 'own-gas-meter-left-off')
  const c = ctx('gas', ['repair'], 'work', [answer('work', 'Turned it off at the meter while I swapped the valve.')])
  assert.equal(nextFollowUp(c, [], 0, rules.filter((r) => r.id.startsWith('own-')))?.question, 'You said “Turned it off at the meter while I swapped the valve.” Did you turn it back on?')

  // Changing keeps the id; removing it takes it out of the off list too.
  const changed = await jo.followUps.save({ ...rule, id: 'own-gas-meter-left-off', ask: 'Did you turn the gas back on?' })
  assert.equal(changed.own.length, 1)
  assert.equal(changed.own[0].ask, 'Did you turn the gas back on?')
  await jo.followUps.switch('own-gas-meter-left-off', false)
  const gone = await jo.followUps.remove('own-gas-meter-left-off')
  assert.deepEqual([gone.own, gone.off], [[], ['benchmark']])
  await assert.rejects(jo.followUps.switch('no-such-rule', false), /not found|follow-up question/)
})
