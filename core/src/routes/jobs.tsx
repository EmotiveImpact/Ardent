import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { clock, dayDate, pounds, totals, trade as tradeWord } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Icon } from '@/components/layout/icons'
import { PageHead } from '@/components/ardent/parts'
import { FilterPill, MiniTrack } from '@/components/ardent/jobs-parts'
import { useBook, type Book } from '@/data/ardent'
import type { Job, JobStatus } from '@/data/model'
import { jobContext, onDay, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const live: JobStatus[] = ['en_route', 'on_site', 'paused']
const closed: JobStatus[] = ['invoiced', 'paid', 'cancelled']

const isOpen = (j: Job) => !closed.includes(j.status)

/** The head's figures filter the list too; they don't get their own pill. */
const figureFilters: { key: string; label: string; test: (j: Job, day: string) => boolean }[] = [
  { key: 'emergency', label: 'Emergency', test: (j) => j.priority === 'emergency' && isOpen(j) && j.status !== 'complete' },
  { key: 'open', label: 'Open', test: isOpen },
  { key: 'nocrew', label: 'No crew yet', test: (j) => isOpen(j) && j.status !== 'complete' && !j.operatorIds.length },
]

const filters: { key: string; label: string; test: (j: Job, day: string) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'today', label: 'Today', test: (j, day) => onDay(j.start, day) && j.status !== 'cancelled' },
  { key: 'enquiries', label: 'Enquiries', test: (j) => j.status === 'enquiry' || j.status === 'quoted' },
  { key: 'booked', label: 'Booked', test: (j) => j.status === 'booked' },
  { key: 'live', label: 'Live', test: (j) => live.includes(j.status) },
  { key: 'done', label: 'Done', test: (j) => j.status === 'complete' },
  { key: 'owed', label: 'To get paid', test: (j) => j.status === 'invoiced' },
  { key: 'paid', label: 'Paid', test: (j) => j.status === 'paid' },
]

/** "TODAY 07:00", or "THU 22 OCT" for any other day. */
const when = (iso: string, day: string) => (onDay(iso, day) ? `Today ${clock(iso)}` : dayDate(iso).replace(',', ''))

const cols = 'lg:grid lg:grid-cols-[64px_minmax(170px,2fr)_minmax(120px,1.3fr)_84px_78px_172px_96px_100px] lg:items-center lg:gap-4'

export function Jobs() {
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const { data: book } = useBook()
  const day = today()

  const counts = useMemo(() => Object.fromEntries([...filters, ...figureFilters].map((f) => [f.key, book?.jobs.filter((j) => f.test(j, day)).length ?? 0])), [book, day])

  const rows = useMemo(() => {
    if (!book) return []
    const test = [...filters, ...figureFilters].find((f) => f.key === filter)!.test
    const term = q.trim().toLowerCase()
    return [...book.jobs]
      .sort((a, b) => b.start.localeCompare(a.start))
      .filter((j) => {
        if (!test(j, day)) return false
        if (!term) return true
        const { customer, site } = jobContext(j, book)
        return [j.ref, j.title, customer?.name, site?.postcode, site?.line1].some((v) => v?.toLowerCase().includes(term))
      })
  }, [filter, q, book, day])

  // Tap a figure to filter by it; tap it again to show everything.
  const pick = (key: string) => () => setFilter((f) => (f === key ? 'all' : key))
  const fig = (key: string, label: string, tone?: 'warn' | 'danger') => ({ label, value: counts[key], tone: counts[key] ? tone : undefined, onClick: pick(key), on: filter === key })

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Jobs' }]} />
      <PageHead
        title="Jobs"
        book={book}
        sub="Every job on the line, from the first call to the money in."
        className="pb-0"
        figures={
          book && [
            ...(counts.emergency ? [fig('emergency', 'Emergency', 'danger')] : []),
            fig('open', 'Open'),
            fig('live', 'Live now'),
            fig('done', 'To invoice'),
            fig('nocrew', 'No crew yet', 'warn'),
          ]
        }
      />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Show" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 sm:flex-wrap">
            {filters.map((f) => (
              <FilterPill key={f.key} on={filter === f.key} label={f.label} count={counts[f.key]} onClick={() => setFilter(f.key)} />
            ))}
          </div>
          <label className="flex h-[38px] w-full items-center gap-2.5 rounded-[10px] bg-surface px-3.5 text-muted focus-within:ring-2 focus-within:ring-ring/60 sm:w-72">
            <Icon name="search" className="size-4 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by job, customer or postcode"
              aria-label="Filter jobs"
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-faint"
            />
          </label>
        </div>

        <div className="animate-rise rounded-[14px] bg-surface px-4 py-1.5 sm:px-[22px]" aria-label="Jobs">
          <div className={cn('cap hidden py-3.5', cols)}>
            <span>Ref</span>
            <span>Work</span>
            <span>Customer</span>
            <span>Trade</span>
            <span>Crew</span>
            <span>Where it is</span>
            <span>When</span>
            <span className="text-right">Value</span>
          </div>
          <ol className="rows lg:[&>*:first-child]:shadow-[inset_0_1px_0_var(--line)]">
            {book && rows.map((j) => <JobRow key={j.id} job={j} book={book} day={day} />)}
          </ol>
          {book && !rows.length && <p className="py-10 text-center text-[14px] text-muted">{q ? `No jobs match "${q.trim()}".` : 'No jobs here.'}</p>}
          {!book && <div className="my-3 h-40 animate-pulse rounded-[10px] bg-inset/60" />}
        </div>
      </section>
    </div>
  )
}

function JobRow({ job, book, day }: { job: Job; book: Book; day: string }) {
  const navigate = useNavigate()
  const { customer, crew } = jobContext(job, book)
  const value = totals(job).total
  const nobody = !crew.length && !closed.includes(job.status) && job.status !== 'complete'
  const flag = job.priority === 'emergency' ? ['Emergency', 'text-danger'] : job.priority === 'high' ? ['High', 'text-warn'] : undefined
  const faded = job.status === 'paid' || job.status === 'cancelled'
  const to = `/jobs/${job.id}`
  const crewText = crew.length ? crew.map((o) => o.initials).join(' ') : nobody ? 'Nobody' : '·'

  return (
    <li
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) navigate(to)
      }}
      className={cn('group cursor-pointer py-3.5 transition-opacity hover:opacity-100', cols, faded && 'opacity-55')}
    >
      {/* Wide screens: one grid row. */}
      <Link to={to} className="hidden rounded font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 lg:block">
        {job.ref}
      </Link>
      <span className="hidden min-w-0 items-center gap-2 lg:flex">
        <Link to={to} className="truncate rounded text-[14px] outline-none group-hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60" tabIndex={-1}>
          {job.title}
        </Link>
        {flag && <span className={cn('shrink-0 font-mono text-[10px] tracking-[.12em] uppercase', flag[1])}>{flag[0]}</span>}
      </span>
      <span className="hidden truncate text-[13px] text-foreground/80 lg:block">
        {customer ? (
          <Link to={`/customers/${customer.id}`} className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
            {customer.name}
          </Link>
        ) : (
          'Unknown'
        )}
      </span>
      <span className="cap hidden truncate lg:block">{tradeWord[job.trade]}</span>
      <span className={cn('op-title hidden truncate text-[10px] lg:block', nobody ? 'text-warn' : !crew.length && 'text-faint')}>{crewText}</span>
      <span className="hidden lg:block">
        <MiniTrack job={job} />
      </span>
      <span className="hidden font-mono text-[12px] text-muted uppercase lg:block">{when(job.start, day)}</span>
      <span className="hidden text-right font-mono text-[13px] tabular lg:block">{value ? pounds(value, { always: true }) : <span className="text-faint">Not priced</span>}</span>

      {/* Narrow screens: a stacked row. */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <Link to={to} className="min-w-0 truncate rounded text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
            <span className="mr-2.5 font-mono text-[12px] text-muted">{job.ref}</span>
            {job.title}
          </Link>
          <span className="shrink-0 font-mono text-[13px] tabular">{value ? pounds(value, { always: true }) : <span className="text-faint">·</span>}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
          <span className="min-w-0 truncate">
            {customer?.name ?? 'Unknown'}
            {flag && <span className={cn('ml-2 font-mono text-[10px] tracking-[.12em] uppercase', flag[1])}>{flag[0]}</span>}
          </span>
          <span className={cn('op-title shrink-0 text-[10px]', nobody ? 'text-warn' : 'text-foreground')}>{crewText}</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <MiniTrack job={job} />
          <span className="font-mono text-[11px] text-muted uppercase">{when(job.start, day)}</span>
        </div>
      </div>
    </li>
  )
}
