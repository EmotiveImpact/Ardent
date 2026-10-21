import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { pounds, shortDate } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, RowButton, SectionHead, type Figure } from '@/components/ardent/parts'
import { EmberButton, GreyButton, LineTable, MoneyLoading } from '@/components/ardent/money-parts'
import { capDate, daysLate, daysUntil, isAre, isLate, OWING } from '@/components/ardent/money-lib'
import { useArdent, useBook, useQuery, type Book } from '@/data/ardent'
import { useNow } from '@/hooks/use-now'
import type { Invoice, PaymentMethod } from '@/data/model'
import { act } from '@/lib/act'
import { find, invoiceOwed, invoiceTotal, jobNet } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const methodWord: Record<PaymentMethod, string> = { bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', tap: 'Tap to Pay', pay_by_bank: 'Pay by bank', direct_debit: 'Direct Debit' }

/** The invoice's head sentence. */
function sentence(inv: Invoice, book: Book): ReactNode {
  const c = find(book.customers, inv.customerId)
  const job = find(book.jobs, inv.jobId)
  const name = c?.name ?? 'The customer'
  const left = invoiceOwed(inv)
  if (isLate(inv))
    return (
      <span className="inline-flex items-baseline gap-2.5">
        <span aria-hidden className="size-[7px] shrink-0 -translate-y-[2px] rounded-full bg-warn" />
        <span>
          {name} {isAre(c)} {daysLate(inv)} {daysLate(inv) === 1 ? 'day' : 'days'} late{inv.paidAmount ? `, with ${pounds(left, { always: true })} still to come` : ''}.
        </span>
      </span>
    )
  if (inv.status === 'draft') return `A draft for ${job?.title.toLowerCase() ?? 'the job'}. Not sent yet.`
  if (inv.status === 'paid') return `Paid in full. Nothing left to collect from ${name}.`
  if (inv.status === 'void') return 'This invoice is void.'
  const due = inv.dueAt ? ` Due ${shortDate(inv.dueAt)}, in ${Math.max(0, daysUntil(inv.dueAt))} ${daysUntil(inv.dueAt) === 1 ? 'day' : 'days'}.` : ''
  if (inv.status === 'part_paid') return `${pounds(inv.paidAmount, { always: true })} in, ${pounds(left, { always: true })} still to come.${due}`
  return `Sent${inv.issuedAt ? ` ${shortDate(inv.issuedAt)}` : ''} to ${name}.${due}`
}

export function InvoiceDetail() {
  const { id } = useParams()
  const { data: book } = useBook()
  const inv = find(book?.invoices, id)

  if (!book)
    return (
      <div className="flex flex-col gap-10 pb-6">
        <PageBar crumbs={[{ label: 'Money', to: '/money' }, { label: 'Invoice' }]} />
        <PageHead title="Invoice" eyebrow=" " className="pb-0" />
        <MoneyLoading />
      </div>
    )
  if (!inv)
    return (
      <div className="flex flex-col gap-10 pb-6">
        <PageBar crumbs={[{ label: 'Money', to: '/money' }, { label: 'Not found' }]} />
        <PageHead title="Invoice" eyebrow="Not found" sub="There's no invoice here. It may belong to another firm, or the link is wrong." />
        <div>
          <GreyButton to="/money">Back to Money</GreyButton>
        </div>
      </div>
    )
  return <InvoicePage key={inv.id} inv={inv} book={book} />
}

function InvoicePage({ inv, book }: { inv: Invoice; book: Book }) {
  const job = find(book.jobs, inv.jobId)
  const late = daysLate(inv)
  const left = invoiceOwed(inv)
  const owing = OWING.includes(inv.status)

  const figures: Figure[] = [
    { label: 'Total', value: pounds(invoiceTotal(inv)) },
    { label: 'Paid', value: pounds(inv.paidAmount) },
    { label: 'Left', value: pounds(left), tone: late ? 'warn' : undefined },
  ]
  if (late) figures.push({ label: 'Days late', value: late, tone: 'warn' })
  else if (owing && inv.dueAt) figures.push({ label: 'Due in', value: Math.max(0, daysUntil(inv.dueAt)), unit: 'days' })

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Money', to: '/money' }, { label: inv.ref }]} />
      <PageHead
        title="Invoice"
        eyebrow={
          <span className="font-mono text-[12px] tracking-normal">
            {inv.ref}
            <span className="px-2 text-faint">·</span>
            {job ? (
              <Link to={`/jobs/${job.id}`} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                {job.ref}
              </Link>
            ) : (
              'No job'
            )}
          </span>
        }
        sub={<span className="text-muted">{sentence(inv, book)}</span>}
        figures={figures}
        className="pb-0"
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <TheInvoice inv={inv} book={book} />
        <div className="flex min-w-0 flex-col gap-5">
          <GetPaid inv={inv} book={book} />
          <History inv={inv} book={book} />
        </div>
      </div>
    </div>
  )
}

/** The invoice as the customer would read it. */
function TheInvoice({ inv, book }: { inv: Invoice; book: Book }) {
  const { me } = useArdent()
  const c = find(book.customers, inv.customerId)
  const job = find(book.jobs, inv.jobId)
  const site = find(book.sites, job?.siteId)
  const late = isLate(inv)
  return (
    <Card className="flex min-w-0 flex-col gap-6 px-5 py-6 sm:px-7 xl:col-span-2">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_1fr_auto]">
        <div className="flex flex-col gap-1.5">
          <span className="cap">From</span>
          <span className="text-[14px]">{me?.organisation.name}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="cap">To</span>
          {c ? (
            <Link to={`/customers/${c.id}`} className="w-fit rounded-sm text-[14px] outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
              {c.name}
            </Link>
          ) : (
            <span className="text-[14px]">Unknown customer</span>
          )}
          {site && (
            <span className="text-[13px] text-muted">
              For {site.line1}, {site.postcode}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 font-mono text-[12px] uppercase sm:text-right">
          <span className="cap">Dates</span>
          <span>{inv.issuedAt ? `Issued ${capDate(inv.issuedAt)}` : <span className="text-muted">Not issued yet</span>}</span>
          {inv.dueAt && <span className={cn(late && 'text-warn')}>Due {capDate(inv.dueAt)}</span>}
        </div>
      </div>

      <LineTable
        lines={inv.lines}
        vatRate={inv.vatRate}
        totalLabel="To pay"
        after={
          inv.paidAmount > 0 && (
            <>
              <div className="flex gap-6 sm:gap-10">
                <dt>Paid</dt>
                <dd className="w-[110px] text-right text-foreground tabular">{pounds(inv.paidAmount, { always: true })}</dd>
              </div>
              <div className="flex gap-6 sm:gap-10">
                <dt>Left</dt>
                <dd className={cn('w-[110px] text-right tabular', late ? 'text-warn' : 'text-foreground')}>{pounds(invoiceOwed(inv), { always: true })}</dd>
              </div>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pt-3.5 text-[13px] text-muted shadow-[inset_0_1px_0_var(--line)]">
        <span>Ref {inv.ref}. Your address, VAT number and bank details aren't in Ardent yet.</span>
        <span className="font-mono text-[11px] uppercase">Pay within 14 days</span>
      </div>
    </Card>
  )
}

/** The one thing to do: record what came in, or mark the draft as sent. */
function GetPaid({ inv, book }: { inv: Invoice; book: Book }) {
  const { client } = useArdent()
  const c = find(book.customers, inv.customerId)
  const owing = OWING.includes(inv.status)
  const [paidAlready, setPaidAlready] = useState(false)
  const tel = c?.phone && (
    <GreyButton href={`tel:${c.phone.replace(/\s/g, '')}`} className="w-full">
      Ring {c.phone}
    </GreyButton>
  )

  if (inv.status === 'paid' || inv.status === 'void')
    return (
      <Card className="flex flex-col gap-3 px-[22px] py-5">
        <span className="cap">{inv.status === 'paid' ? 'Paid' : 'Void'}</span>
        <p className="text-[14px] text-muted">{inv.status === 'paid' ? `${pounds(inv.paidAmount, { always: true })} recorded against ${inv.ref}. Nothing left to collect.` : 'Nothing to collect on a void invoice.'}</p>
      </Card>
    )

  if (inv.status === 'draft')
    return (
      <Card className="flex flex-col gap-3 px-[22px] py-5">
        <span className="cap">Send it</span>
        <p className="text-[13.5px] leading-[1.45] text-muted">Ardent doesn't email invoices yet. Send it your usual way, then mark it as sent here. It falls due 14 days from then.</p>
        <EmberButton disabled={!inv.lines.length} onClick={() => void act(client.invoices.send(inv.id, 'email'), `${inv.ref} marked as sent. Due in 14 days.`)}>
          Mark as sent
        </EmberButton>
        {!inv.lines.length && <p className="text-[12.5px] text-muted">There are no lines on this invoice, so there's nothing to send.</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tel}
          <GreyButton onClick={() => setPaidAlready((v) => !v)} className="w-full">
            {paidAlready ? 'Not paid yet' : 'Paid already?'}
          </GreyButton>
        </div>
        {paidAlready && <PaymentForm inv={inv} />}
      </Card>
    )

  return (
    <Card className="flex flex-col gap-3 px-[22px] py-5">
      <span className="cap">Get paid</span>
      {owing && <PaymentForm inv={inv} ember />}
      {tel}
    </Card>
  )
}

/** Amount and how it came in. Records only: Ardent takes no payments itself. */
function PaymentForm({ inv, ember }: { inv: Invoice; ember?: boolean }) {
  const { client } = useArdent()
  const left = invoiceOwed(inv)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer')
  const [busy, setBusy] = useState(false)
  const pence = Math.round(Number(amount || left / 100) * 100)
  const ok = Number.isFinite(pence) && pence > 0
  const record = async () => {
    setBusy(true)
    const done = await act(client.invoices.recordPayment(inv.id, pence, method), `${pounds(pence, { always: true })} by ${methodWord[method].toLowerCase()} recorded against ${inv.ref}`)
    setBusy(false)
    if (done) setAmount('')
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative">
          <span className="sr-only">Amount paid</span>
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-[13px] text-muted">
            £
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder={(left / 100).toFixed(2)}
            className="h-10 w-full rounded-[10px] bg-inset pr-3 pl-7 font-mono text-[14px] text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </label>
        <div role="radiogroup" aria-label="Paid by" className="flex gap-1 rounded-[10px] bg-inset p-1">
          {(['bank_transfer', 'cash', 'card'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cn('h-8 flex-1 rounded-[7px] px-2.5 text-[12.5px] whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60', method === m ? 'bg-raised text-foreground' : 'text-muted hover:text-foreground')}
            >
              {m === 'bank_transfer' ? 'Transfer' : methodWord[m]}
            </button>
          ))}
        </div>
      </div>
      {ember ? (
        <EmberButton onClick={() => void record()} disabled={!ok || busy}>
          Record payment
        </EmberButton>
      ) : (
        <GreyButton onClick={() => void record()} disabled={!ok || busy} className="w-full">
          Record payment
        </GreyButton>
      )}
      <p className="text-[12.5px] leading-[1.45] text-muted">
        Leave the amount empty to record the full {pounds(left, { always: true })}. Ardent doesn't take payments, card or otherwise. This records one you've already had.
      </p>
    </div>
  )
}

interface Event {
  when?: string
  what: string
  detail?: string
}

/** What's happened, from what Ardent knows: the job's sign-off and notes, sending, due date, payments. */
function History({ inv, book }: { inv: Invoice; book: Book }) {
  const job = find(book.jobs, inv.jobId)
  const { data: field } = useQuery(
    async (c) => {
      if (!job) return undefined
      const [notes, signatures] = await Promise.all([c.notes.forJob(job.id), c.signatures.forJob(job.id)])
      return { notes, signatures }
    },
    [job?.id],
  )
  const now = useNow(60_000)
  const left = invoiceOwed(inv)
  const dated: Event[] = []
  if (inv.issuedAt) dated.push({ when: inv.issuedAt, what: inv.dueAt ? 'Marked as sent' : 'Issued', detail: inv.dueAt ? 'Due 14 days on' : 'Stamped when the first payment was recorded' })
  if (inv.dueAt) {
    const past = Date.parse(inv.dueAt) < now
    dated.push({
      when: inv.dueAt,
      what: past ? 'Due' : 'Falls due',
      detail: inv.status === 'paid' ? 'Paid' : past ? (inv.paidAmount ? `${pounds(left, { always: true })} still owed` : 'Nothing in') : `In ${daysUntil(inv.dueAt)} ${daysUntil(inv.dueAt) === 1 ? 'day' : 'days'}`,
    })
  }
  for (const n of field?.notes ?? []) dated.push({ when: n.at, what: `Note from ${find(book.operators, n.operatorId)?.name.split(' ')[0] ?? 'the crew'}`, detail: n.body })
  for (const s of field?.signatures ?? []) dated.push({ when: s.at, what: 'Signed off', detail: `${s.signedBy} signed for ${job?.ref ?? 'the job'}` })
  dated.sort((a, b) => b.when!.localeCompare(a.when!))

  const events: Event[] = [
    ...(inv.status === 'draft' ? [{ what: 'Draft', detail: 'Not sent yet' }] : []),
    ...(inv.paidAmount > 0 ? [{ what: inv.status === 'paid' ? 'Paid in full' : 'Part paid', detail: inv.status === 'paid' ? `${pounds(inv.paidAmount, { always: true })} recorded` : `${pounds(inv.paidAmount, { always: true })} recorded, ${pounds(left, { always: true })} left` }] : []),
    ...dated,
    ...(job ? [{ what: `Made from ${job.ref}`, detail: job.title }] : []),
  ]

  return (
    <Card className="px-[22px] pt-5 pb-2.5">
      <SectionHead title="What's happened" className="pb-1.5" />
      <ol className="rows">
        {events.map((e, i) => (
          <li key={i} className="flex gap-3.5 py-3">
            <span className="w-[52px] shrink-0 pt-0.5 font-mono text-[11px] text-muted">{e.when ? capDate(e.when) : '--'}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[14px]">{e.what}</span>
              {e.detail && <span className="text-[12.5px] text-muted">{e.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="pt-1 pb-2 text-[12px] text-faint">Payment dates and calls aren't kept in Ardent yet.</p>
    </Card>
  )
}

/** Jobs that are done and not yet invoiced, each one press away from a draft invoice. */
export function NewInvoice() {
  const { client } = useArdent()
  const { data: book } = useBook()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string>()
  const ready = (book?.jobs ?? [])
    .filter((j) => j.status === 'complete' && !book?.invoices.some((i) => i.jobId === j.id && i.status !== 'void'))
    .sort((a, b) => b.end.localeCompare(a.end))
  const worth = ready.reduce((s, j) => s + jobNet(j), 0)

  const draft = async (jobId: string) => {
    setBusy(jobId)
    const inv = await act(client.invoices.create(jobId), (i) => `${i.ref} drafted. Check it, then mark it as sent.`)
    setBusy(undefined)
    if (inv) navigate(`/invoices/${inv.id}`)
  }

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Money', to: '/money' }, { label: 'New invoice' }]} />
      <PageHead
        title="New invoice"
        eyebrow="Money"
        sub="Jobs that are done and not invoiced yet. Draft one and it copies the job's lines, at 20% VAT."
        figures={book && ready.length ? [{ label: 'Ready to invoice', value: ready.length }, { label: 'Worth, before VAT', value: pounds(worth) }] : undefined}
        className="pb-0"
      />
      {!book ? (
        <MoneyLoading />
      ) : !ready.length ? (
        <Card className="flex flex-col items-start gap-4 px-[22px] py-8">
          <p className="text-[15px]">Nothing to invoice. Every finished job has an invoice.</p>
          <p className="text-[13.5px] text-muted">When the crew sign a job off it shows up here.</p>
          <GreyButton to="/money">Back to Money</GreyButton>
        </Card>
      ) : (
        <Card className="px-4 pt-4 pb-2 sm:px-[22px]">
          <SectionHead title={`Done, not invoiced · ${ready.length}`} className="pb-1.5" />
          <ul className="rows">
            {ready.map((j) => {
              const c = find(book.customers, j.customerId)
              const site = find(book.sites, j.siteId)
              const net = jobNet(j)
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3.5">
                  <Link to={`/jobs/${j.id}`} className="w-[64px] shrink-0 rounded-sm font-mono text-[12px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                    {j.ref}
                  </Link>
                  <span className="flex min-w-[200px] flex-1 flex-col gap-1">
                    <span className="truncate text-[14px]">{j.title}</span>
                    <span className="truncate font-mono text-[11px] text-muted uppercase">
                      {c?.name} {site && <span className="ml-2">{site.line1}</span>} <span className="ml-2">Done {capDate(j.end)}</span>
                    </span>
                  </span>
                  <span className={cn('w-[90px] text-right font-mono text-[13px] tabular', !net && 'text-warn')}>{net ? pounds(net, { always: true }) : 'No lines'}</span>
                  <RowButton onClick={() => void draft(j.id)} className={cn(busy && 'pointer-events-none opacity-50')}>
                    {busy === j.id ? 'Drafting' : 'Draft the invoice'}
                  </RowButton>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
