import { clock, pounds, totals } from '@kit'
import { useBook, useQuery, type Book } from '@/data/ardent'
import type { Approval, Exception } from '@/data/model'
import { find, invoiceOwed, onDay, today } from '@/lib/jobs'

/*
 * "Needs you": the things only the office can move, worded the way the owner
 * would say them, each with the one thing to do about it. The bell and Today
 * read the same list, so the count always matches.
 */

export interface Need {
  id: string
  title: string
  /** Short mono facts under the title: a ref, a priority, a postcode. */
  meta: string[]
  action: string
  to: string
  tone?: 'warn' | 'danger'
}

const DAY = 86_400_000
const days = (from: string, to = Date.now()) => Math.max(0, Math.round((to - Date.parse(from)) / DAY))
const first = (name: string) => name.split(' ')[0]
const strip = (id: string, prefix: string) => id.slice(prefix.length)

export function needsFrom(book: Book, attention: Exception[], waiting: Approval[] = []): Need[] {
  const out: Need[] = []
  const day = today()

  // Ardent's drafts, as one line: the page holds the detail.
  if (waiting.length) out.push({ id: 'approvals', title: `Ardent has ${waiting.length} ${waiting.length === 1 ? 'draft' : 'drafts'} waiting for your yes`, meta: [...new Set(waiting.map((a) => a.kind === 'chase_invoice' ? 'reminder' : a.kind === 'send_quote' ? 'quote' : 'invoice'))], action: 'Look', to: '/approvals' })

  // Today's jobs with nobody on them come first: someone is waiting in.
  for (const j of book.jobs.filter((x) => onDay(x.start, day) && !x.operatorIds.length && !['cancelled', 'complete', 'invoiced', 'paid'].includes(x.status))) {
    const site = find(book.sites, j.siteId)
    const who = find(book.customers, j.customerId)
    out.push({ id: `un_${j.id}`, title: `${j.title} at ${who?.name.split(' ')[0] ?? site?.line1}, nobody on it`, meta: [j.ref, j.priority === 'normal' ? '' : j.priority, site?.postcode ?? ''].filter(Boolean), action: 'Book', to: `/jobs/${j.id}`, tone: j.priority === 'emergency' || j.priority === 'high' ? 'warn' : undefined })
  }

  for (const a of attention.filter((x) => x.outcome !== 'resolved')) {
    if (a.id.startsWith('att_inv_')) {
      const inv = find(book.invoices, strip(a.id, 'att_inv_'))
      if (!inv) continue
      const who = find(book.customers, inv.customerId)
      out.push({ id: a.id, title: `${who?.name ?? 'A customer'} owe ${pounds(invoiceOwed(inv), { always: true })}, ${days(inv.dueAt!)} days late`, meta: [inv.ref], action: 'Chase', to: `/invoices/${inv.id}`, tone: 'warn' })
    } else if (a.id.startsWith('att_reg_')) {
      const op = book.operators.find((o) => a.id.startsWith(`att_reg_${o.id}_`))
      const reg = op?.registrations.find((r) => a.id === `att_reg_${op.id}_${r.number}`)
      if (!op || !reg) continue
      const left = Math.round((Date.parse(reg.expires) - Date.now()) / DAY)
      out.push({ id: a.id, title: left < 0 ? `${first(op.name)}'s ${reg.body} has run out` : `${first(op.name)}'s ${reg.body} runs out in ${left} days`, meta: [reg.number], action: 'Renew', to: '/crew', tone: left < 0 ? 'danger' : undefined })
    } else if (a.id.startsWith('att_cert_')) {
      const cert = find(book.certificates, strip(a.id, 'att_cert_'))
      const site = find(book.sites, cert?.siteId)
      if (!cert) continue
      out.push({ id: a.id, title: `${cert.kind} at ${site?.line1 ?? 'a site'} has run out`, meta: [site?.postcode ?? '', `expired ${cert.expires}`].filter(Boolean), action: 'Book', to: `/jobs/new?site=${cert.siteId}&for=${encodeURIComponent(cert.kind)}`, tone: 'danger' })
    } else if (a.id.startsWith('att_job_')) {
      const j = find(book.jobs, strip(a.id, 'att_job_'))
      if (!j) continue
      out.push({ id: a.id, title: `${j.title} hasn't started`, meta: [j.ref, `booked ${clock(j.start)}`], action: 'Open', to: `/jobs/${j.id}` })
    } else if (a.id.startsWith('att_pause_')) {
      const j = find(book.jobs, strip(a.id, 'att_pause_'))
      if (!j) continue
      out.push({ id: a.id, title: `${j.ref} is on hold: ${a.detail}`, meta: [j.ref, a.who], action: 'Open', to: `/jobs/${j.id}` })
    }
    // "Running late" belongs to the vans feed: the office can see it, but there is nothing to press.
  }

  // Quotes that have sat unanswered for three days or more.
  for (const q of book.quotes.filter((x) => x.status === 'sent' && x.sentAt && days(x.sentAt) >= 3)) {
    const who = find(book.customers, q.customerId)
    const job = find(book.jobs, q.jobId)
    out.push({ id: `q_${q.id}`, title: `${who?.name.split(' ')[0] ?? 'A customer'} has had the ${job?.title.toLowerCase() ?? ''} quote ${days(q.sentAt!)} days`.replace('  ', ' '), meta: [q.ref, pounds(totals({ lines: q.lines }).total, { always: true })], action: 'Follow up', to: `/quotes/${q.id}` })
  }
  return out
}

export function useNeeds() {
  const { data: book } = useBook()
  const { data: attention } = useQuery((c) => c.attention.list())
  const { data: waiting } = useQuery((c) => c.approvals.list())
  return book && attention ? needsFrom(book, attention, waiting) : undefined
}

export interface VanNews {
  id: string
  at: string
  initials: string
  title: string
  meta: string[]
  tone?: 'warn'
}

/** What the crew have sent in today, newest first: arrivals, notes, photos, running late. */
export function useVanFeed(book: Book | undefined, limit = 6) {
  const day = today()
  const jobs = book?.jobs.filter((j) => onDay(j.start, day)) ?? []
  const key = jobs.map((j) => j.id).join()
  const { data } = useQuery(
    async (c) => {
      const per = await Promise.all(
        jobs.map(async (j) => {
          const [notes, photos, time] = await Promise.all([c.notes.forJob(j.id), c.photos.forJob(j.id), c.time.forJob(j.id)])
          return { j, notes, photos, time }
        }),
      )
      return per
    },
    [key],
  )
  if (!book) return undefined
  const ini = (id: string) => find(book.operators, id)?.initials ?? '--'
  const items: VanNews[] = []
  for (const op of book.operators.filter((o) => o.state === 'delayed')) {
    const j = find(book.jobs, op.currentJobId)
    items.push({ id: `late_${op.id}`, at: new Date().toISOString(), initials: op.initials, title: op.etaMinutes ? `Running ${op.etaMinutes} min late` : 'Running late', meta: [j?.ref ?? ''].filter(Boolean), tone: 'warn' })
  }
  for (const { j, notes, photos, time } of data ?? []) {
    const site = find(book.sites, j.siteId)
    for (const t of time) {
      if (!onDay(t.start, day)) continue
      if (t.kind === 'labour') items.push({ id: t.id, at: t.start, initials: ini(t.operatorId), title: 'Arrived', meta: [j.ref, site?.line1 ?? ''] })
      if (t.kind === 'travel') items.push({ id: t.id, at: t.start, initials: ini(t.operatorId), title: 'Set off', meta: [j.ref, site?.postcode ?? ''] })
    }
    for (const n of notes.filter((x) => onDay(x.at, day))) items.push({ id: n.id, at: n.at, initials: ini(n.operatorId), title: n.body, meta: [j.ref] })
    const shots = photos.filter((p) => onDay(p.takenAt, day))
    if (shots.length) {
      const last = shots.reduce((a, b) => (a.takenAt > b.takenAt ? a : b))
      items.push({ id: `ph_${j.id}`, at: last.takenAt, initials: ini(last.operatorId), title: `${shots.length} ${shots.length === 1 ? 'photo' : 'photos'}`, meta: [j.ref, last.stage] })
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
