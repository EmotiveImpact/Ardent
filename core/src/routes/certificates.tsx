import { useState } from 'react'
import { Link } from 'react-router'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, RowButton } from '@/components/ardent/parts'
import { capDay, say } from '@/components/ardent/money-lib'
import { useBook, type Book } from '@/data/ardent'
import type { Certificate, CertificateKind } from '@/data/model'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const order: Certificate['state'][] = ['overdue', 'due_soon', 'valid', 'draft']
const dot: Record<Certificate['state'], string> = { overdue: 'bg-danger', due_soon: 'bg-warn', valid: 'bg-foreground', draft: 'bg-[#5f5f5f]' }
const runsOutTone: Record<Certificate['state'], string> = { overdue: 'text-danger', due_soon: 'text-warn', valid: 'text-muted', draft: 'text-muted' }
const kindName: Record<CertificateKind, string> = { CP12: 'CP12', EICR: 'EICR', PAT: 'PAT', BS5839: 'Fire alarm', 'Boiler service': 'Boiler service', Unvented: 'Unvented' }

/** Words a renewal visit for this kind of certificate would carry in its title or notes. */
const renewalWords: Record<CertificateKind, string[]> = {
  CP12: ['cp12', 'gas safety'],
  'Boiler service': ['boiler service'],
  EICR: ['eicr', 'electrical installation condition'],
  PAT: ['pat test', 'portable appliance'],
  BS5839: ['bs5839', 'bs 5839', 'fire alarm'],
  Unvented: ['unvented'],
}
const OPEN_DONE = ['complete', 'invoiced', 'paid', 'cancelled']

/** A renewal visit already in the book: an open job at the same site for the same kind of work. */
function bookedFor(c: Certificate, book: Book) {
  const words = renewalWords[c.kind]
  return book.jobs.find((j) => j.siteId === c.siteId && !OPEN_DONE.includes(j.status) && words.some((w) => `${j.title} ${j.notes ?? ''}`.toLowerCase().includes(w)))
}

type Filter = 'all' | 'overdue' | 'due_soon' | 'valid'

export function Certificates() {
  const { data: book } = useBook()
  const [filter, setFilter] = useState<Filter>('all')
  const certs = book?.certificates ?? []
  const counts = { overdue: 0, due_soon: 0, valid: 0, draft: 0 }
  for (const c of certs) counts[c.state]++
  const rows = certs.filter((c) => filter === 'all' || c.state === filter).sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.expires.localeCompare(b.expires))

  const sub = !book
    ? ' '
    : counts.overdue
      ? `${say(counts.overdue)} ${counts.overdue === 1 ? 'has' : 'have'} run out${counts.due_soon ? ` and ${say(counts.due_soon).toLowerCase()} more ${counts.due_soon === 1 ? 'runs' : 'run'} out in the next 30 days` : ''}. Book the renewals from here.`
      : counts.due_soon
        ? `Nothing has run out. ${say(counts.due_soon)} ${counts.due_soon === 1 ? 'runs' : 'run'} out in the next 30 days.`
        : 'Everything is in date.'

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Certs' }]} />
      <div className="flex flex-wrap items-end justify-between gap-x-10">
        <PageHead title="Certificates" book={book} sub={sub} className="pb-0" />
        {book && <Gauge certs={certs} counts={counts} filter={filter} setFilter={setFilter} />}
      </div>

      {!book ? (
        <div className="h-[420px] animate-pulse rounded-[14px] bg-surface/60" />
      ) : (
        <Card className="px-4 py-1.5 sm:px-[22px]">
          <div className="cap hidden gap-4 py-3.5 lg:grid lg:grid-cols-[130px_minmax(200px,2fr)_minmax(140px,1.3fr)_90px_100px_150px]">
            <span>Certificate</span>
            <span>Address</span>
            <span>Customer</span>
            <span>Issued</span>
            <span>Runs out</span>
            <span />
          </div>
          {!rows.length && <p className="py-10 text-center text-[14px] text-muted">{certs.length ? 'None in this state.' : 'No certificates yet.'}</p>}
          <ul className="rows lg:shadow-[inset_0_1px_0_var(--line)]">
            {rows.map((c) => (
              <CertRow key={c.id} c={c} book={book} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function CertRow({ c, book }: { c: Certificate; book: Book }) {
  const site = find(book.sites, c.siteId)
  const customer = find(book.customers, site?.customerId)
  const visit = c.state === 'overdue' || c.state === 'due_soon' ? bookedFor(c, book) : undefined
  const needsBooking = (c.state === 'overdue' || c.state === 'due_soon') && !visit
  const address = site ? `${site.line1}, ${site.postcode}` : 'Unknown site'
  const action = visit ? (
    <Link to={`/jobs/${visit.id}`} className="rounded-sm font-mono text-[11px] tracking-[.1em] text-muted uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
      Booked {visit.ref}
    </Link>
  ) : needsBooking ? (
    <RowButton to={`/jobs/new?site=${c.siteId}&for=${encodeURIComponent(c.kind)}`} className="h-8 px-3">
      Book renewal
    </RowButton>
  ) : null
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 lg:grid lg:grid-cols-[130px_minmax(200px,2fr)_minmax(140px,1.3fr)_90px_100px_150px] lg:py-[11px]', (c.state === 'valid' || c.state === 'draft') && 'opacity-55')}>
      <span className="flex w-full items-center gap-2.5 text-[13.5px] lg:w-auto">
        <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', dot[c.state])} />
        {kindName[c.kind]}
        <span className="sr-only">, {c.state.replace('_', ' ')}</span>
        <span className={cn('ml-auto font-mono text-[11px] lg:hidden', runsOutTone[c.state])}>{capDay(c.expires)}</span>
      </span>
      <span className="min-w-0 flex-1 truncate pl-[17px] text-[14px] lg:flex-none lg:pl-0">{address}</span>
      <span className="hidden min-w-0 truncate text-[13.5px] text-[#c8c8c8] lg:block">
        {customer ? (
          <Link to={`/customers/${customer.id}`} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
            {customer.name}
          </Link>
        ) : null}
      </span>
      <span className="hidden font-mono text-[12px] text-muted lg:block">{c.issued ? capDay(c.issued) : '--'}</span>
      <span className={cn('hidden font-mono text-[12px] lg:block', runsOutTone[c.state])}>{capDay(c.expires)}</span>
      <span className="flex shrink-0 justify-end lg:min-h-8 lg:items-center">{action}</span>
      <span className="w-full truncate pl-[17px] text-[12.5px] text-muted lg:hidden">{customer?.name}</span>
    </li>
  )
}

/** In date out of all, one segment per certificate, and a legend that filters the list. */
function Gauge({ certs, counts, filter, setFilter }: { certs: Certificate[]; counts: Record<Certificate['state'], number>; filter: Filter; setFilter: (f: Filter) => void }) {
  const live = certs.filter((c) => c.state !== 'draft')
  const segs = [...live].sort((a, b) => order.indexOf(b.state) - order.indexOf(a.state))
  const inDate = counts.valid + counts.due_soon
  const legend: { key: Filter; label: string; n: number; dot: string }[] = [
    { key: 'overdue', label: 'Run out', n: counts.overdue, dot: 'bg-danger' },
    { key: 'due_soon', label: 'Due in 30 days', n: counts.due_soon, dot: 'bg-warn' },
    { key: 'valid', label: 'Fine', n: counts.valid, dot: 'bg-foreground' },
  ]
  return (
    <div className="flex w-[440px] max-w-full flex-col gap-3 pt-6">
      <div className="flex items-baseline justify-between">
        <span className="cap">In date</span>
        <span className="op-number text-[30px]">
          {inDate} <span className="text-[16px] text-muted">of {live.length}</span>
        </span>
      </div>
      <div aria-hidden className="flex gap-[3px]">
        {segs.map((c) => (
          <span key={c.id} className={cn('h-2 flex-1 rounded-[1px]', dot[c.state])} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Show only">
        {legend.map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={filter === l.key}
            onClick={() => setFilter(filter === l.key ? 'all' : l.key)}
            className={cn('cap flex h-7 items-center gap-1.5 rounded-full px-2.5 outline-none transition-colors first:-ml-2.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60', filter === l.key && 'bg-raised text-foreground')}
          >
            <span className={cn('size-[7px] rounded-full', l.dot)} />
            {l.label} <span className="text-foreground">{l.n}</span>
          </button>
        ))}
        {filter !== 'all' && (
          <button type="button" onClick={() => setFilter('all')} className="cap flex h-7 items-center rounded-full px-2.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
            Show all
          </button>
        )}
      </div>
    </div>
  )
}
