/**
 * The engineer's job report, written on the phone from what they said, with
 * no signal and no AI. Everything here is plain rules: a line in the report is
 * a sentence they said, tidied; a part is a price list item their words name;
 * a reading is a number they spoke with its unit. Nothing is ever filled in
 * that wasn't said, and what wasn't said shows as still needed.
 */
import type { JobReport, LineItem, PriceItem, ReportLine, ReportPart, ReportReading, ReportSegment, ReportSource, ReportTopic, StockLevel, Trade } from '../../core/src/data/model.ts'

export interface ReportPrompt {
  topic: ReportTopic
  /** One word for the chip that ticks off while they talk. */
  chip: string
  title: string
  hint: string
}

const TESTS: Partial<Record<Trade, { title: string; hint: string }>> = {
  electrical: { title: 'Test results', hint: 'Zs, RCD trip times, insulation resistance' },
  fire: { title: 'Test results', hint: 'Panel, detectors and sounders tested' },
  gas: { title: 'Readings and checks', hint: 'Working pressure, tightness, flue. The CP12 has its own form' },
  heating: { title: 'Readings and checks', hint: 'System pressure, flow temperature, leaks' },
  plumbing: { title: 'How you tested it', hint: 'Pressure test, leak check, flow' },
  hvac: { title: 'Readings and checks', hint: 'Pressures, temperatures, refrigerant' },
  lifts: { title: 'Tests', hint: 'Safety gear, doors, brakes' },
}

/** What to mention, by trade. The same five topics for everyone; the tests prompt follows the trade. */
export function promptsFor(trade: Trade): ReportPrompt[] {
  const t = TESTS[trade] ?? { title: 'How you checked it', hint: 'What you tried and what happened' }
  return [
    { topic: 'work', chip: 'Work', title: 'What you did', hint: 'In your own words, as you would tell the office' },
    { topic: 'parts', chip: 'Parts', title: 'Parts used and where from', hint: 'Van, merchant or the customer' },
    { topic: 'tests', chip: 'Tests', ...t },
    { topic: 'left', chip: 'Faults', title: "Anything you couldn't finish or found wrong", hint: 'Faults, no access, made safe. Say "nothing left" if none' },
    { topic: 'next', chip: 'Next', title: 'What the customer wants next', hint: 'Quotes, return visits, advice. Say "nothing else" if none' },
  ]
}

// Numbers, as people say them on site.

const SMALL: Record<string, number> = {
  zero: 0, nought: 0, nil: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }
const isNumWord = (w: string) => w in SMALL || w in TENS || w === 'hundred' || w === 'thousand'

const KEEP_ONE = new Set(['the', 'old', 'new', 'that', 'this', 'another', 'each', 'every', 'other', 'no', 'any', 'which', 'a', 'last', 'first', 'right', 'wrong', 'big', 'small', 'same'])

/** The number a run of number words says, or several when they were said apart: "two thirty-two" is 2 and 32. */
function say(ws: string[]): string {
  const point = ws.indexOf('point')
  let whole = point >= 0 ? ws.slice(0, point) : ws
  const decimals = point >= 0 ? ws.slice(point + 1).map((w) => String(SMALL[w])).join('') : ''
  const half = whole.length >= 3 && whole.slice(-3).join(' ') === 'and a half'
  if (half) whole = whole.slice(0, -3)
  const nums: number[] = []
  let cur: number | undefined
  let thousands = 0
  for (const w of whole) {
    if (w === 'and') continue
    if (w === 'thousand') {
      thousands += (cur ?? 1) * 1000
      cur = undefined
      continue
    }
    if (w === 'hundred') {
      cur = (cur ?? 1) * 100
      continue
    }
    const v = TENS[w] ?? SMALL[w]
    if (cur === undefined) cur = v
    else if (w in TENS && cur >= 100 && cur % 100 === 0) cur += v
    else if (!(w in TENS) && v < 10 && cur % 10 === 0 && cur % 100 >= 20) cur += v
    else if (!(w in TENS) && v < 100 && cur >= 100 && cur % 100 === 0) cur += v
    else {
      nums.push(cur)
      cur = v
    }
  }
  if (cur !== undefined) nums.push(cur)
  if (thousands) nums[0] = thousands + (nums.length ? nums[0] : 0)
  // Pairs said one after another are one number: "twenty-four seventeen" is 2417.
  const out: string[] = []
  nums.forEach((n, i) => {
    const prev = nums[i - 1]
    if (i > 0 && prev >= 10 && prev < 100 && n >= 10 && n < 100) out[out.length - 1] += String(n)
    else out.push(String(n))
  })
  if (decimals) out[out.length - 1] += `.${decimals}`
  else if (half) out[out.length - 1] = String(Number(out[out.length - 1]) + 0.5)
  return out.join(' ')
}

/**
 * Number words to digits: "nought point three eight" -> "0.38", "two and a
 * half" -> "2.5", "twenty-four seventeen" -> "2417". "Oh" counts only after
 * "point", and "the old one" stays words.
 */
export function digits(text: string): string {
  text = text.replace(/\b([a-z]+)-(way|fold|metre|meter|mil|amp|amps)\b/gi, '$1 $2')
  const parts = text.split(/(\s+)/)
  const bare = (t: string | undefined) => (t ?? '').toLowerCase().replace(/[^a-z-]/g, '')
  const out: string[] = []
  let i = 0
  while (i < parts.length) {
    const first = bare(parts[i]).split('-').filter(Boolean)
    const starts = first.length && first.every(isNumWord) && first[0] !== 'oh' && first[0] !== 'hundred' && first[0] !== 'thousand'
    if (!starts) {
      out.push(parts[i++])
      continue
    }
    // Gather the run: number words, with "and", "and a half" and "point" inside it. Punctuation ends it.
    const ws: string[] = []
    let last = i
    let j = i
    let afterPoint = false
    while (j < parts.length) {
      if (/^\s+$/.test(parts[j])) {
        j++
        continue
      }
      const w = bare(parts[j])
      const pieces = w.split('-').filter(Boolean)
      const isNum = pieces.length > 0 && pieces.every((x) => isNumWord(x) && (!afterPoint || (x in SMALL && SMALL[x] < 10)))
      if (isNum && !(pieces[0] === 'oh' && !afterPoint)) ws.push(...pieces)
      else if (w === 'point' && !afterPoint && /^(zero|nought|oh|one|two|three|four|five|six|seven|eight|nine)$/.test(bare(parts[j + 2]))) {
        ws.push('point')
        afterPoint = true
      } else if (w === 'and' && !afterPoint && bare(parts[j + 2]) === 'a' && bare(parts[j + 4]).replace(/[^a-z]/g, '') === 'half') {
        ws.push('and', 'a', 'half')
        last = j + 4
        break
      } else if (w === 'and' && !afterPoint && ws.includes('hundred') && (bare(parts[j + 2]) in SMALL || bare(parts[j + 2]).split('-')[0] in TENS)) ws.push('and')
      else break
      last = j
      j++
      if (/[,.;:!?]$/.test(parts[j - 1] ?? '')) break
    }
    // "the old one": a word, not a count.
    const prev = bare(out.filter((t) => !/^\s+$/.test(t)).at(-1))
    if (ws.length === 1 && ws[0] === 'one' && (KEEP_ONE.has(prev) || /^(of|or|thing|more|day|way|another|off|bit)$/.test(bare(parts[last + 2])))) {
      out.push(parts[i++])
      continue
    }
    const punct = (parts[last].match(/[,.;:!?]+$/) ?? [''])[0]
    out.push(say(ws) + punct)
    i = last + 1
  }
  return out.join('')
}

const UNIT_RULES: [RegExp, string][] = [
  [/(\d(?:[\d.]*\d)?)\s*(?:amps?|amperes?)\b/gi, '$1A'],
  [/(\d(?:[\d.]*\d)?)\s*(?:mil|mill|millimetres?|millimeters?|mm)\b/gi, '$1mm'],
  [/(\d(?:[\d.]*\d)?)\s*(?:milliseconds?|ms)\b/gi, '$1 ms'],
  [/(\d(?:[\d.]*\d)?)\s*(?:megohms?|meg(?:a)?(?:s)?|mΩ|MΩ)(?=[\s,.;!?]|$)/gi, '$1 MΩ'],
  [/(\d(?:[\d.]*\d)?)\s*(?:ohms?|Ω)(?=[\s,.;!?]|$)/gi, '$1 Ω'],
  [/(\d(?:[\d.]*\d)?)\s*(?:millibars?|mbar|mb)\b/gi, '$1 mbar'],
  [/(\d(?:[\d.]*\d)?)\s*(?:bars?)\b/gi, '$1 bar'],
  [/(\d(?:[\d.]*\d)?)\s*(?:kilowatts?|kw)\b/gi, '$1kW'],
  [/(\d(?:[\d.]*\d)?)\s*(?:degrees?(?:\s+(?:c|celsius|centigrade))?|°c)\b/gi, '$1°C'],
  [/(\d(?:[\d.]*\d)?)\s*(?:per\s?cent|percent|%)/gi, '$1%'],
  [/(\d(?:[\d.]*\d)?)\s*(?:volts?|v)\b/gi, '$1V'],
  [/(\d(?:[\d.]*\d)?)\s*(?:metres?|meters?)\b/gi, '$1 m'],
  [/(\d+)\s*(?:-\s*)?way\b/gi, '$1-way'],
]

/** Digits and the short units a report uses: "thirty-two amp" -> "32A", "two hundred meg" -> "200 MΩ". */
export function spoken(text: string): string {
  let s = digits(text)
  for (const [re, to] of UNIT_RULES) s = s.replace(re, to)
  return s
}

// Sentences, and what each one is about.

const FILLER_START = /^(?:(?:right|ok(?:ay)?|so|well|er+m?|um+|uh+|basically|yeah|yep|and|anyway|oh)\b[\s,]*)+/i
const FILLER_INSIDE = /\s*\b(?:er+m?|um+|uh+)\b,?/gi

/** A sentence as it goes in the report: no fillers, numbers as digits, a capital and a full stop. */
export function tidy(sentence: string): string {
  let s = spoken(sentence).replace(FILLER_START, '').replace(FILLER_INSIDE, '').replace(/\s+/g, ' ').trim()
  s = s.replace(/^[,;:\s]+/, '')
  if (!s) return ''
  s = s.charAt(0).toUpperCase() + s.slice(1)
  if (!/[.!?]$/.test(s)) s += '.'
  return s
}

const RULES: { topic: ReportTopic | 'none_left' | 'none_next'; re: RegExp }[] = [
  { topic: 'none_left', re: /\b(nothing (left|outstanding|wrong|to report)|no (faults?|issues|problems|defects)( found)?|all (finished|done|complete|sorted)|job('s| is) (finished|done|complete)|everything('s| is) (working|fine|sound|good))\b/i },
  { topic: 'none_next', re: /\b(nothing else|doesn'?t (want|need) anything|no(thing)? further (work|action)|didn'?t ask for anything)\b/i },
  { topic: 'next', re: /\b(wants?|would like|quote|come back|return(ing)? visit|go back|next (week|visit|time|year)|advised|recommend(ed)?|asked (for|about|me)|told (her|him|them|the (customer|tenant|landlord)) to|keep an eye)\b/i },
  { topic: 'tests', re: /\b(test(ed|s|ing)?|zs|ze|r1|r2|rcds? (trip|test)\w*|insulation|trip(ped|ping|s)?|tightness|pressure|readings?|analyser|flue gas|co2|co|ratio|leak check|no leaks?|leak[- ]free|commissioned|checked|working (fine|ok|properly|again))\b|\d\s?(ms|mbar|bar|MΩ|Ω|°C)\b|MΩ|Ω/i },
  { topic: 'left', re: /\b(couldn'?t|could not|didn'?t (have|get|finish|manage)|unable|no access|made (it |them )?safe|left (it|as|the|them)|capped( it)?( off)?|isolated|no earth|unsafe|at risk|immediately dangerous|not to (current )?(regs|regulations|standard)|needs? (replacing|a new|to be)|fault(y|s)?|found|leak(ing|s)?|cracked|corroded|warning notice|condemned|ran out)\b/i },
  { topic: 'parts', re: /\b(off the van|from the van|out the van|van|merchant|wholesaler|screwfix|toolstation|plumb ?centre|city plumbing|customer'?s own|customer supplied|supplied by|picked up|bought|used)\b/i },
]

const WORK = /\b(swapped|replaced|fitted|installed|changed|put in|added|renewed|repaired|fixed|ran|wired|connected|re-?made|re-?piped|cleared|serviced)\b/i

/** Sentences in a segment, with where each sits in the segment's text. */
function sentences(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = []
  const re = /[^.!?]+[.!?]*/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const raw = m[0]
    const lead = raw.length - raw.trimStart().length
    const s = raw.trim()
    if (!s) continue
    const start = m.index + lead
    // Speech without full stops: break long runs at "and then", "then", "also".
    const words = s.split(/\s+/)
    if (words.length > 28) {
      const br = /\s(?:and then|then|also|plus)\s/gi
      let from = 0
      for (let b = br.exec(s); b; b = br.exec(s)) {
        if (b.index - from > 40) {
          out.push({ text: s.slice(from, b.index), start: start + from, end: start + b.index })
          from = b.index + 1
        }
      }
      out.push({ text: s.slice(from), start: start + from, end: start + s.length })
    } else out.push({ text: s, start, end: start + s.length })
  }
  return out
}

/** Too little to report: "Right, job 2417." */
const chatter = (tidied: string) => /^(?:job|that'?s|this is|it'?s)\b[\s\w-]{0,14}\.$/i.test(tidied) || tidied.split(/\s+/).length < 3

// Parts: matching what was said to the firm's price list.

const SYNONYMS: [RegExp, string][] = [
  [/\b(circuit )?breakers?\b/g, 'breaker mcb rcbo'],
  [/\bmcbs?\b/g, 'mcb'],
  [/\brcbos?\b/g, 'rcbo'],
  [/\b(fuse ?board|consumer units?|cu|dual rcd units?|boards?)\b/g, 'consumer unit board'],
  [/\b(isolation|isolator|isolating) valves?\b/g, 'isolating valve'],
  [/\bisolators?\b/g, 'isolating valve'],
  [/\b(thermostatic radiator valves?|rad valves?|radiator valves?|trvs?)\b/g, 'trv'],
  [/\b(t and e|t&e|twin and earth|twin & earth|twin earth)\b/g, 'twin earth'],
  [/\b(mag(netic)? filters?|magnaclean|filter)\b/g, 'magnetic filter'],
  [/\b(meter )?tails\b/g, 'meter tails'],
  [/\bcopper\b/g, 'copper pipe'],
  [/\b(compression )?elbows?\b/g, 'elbow'],
  [/\bcombis?\b/g, 'combi boiler'],
  [/\bflue ext(ension)?s?\b/g, 'flue extension'],
]
/** Words the synonyms add, so a count before "breakers" is still found once they're expanded. */
const ADDED = new Set(SYNONYMS.flatMap(([, to]) => to.split(' ')))
const STOP = new Set(['and', 'of', 'the', 'a', 'an', 'type', 'per', 'for', 'with', 'new', 'old', 'litre', 'x', 'off', 'on', 'in', 'to', 'it', 'i', 'we'])
const unitToken = (t: string) => /^\d+(\.\d+)?(mm|a|kw|m|v|way)$/.test(t)
const family = (t: string) => t.replace(/^[\d.]+/, '')

function tokens(s: string): string[] {
  let x = ` ${spoken(s).toLowerCase().replace(/²/g, '').replace(/(\d)\s+m\b/g, '$1m')} `
  for (const [re, to] of SYNONYMS) x = x.replace(re, to)
  return x
    .replace(/(\d+)-way/g, '$1way')
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/\.$/, ''))
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !/\d/.test(t) ? t.slice(0, -1) : t))
}

interface Indexed {
  item: PriceItem
  nouns: string[]
  sizes: string[]
}

function index(items: PriceItem[]): Indexed[] {
  return items
    .filter((i) => i.kind === 'material' && !i.archived)
    .map((item) => {
      const ts = tokens(item.name)
      return { item, nouns: [...new Set(ts.filter((t) => !unitToken(t) && !STOP.has(t) && t.length > 1 && !/^\d+$/.test(t)))], sizes: ts.filter(unitToken) }
    })
}

/** The price list items a sentence names, best first, with the token where each was said. */
function matches(sentence: string, list: Indexed[]) {
  const ts = tokens(sentence)
  const set = new Set(ts)
  const sizes = ts.filter(unitToken)
  const found = list
    .map((x) => {
      const hit = x.nouns.filter((n) => set.has(n))
      // A size said for the same kind of thing must agree: 15mm said rules out 22mm.
      const clash = x.sizes.some((s) => sizes.some((t) => family(t) === family(s)) && !set.has(s))
      const sized = x.sizes.filter((s) => set.has(s)).length
      return { x, hit, clash, score: hit.length * 2 + sized }
    })
    .filter((m) => m.hit.length > 0 && !m.clash)
  // Each candidate needs two of its words, or one word no other item shares.
  const unique = (n: string) => list.filter((x) => x.nouns.includes(n)).length === 1
  return found
    .filter((m) => m.hit.length >= Math.min(2, m.x.nouns.length) || m.hit.some(unique))
    .sort((a, b) => b.score - a.score)
    .map((m) => ({ ...m, at: Math.min(...m.hit.map((n) => ts.indexOf(n)).filter((k) => k >= 0)), ts }))
}

const NEGATED = /\b(no|not|didn t|didnt|without|never|don t|dont|wasn t|weren t)\b(?:\s+\w+){0,3}\s*$/i

function quantityOf(m: { x: Indexed; at: number; ts: string[] }, sentence: string): { quantity: number; said: boolean } {
  const s = spoken(sentence)
  if (m.x.item.unit === 'metre') {
    const len = s.match(/(\d+(?:\.\d+)?)\s?m\b(?!m)/)
    if (len) return { quantity: Number(len[1]), said: true }
    const half = /\bhalf a (metre|meter)\b/i.test(sentence)
    return half ? { quantity: 0.5, said: true } : { quantity: 1, said: false }
  }
  // Look back from the first word of the item for a count: "2 32A breakers", "a new valve", "pair of".
  for (let k = m.at - 1; k >= Math.max(0, m.at - 4); k--) {
    const t = m.ts[k]
    if (/^\d+$/.test(t)) return { quantity: Number(t), said: true }
    if (t === 'a' || t === 'an' || t === 'one') return { quantity: 1, said: true }
    if (t === 'pair') return { quantity: 2, said: true }
    if (!(STOP.has(t) || ADDED.has(t) || unitToken(t) || t === 'about' || t === 'around' || m.x.nouns.includes(t) || t.length <= 3)) break
  }
  // "the board", "new boiler": one. "the breakers" with no count: not said.
  const word = sentence.split(/\s+/).find((w) => tokens(w).includes(m.ts[m.at])) ?? ''
  const said = !/[a-z]{2}s[,.;!?]?$/i.test(word) || /ss[,.;!?]?$/i.test(word)
  return { quantity: 1, said }
}

// Readings.

const LABELS: [RegExp, string][] = [
  [/\br1\s*(\+|plus|and)\s*r2\b/i, 'R1+R2'],
  [/\bzs\b/i, 'Zs'],
  [/\bze\b/i, 'Ze'],
  [/\brcds?\b|\btrip/i, 'RCD trip time'],
  [/\binsulation\b/i, 'Insulation resistance'],
  [/\bworking pressure\b/i, 'Working pressure'],
  [/\b(standing|static) pressure\b/i, 'Standing pressure'],
  [/\btightness\b/i, 'Tightness test'],
  [/\b(gas )?rate\b/i, 'Gas rate'],
  [/\bco2\b/i, 'CO2'],
  [/\bratio\b/i, 'CO/CO2 ratio'],
  [/\bco\b/i, 'CO'],
  [/\bflow\b/i, 'Flow temperature'],
  [/\breturn\b/i, 'Return temperature'],
  [/\b(system )?pressure\b/i, 'Pressure'],
  [/\btemp(erature)?\b/i, 'Temperature'],
  [/\bleak check|no leaks?|leak[- ]free\b/i, 'Leak check'],
]
/** Readings that only ever come in one unit, so a bare number still reads right. */
const BARE: [RegExp, string, string][] = [
  [/\bzs\b/, 'Zs', 'Ω'],
  [/\bze\b/, 'Ze', 'Ω'],
  [/\br1\s*(?:\+|plus|and)\s*r2\b/, 'R1+R2', 'Ω'],
  [/\binsulation\b/, 'Insulation resistance', 'MΩ'],
  [/\bworking pressure\b/, 'Working pressure', 'mbar'],
  [/\b(?:standing|static) pressure\b/, 'Standing pressure', 'mbar'],
]
const VALUE = /(?:(over|above|more than|greater than|under|below|less than)\s+)?(\d+(?:\.\d+)?)\s?(ms|mbar|bar|MΩ|Ω|°C|kW|%|V)(?=[\s,.;!?]|$)/g

function readingsIn(sentence: string, from: ReportSource): ReportReading[] {
  const s = spoken(sentence)
  const out: ReportReading[] = []
  const labelAt = (upTo: number) => {
    let best: { end: number; label: string; len: number } | undefined
    for (const [re, label] of LABELS) {
      const g = new RegExp(re.source, 'gi')
      for (let m = g.exec(s); m; m = g.exec(s)) {
        const end = m.index + m[0].length
        if (end > upTo) continue
        if (!best || end > best.end || (end === best.end && m[0].length > best.len)) best = { end, label, len: m[0].length }
      }
    }
    return best?.label
  }
  let lastEnd = 0
  for (let m = VALUE.exec(s); m; m = VALUE.exec(s)) {
    const label = labelAt(m.index)
    if (!label) continue
    const sign = m[1] ? (/over|above|more|greater/i.test(m[1]) ? '> ' : '< ') : ''
    // "22 and 25 ms": bare numbers just before share the unit.
    const before = s.slice(lastEnd, m.index)
    const bare = [...before.matchAll(/(\d+(?:\.\d+)?)\s*(?:,|and|&)\s*$/g)].map((b) => b[1])
    const chain = before.match(/((?:\d+(?:\.\d+)?\s*(?:,|and|&)\s*)+)$/)
    const extra = chain ? [...chain[1].matchAll(/\d+(?:\.\d+)?/g)].map((x) => x[0]) : bare
    const unit = m[3]
    const values = [...extra, m[2]].map((v) => `${sign}${v} ${unit}`.replace(/ (%|°C|kW|V)$/, '$1'))
    const prev = out.find((r) => r.label === label)
    if (prev) prev.value += `, ${values.join(', ')}`
    else out.push({ label, value: values.join(', '), from })
    lastEnd = m.index + m[0].length
  }
  // A number said with no unit, straight after a reading that only has one: "Zs on the shower's 0.38".
  for (const [re, label, unit] of BARE) {
    if (out.some((r) => r.label === label)) continue
    const m = s.match(new RegExp(`${re.source}[^\\d.]{0,24}?(?:(over|above|more than|under|below|less than)\\s+)?(\\d+(?:\\.\\d+)?)(?!\\s?(?:ms|mbar|bar|MΩ|Ω|°C|kW|%|V|A|mm|m)\\b)(?![\\d.])`, 'i'))
    if (!m) continue
    const sign = m[m.length - 2] ? (/over|above|more/i.test(m[m.length - 2]) ? '> ' : '< ') : ''
    out.push({ label, value: `${sign}${m[m.length - 1]} ${unit}`, from })
  }
  // A ratio said as a bare decimal: "ratio 0.0004".
  const ratio = s.match(/\bratio\D{0,12}(0\.\d+)/i)
  if (ratio && !out.some((r) => r.label === 'CO/CO2 ratio')) out.push({ label: 'CO/CO2 ratio', value: ratio[1], from })
  // Results said in words: "tightness test passed", "RCDs all tripped fine".
  const verdict = s.match(/\b(passed|pass|failed|fail|tripped fine|all good|no leaks?|leak[- ]free)\b/i)
  if (verdict) {
    const label = labelAt(verdict.index ?? 0) ?? labelAt(s.length)
    if (label && !out.some((r) => r.label === label)) out.push({ label, value: /fail/i.test(verdict[1]) ? 'Failed' : label === 'Leak check' ? 'No leaks' : 'Passed', from })
  }
  return out
}

// The report.

export interface ReportInput {
  segments: ReportSegment[]
  trade: Trade
  /** The firm's price list. */
  priceList: PriceItem[]
  /** What's on the engineer's own van. */
  van: StockLevel[]
}

export type BuiltReport = Pick<JobReport, 'sections' | 'parts' | 'readings' | 'missing'>

/** Work the report out from what was said. Same input, same report, on the phone and in the engine. */
export function buildReport({ segments, trade, priceList, van }: ReportInput): BuiltReport {
  const list = index(priceList)
  const lines: Record<ReportTopic, ReportLine[]> = { work: [], parts: [], tests: [], left: [], next: [] }
  const readings: ReportReading[] = []
  const parts: ReportPart[] = []
  const covered = new Set<ReportTopic>()
  const onVan = (itemId: string) => van.some((s) => s.itemId === itemId && s.quantity > 0)

  segments.forEach((seg, segment) => {
    for (const sen of sentences(seg.text)) {
      const text = tidy(sen.text)
      if (!text) continue
      const from: ReportSource = { segment, start: sen.start, end: sen.end }
      const rule = RULES.find((r) => r.re.test(spoken(sen.text)))
      let topic: ReportTopic = 'work'
      if (rule?.topic === 'none_left') {
        covered.add('left')
        lines.left.push({ text, from })
        continue
      }
      if (rule?.topic === 'none_next') {
        covered.add('next')
        lines.next.push({ text, from })
        continue
      }
      if (rule) topic = rule.topic as ReportTopic
      // "Swapped it for a new valve off the van" is the work as well as the part.
      if (topic === 'parts' && WORK.test(sen.text)) topic = 'work'

      // Parts can be named in any sentence about the work, but never in what the customer wants next,
      // and a test that names a part ("checked every valve") hasn't used one.
      let named = 0
      if (topic !== 'next' && (topic !== 'tests' || WORK.test(sen.text))) {
        const taken = new Set<string>()
        for (const m of matches(sen.text, list)) {
          if (taken.has(m.x.item.id)) continue
          const before = m.ts.slice(0, m.at).join(' ')
          if (NEGATED.test(before)) continue
          // Words that fit several items equally: ask, don't pick.
          const rivals = matches(sen.text, list).filter((o) => o.score === m.score && o.at === m.at && o.x.item.id !== m.x.item.id && !taken.has(o.x.item.id))
          const q = quantityOf(m, sen.text)
          const saysVan = /\bvan\b/i.test(sen.text) && !/\bnot (off|from|out) (of )?the van\b/i.test(sen.text)
          const saysElse = /\b(merchant|wholesaler|screwfix|toolstation|plumb ?centre|city plumbing|customer'?s own|customer supplied|supplied by|picked up|bought)\b/i.test(sen.text)
          const heard = spoken(sen.text).trim()
          const existing = parts.find((p) => p.itemId === m.x.item.id)
          if (existing) {
            if (!existing.quantitySaid && q.said) Object.assign(existing, { quantity: q.quantity, quantitySaid: true, heard, from })
            if (saysVan || saysElse) Object.assign(existing, { fromVan: saysVan, sourceSaid: true })
          } else if (rivals.length) {
            const ids = [m.x.item.id, ...rivals.map((r) => r.x.item.id)]
            ids.forEach((id) => taken.add(id))
            if (!parts.some((p) => !p.itemId && p.from.segment === segment && p.from.start === sen.start))
              parts.push({ description: m.hit.join(' '), quantity: q.quantity, unit: m.x.item.unit, quantitySaid: q.said, fromVan: saysVan, sourceSaid: saysVan || saysElse, heard, from, choices: ids })
          } else {
            parts.push({
              itemId: m.x.item.id,
              description: m.x.item.name,
              quantity: q.quantity,
              unit: m.x.item.unit,
              quantitySaid: q.said,
              fromVan: saysVan || (!saysElse && onVan(m.x.item.id)),
              sourceSaid: saysVan || saysElse,
              heard,
              from,
            })
          }
          taken.add(m.x.item.id)
          named++
        }
      }

      if (topic === 'parts') {
        covered.add('parts')
        // A parts sentence that names nothing on the list still goes in, so nothing said is lost.
        if (!named && !chatter(text)) lines.parts.push({ text, from })
        continue
      }
      if (topic === 'tests') {
        const found = readingsIn(sen.text, from)
        readings.push(...found.filter((r) => !readings.some((x) => x.label === r.label && x.value === r.value)))
        covered.add('tests')
        lines.tests.push({ text, from })
        continue
      }
      if (chatter(text) && topic === 'work') continue
      covered.add(topic)
      lines[topic].push({ text, from })
    }
  })
  if (parts.length) covered.add('parts')

  const topics = promptsFor(trade).map((p) => p.topic)
  return {
    sections: topics.filter((t) => lines[t].length).map((topic) => ({ topic, lines: lines[topic] })),
    parts,
    readings,
    missing: topics.filter((t) => !covered.has(t)),
  }
}

/** Which prompts what's been said so far covers, for the chips that tick off while they talk. */
export function coveredSoFar(input: ReportInput): Set<ReportTopic> {
  const r = buildReport(input)
  return new Set(promptsFor(input.trade).map((p) => p.topic).filter((t) => !r.missing.includes(t)))
}

const GLOSSARY: Partial<Record<Trade, string[]>> = {
  electrical: ['RCD', 'RCBO', 'MCB', 'Zs', 'Ze', 'R1 plus R2', 'consumer unit', 'meter tails', 'twin and earth', 'insulation resistance', 'megohms', 'milliseconds', 'EICR', 'EIC', 'SWA', 'spur', 'fused spur'],
  gas: ['combi', 'CP12', 'flue', 'tightness test', 'working pressure', 'millibar', 'flue gas analyser', 'CO2', 'Worcester Bosch', 'Vaillant', 'Ideal', 'Baxi', 'condensate', 'PRV', 'magnetic filter', 'inhibitor', 'Gas Safe'],
  heating: ['combi', 'TRV', 'lockshield', 'magnetic filter', 'inhibitor', 'power flush', 'bleed', 'expansion vessel', 'PRV', 'diverter valve', 'Worcester Bosch', 'Vaillant', 'Ideal', 'Baxi'],
  plumbing: ['isolating valve', 'compression elbow', 'push-fit', 'Speedfit', 'stopcock', 'PRV', 'TRV', 'unvented', 'cylinder', 'immersion', 'trap', 'waste', 'ballcock', 'fill valve'],
}

/**
 * Words to tell the phone's speech recogniser to listen for: the firm's own
 * parts first (what's on this van, then the trade's), then the trade's
 * terms. Phones take a short list: 100 at most, a few words each.
 */
export function tradeWords({ trade, priceList, van }: Omit<ReportInput, 'segments'>): string[] {
  const short = (name: string) => name.replace(/,.*$/, '').replace(/\s+/g, ' ').trim()
  const onVan = priceList.filter((i) => van.some((s) => s.itemId === i.id))
  const forTrade = priceList.filter((i) => i.kind === 'material' && !i.archived && (i.trade === trade || !i.trade))
  const words = [...(GLOSSARY[trade] ?? []), ...onVan.map((i) => short(i.name)), ...forTrade.map((i) => short(i.name))]
  return [...new Set(words.filter((w) => w.split(' ').length <= 4))].slice(0, 100)
}

/**
 * The job lines a signed report adds: each matched part at its price list
 * price, off the engineer's van when it came from there and the van carries
 * it. Parts still waiting for a pick between two items add nothing.
 */
export function partLines(parts: ReportPart[], priceList: PriceItem[], operatorId: string): Omit<LineItem, 'id'>[] {
  return parts.flatMap((p) => {
    const item = p.itemId ? priceList.find((i) => i.id === p.itemId) : undefined
    if (!item) return []
    return [{ kind: item.kind, description: item.name, quantity: p.quantity, unitPrice: item.price, itemId: item.id, ...(p.fromVan && item.stocked ? { fromVan: operatorId } : {}) }]
  })
}

/** Why a report can't be signed yet, or undefined when it can. */
export function cantSign(parts: ReportPart[]): string | undefined {
  const open = parts.find((p) => !p.itemId && p.choices?.length)
  return open ? `Pick which part "${open.description}" is first` : undefined
}

/**
 * A rebuilt report's parts, keeping the engineer's own fixes (a count, a pick,
 * van or not) to parts from sentences that haven't changed. Parts are matched
 * by the words they came from and their order within them.
 */
export function keepFixes(built: ReportPart[], saved: ReportPart[]): ReportPart[] {
  const key = (p: ReportPart, list: ReportPart[]) => {
    const same = list.filter((o) => o.from.segment === p.from.segment && o.from.start === p.from.start && o.from.end === p.from.end)
    return `${p.from.segment}:${p.from.start}:${p.from.end}:${same.indexOf(p)}`
  }
  const fixed = new Map(saved.map((p) => [key(p, saved), p]))
  return built.map((p) => fixed.get(key(p, built)) ?? p)
}
