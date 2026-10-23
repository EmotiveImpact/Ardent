import { pounds, totals, ukDay } from '@kit'
import type { Book } from '@/data/ardent'
import type { LiveBoard, LiveJob, LiveVan } from '@/data/hq'
import type { ActionEntry, Approval, Charge, Invoice, Job, JobStatus, Operator } from '@/data/model'
import { isLate, OWING } from '@/components/ardent/money-lib'
import { addDays, find, hoursOf, invoiceOwed, invoiceTotal, today, WEEK_HOURS, weekStart } from './jobs'

/*
 * The owner's view on Today: one firm's records worked into the shapes the
 * HQ master map draws (the same rules HQ uses in engine/src/hq.ts), and the
 * month in money and work, all from what the firm's own records hold.
 */

const DAY = 86_400_000
const LIVE: JobStatus[] = ['en_route', 'on_site']
const DONE: JobStatus[] = ['complete', 'invoiced', 'paid']
/** As HQ: a phone this far behind the firm's freshest one has stopped syncing. */
export const BEHIND_MS = 90 * 60 * 1000
/** Late invoices owing at least this much make the owner's "Needs a look". */
export const LATE_FLOOR = 20000

export const thisMonth = (now = Date.now()) => today(now).slice(0, 7)
export const inMonth = (iso: string | undefined, month: string) => !!iso && ukDay(iso).slice(0, 7) === month
export const first = (name: string) => name.split(' ')[0]

/** On today's board: booked for today, or out on it now. */
const onToday = (j: Job, day: string) => ukDay(j.start) === day || LIVE.includes(j.status) || j.status === 'paused'

/** Phones on shift that have fallen behind the firm's freshest one, as HQ works it out. */
export function stalePhones(ops: Operator[]) {
  const live = ops.filter((o) => o.state !== 'off_shift' && o.location)
  if (live.length < 2) return []
  const freshest = Math.max(...live.map((o) => Date.parse(o.location!.at)))
  return live.filter((o) => freshest - Date.parse(o.location!.at) > BEHIND_MS)
}

function centreOf(sites: { lat: number; lng: number }[]) {
  if (!sites.length) return { lat: 53.48, lng: -2.24 }
  return {
    lat: sites.reduce((s, x) => s + x.lat, 0) / sites.length,
    lng: sites.reduce((s, x) => s + x.lng, 0) / sites.length,
  }
}

/** The firm's own day as the master map's board: every job today and every van on shift. */
export function boardOf(book: Book, firm: { id: string; name: string }, now = Date.now()): LiveBoard {
  const day = today(now)
  const iso = new Date(now).toISOString()
  const stale = new Set(stalePhones(book.operators).map((o) => o.id))
  const jobs: LiveJob[] = []
  for (const j of book.jobs.filter((x) => onToday(x, day) && x.status !== 'cancelled')) {
    const site = find(book.sites, j.siteId)
    if (!site) continue
    const crew = book.operators.filter((o) => j.operatorIds.includes(o.id))
    const late = crew.find((o) => o.currentJobId === j.id && o.state === 'delayed')
    const away = crew.find((o) => o.currentJobId === j.id && o.state === 'en_route')
    const working = LIVE.includes(j.status) || j.status === 'paused'
    const flag =
      j.priority === 'emergency' && !DONE.includes(j.status) && j.status !== 'on_site'
        ? away || late
          ? `Emergency, ${away?.etaMinutes ?? late?.etaMinutes ?? '?'} min away`
          : 'Emergency, nobody on the way yet'
        : late
          ? `Running late, ${late.etaMinutes ?? '?'} min away`
          : crew.some((o) => stale.has(o.id))
            ? "Engineer's phone not syncing"
            : working && j.end < iso
              ? `Running over, booked till ${new Date(j.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`
              : j.status === 'paused'
                ? 'Paused'
                : undefined
    jobs.push({
      id: j.id,
      ref: j.ref,
      title: j.title,
      trade: j.trade,
      status: j.status,
      priority: j.priority,
      start: j.start,
      end: j.end,
      firmId: firm.id,
      firmName: firm.name,
      operators: crew.map((o) => ({
        id: o.id,
        name: o.name,
        initials: o.initials,
      })),
      customer: find(book.customers, j.customerId)?.name ?? '',
      address: `${site.line1}, ${site.town} ${site.postcode}`,
      area: `${site.town}, ${site.postcode.split(' ')[0]}`,
      lat: site.lat,
      lng: site.lng,
      ...(flag ? { flag } : {}),
    })
  }
  const vans: LiveVan[] = []
  for (const o of book.operators) {
    if (o.state === 'off_shift') continue
    const job = find(book.jobs, o.currentJobId)
    const site = job && find(book.sites, job.siteId)
    const spot = o.location
      ? {
          lat: o.location.lat,
          lng: o.location.lng,
          from: 'van' as const,
          seenAt: o.location.at,
        }
      : site
        ? { lat: site.lat, lng: site.lng, from: 'job' as const }
        : o.standby?.base
          ? { ...o.standby.base, from: 'base' as const }
          : { ...centreOf(book.sites), from: 'base' as const }
    vans.push({
      id: o.id,
      name: o.name,
      initials: o.initials,
      firmId: firm.id,
      firmName: firm.name,
      state: o.state,
      ...spot,
      ...(job ? { jobId: job.id } : {}),
      ...(o.etaMinutes ? { etaMinutes: o.etaMinutes } : {}),
    })
  }
  jobs.sort((a, b) => a.start.localeCompare(b.start))
  return { day, jobs, vans }
}

/* ---------- Money ---------- */

/** Mondays of the weeks that touch this month, up to this week. */
export function monthWeeks(now = Date.now()) {
  const month = thisMonth(now)
  const out: string[] = []
  for (let w = weekStart(`${month}-01`); w <= weekStart(today(now)); w = addDays(w, 7)) out.push(w)
  return out
}

/** The last n months, oldest first, as "2026-10". */
export function lastMonths(n: number, now = Date.now()) {
  const [y, m] = thisMonth(now).split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 15))
    return d.toISOString().slice(0, 7)
  })
}

/** Sent invoices: anything with an issue date that hasn't been voided. */
const sent = (book: Book) => book.invoices.filter((i) => i.issuedAt && i.status !== 'void' && i.status !== 'draft')

export function invoicedIn(book: Book, month: string, week?: string) {
  return sent(book).filter((i) => inMonth(i.issuedAt, month) && (!week || weekStart(ukDay(i.issuedAt!)) === week))
}

/** The same days of last month, so this month's total has something fair to stand against. */
export function invoicedLastMonthToDate(book: Book, now = Date.now()) {
  const day = today(now)
  const [y, m, d] = day.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10)
  const last = new Date(Date.UTC(y, m - 1, 0)).getUTCDate()
  const to = new Date(Date.UTC(y, m - 2, Math.min(d, last))).toISOString().slice(0, 10)
  return sent(book)
    .filter((i) => ukDay(i.issuedAt!) >= from && ukDay(i.issuedAt!) <= to)
    .reduce((s, i) => s + invoiceTotal(i), 0)
}

export interface CashIn {
  at: string
  amount: number
  through: 'invoice' | 'plan' | 'deposit'
}

/**
 * Money in: every payment recorded on an invoice (cash and bank included,
 * refunds taken off), plus Stripe payments not on an invoice yet: service
 * plans and deposits. A deposit already taken off an invoice is counted once.
 */
export function cashIn(book: Book, charges: Charge[] = []): CashIn[] {
  const out: CashIn[] = []
  const onInvoices = new Set<string>()
  for (const inv of book.invoices) {
    for (const p of inv.payments ?? []) {
      if (p.chargeId) onInvoices.add(p.chargeId)
      out.push({ at: p.at, amount: p.amount, through: 'invoice' })
    }
  }
  for (const c of charges.filter((x) => x.kind !== 'invoice' && !onInvoices.has(x.id))) out.push({ at: c.at, amount: c.amount - c.refunded, through: c.kind })
  return out
}

/** What's owed, by how late: not due yet, then 1 to 14, 15 to 30, 31 to 60 and over 60 days late. */
export function owedByAge(book: Book, now = Date.now()) {
  const buckets = [0, 0, 0, 0, 0]
  for (const i of book.invoices.filter((x) => OWING.includes(x.status))) {
    const late = isLate(i, now) ? Math.max(1, Math.floor((now - Date.parse(i.dueAt!)) / DAY)) : 0
    buckets[late === 0 ? 0 : late <= 14 ? 1 : late <= 30 ? 2 : late <= 60 ? 3 : 4] += invoiceOwed(i)
  }
  return buckets
}
export const AGE_LABELS = ['Not due yet', '1 to 14 days late', '15 to 30 days late', '31 to 60 days late', 'Over 60 days late']

/**
 * Quotes won. A quote carries no date for the customer's answer, so the rate is
 * of quotes sent in the last 30 days that have one: said yes, said no or ran out.
 */
export function quoteFigures(book: Book, now = Date.now()) {
  const since = now - 30 * DAY
  const answered = book.quotes.filter((q) => q.sentAt && Date.parse(q.sentAt) >= since && ['accepted', 'declined', 'expired'].includes(q.status))
  const won = answered.filter((q) => q.status === 'accepted')
  const out = book.quotes.filter((q) => q.status === 'sent')
  return {
    answered: answered.length,
    won: won.length,
    rate: answered.length ? Math.round((won.length / answered.length) * 100) : undefined,
    outCount: out.length,
    outValue: out.reduce((s, q) => s + totals(q).total, 0),
  }
}

/** Quotes said yes to, by the week they were sent. */
export const quotesWonByWeek = (book: Book, weeks: string[]) => weeks.map((w) => book.quotes.filter((q) => q.status === 'accepted' && q.sentAt && weekStart(ukDay(q.sentAt)) === w).length)

/* ---------- The crew ---------- */

export interface CrewRow {
  op: Operator
  done: number
  /** With VAT. A job two people worked is split between them. */
  invoiced: number
  hoursWeek: number
  bookedPct: number
  /** Registrations, soonest to run out first, with days left (negative once run out). */
  papers: { body: string; number: string; expires: string; left: number }[]
}

export function crewRows(book: Book, now = Date.now()): CrewRow[] {
  const month = thisMonth(now)
  const mon = weekStart(today(now))
  const week = Array.from({ length: 5 }, (_, i) => addDays(mon, i))
  const invoiced = invoicedIn(book, month)
  return book.operators.map((op) => {
    const mine = (j?: Job) => !!j && j.operatorIds.includes(op.id)
    const done = book.jobs.filter((j) => mine(j) && DONE.includes(j.status) && inMonth(j.start, month)).length
    const money = invoiced.reduce((s, inv) => {
      const j = find(book.jobs, inv.jobId)
      return mine(j) ? s + invoiceTotal(inv) / j!.operatorIds.length : s
    }, 0)
    const hoursWeek = week.reduce((s, d) => s + hoursOf(book, d, op.id), 0)
    const papers = op.registrations
      .map((r) => ({
        ...r,
        left: Math.floor((Date.parse(`${r.expires}T23:59:59Z`) - now) / DAY),
      }))
      .sort((a, b) => a.expires.localeCompare(b.expires))
    return {
      op,
      done,
      invoiced: Math.round(money),
      hoursWeek,
      bookedPct: Math.round((hoursWeek / WEEK_HOURS) * 100),
      papers,
    }
  })
}

/* ---------- Coming up ---------- */

export interface LatePayer {
  customerId: string
  name: string
  phone?: string
  owed: number
  /** The oldest late invoice, to open. */
  oldest: Invoice
  days: number
}

export function latePayers(book: Book, now = Date.now()): LatePayer[] {
  const by = new Map<string, Invoice[]>()
  for (const i of book.invoices.filter((x) => isLate(x, now))) by.set(i.customerId, [...(by.get(i.customerId) ?? []), i])
  return [...by.entries()]
    .map(([customerId, list]) => {
      const oldest = [...list].sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0]
      const c = find(book.customers, customerId)
      return {
        customerId,
        name: c?.name ?? 'A customer',
        phone: c?.phone,
        owed: list.reduce((s, i) => s + invoiceOwed(i), 0),
        oldest,
        days: Math.max(1, Math.floor((now - Date.parse(oldest.dueAt!)) / DAY)),
      }
    })
    .sort((a, b) => b.owed - a.owed)
}

/* ---------- What Ardent did this week ---------- */

export interface ArdentWeek {
  drafted: number
  draftedKinds: {
    invoices: number
    reminders: number
    quotes: number
    refunds: number
  }
  saidYes: number
  saidNo: number
  waiting: number
  remindersSent: number
  /** Things Ardent did by itself, from the firm's log. */
  onItsOwn: number
}

export function ardentWeek(book: Book, approvals: Approval[], log: ActionEntry[], now = Date.now()): ArdentWeek {
  const mon = weekStart(today(now))
  const fresh = (iso?: string) => !!iso && ukDay(iso) >= mon
  const made = approvals.filter((a) => fresh(a.createdAt))
  return {
    drafted: made.length,
    draftedKinds: {
      invoices: made.filter((a) => a.kind === 'send_invoice').length,
      reminders: made.filter((a) => a.kind === 'chase_invoice').length,
      quotes: made.filter((a) => a.kind === 'send_quote').length,
      refunds: made.filter((a) => a.kind === 'refund').length,
    },
    saidYes: approvals.filter((a) => a.status === 'approved' && fresh(a.decidedAt)).length,
    saidNo: approvals.filter((a) => a.status === 'rejected' && fresh(a.decidedAt)).length,
    waiting: approvals.filter((a) => a.status === 'waiting').length,
    remindersSent: book.invoices.reduce((s, i) => s + (i.reminders ?? []).filter(fresh).length, 0),
    onItsOwn: log.filter((e) => e.by.kind === 'ardent' && !e.action.startsWith('hq.') && fresh(e.at)).length,
  }
}

/* ---------- Words ---------- */

const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
export const say = (n: number) => words[n] ?? String(n)
export const money = (p: number) => pounds(Math.round(p / 100) * 100)
