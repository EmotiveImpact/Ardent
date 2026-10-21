/**
 * Tidying the wording of a job report with Claude, when there's signal and
 * the firm has switched it on. The plain report from report.ts is always the
 * base: Claude only rewrites each section's lines, and code then checks the
 * rewrite against the plain report. If the rewrite drops or adds a number, a
 * unit, a "no" or a part, it's thrown away and the plain report stands.
 */
import type { PriceItem, ReportTopic } from '../../core/src/data/model.ts'
import { type BuiltReport, spoken } from './report.ts'

export type Tidied = Partial<Record<ReportTopic, string[]>>

export interface TidyCheck {
  ok: boolean
  /** Why the rewrite can't be used. Any one of these keeps the plain report. */
  problems: string[]
  /** Words the rewrite uses that weren't said. Shown to the engineer to look at; not a failure on their own. */
  newWords: string[]
}

const SYSTEM = `You tidy the wording of a UK trade engineer's job report. The engineer spoke it on site; Ardent has already split it into sections.

Rewrite each section's lines into short, clear sentences in British English, as a tidy report the office and the customer will read.

Rules:
- Use only what the lines say. Never add a part, reading, test, quantity, cause, advice or name that isn't there.
- Keep every number and unit exactly as written (22 ms, 0.38 Ω, 2.5mm, 20 mbar).
- Keep "no", "not", "nothing" and similar where the engineer used them: they matter in a safety report.
- Keep each fact in its own section. Don't move anything between sections.
- Drop filler ("right", "er", "one thing") and the job number.
- Write in the past tense and the third person where it reads naturally ("Replaced the fuse board").

Reply with JSON only: an object whose keys are exactly the section keys you were given, each an array of sentences.`

const LABEL: Record<ReportTopic, string> = { work: 'Work done', parts: 'Parts', tests: 'Tests and readings', left: 'Left or found wrong', next: 'Customer wants next' }

/** Customer and site names said aloud never leave the phone: they become "the customer". */
export function redact(text: string, names: string[]): string {
  let out = text
  for (const n of names.flatMap((x) => [x, ...x.split(/\s+/)]).filter((x) => x.length > 2).sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), 'the customer')
  }
  return out
}

/** What goes to Claude: the section lines and nothing else about the job or the customer. */
export function tidyPrompt(report: Pick<BuiltReport, 'sections'>, names: string[] = []): { system: string; user: string } {
  const user = report.sections
    .map((s) => `[${s.topic}] ${LABEL[s.topic]}\n${s.lines.map((l) => `- ${redact(l.text, names)}`).join('\n')}`)
    .join('\n\n')
  return { system: SYSTEM, user: `Sections:\n\n${user}\n\nReply with JSON whose keys are: ${report.sections.map((s) => s.topic).join(', ')}.` }
}

const UNITS = ['ms', 'mΩ', 'MΩ', 'Ω', 'mbar', 'bar', 'kW', 'kw', '°C', '%', 'mm', 'A', 'V', 'm', 'way', 'litre', 'litres']
const NUMBER = /\d+(?:\.\d+)?/g
const NEGATIVE = /\b(no|not|nothing|none|never|without|n't|cannot|couldn't|didn't|wasn't|isn't|won't)\b|n't\b/gi

const numbers = (text: string) => (spoken(text).match(NUMBER) ?? []).map(Number)
const units = (text: string) => {
  const t = spoken(text)
  return UNITS.filter((u) => new RegExp(`\\d\\s*${u.replace('%', '\\%')}(?![A-Za-zΩ])`).test(t))
}
const negatives = (text: string) => (text.match(NEGATIVE) ?? []).length
const words = (text: string) => text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []
const stem = (w: string) => w.slice(0, 5)

/** Wording any tidy-up may use without it counting as something new. */
const PLAIN = new Set(
  'that with were have this from they their there them then also into after before which will would been both each every customer requested request asked wants would like quote return visit advised further required completed carried checked replaced fitted installed system unit circuit circuits supply fault found left work done parts used readings tests tested result results confirmed recorded noted informed told sound safe tight test working order connection connected properly correctly within normal'
    .split(' ')
    .map((w) => w.slice(0, 5)),
)

const count = (xs: number[]) => xs.reduce<Map<number, number>>((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())

/**
 * Check a rewrite against the plain report it came from. Numbers and units
 * must match exactly, section by section; no "no" may be lost; no part may
 * be named that wasn't said. New ordinary words are listed, not failed.
 */
export function checkTidy(report: Pick<BuiltReport, 'sections'> & Partial<Pick<BuiltReport, 'readings'>>, tidied: unknown, priceList: PriceItem[] = []): TidyCheck {
  const problems: string[] = []
  const newWords: string[] = []
  if (!tidied || typeof tidied !== 'object' || Array.isArray(tidied)) return { ok: false, problems: ['The answer was not a set of sections'], newWords }
  const t = tidied as Record<string, unknown>
  const topics = report.sections.map((s) => s.topic)
  for (const k of Object.keys(t)) if (!topics.includes(k as ReportTopic)) problems.push(`Added a section that wasn't in the report (${k})`)
  // Only things that get fitted count as parts: "engineer" or "call-out" on the price list aren't.
  const partWords = new Set(priceList.filter((i) => i.kind === 'material').flatMap((i) => words(i.name).map(stem)))

  for (const s of report.sections) {
    const lines = t[s.topic]
    const name = LABEL[s.topic]
    if (!Array.isArray(lines) || !lines.every((l) => typeof l === 'string') || !lines.length) {
      problems.push(`${name}: missing`)
      continue
    }
    const before = s.lines.map((l) => l.text).join(' ')
    const after = (lines as string[]).join(' ')
    const was = count(numbers(before))
    const now = count(numbers(after))
    for (const [n, c] of was) if ((now.get(n) ?? 0) < c) problems.push(`${name}: dropped the number ${n}`)
    for (const [n, c] of now) if ((was.get(n) ?? 0) < c) problems.push(`${name}: added the number ${n}`)
    // A bare reading ("Zs 0.38") has its unit in the readings, so Claude may write it out.
    const uWas = units(s.topic === 'tests' ? [before, ...(report.readings ?? []).map((r) => r.value)].join(' ') : before)
    const uNow = units(after)
    for (const u of units(before)) if (!uNow.includes(u)) problems.push(`${name}: dropped the unit ${u}`)
    for (const u of uNow) if (!uWas.includes(u)) problems.push(`${name}: added the unit ${u}`)
    if (negatives(after) < negatives(before)) problems.push(`${name}: lost a "no" or "not"`)
    if (after.length > before.length * 2 + 40) problems.push(`${name}: much longer than what was said`)
    const said = new Set(words(spoken(before)).map(stem))
    for (const w of new Set(words(spoken(after)))) {
      if (said.has(stem(w)) || PLAIN.has(stem(w))) continue
      if (partWords.has(stem(w))) problems.push(`${name}: names a part that wasn't said ("${w}")`)
      else if (!newWords.includes(w)) newWords.push(w)
    }
  }
  return { ok: problems.length === 0, problems, newWords }
}
