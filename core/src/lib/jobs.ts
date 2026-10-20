import { jobDone, totals, ukDay } from '@kit'
import type { Customer, Invoice, Job, Operator, Site } from '@/data/model'

/** The job's value before VAT, in pence. */
export const jobNet = (job: Pick<Job, 'lines'>) => totals({ lines: job.lines, vatRate: 0 }).net

export const invoiceTotal = (inv: Invoice) => totals(inv).total
export const invoiceOwed = (inv: Invoice) => Math.max(0, totals(inv).total - inv.paidAmount)

/** UK calendar day, "2026-10-20". */
export const today = (now = Date.now()) => ukDay(new Date(now).toISOString())
export const onDay = (iso: string, day: string) => ukDay(iso) === day

/** Monday of the UK week holding `day`. */
export function weekStart(day: string) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const isDone = (job: Job) => jobDone.has(job.status)

/** Where a job sits on the board. */
export type Lane = 'unassigned' | 'booked' | 'en_route' | 'on_site' | 'signed_off'
export function laneOf(job: Job): Lane | undefined {
  if (job.status === 'cancelled') return undefined
  if (isDone(job)) return 'signed_off'
  if (job.status === 'en_route') return 'en_route'
  if (job.status === 'on_site' || job.status === 'paused') return 'on_site'
  if (!job.operatorIds.length) return 'unassigned'
  return 'booked'
}

/** Find by id in a list that may still be loading. */
export const find = <T extends { id: string }>(list: T[] | undefined, id: string | undefined) => (id ? list?.find((x) => x.id === id) : undefined)

/** Everything about a job a row needs, looked up once. */
export function jobContext(job: Job, book: { customers: Customer[]; sites: Site[]; operators: Operator[] }) {
  return {
    customer: find(book.customers, job.customerId),
    site: find(book.sites, job.siteId),
    crew: job.operatorIds.map((id) => find(book.operators, id)).filter((o): o is Operator => !!o),
  }
}

/** The job most worth watching right now: on site, then on the way, then next booked today. */
export function focusJob(jobs: Job[], now = Date.now()) {
  const day = today(now)
  const todays = jobs.filter((j) => onDay(j.start, day)).sort((a, b) => a.start.localeCompare(b.start))
  return (
    todays.find((j) => j.status === 'on_site') ??
    todays.find((j) => j.status === 'en_route') ??
    todays.find((j) => j.status === 'paused') ??
    todays.find((j) => j.status === 'booked' && j.end > new Date(now).toISOString()) ??
    todays[0]
  )
}
