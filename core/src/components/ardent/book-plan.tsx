import { clock, trade as tradeName, ukDay, ukToIso } from '@kit'
import type { Book } from '@/data/ardent'
import type { ComplianceCheck, Job, Operator, Site, Trade } from '@/data/model'
import { addDays, find, today } from '@/lib/jobs'

/*
 * The working-out behind booking: who holds the right trade, who can go now,
 * and where the free time is in the real diary. Nothing here is guessed:
 * free time comes from booked jobs, distance from the sites' own coordinates.
 */

const HALF_HOUR = 30 * 60_000
const ceilHalf = (ms: number) => Math.ceil(ms / HALF_HOUR) * HALF_HOUR

/** Working hours the slot finder looks inside, UK time. */
export const DAY_FROM = '08:00'
export const DAY_TO = '17:00'

/** Anyone can take general work; everything else needs the trade. */
export const holdsTrade = (o: Operator, t: Trade) => t === 'general' || o.trades.includes(t)

export const tradeWord = (t: Trade) => tradeName[t]?.toLowerCase() ?? t

/** "carpentry and general" */
export function listWords(words: string[]) {
  if (words.length < 2) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

const first = (name: string) => name.split(' ')[0]

/** Straight-line miles between two sites, when both have a real position. */
export function milesBetween(a?: Pick<Site, 'lat' | 'lng'>, b?: Pick<Site, 'lat' | 'lng'>) {
  if (!a || !b || (!a.lat && !a.lng) || (!b.lat && !b.lng)) return undefined
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(3958.8 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10
}

/** The gates a job of this trade has to pass before it can be signed off. */
export function checksFor(trade: Trade): ComplianceCheck[] {
  const c = (key: ComplianceCheck['key'], label: string): ComplianceCheck => ({ key, label, state: 'pending' })
  const list = [c('rams', 'RAMS')]
  if (trade === 'gas' || trade === 'heating') list.push(c('registration', 'Gas Safe'), c('gas_tightness', 'Tightness test'))
  if (trade === 'electrical') list.push(c('registration', 'NICEIC'), c('eicr', 'Electrical cert'))
  list.push(c('photos', 'Photos'), c('signature', 'Customer sign-off'))
  return list
}

/* ---------- Who can go now (emergency callout) ---------- */

export interface Candidate {
  op: Operator
  cleared: boolean
  /** now: free this minute. later: busy, free when their job ends. off: off shift. no: not cleared for the trade. */
  when: 'now' | 'later' | 'off' | 'no'
  freeAt?: string
  why: string
  miles?: number
}

const isLive = (j: Job) => !['cancelled', 'complete', 'invoiced', 'paid'].includes(j.status)

/** Everyone on the books, best first: right trade and free now, then finishing soonest, then off shift, then not cleared. */
export function rankCrew(book: Book, trade: Trade, site?: Site, now = Date.now()): Candidate[] {
  const day = today(now)
  const list = book.operators.map((op): Candidate => {
    const current = find(book.jobs, op.currentJobId)
    const here = find(book.sites, current?.siteId)
    const miles = milesBetween(here, site)
    const cleared = holdsTrade(op, trade)
    const nextToday = book.jobs
      .filter((j) => j.operatorIds.includes(op.id) && isLive(j) && j.id !== current?.id && ukDay(j.start) === day && Date.parse(j.start) > now)
      .sort((a, b) => a.start.localeCompare(b.start))[0]

    let state = ''
    let when: Candidate['when'] = 'now'
    let freeAt: string | undefined
    if (op.state === 'off_shift') {
      when = 'off'
      state = 'Off shift'
    } else if (current && (op.state === 'on_site' || op.state === 'en_route' || op.state === 'delayed')) {
      when = 'later'
      freeAt = new Date(Math.max(Date.parse(current.end), now + HALF_HOUR)).toISOString()
      const over = Date.parse(current.end) < now
      if (op.state === 'on_site') state = over ? `On site at ${current.ref}, past the ${clock(current.end)} booked finish` : `On site at ${current.ref} until about ${clock(current.end)}`
      else if (op.state === 'delayed') state = `Running late to ${current.ref}${op.etaMinutes ? `, ${op.etaMinutes} min out` : ''}, booked there until ${clock(current.end)}`
      else state = `On the way to ${current.ref}${op.etaMinutes ? `, there in ${op.etaMinutes} min` : ''}, booked until ${clock(current.end)}`
    } else {
      state = op.state === 'workshop' ? 'In the workshop' : 'On shift with nothing on right now'
      if (nextToday) state += `, next booked ${clock(nextToday.start)} at ${nextToday.ref}`
    }

    if (!cleared) {
      const holds = listWords(op.trades.map(tradeWord))
      return { op, cleared, when: 'no', why: `${state}, but ${holds || 'no trade'} only.`, miles }
    }
    return { op, cleared, when, freeAt, why: `${tradeName[op.trades[0]] ?? ''}${op.trades.length > 1 ? ` and ${tradeWord(op.trades[1])}` : ''}. ${state}.`, miles }
  })
  const order = { now: 0, later: 1, off: 2, no: 3 }
  return list.sort((a, b) => order[a.when] - order[b.when] || (a.freeAt ?? '').localeCompare(b.freeAt ?? '') || (a.miles ?? 99) - (b.miles ?? 99))
}

/** What the office says before sending someone. */
export function sendNote(book: Book, c: Candidate, caller: string) {
  const name = first(c.op.name)
  const them = caller.trim() ? `${first(caller.trim())}'s job` : 'The job'
  const current = find(book.jobs, c.op.currentJobId)
  const where = current && find(book.customers, current.customerId)
  if (c.when === 'later' && current) return `${name} finishes ${current.ref}${where ? ` for ${where.name}` : ''} first. ${them} lands on ${name}'s phone as an emergency, with the address and what they said.`
  if (c.when === 'off') return `${name} is off shift, so ring them before you send it. ${them} lands on their phone as an emergency.`
  return `${name} is free now. ${them} lands on ${name}'s phone as an emergency, with the address and what they said.`
}

/* ---------- Free slots (new job) ---------- */

export interface Slot {
  key: string
  opId: string
  start: string
  end: string
  why: string
  tag?: 'Soonest' | 'Close by'
  miles?: number
}

const isWeekday = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay()
  return d !== 0 && d !== 6
}

/**
 * Gaps in the real diary, long enough for the job, for crew who hold the trade.
 * Working days only, 08:00 to 17:00, from half an hour from now. One slot per gap,
 * at most two a day for each person, soonest first.
 */
export function freeSlots(book: Book, trade: Trade, mins: number, site?: Site, opts: { now?: number; days?: number; limit?: number } = {}): Slot[] {
  const now = opts.now ?? Date.now()
  const span = mins * 60_000
  const crew = book.operators.filter((o) => holdsTrade(o, trade))
  const days: string[] = []
  for (let i = 0; days.length < (opts.days ?? 10) && i < 30; i++) {
    const d = addDays(today(now), i)
    if (isWeekday(d)) days.push(d)
  }
  const out: Slot[] = []
  for (const op of crew) {
    for (const d of days) {
      const from = Date.parse(ukToIso(d, DAY_FROM))
      const to = Date.parse(ukToIso(d, DAY_TO))
      if (d === today(now) && op.state === 'off_shift') continue
      const busy = book.jobs
        .filter((j) => j.operatorIds.includes(op.id) && j.status !== 'cancelled' && Date.parse(j.start) < to && Date.parse(j.end) > from)
        .sort((a, b) => a.start.localeCompare(b.start))
      let cursor = ceilHalf(Math.max(from, now + HALF_HOUR))
      let prev: Job | undefined
      let perDay = 0
      const consider = (end: number, next?: Job) => {
        if (perDay < 2 && end - cursor >= span) {
          out.push(slotAt(book, op, cursor, span, prev, next, site, busy.length === 0, d === today(now)))
          perDay++
        }
      }
      for (const j of busy) {
        consider(Date.parse(j.start), j)
        cursor = Math.max(cursor, ceilHalf(Date.parse(j.end)))
        prev = j
      }
      consider(to)
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || (a.miles ?? 99) - (b.miles ?? 99))
  const picked = out.slice(0, opts.limit ?? 5)
  picked.forEach((s, i) => {
    if (i === 0) s.tag = 'Soonest'
    else if (s.miles !== undefined && s.miles <= 2) s.tag = 'Close by'
  })
  return picked
}

function slotAt(book: Book, op: Operator, at: number, span: number, prev: Job | undefined, next: Job | undefined, site: Site | undefined, emptyDay: boolean, isToday: boolean): Slot {
  const near = prev ?? next
  const miles = near ? milesBetween(find(book.sites, near.siteId), site) : undefined
  const away = miles !== undefined ? `, ${miles} mi as the crow flies` : ''
  const town = (j: Job) => find(book.sites, j.siteId)?.town
  let why: string
  if (emptyDay) why = isToday ? 'Nothing else booked for the rest of today.' : 'Nothing else booked that day.'
  else if (prev) why = `After ${prev.ref}${town(prev) ? ` in ${town(prev)}` : ''}${away}.`
  else if (next) why = `${isToday ? 'Before' : 'First of the day, before'} ${next.ref} at ${clock(next.start)}${away}.`
  else why = 'A free gap.'
  return { key: `${op.id}_${at}`, opId: op.id, start: new Date(at).toISOString(), end: new Date(at + span).toISOString(), why, miles }
}

/** "Wed 21" */
export const slotDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'Europe/London' }).replace(',', '')
