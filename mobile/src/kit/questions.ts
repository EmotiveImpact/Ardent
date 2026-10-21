/**
 * Ardent's follow-up questions: the rule book behind "You didn't give any
 * readings" and "You said the light has no earth. Add that as a fault?".
 *
 * Each follow-up is one rule written as plain data, so anyone can read why a
 * question was asked and add a new one without touching the screen. A rule
 * says which answer it listens to, what has to be true, what to ask and what
 * each button does. After every answer the rules are checked top to bottom
 * and the first that holds is asked; each rule asks at most once a report,
 * and no answer gets more than MAX_PER_ANSWER of them, so it never nags.
 * Same rules, same questions, on the phone with no signal and in the engine.
 */
import type { FollowUp, FollowUpReply as Reply, FollowUpSet, ReportSegment, ReportTick, ReportTopic, Trade } from '../data/core/model'
import { needed, sentences, spoken, TICKS, tidy, type BuiltReport } from './report'

export type { FollowUp, FollowUpCheck as Check, FollowUpReply as Reply } from '../data/core/model'

/** The most follow-ups one answer can get. */
export const MAX_PER_ANSWER = 3

// Word lists used by more than one rule.
const LEFT_WORDS = ['no earth', 'unsafe', 'at risk', 'immediately dangerous', 'made safe', 'made it safe', 'capped', "couldn't", 'could not', 'unable', 'no access', 'needs replacing', 'needs a new', 'needs to be', 'leaking', 'still leak*', 'cracked', 'corroded', 'condemned', 'warning notice', 'ran out', 'not to current regs', 'not to regs']
const FIXED_WORDS = ['swapped', 'replaced', 'fitted', 'installed', 'fixed', 'repaired', 'renewed', 'sorted', 'put in']
const FITTED_WORDS = ['fitted', 'installed', 'replaced', 'swapped', 'put in', 'renewed', 'new']
const BOILER_MAKES = ['worcester', 'bosch', 'vaillant', 'ideal', 'baxi', 'viessmann', 'glow-worm', 'glow worm', 'potterton', 'alpha', 'intergas', 'ariston', 'navien', 'main', 'vokera', 'remeha']
const TOLD_WORDS = ['told', 'explained', 'spoke to', 'showed', 'informed', 'let her know', 'let him know', 'let them know', 'customer knows', 'aware']
const NOT_NOW = { label: 'Skip', does: 'skip' } as const

/**
 * The rule book, checked top to bottom. To add a follow-up, add a rule here:
 * the screen, the engine and the rule book page all pick it up.
 */
export const FOLLOW_UPS: FollowUp[] = [
  // Said but not ticked: put it where it belongs.
  {
    id: 'fault-not-ticked',
    name: "A fault they didn't tick",
    why: 'Faults and unfinished work have to reach the office as faults, or nobody follows them up.',
    after: 'any',
    when: [{ notTicked: 'left' }, { says: LEFT_WORDS }, { unless: FIXED_WORDS }],
    ask: 'You said “{said}” Add that as something left or wrong?',
    replies: [
      { label: 'Yes, add it', does: 'tick', tick: 'left', move: true },
      { label: 'No', does: 'skip' },
    ],
  },
  {
    id: 'more-work-not-ticked',
    name: "More work they didn't tick",
    why: 'A customer asking for more is a quote the office can send today.',
    after: 'any',
    when: [{ notTicked: 'next' }, { says: ['quote', 'come back', 'wants', 'would like', 'asked for', 'asked about', 'recommend*', 'advised', 'next year'] }],
    ask: 'You said “{said}” Add that as more work for the office?',
    replies: [
      { label: 'Yes, add it', does: 'tick', tick: 'next', move: true },
      { label: 'No', does: 'skip' },
    ],
  },
  {
    id: 'tests-not-ticked',
    name: "Tests they didn't tick",
    why: 'Tests and readings go on certificates, so they belong in their own part of the report.',
    after: ['work', 'parts', 'left', 'next'],
    when: [{ notTicked: 'tests' }, { says: ['test*', 'reading*', 'pressure', 'zs', 'ze', 'rcd*', 'insulation', 'tightness', 'flue gas', 'commissioned'] }],
    ask: 'You said “{said}” Add that to tests and readings?',
    replies: [
      { label: 'Yes, add it', does: 'tick', tick: 'tests', move: true },
      { label: 'No', does: 'skip' },
    ],
  },

  // What the work said: things that should follow from it.
  {
    id: 'parts-for-fitting',
    name: 'Fitted something, no parts',
    why: "Fitting something uses parts, and parts that aren't in the report never reach the invoice.",
    after: ['work'],
    when: [{ notTicked: 'parts' }, { noParts: true }, { says: FITTED_WORDS }],
    ask: 'You fitted something. Did any parts go in?',
    hint: 'Off the van, from a merchant or the customer’s own',
    replies: [
      { label: 'Yes, add parts', does: 'tick', tick: 'parts' },
      { label: 'No parts', does: 'skip' },
    ],
  },
  {
    id: 'which-boiler',
    name: 'Which boiler went in',
    why: 'The office needs the make and model for the warranty, the Gas Safe notification and the invoice.',
    trades: ['gas', 'heating'],
    after: ['work'],
    when: [{ says: ['boiler', 'combi'] }, { says: FITTED_WORDS }, { nowhere: BOILER_MAKES }],
    ask: 'Which boiler did you fit?',
    hint: 'Say the make and model, for example Worcester Bosch Greenstar 4000',
    replies: [{ label: 'Say it', does: 'talk', topic: 'work' }, NOT_NOW],
  },
  {
    id: 'benchmark',
    name: 'Benchmark after a new boiler',
    why: 'Manufacturers ask for the Benchmark checklist before they honour the warranty.',
    trades: ['gas', 'heating'],
    after: ['work'],
    when: [{ says: ['boiler', 'combi'] }, { says: FITTED_WORDS }, { nowhere: ['benchmark'] }],
    ask: 'Have you filled in the Benchmark checklist?',
    replies: [
      { label: 'Yes, done', does: 'note', topic: 'work', note: 'Benchmark checklist filled in.' },
      { label: 'Not yet', does: 'note', topic: 'left', note: 'Benchmark checklist still to do.' },
    ],
  },
  {
    id: 'electrical-certificate',
    name: 'Certificate after a new board or circuit',
    why: 'A new consumer unit or circuit needs an Electrical Installation Certificate, and the office has to send it.',
    trades: ['electrical'],
    after: ['work'],
    when: [{ says: ['consumer unit', 'fuse board', 'board', 'new circuit', 'circuit'] }, { says: ['fitted', 'installed', 'replaced', 'swapped', 'added', 'new', 'ran'] }, { nowhere: ['eic', 'certificate', 'cert'] }],
    ask: 'Have you done the EIC for it?',
    hint: 'Electrical Installation Certificate',
    replies: [
      { label: 'Yes, done', does: 'note', topic: 'work', note: 'EIC done.' },
      { label: 'Not yet', does: 'note', topic: 'left', note: 'EIC still to do.' },
    ],
  },
  {
    id: 'leak-check',
    name: 'Leak check after pipework',
    why: 'A leak found the next day is a callback; saying it was checked protects the firm.',
    trades: ['plumbing', 'heating'],
    after: ['work'],
    when: [{ notTicked: 'tests' }, { says: ['leak*', 'weep*', 'drip*', 'pipe*', 'joint', 'valve'] }, { nowhere: ['no leak*', 'leak free', 'leak-free', 'checked for leaks', 'pressure test*'] }],
    ask: 'Did you check it for leaks afterwards?',
    replies: [
      { label: 'Yes, no leaks', does: 'note', topic: 'tests', note: 'Checked for leaks, none found.' },
      { label: 'Say what you found', does: 'talk', topic: 'tests' },
    ],
  },

  // Readings: a test with no numbers can't go on a certificate.
  {
    id: 'electrical-readings',
    name: 'Electrical tests with no readings',
    why: 'Certificates need the numbers, and they are easiest to say while the tester is still in hand.',
    trades: ['electrical'],
    after: ['tests'],
    when: [{ noReadings: true }],
    ask: "You didn't give any readings. Any Zs, RCD trip times or insulation?",
    hint: 'Say them as you read them off the tester',
    replies: [
      { label: 'Say them', does: 'talk', topic: 'tests' },
      { label: 'No readings', does: 'note', topic: 'tests', note: 'No readings taken.' },
    ],
  },
  {
    id: 'gas-readings',
    name: 'Gas checks with no readings',
    why: 'Working pressure, tightness and flue gas readings back up the gas safety record.',
    trades: ['gas'],
    after: ['tests'],
    when: [{ noReadings: true }],
    ask: "You didn't give any readings. Working pressure, tightness or flue gas?",
    hint: 'Say them as you read them off the analyser',
    replies: [
      { label: 'Say them', does: 'talk', topic: 'tests' },
      { label: 'No readings', does: 'note', topic: 'tests', note: 'No readings taken.' },
    ],
  },
  {
    id: 'heating-readings',
    name: 'Heating checks with no readings',
    why: 'System pressure and flow temperature show the system was left working.',
    trades: ['heating'],
    after: ['tests'],
    when: [{ noReadings: true }],
    ask: "You didn't give any readings. System pressure or flow temperature?",
    replies: [
      { label: 'Say them', does: 'talk', topic: 'tests' },
      { label: 'No readings', does: 'note', topic: 'tests', note: 'No readings taken.' },
    ],
  },
  {
    id: 'hvac-readings',
    name: 'HVAC checks with no readings',
    why: 'Pressures and temperatures are the record that the system was left working.',
    trades: ['hvac'],
    after: ['tests'],
    when: [{ noReadings: true }],
    ask: "You didn't give any readings. Pressures or temperatures?",
    replies: [
      { label: 'Say them', does: 'talk', topic: 'tests' },
      { label: 'No readings', does: 'note', topic: 'tests', note: 'No readings taken.' },
    ],
  },

  // Something left wrong: what has to happen next.
  {
    id: 'gas-unsafe-class',
    name: 'How an unsafe gas appliance was classed',
    why: 'The unsafe situations procedure classes it Immediately Dangerous or At Risk, and the office has to record which.',
    trades: ['gas'],
    after: ['left', 'work'],
    when: [{ says: ['unsafe', 'capped', 'made safe', 'made it safe', 'condemned', 'warning notice', 'disconnected', 'turned off'] }, { nowhere: ['immediately dangerous', 'at risk'] }],
    ask: 'How did you class it?',
    hint: 'Under the gas unsafe situations procedure',
    replies: [
      { label: 'Immediately Dangerous', does: 'note', topic: 'left', note: 'Classed Immediately Dangerous (ID).' },
      { label: 'At Risk', does: 'note', topic: 'left', note: 'Classed At Risk (AR).' },
      { label: 'Say it', does: 'talk', topic: 'left' },
    ],
  },
  {
    id: 'gas-warning-notice',
    name: 'Warning notice for an unsafe gas appliance',
    why: 'An unsafe appliance needs a warning notice left on site and the responsible person told.',
    trades: ['gas'],
    after: ['left', 'work'],
    when: [{ says: ['immediately dangerous', 'at risk', 'unsafe', 'capped', 'condemned'] }, { nowhere: ['warning notice', 'warning label', 'notice', 'label'] }],
    ask: 'Did you leave a warning notice and tell the customer?',
    replies: [
      { label: 'Yes, both', does: 'note', topic: 'left', note: 'Warning notice left and the customer told.' },
      { label: 'Say what you did', does: 'talk', topic: 'left' },
    ],
  },
  {
    id: 'customer-told',
    name: 'Customer told about a fault',
    why: 'If something is left wrong, the report should show the customer knows.',
    after: ['left'],
    when: [{ says: LEFT_WORDS }, { nowhere: TOLD_WORDS }],
    ask: 'Did you tell the customer?',
    replies: [
      { label: 'Yes', does: 'note', topic: 'left', note: 'Customer told.' },
      { label: 'Not yet', does: 'note', topic: 'left', note: 'Customer not told yet.' },
    ],
  },
  {
    id: 'no-access-card',
    name: 'No access: card or call',
    why: 'The office needs to know the customer was contacted before it rebooks.',
    after: ['left', 'work'],
    when: [{ says: ['no access', 'no one in', 'nobody in', 'nobody home', 'no answer', 'not in'] }, { nowhere: ['card', 'rang', 'called', 'phoned', 'texted'] }],
    ask: 'Did you leave a card or ring the customer?',
    replies: [
      { label: 'Left a card', does: 'note', topic: 'left', note: 'Left a card.' },
      { label: 'Rang them', does: 'note', topic: 'left', note: 'Rang the customer.' },
      NOT_NOW,
    ],
  },
]

// Checking a rule.

export interface FollowUpContext {
  trade: Trade
  /** The question just answered. */
  answering: ReportTopic
  segments: ReportSegment[]
  report: Pick<BuiltReport, 'parts' | 'readings'> & { ticked?: ReportTick[] }
}

/** One check, as the rule book page shows it, and whether it held. */
export interface Checked {
  text: string
  ok: boolean
}

export interface Explained {
  rule: FollowUp
  /** Whether it applies to this trade and this question at all. */
  applies: boolean
  checks: Checked[]
  asks: boolean
  /** The sentence that set it off, where it sits in the report. */
  sentence?: { segment: number; start: number; end: number; text: string }
  /** The question as it would be asked. */
  question: string
}

const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
/** One word or phrase as a pattern: whole words, any spacing, "test*" for test, tested, testing. */
const wordRe = (w: string) => new RegExp(`(?<![\\w'])${esc(w.toLowerCase()).replace(/\s+/g, '\\s+').replace(/\*/g, "[\\w'-]*")}(?![\\w'])`, 'i')
const hit = (text: string, words: string[]) => {
  const t = `${text} ${spoken(text)}`.toLowerCase()
  return words.find((w) => wordRe(w).test(t))
}
const list = (words: string[]) => (words.length > 6 ? `${words.slice(0, 6).join(', ')} and ${words.length - 6} more` : words.join(', '))
const tickLabel = (t: ReportTick) => TICKS.find((x) => x.tick === t)!.label
const quote = (s: string) => {
  const t = tidy(s)
  return t.length > 70 ? `${t.slice(0, 68).replace(/\s+\S*$/, '')}…` : t
}

/** Whether a rule would ask now, and every check with whether it held: the rule book page shows exactly this. */
export function explain(rule: FollowUp, ctx: FollowUpContext): Explained {
  const ticked = ctx.report.ticked ?? []
  const forTrade = !rule.trades || rule.trades.includes(ctx.trade)
  const forAnswer = rule.after === 'any' || rule.after.includes(ctx.answering)
  const applies = forTrade && forAnswer
  const checks: Checked[] = []
  if (rule.trades) checks.push({ text: `For ${rule.trades.join(' and ')}`, ok: forTrade })
  checks.push({ text: rule.after === 'any' ? 'After any answer' : `After “${rule.after.join('” or “')}”`, ok: forAnswer })

  // The sentence, in the answer just given, that every `says` and `unless` fits.
  const says = rule.when.filter((c): c is { says: string[] } => 'says' in c)
  const unless = rule.when.filter((c): c is { unless: string[] } => 'unless' in c)
  let sentence: Explained['sentence']
  if (says.length) {
    ctx.segments.forEach((seg, segment) => {
      if (sentence || seg.topic !== ctx.answering) return
      for (const p of sentences(seg.text)) {
        if (seg.moved?.some((m) => p.start >= m.start && p.end <= m.end)) continue
        if (says.every((c) => hit(p.text, c.says)) && unless.every((c) => !hit(p.text, c.unless))) {
          sentence = { segment, ...p }
          break
        }
      }
    })
  }
  const all = ctx.segments.map((s) => s.text).join(' ')
  for (const c of rule.when) {
    if ('says' in c) checks.push({ text: `The answer says ${list(c.says)}`, ok: !!sentence })
    else if ('unless' in c) checks.push({ text: `That sentence doesn't say ${list(c.unless)}`, ok: !!sentence })
    else if ('nowhere' in c) {
      const found = hit(all, c.nowhere)
      checks.push({ text: found ? `The report already says “${found}”` : `The report doesn't say ${list(c.nowhere)}`, ok: !found })
    } else if ('ticked' in c) checks.push({ text: `“${tickLabel(c.ticked)}” is ticked`, ok: ticked.includes(c.ticked) })
    else if ('notTicked' in c) checks.push({ text: `“${tickLabel(c.notTicked)}” isn't ticked`, ok: !ticked.includes(c.notTicked) })
    else if ('noReadings' in c) checks.push({ text: 'No readings yet', ok: ctx.report.readings.length === 0 })
    else if ('noParts' in c) checks.push({ text: 'No parts yet', ok: ctx.report.parts.length === 0 })
  }
  const asks = applies && checks.every((c) => c.ok)
  return { rule, applies, checks, asks, sentence, question: rule.ask.replace('{said}', sentence ? quote(sentence.text) : '…') }
}

/** Every rule against what's been said, for the rule book page. */
export function explainAll(ctx: FollowUpContext, rules: FollowUp[] = FOLLOW_UPS): Explained[] {
  return rules.map((r) => explain(r, ctx))
}

/**
 * The follow-up to ask now, or undefined. `asked` is the rules already asked
 * on this report; `thisAnswer` is how many this answer has had.
 */
export function nextFollowUp(ctx: FollowUpContext, asked: string[], thisAnswer = 0, rules: FollowUp[] = FOLLOW_UPS): Explained | undefined {
  if (!ctx.report.ticked || thisAnswer >= MAX_PER_ANSWER) return undefined
  for (const r of rules) {
    if (asked.includes(r.id)) continue
    const e = explain(r, ctx)
    if (e.asks) return e
  }
  return undefined
}

/**
 * What a reply does to the report: the words it adds, and the ticks. A talk
 * reply passes the words they said. Words a follow-up adds keep its id.
 */
export function applyReply(segments: ReportSegment[], ticked: ReportTick[], asked: Explained, reply: Reply, at: string, words = ''): { segments: ReportSegment[]; ticked: ReportTick[] } {
  const id = asked.rule.id
  if (reply.does === 'skip') return { segments, ticked }
  if (reply.does === 'note') return { segments: [...segments, { text: reply.note, at, topic: reply.topic, followUp: id }], ticked }
  if (reply.does === 'talk') return words.trim() ? { segments: [...segments, { text: words.trim(), at, topic: reply.topic, followUp: id }], ticked } : { segments, ticked }
  const next = TICKS.map((x) => x.tick).filter((t) => t === reply.tick || ticked.includes(t))
  const s = asked.sentence
  if (!reply.move || !s) return { segments, ticked: next }
  const topic = TICKS.find((x) => x.tick === reply.tick)!.needs
  return {
    segments: segments.map((g, i) => (i === s.segment ? { ...g, moved: [...(g.moved ?? []), { start: s.start, end: s.end, topic }] } : g)),
    ticked: next,
  }
}

/** Topics the ticks need that already have words, so the screen can skip asking them again. */
export function answered(r: Pick<BuiltReport, 'sections'> & { ticked?: ReportTick[] }): ReportTopic[] {
  return needed(r.ticked ?? []).filter((t) => r.sections.some((s) => s.topic === t && s.lines.length > 0))
}

/** The rules a firm's phones check, in order: the playbook, then the firm's own, less any switched off. */
export function activeRules(set: FollowUpSet): FollowUp[] {
  return [...set.playbook, ...set.own].filter((r) => !set.off.includes(r.id))
}

const TOPICS: ReportTopic[] = ['work', 'parts', 'tests', 'left', 'next']
const TRADES: Trade[] = ['gas', 'electrical', 'plumbing', 'heating', 'roofing', 'carpentry', 'fire', 'lifts', 'hvac', 'general']
const words = (w: unknown) => Array.isArray(w) && w.length > 0 && w.length <= 40 && w.every((x) => typeof x === 'string' && x.trim().length > 0 && x.length <= 40)
const text = (t: unknown, max: number) => typeof t === 'string' && t.trim().length > 0 && t.length <= max

/**
 * What's wrong with a rule someone wrote, in words for them, or undefined
 * when it's fine. The office's form and the engine both check with this.
 */
export function ruleProblem(r: Partial<FollowUp>): string | undefined {
  if (!text(r.name, 60)) return 'Give it a name, 60 characters at most'
  if (!text(r.ask, 200)) return 'Give it a question to ask, 200 characters at most'
  if (!text(r.why, 200)) return 'Say why Ardent asks, 200 characters at most'
  if (r.hint !== undefined && !(typeof r.hint === 'string' && r.hint.length <= 160)) return 'The hint is 160 characters at most'
  if (r.trades !== undefined && !(Array.isArray(r.trades) && r.trades.length > 0 && r.trades.every((t) => TRADES.includes(t)))) return 'Pick the trades it is for, or every trade'
  if (!(r.after === 'any' || (Array.isArray(r.after) && r.after.length > 0 && r.after.every((t) => TOPICS.includes(t))))) return 'Pick which question it listens to'
  if (!Array.isArray(r.when) || r.when.length === 0 || r.when.length > 8) return 'Give it at least 1 condition, or it would ask after every answer'
  for (const c of r.when) {
    const ok =
      ('says' in c && words(c.says)) ||
      ('unless' in c && words(c.unless)) ||
      ('nowhere' in c && words(c.nowhere)) ||
      ('ticked' in c && TICKS.some((t) => t.tick === c.ticked)) ||
      ('notTicked' in c && TICKS.some((t) => t.tick === c.notTicked)) ||
      ('noReadings' in c && c.noReadings === true) ||
      ('noParts' in c && c.noParts === true)
    if (!ok) return 'One of its conditions is not one Ardent knows'
  }
  if (r.when.some((c) => 'unless' in c) && !r.when.some((c) => 'says' in c)) return '"Unless that sentence says" needs words to listen for too'
  if (r.ask!.includes('{said}') && !r.when.some((c) => 'says' in c)) return 'Only quote what they said when the rule listens for words'
  if (!Array.isArray(r.replies) || r.replies.length < 2 || r.replies.length > 4) return 'Give it 2 to 4 buttons, so there is always a way out'
  for (const b of r.replies) {
    if (!text(b.label, 30)) return 'Every button needs a label, 30 characters at most'
    const ok =
      (b.does === 'skip') ||
      (b.does === 'talk' && TOPICS.includes(b.topic)) ||
      (b.does === 'note' && TOPICS.includes(b.topic) && text(b.note, 120)) ||
      (b.does === 'tick' && TICKS.some((t) => t.tick === b.tick) && (b.move === undefined || typeof b.move === 'boolean'))
    if (!ok) return `The button "${b.label}" doesn't say what it does`
  }
  if (r.replies.filter((b) => b.does === 'talk').length > 1) return 'Only 1 button can open the mic'
  return undefined
}

/** A short id for a firm's own rule, from its name. */
export const ownId = (name: string, taken: string[]) => {
  const base = `own-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'rule'}`
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}
