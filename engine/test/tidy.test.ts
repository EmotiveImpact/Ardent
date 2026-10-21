// Claude's tidy-up of a job report is checked against the plain report before anyone sees it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { priceList, stock } from '../../core/src/data/mock.ts'
import { buildReport } from '../kit/report.ts'
import { checkTidy, redact, tidyPrompt } from '../kit/tidy.ts'

const at = '2026-10-21T15:00:00Z'
const report = buildReport({
  trade: 'electrical',
  priceList,
  van: stock.filter((s) => s.operatorId === 'opr_02'),
  segments: [
    'Swapped the old fuse board for a ten-way dual RCD unit. Added two thirty-two amp breakers for the kitchen and the shower circuit.',
    "Tested everything. Zs on the shower's nought point three eight, RCDs tripping at twenty-two and twenty-five milliseconds, insulation's over two hundred meg on all circuits.",
    "One thing, the bathroom light's got no earth at the fitting. I've left it as it was and told Mrs Shah.",
    'She wants a quote for an extra socket in the garage.',
  ].map((text) => ({ text, at })),
})

const good = {
  work: ['Replaced the old fuse board with a 10-way dual RCD unit.', 'Added 2 32A breakers for the kitchen and shower circuits.'],
  tests: ['Tested all circuits.', 'Zs on the shower circuit was 0.38 Ω, RCDs tripped at 22 and 25 ms, and insulation resistance was over 200 MΩ on all circuits.'],
  left: ['The bathroom light has no earth at the fitting. Left as found and the customer was told.'],
  next: ['The customer would like a quote for an extra socket in the garage.'],
}

test('a faithful rewrite passes, and new everyday words are listed for the engineer', () => {
  const c = checkTidy(report, good, priceList)
  assert.deepEqual(c.problems, [])
  assert.equal(c.ok, true)
  assert.ok(c.newWords.includes('resistance'))
})

test('a changed or invented number, a lost "no", a moved fact or an unsaid part is refused', () => {
  const bad = (change: Partial<typeof good>) => checkTidy(report, { ...good, ...change }, priceList).problems
  assert.match(bad({ tests: ['Tested all circuits. Zs 0.38 Ω, RCDs tripped at 22 and 25 ms, insulation over 200 MΩ. Ze 0.21 Ω.'] }).join(), /added the number 0.21/)
  assert.match(bad({ tests: ['Tested all circuits. Zs 0.38 Ω, RCDs tripped at 22 ms, insulation over 200 MΩ.'] }).join(), /dropped the number 25/)
  assert.match(bad({ left: ['The bathroom light earth at the fitting was left as found, and the customer was told.'] }).join(), /lost a "no"/)
  assert.match(bad({ next: ['Quote for an extra socket in the garage. Fit a new isolating valve.'] }).join(), /names a part that wasn't said/)
  assert.match(bad({ work: undefined as never }).join(), /Work done: missing/)
  assert.match(checkTidy(report, { ...good, parts: ['RCBO'] }).problems.join(), /Added a section/)
  assert.equal(checkTidy(report, 'Sure! Here is the report').ok, false)
})

test("only the section lines go to Claude, with the customer's name taken out", () => {
  const { user } = tidyPrompt(report, ['Mrs Shah', 'Priya Shah'])
  assert.match(user, /told the customer/)
  assert.doesNotMatch(user, /Shah/)
  assert.equal(redact('Rang Priya to say', ['Priya Shah']), 'Rang the customer to say')
})
