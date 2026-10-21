import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { pounds, totals } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, RowButton, SectionHead } from '@/components/ardent/parts'
import { MoneyLoading, StateMark } from '@/components/ardent/money-parts'
import { capDate, daysLate, isLate, OWING, quoteState, say, invoiceState } from '@/components/ardent/money-lib'
import { useBook, type Book } from '@/data/ardent'
import type { Invoice, Quote } from '@/data/model'
import { addDays, find, invoiceOwed, invoiceTotal, today, weekStart } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/** The day in money, the way the owner would say it. */
function summary(book: Book) {
  const owing = book.invoices.filter((i) => OWING.includes(i.status))
  const late = owing.filter((i) => isLate(i))
  const byCustomer = new Map<string, number>()
  for (const i of late) byCustomer.set(i.customerId, (byCustomer.get(i.customerId) ?? 0) + invoiceOwed(i))
  const drafts = book.invoices.filter((i) => i.status === 'draft').length
  const tail = drafts ? ` ${say(drafts)} ${drafts === 1 ? 'draft' : 'drafts'} still to send.` : ''
  if (byCustomer.size) {
    const worst = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const name = find(book.customers, worst)?.name ?? 'The biggest'
    const n = byCustomer.size
    return `${say(n)} ${n === 1 ? 'customer is' : 'customers are'} late. ${name} is the one to ring.${tail}`
  }
  if (owing.length) return `Nothing is late. ${say(owing.length)} ${owing.length === 1 ? 'invoice is' : 'invoices are'} out, waiting to be paid.${tail}`
  return `Nothing is owed. Every invoice sent has been paid.${tail}`
}

export function Money() {
  const { data: book } = useBook()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'quotes' ? 'quotes' : 'invoices'

  // Old links put the invoice or quote in the query. They have their own pages now.
  const oldInvoice = params.get('invoice')
  const oldQuote = params.get('quote')
  if (oldInvoice) return <Navigate to={`/invoices/${oldInvoice}`} replace />
  if (oldQuote) return <Navigate to={`/quotes/${oldQuote}`} replace />

  const owing = book?.invoices.filter((i) => OWING.includes(i.status)) ?? []
  const late = owing.filter((i) => isLate(i))
  const out = book?.quotes.filter((q) => q.status === 'sent') ?? []

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Money' }]} />
      <PageHead
        title="Money"
        book={book}
        sub={book ? summary(book) : ' '}
        className="pb-0"
        figures={
          book && [
            { label: 'Owed to you', value: pounds(owing.reduce((s, i) => s + invoiceOwed(i), 0)) },
            { label: 'Late', value: pounds(late.reduce((s, i) => s + invoiceOwed(i), 0)), tone: late.length ? 'warn' : undefined },
            { label: 'Paid in', value: pounds(book.invoices.reduce((s, i) => s + i.paidAmount, 0)) },
            { label: 'Quotes out', value: pounds(out.reduce((s, q) => s + totals(q).total, 0)) },
          ]
        }
      />

      {!book ? (
        <MoneyLoading />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
          <Card className="min-w-0 px-4 pt-4 pb-2 sm:px-[22px] sm:pt-[18px] xl:col-span-2">
            <div role="tablist" aria-label="Show" className="flex gap-1.5 pb-2.5">
              {(['invoices', 'quotes'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setParams(t === 'quotes' ? { tab: 'quotes' } : {}, { replace: true })}
                  className={cn(
                    'h-8 rounded-full px-3.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
                    tab === t ? 'bg-foreground text-background' : 'bg-raised text-foreground hover:bg-[#262626]',
                  )}
                >
                  {t === 'invoices' ? 'Invoices' : 'Quotes'} <span className={cn('font-mono', tab === t ? 'text-faint' : 'text-muted')}>{t === 'invoices' ? book.invoices.length : book.quotes.length}</span>
                </button>
              ))}
            </div>
            {tab === 'invoices' ? <Invoices book={book} /> : <Quotes book={book} />}
          </Card>

          <div className="flex min-w-0 flex-col gap-5">
            <CashChart book={book} />
            <RingToday book={book} />
          </div>
        </div>
      )}
    </div>
  )
}

const invCols = 'lg:grid-cols-[84px_minmax(120px,1.6fr)_64px_64px_64px_96px_96px]'

function Invoices({ book }: { book: Book }) {
  // Drafts first, then newest sent.
  const rows = [...book.invoices].sort((a, b) => (b.issuedAt ?? '9').localeCompare(a.issuedAt ?? '9') || b.ref.localeCompare(a.ref))
  if (!rows.length) return <p className="py-10 text-center text-[14px] text-muted">No invoices yet. When a job is done, draft one from New, Invoice.</p>
  return (
    <div>
      <div className={cn('cap hidden gap-3.5 py-3 lg:grid', invCols)}>
        <span>Invoice</span>
        <span>Customer</span>
        <span>Job</span>
        <span>Sent</span>
        <span>Due</span>
        <span>State</span>
        <span className="text-right">Amount</span>
      </div>
      <ul className="rows shadow-[inset_0_1px_0_var(--line)] lg:shadow-none">
        {rows.map((i) => (
          <li key={i.id}>
            <InvoiceRow inv={i} book={book} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function InvoiceRow({ inv, book }: { inv: Invoice; book: Book }) {
  const st = invoiceState(inv)
  const customer = find(book.customers, inv.customerId)
  const job = find(book.jobs, inv.jobId)
  const warnDue = isLate(inv) || inv.status === 'part_paid'
  const due = inv.dueAt ? capDate(inv.dueAt) : '--'
  return (
    <Link
      to={`/invoices/${inv.id}`}
      className={cn(
        '-mx-2 flex items-center gap-3.5 rounded-lg px-2 py-3 outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-ring/60 lg:grid lg:py-[13px]',
        invCols,
        inv.status === 'paid' && 'opacity-55',
      )}
    >
      {/* Wide: one grid row. */}
      <span className="hidden font-mono text-[12px] lg:block">{inv.ref}</span>
      <span className="hidden min-w-0 truncate text-[14px] lg:block">{customer?.name}</span>
      <span className="hidden font-mono text-[12px] text-muted lg:block">{job?.ref}</span>
      <span className="hidden font-mono text-[12px] text-muted lg:block">{inv.issuedAt ? capDate(inv.issuedAt) : 'NOT YET'}</span>
      <span className={cn('hidden font-mono text-[12px] lg:block', warnDue ? 'text-warn' : 'text-muted')}>{due}</span>
      <StateMark dot={st.dot} className="hidden text-[13px] lg:inline-flex">
        {st.label}
      </StateMark>
      <span className="hidden text-right font-mono text-[13px] tabular lg:block">{pounds(invoiceTotal(inv), { always: true })}</span>
      {/* Narrow: two lines. */}
      <span className="min-w-0 flex-1 lg:hidden">
        <span className="block truncate text-[14px]">{customer?.name}</span>
        <span className="mt-1 block truncate font-mono text-[11px] text-muted">
          {inv.ref} <span className="text-faint">·</span> {job?.ref} <span className="text-faint">·</span> <span className={cn(warnDue && 'text-warn')}>DUE {due}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 lg:hidden">
        <span className="font-mono text-[13px] tabular">{pounds(invoiceTotal(inv), { always: true })}</span>
        <StateMark dot={st.dot} className="text-[12px] text-muted">
          {st.label}
        </StateMark>
      </span>
    </Link>
  )
}

const quoteCols = 'lg:grid-cols-[64px_minmax(120px,1.4fr)_minmax(100px,1fr)_64px_72px_92px_92px]'

function Quotes({ book }: { book: Book }) {
  const day = today()
  // Drafts first, then newest sent.
  const rows = [...book.quotes].sort((a, b) => (b.sentAt ?? '9').localeCompare(a.sentAt ?? '9') || b.ref.localeCompare(a.ref))
  if (!rows.length) return <p className="py-10 text-center text-[14px] text-muted">No quotes yet. Log an enquiry and write one from its job page.</p>
  return (
    <div>
      <div className={cn('cap hidden gap-3.5 py-3 lg:grid', quoteCols)}>
        <span>Quote</span>
        <span>For</span>
        <span>Customer</span>
        <span>Sent</span>
        <span>Good till</span>
        <span>State</span>
        <span className="text-right">Value</span>
      </div>
      <ul className="rows shadow-[inset_0_1px_0_var(--line)] lg:shadow-none">
        {rows.map((q) => (
          <li key={q.id}>
            <QuoteRow q={q} book={book} day={day} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function QuoteRow({ q, book, day }: { q: Quote; book: Book; day: string }) {
  const st = quoteState(q, day)
  const customer = find(book.customers, q.customerId)
  const job = find(book.jobs, q.jobId)
  const what = job?.title ?? q.lines[0]?.description ?? 'Quote'
  const till = capDate(`${q.validUntil}T12:00:00Z`)
  const total = pounds(totals(q).total, { always: true })
  return (
    <Link
      to={`/quotes/${q.id}`}
      className={cn(
        '-mx-2 flex items-center gap-3.5 rounded-lg px-2 py-3 outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-ring/60 lg:grid lg:py-[13px]',
        quoteCols,
        (q.status === 'declined' || q.status === 'expired') && 'opacity-55',
      )}
    >
      <span className="hidden font-mono text-[12px] lg:block">{q.ref}</span>
      <span className="hidden min-w-0 truncate text-[14px] lg:block">{what}</span>
      <span className="hidden min-w-0 truncate text-[13px] text-muted lg:block">{customer?.name}</span>
      <span className="hidden font-mono text-[12px] text-muted lg:block">{q.sentAt ? capDate(q.sentAt) : 'NOT YET'}</span>
      <span className={cn('hidden font-mono text-[12px] lg:block', st.dot === 'warn' ? 'text-warn' : 'text-muted')}>{till}</span>
      <StateMark dot={st.dot} className="hidden text-[13px] lg:inline-flex">
        {st.label}
      </StateMark>
      <span className="hidden text-right font-mono text-[13px] tabular lg:block">{total}</span>
      <span className="min-w-0 flex-1 lg:hidden">
        <span className="block truncate text-[14px]">{what}</span>
        <span className="mt-1 block truncate font-mono text-[11px] text-muted">
          {q.ref} <span className="text-faint">·</span> {customer?.name}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 lg:hidden">
        <span className="font-mono text-[13px] tabular">{total}</span>
        <StateMark dot={st.dot} className="text-[12px] text-muted">
          {st.label}
        </StateMark>
      </span>
    </Link>
  )
}

/** Invoiced each week, and how much of that has been paid, by the week it went out. */
function CashChart({ book }: { book: Book }) {
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today()), (i - 7) * 7))
  const data = weeks.map((w, i) => {
    const sent = book.invoices.filter((inv) => inv.issuedAt && inv.status !== 'void' && weekStart(inv.issuedAt.slice(0, 10)) === w)
    const d = new Date(`${w}T12:00:00Z`)
    const newMonth = i === 0 || d.getUTCDate() <= 7
    return {
      week: w,
      day: String(d.getUTCDate()),
      month: newMonth ? capDate(`${w}T12:00:00Z`).split(' ')[1] : '',
      invoiced: sent.reduce((s, x) => s + invoiceTotal(x), 0),
      paid: sent.reduce((s, x) => s + x.paidAmount, 0),
    }
  })
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.invoiced))
  const h = data[hover ?? data.length - 1]
  return (
    <Card className="flex flex-col gap-4 px-[22px] py-5">
      <div className="flex items-center justify-between gap-3">
        <span className="cap">Last 8 weeks</span>
        <span className="cap flex gap-3.5">
          <span className="flex items-center gap-1.5">
            <span className="size-2 bg-[#2e2e2e]" /> Invoiced
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 bg-foreground" /> Paid
          </span>
        </span>
      </div>
      <div className="grid h-[150px] grid-cols-8 items-end gap-2.5" onMouseLeave={() => setHover(null)}>
        {data.map((w, i) => (
          <div key={w.week} className="flex h-full items-end gap-[3px]" onMouseEnter={() => setHover(i)} aria-label={`Week of ${w.day} ${w.month}: ${pounds(w.invoiced)} invoiced, ${pounds(w.paid)} paid`} role="img">
            <span className="flex-1 rounded-t-[2px] bg-[#2e2e2e]" style={{ height: `${(w.invoiced / max) * 100}%` }} />
            <span className={cn('flex-1 rounded-t-[2px] bg-foreground transition-opacity', hover !== null && hover !== i && 'opacity-50')} style={{ height: `${(w.paid / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-2.5 font-mono text-[11px] text-muted">
        {data.map((w, i) => (
          <span key={w.week} className={cn('truncate', hover === i && 'text-foreground')}>
            {w.day}
            {w.month && <span className="hidden sm:inline"> {w.month}</span>}
          </span>
        ))}
      </div>
      <p className="font-mono text-[11px] text-muted uppercase">
        W/C {capDate(`${h.week}T12:00:00Z`)} <span className="ml-2 text-foreground">{pounds(h.paid)}</span> paid of {pounds(h.invoiced)} sent
      </p>
    </Card>
  )
}

/** Who to chase: late or part-paid invoices, the latest first. */
function RingToday({ book }: { book: Book }) {
  const chase = book.invoices.filter((i) => isLate(i) || i.status === 'part_paid').sort((a, b) => daysLate(b) - daysLate(a) || invoiceOwed(b) - invoiceOwed(a))
  return (
    <Card className="px-[22px] pt-5 pb-2">
      <SectionHead title="Ring today" className="pb-1.5" />
      {!chase.length && <p className="pt-2 pb-4 text-[14px] text-muted">Nobody to chase. Everything sent is in date.</p>}
      <ul className="rows">
        {chase.map((i) => {
          const c = find(book.customers, i.customerId)
          const d = daysLate(i)
          return (
            <li key={i.id} className="flex items-center gap-3 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-[14px]">{c?.name ?? 'Customer'}</span>
                <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-muted uppercase">
                  {c?.phone && (
                    <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                      {c.phone}
                    </a>
                  )}
                  {d > 0 && <span>{`${d} ${d === 1 ? 'day' : 'days'} late`}</span>}
                  {i.status === 'part_paid' && <span>{pounds(invoiceOwed(i), { always: true })} left</span>}
                </span>
              </span>
              <RowButton to={`/invoices/${i.id}`}>Record payment</RowButton>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
