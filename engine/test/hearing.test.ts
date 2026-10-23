// How Field hears the engineer with and without signal: plain rules, tested without a phone.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { afterListening, canHearLater, chooseHearing, fixTradeWords, heardLater, MAX_TRIES, waitingSegment, type HearingCaps, type Recording } from '../kit/hearing.ts'
import { buildReport } from '../kit/report.ts'
import { priceList } from '../../core/src/data/mock.ts'
import { demo } from './helpers.ts'

const at = '2026-10-22T09:00:00Z'
const caps = (c: Partial<HearingCaps>): HearingCaps => ({ recogniser: true, onDevice: false, canRecord: true, ...c })
const rec = (r: Partial<Recording> = {}): Recording => ({ id: 'voice_1', jobId: 'job_1', uri: 'file:///voice/voice_1.wav', at, state: 'waiting', tries: 0, ...r })

test('hearing on the phone comes first, with no recording to keep', () => {
  assert.deepEqual(chooseHearing(caps({ onDevice: true })), { how: 'phone', offline: true, keep: false })
  assert.deepEqual(chooseHearing(caps({ onDevice: true, canRecord: false })), { how: 'phone', offline: true, keep: false })
  // On the phone wins even with signal: words never leave the phone when they don't need to.
  assert.equal(chooseHearing(caps({ onDevice: true, online: true, model: true })).how, 'phone')
})

test("Ardent's own model is next, then the phone with signal", () => {
  assert.equal(chooseHearing(caps({ model: true, online: false })).how, 'model')
  assert.equal(chooseHearing(caps({ model: true, online: false })).offline, true)
  const online = chooseHearing(caps({ online: true }))
  assert.equal(online.how, 'phone-online')
  assert.equal(online.offline, false)
  assert.equal(online.keep, true, 'the recording is kept in case the signal goes')
  assert.match(online.say!, /needs signal/)
  // Signal not known yet: try the phone, still keeping the recording.
  assert.equal(chooseHearing(caps({})).how, 'phone-online')
})

test('with no signal and no way to write, the recording is kept, and typing is the last resort', () => {
  const offline = chooseHearing(caps({ online: false }))
  assert.equal(offline.how, 'record')
  assert.equal(offline.keep, true)
  assert.match(offline.say!, /keeps the recording/)
  // Android 12 and older can't keep a recording.
  assert.equal(chooseHearing(caps({ online: false, canRecord: false })).how, 'type')
  // No recogniser and no model: nothing could ever write a recording up, so they type.
  assert.equal(chooseHearing(caps({ recogniser: false, online: true })).how, 'type')
  // With Ardent's model, the same phone hears with no signal.
  assert.equal(chooseHearing(caps({ recogniser: false, model: true })).how, 'model')
  assert.equal(chooseHearing(caps({ recogniser: false, canRecord: false })).how, 'type')
  // The microphone refused beats everything.
  assert.deepEqual(chooseHearing(caps({ refused: true, onDevice: true })).how, 'type')
})

test('when listening ends, words are kept, and the recording waits only when it holds more', () => {
  const r = { id: 'voice_1', jobId: 'job_1', uri: 'file:///v.wav', at }
  assert.deepEqual(afterListening({ text: ' Fitted a new TRV. ', endedBy: 'done', recording: r, how: 'phone' }), { text: 'Fitted a new TRV.' })
  // The signal went part way: the words so far, and the recording to write in the rest.
  const cut = afterListening({ text: 'Fitted a new', endedBy: 'network', recording: r, how: 'phone-online' })
  assert.equal(cut.text, 'Fitted a new')
  assert.equal(cut.waiting?.state, 'waiting')
  assert.equal(cut.waiting?.tries, 0)
  // Recording only: nothing written yet, all of it waits.
  assert.deepEqual(afterListening({ text: '', endedBy: 'done', recording: r, how: 'record' }), { waiting: { ...r, state: 'waiting', tries: 0 } })
  // Signal went and nothing was recorded: only what was heard, nothing invented.
  assert.deepEqual(afterListening({ text: 'Fitted', endedBy: 'network', how: 'phone-online' }), { text: 'Fitted' })
  assert.deepEqual(afterListening({ text: '  ', endedBy: 'network', how: 'phone-online' }), {})
})

test('a waiting recording is written up as soon as the phone can hear it', () => {
  assert.equal(canHearLater(rec(), { recogniser: true, canRecord: true, onDevice: true }), 'phone')
  assert.equal(canHearLater(rec(), { recogniser: true, canRecord: true, onDevice: false, model: true }), 'model')
  assert.equal(canHearLater(rec(), { recogniser: true, canRecord: true, onDevice: false, online: true }), 'phone-online')
  // Still no signal and no pack: it keeps waiting.
  assert.equal(canHearLater(rec(), { recogniser: true, canRecord: true, onDevice: false, online: false }), undefined)
  assert.equal(canHearLater(rec(), { recogniser: true, canRecord: true, onDevice: false }), undefined, 'unknown signal is not signal')
  // Given up after a few tries, and never twice.
  assert.equal(canHearLater(rec({ tries: MAX_TRIES }), { recogniser: true, canRecord: true, onDevice: true }), undefined)
  assert.equal(canHearLater(rec({ state: 'heard' }), { recogniser: true, canRecord: true, onDevice: true }), undefined)
})

test('words from a recording fill in what the signal cut short, unless the engineer changed it', () => {
  const r = rec()
  const before = [{ text: 'Swapped the tap.', at }, waitingSegment('Fitted a new', r)]
  const full = heardLater(before, r, 'Fitted a new TRV on the lounge radiator.')
  assert.equal(full.result, 'replaced')
  assert.deepEqual(full.segments[1], { text: 'Fitted a new TRV on the lounge radiator.', at, audio: 'voice_1', later: true })
  assert.deepEqual(full.segments[0], before[0], 'other words are untouched')

  // They typed over it while waiting: their words stay.
  const edited = [{ ...before[1], text: 'Fitted a new TRV in the lounge.' }]
  const kept = heardLater(edited, r, 'Fitted a new TRV on the lounge radiator.')
  assert.equal(kept.result, 'kept-edit')
  assert.deepEqual(kept.segments[0], { text: 'Fitted a new TRV in the lounge.', at, audio: 'voice_1' })

  // A signed report is never changed.
  assert.equal(heardLater(before, r, 'More words', { signed: true }).segments, before)
  // Nothing more in the sound: the words stay as they were, no longer waiting.
  const empty = heardLater(before, r, '  ')
  assert.equal(empty.result, 'empty')
  assert.deepEqual(empty.segments[1], { text: 'Fitted a new', at, audio: 'voice_1' })
})

test('a recording made with no words at all is added where it was made, for the engineer to check', () => {
  const r = rec({ topic: 'tests', followUp: 'gas-readings' })
  const out = heardLater([{ text: 'Serviced the boiler.', at }], r, 'Working pressure twenty mil bar.', { heard: 'Working pressure twenty mil bar' })
  assert.equal(out.result, 'added')
  assert.deepEqual(out.segments[1], { text: 'Working pressure twenty mil bar.', at, audio: 'voice_1', later: true, heard: 'Working pressure twenty mil bar', topic: 'tests', followUp: 'gas-readings' })
  // The report builds from it like any other words, with nothing filled in.
  const built = buildReport({ segments: out.segments, trade: 'gas', priceList, van: [] })
  assert.ok(built.sections.flatMap((s) => s.lines).every((l) => out.segments[l.from.segment].text.includes(l.text.replace(/\.$/, '').slice(0, 10))))
})

test('trade words the phone often mishears are put right, and nothing is added', () => {
  const firm = ['Worcester Bosch Greenstar', 'Vaillant ecoTEC', 'Baxi 600', 'RCBO 32A']
  const fix = (t: string) => fixTradeWords(t, firm).text
  assert.equal(fix('Serviced the combie and fitted a new r c b o'), 'Serviced the combi and fitted a new RCBO')
  assert.equal(fix('Worster Bosch boiler, flu gas analyser reading fine'), 'Worcester Bosch boiler, flue gas analyser reading fine')
  assert.equal(fix('swapped the worcester bosh for a valiant'), 'swapped the Worcester Bosch for a Vaillant')
  assert.equal(fix('insulation over 200 mega ohms, zed s 0.38'), 'insulation over 200 megohms, Zs 0.38')
  assert.equal(fix('Tested the R.C.D. and filled in the see pea twelve.'), 'Tested the RCD and filled in the CP12.')
  assert.equal(fix('Topped up the inhibiter, checked the tun dish and the G three paperwork'), 'Topped up the inhibitor, checked the tundish and the G3 paperwork')
  assert.equal(fix('Ran 2.5 twin in earth to a new TRV'), 'Ran 2.5 twin and earth to a new TRV')
  // What the phone wrote is kept beside it.
  assert.deepEqual(fixTradeWords('Serviced the combie', firm), { text: 'Serviced the combi', heard: 'Serviced the combie' })
})

test('ordinary words and numbers are left alone', () => {
  const firm = ['Worcester Bosch Greenstar']
  const same = (t: string) => assert.deepEqual(fixTradeWords(t, firm), { text: t })
  same('I had a word with the customer and she is happy.')
  same('Fitted a b and q tap they bought themselves.')
  same('2 x 15mm elbows, 1 2 3 checks done.')
  same('Had flu last week so came back today.')
  // A brand the firm never fits isn't changed.
  same('The customer was valiant about the mess.')
  // Back from Baxi only when the firm fits Baxi.
  same('Came back see the job later.')
  // Already right stays right.
  same('Zs 0.38, insulation over 200 megohms, CP12 done, combi serviced.')
})

test('putting words right never makes a sentence longer', () => {
  const firm = ['Worcester Bosch', 'Vaillant', 'Baxi']
  const samples = ['r c b o and r c d tested', 'worster bosch combie', 'flu pipe sealed, see pea 12 done', 'mega ohms fine', 'p r v and t r v swapped', 'a r c d was tripping']
  for (const t of samples) {
    const out = fixTradeWords(t, firm).text
    assert.ok(out.split(/\s+/).length <= t.split(/\s+/).length, `${t} -> ${out}`)
  }
  assert.equal(fixTradeWords('a r c d was tripping', firm).text, 'a RCD was tripping')
})

test('the engine keeps the marks that tie words to a recording, and nothing it does not know', async () => {
  const { as } = demo()
  const kofi = as('kofi').client
  const segments = [
    { text: 'Swapped the fuse board for a new RCBO board.', at, audio: 'voice_1', waiting: true, waitingText: 'Swapped the fuse board for a new RCBO board.', heard: 'Swapped the fuse board for a new r c b o board.' },
    { text: 'Tested everything, all fine.', at, audio: 'voice_2', later: true, waitingText: 'dropped when not waiting', played: true },
  ]
  const draft = await kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: segments as never })
  assert.deepEqual(draft.segments, [segments[0], { text: 'Tested everything, all fine.', at, audio: 'voice_2', later: true }])
  // A recording id is a plain name, never a path off the phone.
  await assert.rejects(kofi.reports.save('job_1045', { operatorId: 'opr_02', segments: [{ text: 'Fitted a tap.', at, audio: 'file:///data/voice.wav' }] }), /unknown recording/)
})

test('a job with no signal: nothing said is lost, and the words land once the phone can hear', () => {
  // Android with no speech pack, in a basement.
  const phone: HearingCaps = { recogniser: true, onDevice: false, canRecord: true, online: false }
  const plan = chooseHearing(phone)
  assert.equal(plan.how, 'record')
  const held = afterListening({ text: '', endedBy: 'done', recording: { id: 'voice_9', jobId: 'job_1', uri: 'file:///v9.wav', at, topic: 'work' }, how: plan.how })
  const kept = held.waiting!
  let segments: ReturnType<typeof heardLater>['segments'] = []
  // Still no signal: it waits, and the report has nothing made up in it.
  assert.equal(canHearLater(kept, phone), undefined)
  assert.equal(segments.length, 0)
  // Back in the van with signal.
  const how = canHearLater(kept, { ...phone, online: true })
  assert.equal(how, 'phone-online')
  const fixed = fixTradeWords('Swapped the combie for a new worcester bosh', ['Worcester Bosch'])
  segments = heardLater(segments, kept, fixed.text, { heard: fixed.heard }).segments
  assert.deepEqual(segments, [{ text: 'Swapped the combi for a new Worcester Bosch', at, audio: 'voice_9', later: true, heard: 'Swapped the combie for a new worcester bosh', topic: 'work' }])
})
