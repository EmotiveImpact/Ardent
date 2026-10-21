/**
 * The office manager's words: what each change was, in a line a person reads
 * in the log, and the owner's morning brief from the day's numbers. Code does
 * the sums and the sentences here; nothing is guessed.
 */
import type { Customer, Exception, Invoice, Job, JobStatus, MorningBrief, Operator, Quote } from '../../core/src/data/model.ts'
import { pounds, ukDay } from '../kit/format.ts'

export interface Look {
  job(id: unknown): Job | undefined
  customer(id: unknown): Customer | undefined
  operator(id: unknown): Operator | undefined
  invoice(id: unknown): Invoice | undefined
  quote(id: unknown): Quote | undefined
}

const STATUS_WORDS: Partial<Record<JobStatus, string>> = {
  booked: 'booked',
  en_route: 'on the way',
  on_site: 'on site',
  paused: 'paused',
  complete: 'finished',
  cancelled: 'cancelled',
}

const ref = (x: { ref?: string } | undefined, fallback: string) => x?.ref ?? fallback
const who = (look: Look, id: unknown) => look.operator(id)?.name.split(' ')[0] ?? 'someone'

/**
 * A change in words, and the job it belongs to. Reads only what the change
 * returned and the records it names. Methods not listed get their own name.
 */
export function describe(method: string, args: unknown[], result: unknown, look: Look): { summary: string; jobId?: string } {
  const r = (result ?? {}) as Record<string, unknown> & { id?: string; ref?: string; jobId?: string }
  const job = (id: unknown) => look.job(id)
  const a0 = args[0]
  switch (method) {
    case 'jobs.create':
      return { summary: `Booked ${r.ref}, ${r.title}`, jobId: r.id }
    case 'jobs.update':
      return { summary: `Changed the booking on ${ref(job(a0), 'a job')}`, jobId: a0 as string }
    case 'jobs.setStatus':
      return { summary: `${ref(job(a0), 'A job')} ${STATUS_WORDS[args[1] as JobStatus] ?? `set to ${args[1]}`}`, jobId: a0 as string }
    case 'jobs.addLine':
      return { summary: `Added ${(args[1] as { description?: string })?.description ?? 'a line'} to ${ref(job(a0), 'a job')}`, jobId: a0 as string }
    case 'jobs.removeLine':
      return { summary: `Took a line off ${ref(job(a0), 'a job')}`, jobId: a0 as string }
    case 'jobs.setCheck':
      return { summary: `${String(args[1]).replace(/_/g, ' ')} check ${args[2]} on ${ref(job(a0), 'a job')}`, jobId: a0 as string }
    case 'customers.create':
      return { summary: `Added ${r.name} as a customer` }
    case 'customers.update':
      return { summary: `Changed ${look.customer(a0)?.name ?? 'a customer'}'s details` }
    case 'sites.create':
      return { summary: `Added ${r.line1} as a site` }
    case 'operators.setState':
      return { summary: `${who(look, a0)} is ${String(args[1]).replace(/_/g, ' ')}`, jobId: args[2] as string | undefined }
    case 'operators.setLocation':
      return { summary: '' }
    case 'operators.setStandby':
      return { summary: args[1] ? `${who(look, a0)} went on standby` : `${who(look, a0)} came off standby` }
    case 'requests.create':
      return { summary: `Asked the crew about ${ref(job(r.jobId), 'a job')}`, jobId: r.jobId }
    case 'requests.respond': {
      const mine = (r.offers as { status?: string }[] | undefined)?.[0]
      return { summary: `${ref(job(r.jobId), 'A job request')} ${mine?.status === 'accepted' ? 'accepted' : 'passed on'}`, jobId: r.jobId }
    }
    case 'requests.withdraw':
      return { summary: `Called off the request for ${ref(job(r.jobId), 'a job')}`, jobId: r.jobId }
    case 'time.start':
      return { summary: `Clock started on ${ref(job((a0 as { jobId?: string })?.jobId), 'the day')}`, jobId: (a0 as { jobId?: string })?.jobId }
    case 'time.stop':
      return { summary: `Clock stopped${r.jobId ? ` on ${ref(job(r.jobId), 'a job')}` : ''}`, jobId: r.jobId }
    case 'photos.add':
      return { summary: `Photo added to ${ref(job(r.jobId), 'a job')}`, jobId: r.jobId }
    case 'notes.add':
      return { summary: `Note on ${ref(job(r.jobId), 'a job')}`, jobId: r.jobId }
    case 'signatures.add':
      return { summary: `${r.signedBy} signed off ${ref(job(r.jobId), 'a job')}`, jobId: r.jobId }
    case 'quotes.create':
      return { summary: `Drafted ${r.ref}`, jobId: r.jobId }
    case 'quotes.update':
      return { summary: `Changed ${r.ref}`, jobId: r.jobId }
    case 'quotes.send':
      return { summary: `Marked ${r.ref} as sent`, jobId: r.jobId }
    case 'quotes.respond':
      return { summary: `${r.ref} ${r.status}${r.chosen ? `, option ${r.chosen}` : ''}`, jobId: r.jobId }
    case 'invoices.create':
      return { summary: `Drafted ${r.ref}`, jobId: r.jobId }
    case 'invoices.send':
      return { summary: `Marked ${r.ref} as sent`, jobId: r.jobId }
    case 'invoices.recordPayment':
      return { summary: `${pounds(args[1] as number)} paid on ${r.ref} by ${String(args[2]).replace('_', ' ')}`, jobId: r.jobId }
    case 'priceList.create':
      return { summary: `Added ${r.name} to the price list` }
    case 'priceList.update':
      return { summary: `Changed ${r.name} on the price list` }
    case 'stock.set':
      return { summary: `${who(look, a0)}'s van: ${r.quantity} of ${String(args[1])}` }
    case 'gasRecords.create':
      return { summary: `Started ${r.ref}`, jobId: r.jobId }
    case 'gasRecords.issue':
      return { summary: `Issued ${r.ref}`, jobId: r.jobId }
    case 'gasRecords.saveAppliance':
    case 'gasRecords.removeAppliance':
    case 'gasRecords.setInstallation':
      return { summary: `Filled in ${r.ref}`, jobId: r.jobId }
    default:
      return { summary: method }
  }
}

/** The day before a UK day. */
export const dayBefore = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

const DONE: JobStatus[] = ['complete', 'invoiced', 'paid']
const OWING: Invoice['status'][] = ['sent', 'part_paid', 'overdue']
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What an invoice comes to with VAT, in pence. */
const gross = (inv: Pick<Invoice, 'lines' | 'vatRate'>) => {
  const net = inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  return net + Math.round((net * inv.vatRate) / 10000)
}

/**
 * The morning brief for a UK day, from the records and the attention list.
 * Yesterday's work and money, what's overdue, what's on today, and what
 * needs a look, in the owner's words.
 */
export function composeBrief(input: { day: string; now: string; jobs: Job[]; invoices: Invoice[]; attention: Exception[]; waiting: number }): MorningBrief {
  const { day, jobs, invoices, attention, waiting } = input
  const yesterday = dayBefore(day)
  const done = jobs.filter((j) => DONE.includes(j.status) && ukDay(j.end) === yesterday)
  const invoiced = invoices.filter((i) => i.issuedAt && ukDay(i.issuedAt) === yesterday && i.status !== 'void').reduce((s, i) => s + gross(i), 0)
  const cash = invoices.flatMap((i) => i.payments ?? []).filter((p) => ukDay(p.at) === yesterday).reduce((s, p) => s + p.amount, 0)
  const late = invoices.filter((i) => OWING.includes(i.status) && i.dueAt && i.dueAt < input.now)
  const overdue = late.reduce((s, i) => s + gross(i) - i.paidAmount, 0)
  const today = jobs.filter((j) => ukDay(j.start) === day && j.status !== 'cancelled')
  const unmanned = today.filter((j) => !j.operatorIds.length)

  const said: string[] = []
  said.push(done.length || invoiced || cash ? `Yesterday ${plural(done.length, 'job')} finished${invoiced ? `, ${pounds(invoiced)} invoiced` : ''}${cash ? ` and ${pounds(cash)} came in` : ''}.` : 'Nothing finished or invoiced yesterday.')
  if (late.length) said.push(`${pounds(overdue)} is overdue on ${plural(late.length, 'invoice')}.`)
  said.push(today.length ? `${plural(today.length, 'job')} on today${unmanned.length ? `, ${unmanned.length} with nobody on ${unmanned.length === 1 ? 'it' : 'them'}` : ''}.` : 'Nothing booked today yet.')
  if (waiting) said.push(`${plural(waiting, 'thing')} waiting for your yes.`)

  const tone = (o: Exception['outcome']) => (o === 'blocked' ? 'danger' : 'warn') as 'danger' | 'warn'
  const items: MorningBrief['items'] = [
    ...unmanned.map((j) => ({ tone: 'danger' as const, text: `${j.ref} ${j.title} has nobody on it`, jobId: j.id })),
    ...attention.map((a) => ({ tone: tone(a.outcome), text: `${a.rule}: ${a.who}, ${a.detail}` })),
  ]
  items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1))

  return {
    day,
    headline: said.join(' '),
    numbers: [
      { key: 'done', label: 'Finished yesterday', value: done.length },
      { key: 'invoiced', label: 'Invoiced yesterday', value: invoiced, money: true },
      { key: 'cash', label: 'Came in yesterday', value: cash, money: true },
      { key: 'overdue', label: 'Overdue', value: overdue, money: true, note: late.length ? plural(late.length, 'invoice') : undefined },
      { key: 'today', label: 'On today', value: today.length },
    ],
    items,
    waiting,
  }
}
