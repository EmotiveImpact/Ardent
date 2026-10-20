import { useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Banknote, FileText, Hourglass, PoundSterling, Receipt, TrendingUp } from 'lucide-react'
import { dayDate, invoiceStatus, pounds, quoteStatus, shortDate, totals } from '@kit'
import { Panel, PanelHeader, Row, SectionLabel, Well, PageHeader } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HoldButton } from '@/components/ui/hold-button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useArdent, useBook, type Book } from '@/data/ardent'
import type { Invoice, Quote } from '@/data/model'
import { act } from '@/lib/act'
import { addDays, find, invoiceOwed, invoiceTotal, today, weekStart } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/use-now'

const OWING: Invoice['status'][] = ['sent', 'part_paid', 'overdue']
const isLate = (inv: Invoice) => OWING.includes(inv.status) && !!inv.dueAt && inv.dueAt < new Date().toISOString()
/** What the screen calls an invoice's state: a sent invoice past its date is overdue. */
const shownStatus = (inv: Invoice) => (isLate(inv) ? 'overdue' : inv.status)

function Stat({ icon, title, pence, note, tone, index }: { icon: React.ReactNode; title: string; pence: number; note: string; tone?: string; index: number }) {
  const v = useCountUp(pence)
  return (
    <Panel style={{ '--i': index } as CSSProperties}>
      <PanelHeader icon={icon} title={title} />
      <Well className="px-3 py-3">
        <p className={cn('font-mono text-[26px] leading-none tracking-tight tabular', tone)}>{pounds(Math.round(v / 100) * 100)}</p>
      </Well>
      <p className="px-2.5 pt-2.5 pb-1 text-[12px] text-muted">{note}</p>
    </Panel>
  )
}

/** Invoiced each week, and how much of that has been paid, by the week it went out. */
function CashChart({ book }: { book: Book }) {
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today()), (i - 7) * 7))
  const data = weeks.map((w) => {
    const sent = book.invoices.filter((inv) => inv.issuedAt && inv.status !== 'void' && weekStart(inv.issuedAt.slice(0, 10)) === w)
    return { week: w, invoiced: sent.reduce((s, i) => s + invoiceTotal(i), 0), paid: sent.reduce((s, i) => s + i.paidAmount, 0) }
  })
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.invoiced))
  const h = hover ?? data.length - 1
  return (
    <Panel style={{ '--i': 4 } as CSSProperties}>
      <PanelHeader
        icon={<TrendingUp />}
        title="Invoiced and paid, by week sent"
        actions={
          <span className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-ember" /> Paid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-[#3a3a3a]" /> Invoiced
            </span>
          </span>
        }
      />
      <Well className="flex flex-1 flex-col p-4">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="font-mono text-[22px] tabular">{pounds(data[h].paid)}</span>
          <span className="text-[12px] text-muted">paid of {pounds(data[h].invoiced)} sent w/c {dayDate(data[h].week)}</span>
        </div>
        <div className="flex min-h-44 flex-1 items-end gap-3" onMouseLeave={() => setHover(null)}>
          {data.map((w, i) => (
            <div key={w.week} className="flex h-full flex-1 flex-col justify-end gap-2" onMouseEnter={() => setHover(i)}>
              <div className="flex flex-1 items-end justify-center gap-1">
                <span className="animate-grow w-full max-w-4 rounded-t-[3px] bg-[#333]" style={{ '--i': i, height: `${(w.invoiced / max) * 100}%`, '--o': h === i ? 1 : 0.6 } as CSSProperties} />
                <span
                  className="animate-grow w-full max-w-4 rounded-t-[3px] bg-gradient-to-t from-ember/50 to-ember"
                  style={{ '--i': i, height: `${(w.paid / max) * 100}%`, '--o': h === i ? 1 : 0.55, boxShadow: h === i ? '0 0 16px -2px var(--ember)' : undefined } as CSSProperties}
                />
              </div>
              <span className={cn('text-center font-mono text-[10px] text-faint', h === i && 'text-foreground')}>{shortDate(`${w.week}T12:00:00Z`)}</span>
            </div>
          ))}
        </div>
      </Well>
    </Panel>
  )
}

function Lines({ lines, vatRate }: { lines: Invoice['lines']; vatRate?: number }) {
  const sums = totals({ lines, vatRate })
  return (
    <div className="divide-y divide-line rounded-lg bg-surface">
      {lines.map((l) => (
        <Row key={l.id} label={<span className="text-foreground/90">{l.description}</span>}>
          <span className="font-mono text-[12px] text-muted">
            {l.quantity} × {pounds(l.unitPrice, { always: true })}
          </span>
          <span className="w-20 font-mono tabular">{pounds(l.quantity * l.unitPrice, { always: true })}</span>
        </Row>
      ))}
      {!lines.length && <p className="px-3 py-3 text-[13px] text-faint">No lines.</p>}
      <Row label="Net">
        <span className="font-mono tabular">{pounds(sums.net, { always: true })}</span>
      </Row>
      <Row label={`VAT ${(vatRate ?? 2000) / 100}%`}>
        <span className="font-mono tabular">{pounds(sums.vat, { always: true })}</span>
      </Row>
      <Row label="Total">
        <span className="font-mono text-[15px] tabular text-foreground">{pounds(sums.total, { always: true })}</span>
      </Row>
    </div>
  )
}

function InvoiceSheet({ inv, book }: { inv: Invoice; book: Book }) {
  const { client } = useArdent()
  const owed = invoiceOwed(inv)
  const [amount, setAmount] = useState('')
  const job = find(book.jobs, inv.jobId)
  const customer = find(book.customers, inv.customerId)
  const status = shownStatus(inv)
  const pence = Math.round(Number(amount || owed / 100) * 100)
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-1 pt-2">
        <p className="font-mono text-[18px]">{inv.ref}</p>
        <Badge tone={invoiceStatus[status].tone} dot>
          {invoiceStatus[status].label}
        </Badge>
      </div>
      {inv.status === 'draft' && (
        <HoldButton label="Hold to mark as sent" onCommit={() => void act(client.invoices.send(inv.id, 'email'), `${inv.ref} marked sent, due in 14 days`)} className="mt-3" />
      )}
      {OWING.includes(inv.status) && (
        <div className="mt-3 flex gap-1.5">
          <label className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[13px] text-faint">£</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={(owed / 100).toFixed(2)} className="h-11 pl-7 font-mono" aria-label="Amount paid" />
          </label>
          <Button
            variant="ember"
            className="h-11"
            disabled={!(pence > 0)}
            onClick={async () => {
              if (await act(client.invoices.recordPayment(inv.id, pence, 'bank_transfer'), `${pounds(pence, { always: true })} recorded against ${inv.ref}`)) setAmount('')
            }}
          >
            <Banknote /> Record payment
          </Button>
        </div>
      )}
      <SectionLabel>Invoice</SectionLabel>
      <div className="divide-y divide-line rounded-lg bg-surface">
        <Row label="Customer">{customer ? <Link to={`/customers/${customer.id}`} className="hover:text-white">{customer.name}</Link> : 'Unknown'}</Row>
        <Row label="Job">{job ? <Link to={`/jobs/${job.id}`} className="hover:text-white"><span className="font-mono text-muted">{job.ref}</span> {job.title}</Link> : 'Unknown'}</Row>
        <Row label="Sent">{inv.issuedAt ? shortDate(inv.issuedAt) : <span className="text-faint">Not yet</span>}</Row>
        <Row label="Due">{inv.dueAt ? <span className={cn(isLate(inv) && 'text-danger')}>{shortDate(inv.dueAt)}</span> : <span className="text-faint">On sending</span>}</Row>
        <Row label="Paid">
          <span className="font-mono tabular">{pounds(inv.paidAmount, { always: true })}</span>
        </Row>
        <Row label="Still owed">
          <span className={cn('font-mono tabular', owed && OWING.includes(inv.status) ? 'text-foreground' : 'text-faint')}>{pounds(owed, { always: true })}</span>
        </Row>
      </div>
      <SectionLabel>Lines</SectionLabel>
      <Lines lines={inv.lines} vatRate={inv.vatRate} />
    </>
  )
}

function QuoteSheet({ q, book }: { q: Quote; book: Book }) {
  const { client } = useArdent()
  const job = find(book.jobs, q.jobId)
  const customer = find(book.customers, q.customerId)
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-1 pt-2">
        <p className="font-mono text-[18px]">{q.ref}</p>
        <Badge tone={quoteStatus[q.status].tone} dot>
          {quoteStatus[q.status].label}
        </Badge>
      </div>
      {q.status === 'draft' && (
        <HoldButton label="Hold to mark as sent" disabled={!q.lines.length} onCommit={() => void act(client.quotes.send(q.id, 'email'), `${q.ref} marked sent to ${customer?.name}`)} className="mt-3" />
      )}
      {q.status === 'sent' && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button variant="ember" className="h-11" onClick={() => void act(client.quotes.respond(q.id, 'accepted'), `${q.ref} accepted. ${job?.ref} is booked with the quoted price.`)}>
            They said yes
          </Button>
          <Button variant="outline" className="h-11" onClick={() => void act(client.quotes.respond(q.id, 'declined'), `${q.ref} marked declined`)}>
            They said no
          </Button>
        </div>
      )}
      <SectionLabel>Quote</SectionLabel>
      <div className="divide-y divide-line rounded-lg bg-surface">
        <Row label="Customer">{customer ? <Link to={`/customers/${customer.id}`} className="hover:text-white">{customer.name}</Link> : 'Unknown'}</Row>
        <Row label="Job">{job ? <Link to={`/jobs/${job.id}`} className="hover:text-white"><span className="font-mono text-muted">{job.ref}</span> {job.title}</Link> : 'Unknown'}</Row>
        <Row label="Sent">{q.sentAt ? shortDate(q.sentAt) : <span className="text-faint">Not yet</span>}</Row>
        <Row label="Good until">{shortDate(`${q.validUntil}T12:00:00Z`)}</Row>
      </div>
      <SectionLabel>Lines</SectionLabel>
      <Lines lines={q.lines} />
      {!q.lines.length && q.status === 'draft' && (
        <p className="px-1 pt-2 text-[12px] text-faint">
          Price the work on the <Link to={`/jobs/${q.jobId}`} className="text-muted underline-offset-2 hover:underline">job page</Link> before sending.
        </p>
      )}
    </>
  )
}

export function Money() {
  const { data: book } = useBook()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'quotes' ? 'quotes' : 'invoices'
  const pick = (next: Record<string, string>) => setParams(next, { replace: true })

  if (!book) return <div className="mx-auto h-40 max-w-[1600px] animate-pulse rounded-xl bg-surface/60" />

  const owing = book.invoices.filter((i) => OWING.includes(i.status))
  const late = owing.filter(isLate)
  const collected = book.invoices.reduce((s, i) => s + i.paidAmount, 0)
  const out = book.quotes.filter((q) => q.status === 'sent')
  const invoices = [...book.invoices].sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || (b.issuedAt ?? '9').localeCompare(a.issuedAt ?? '9'))
  const quotes = [...book.quotes].sort((a, b) => (b.sentAt ?? '9').localeCompare(a.sentAt ?? '9'))
  const inv = find(book.invoices, params.get('invoice') ?? undefined) ?? (tab === 'invoices' ? invoices[0] : undefined)
  const q = find(book.quotes, params.get('quote') ?? undefined) ?? (tab === 'quotes' ? quotes[0] : undefined)

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader eyebrow="Invoices, quotes and what is owed" title="Money" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat index={0} icon={<Hourglass />} title="Owed to you" pence={owing.reduce((s, i) => s + invoiceOwed(i), 0)} note={`${owing.length} ${owing.length === 1 ? 'invoice' : 'invoices'} waiting`} />
        <Stat index={1} icon={<PoundSterling />} title="Overdue" pence={late.reduce((s, i) => s + invoiceOwed(i), 0)} tone={late.length ? 'text-danger' : undefined} note={late.length ? late.map((i) => find(book.customers, i.customerId)?.name).filter(Boolean).slice(0, 2).join(', ') : 'Nothing past its date'} />
        <Stat index={2} icon={<Banknote />} title="Paid in" pence={collected} tone="text-ok" note={`Across ${book.invoices.filter((i) => i.paidAmount > 0).length} invoices`} />
        <Stat index={3} icon={<FileText />} title="Quotes out" pence={out.reduce((s, x) => s + totals(x).total, 0)} note={`${out.length} waiting for a yes`} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel style={{ '--i': 5 } as CSSProperties}>
          <PanelHeader
            icon={<Receipt />}
            title={tab === 'quotes' ? 'Quotes' : 'Invoices'}
            actions={
              <Tabs value={tab} onValueChange={(v) => pick(v === 'quotes' ? { tab: 'quotes' } : {})}>
                <TabsList className="h-8">
                  <TabsTrigger value="invoices">Invoices · {book.invoices.length}</TabsTrigger>
                  <TabsTrigger value="quotes">Quotes · {book.quotes.length}</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            className="h-11"
          />
          <Well className="overflow-x-auto">
            {tab === 'invoices' ? (
              <table className="w-full min-w-[620px] text-left text-[13px]">
                <thead className="text-muted">
                  <tr className="border-b">
                    {['Invoice', 'Customer', 'Due', 'Amount', 'Status'].map((h) => (
                      <th key={h} className={cn('h-10 px-3 font-normal', (h === 'Amount' || h === 'Status') && 'text-right')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => {
                    const st = shownStatus(i)
                    return (
                      <tr key={i.id} onClick={() => pick({ invoice: i.id })} className={cn('cursor-pointer border-b last:border-0 hover:bg-white/[0.025]', inv?.id === i.id && 'bg-white/[0.04]')}>
                        <td className="h-12 px-3 font-mono text-[12px]">{i.ref}</td>
                        <td className="px-3">{find(book.customers, i.customerId)?.name}</td>
                        <td className={cn('px-3 font-mono text-[12px] text-muted', isLate(i) && 'text-danger')}>{i.dueAt ? shortDate(i.dueAt) : '·'}</td>
                        <td className="px-3 text-right font-mono tabular">
                          {pounds(invoiceTotal(i))}
                          {i.status === 'part_paid' && <span className="block text-[11px] text-faint">{pounds(i.paidAmount)} paid</span>}
                        </td>
                        <td className="px-3 text-right">
                          <Badge tone={invoiceStatus[st].tone} dot>
                            {invoiceStatus[st].label}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                  {!invoices.length && (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-faint">
                        No invoices yet. Finish a job and draft one from its job sheet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[620px] text-left text-[13px]">
                <thead className="text-muted">
                  <tr className="border-b">
                    {['Quote', 'For', 'Customer', 'Good until', 'Value', 'Status'].map((h) => (
                      <th key={h} className={cn('h-10 px-3 font-normal', (h === 'Value' || h === 'Status') && 'text-right')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((x) => (
                    <tr key={x.id} onClick={() => pick({ tab: 'quotes', quote: x.id })} className={cn('cursor-pointer border-b last:border-0 hover:bg-white/[0.025]', q?.id === x.id && 'bg-white/[0.04]')}>
                      <td className="h-12 px-3 font-mono text-[12px]">{x.ref}</td>
                      <td className="max-w-[220px] truncate px-3">{find(book.jobs, x.jobId)?.title ?? x.lines[0]?.description}</td>
                      <td className="px-3 text-muted">{find(book.customers, x.customerId)?.name}</td>
                      <td className="px-3 font-mono text-[12px] text-muted">{shortDate(`${x.validUntil}T12:00:00Z`)}</td>
                      <td className="px-3 text-right font-mono tabular">{pounds(totals(x).total)}</td>
                      <td className="px-3 text-right">
                        <Badge tone={quoteStatus[x.status].tone} dot>
                          {quoteStatus[x.status].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!quotes.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-faint">
                        No quotes yet. Log an enquiry and write one from its job sheet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </Well>
        </Panel>

        <Panel style={{ '--i': 6 } as CSSProperties} className="xl:sticky xl:top-0 xl:self-start">
          <PanelHeader icon={<FileText />} title={tab === 'quotes' ? 'Quote' : 'Invoice'} />
          <Well className="px-2 pb-2">
            {tab === 'invoices' && inv && <InvoiceSheet key={inv.id} inv={inv} book={book} />}
            {tab === 'quotes' && q && <QuoteSheet key={q.id} q={q} book={book} />}
            {((tab === 'invoices' && !inv) || (tab === 'quotes' && !q)) && <p className="px-3 py-10 text-center text-[13px] text-faint">Pick one from the list.</p>}
          </Well>
        </Panel>
      </div>

      <CashChart book={book} />
    </div>
  )
}
