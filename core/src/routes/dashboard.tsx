import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { clock, dayDate, pounds, shortDate } from '@kit'
import { PageBar, useShell } from '@/components/layout/bar'
import { barButton } from '@/components/layout/topbar'
import { Icon } from '@/components/layout/icons'
import { Card, PageHead, Readout, RowButton, SectionHead, TheLine } from '@/components/ardent/parts'
import { CrewTiles, LiveJobSheet } from '@/components/ardent/job-live'
import { CrewMap } from '@/components/dashboard/crew-map'
import { JobBoard } from '@/components/dashboard/job-board'
import { MorningBriefCard } from '@/components/ardent/office'
import { useArdent, useBook, type Book } from '@/data/ardent'
import { useNeeds, useVanFeed, type Need } from '@/lib/needs'
import { addDays, find, focusJob, invoiceOwed, invoiceTotal, isDone, onDay, today, weekStart } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { useNow } from '@/hooks/use-now'

const greeting = (hour: number) => (hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening')
const ukHour = () => Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }))
const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const say = (n: number) => words[n] ?? String(n)

/** The day in one sentence, the way the owner would say it. */
function summary(book: Book, needs: number, name?: string) {
  const onTools = book.operators.filter((o) => o.state === 'on_site').length
  const late = book.operators.filter((o) => o.state === 'delayed')
  const bits = [`${say(onTools).replace(/^No$/, 'Nobody')} on the tools`]
  if (late.length === 1) bits.push(`${late[0].name.split(' ')[0]}'s running late`)
  else if (late.length > 1) bits.push(`${say(late.length).toLowerCase()} running late`)
  bits.push(needs ? `${say(needs).toLowerCase()} ${needs === 1 ? 'thing needs' : 'things need'} you` : 'nothing needs you')
  const last = bits.pop()
  return `${greeting(ukHour())}${name ? `, ${name}` : ''}. ${bits.join(', ')}${bits.length ? ', and ' : ''}${last}.`
}

export function Dashboard() {
  const { me } = useArdent()
  const { data: book } = useBook()
  const needs = useNeeds()
  const { setWall, wall } = useShell()
  const [picked, setPicked] = useState<string>()
  const live = book && (find(book.jobs, picked) ?? focusJob(book.jobs))
  const [params, setParams] = useSearchParams()
  const view = (views.some((v) => v.key === params.get('view')) ? params.get('view') : 'overview') as View
  const setView = (v: View) => setParams(v === 'overview' ? {} : { view: v }, { replace: true })
  const sheet = live ? <LiveJobSheet job={live} book={book} /> : <Card className="py-12 text-center text-[13px] text-muted">No jobs booked today.</Card>

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar
        crumbs={[{ label: 'Today' }]}
        actions={
          <button type="button" className={barButton} onClick={() => setWall(true)}>
            <Icon name="wall" className="size-4" /> Wall mode
          </button>
        }
      />
      <PageHead title="Today" book={book} sub={book && needs ? summary(book, needs.length, me?.user.name.split(' ')[0]) : ' '} className="pb-0" aside={<ViewSwitch view={view} onChange={setView} />} />

      {!book ? (
        <Loading />
      ) : (
        <>
          {view === 'overview' && <MorningBriefCard />}
          {view === 'overview' && <Readouts book={book} />}

          {view === 'overview' && (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <NeedsYou needs={needs} />
                <FromTheVans book={book} />
              </div>

              <section>
                <SectionHead title="The crew" aside={!wall && 'Pick someone on the map or the list to open their job'} />
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="flex min-w-0 flex-col gap-3">
                    <MapWell book={book} onSelect={setPicked} className="sm:h-[420px]" />
                    <CrewTiles book={book} onPick={setPicked} picked={live?.id} />
                  </div>
                  <div className="min-w-0">{sheet}</div>
                </div>
              </section>

              <section>
                <SectionHead title="Today's jobs" aside="Drag a job across, or click one with nobody on it to hand it to someone" />
                <Card className="p-2">
                  <JobBoard book={book} layout="full" onSelect={setPicked} selectedId={live?.id} />
                </Card>
              </section>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <TheLine book={book} />
                <ThisWeek book={book} />
              </div>
            </>
          )}

          {view === 'dispatch' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(380px,1fr)]">
              <section className="min-w-0">
                <SectionHead title="Today's jobs" aside="Drag a job across, or click one with nobody on it to hand it to someone" />
                <Card className="p-2">
                  <JobBoard book={book} layout="full" onSelect={setPicked} selectedId={live?.id} className="xl:grid-cols-3 2xl:grid-cols-5" />
                </Card>
              </section>
              <section className="min-w-0">
                <SectionHead title="Job sheet" />
                {sheet}
              </section>
            </div>
          )}

          {view === 'map' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(380px,1fr)]">
              <section className="flex min-w-0 flex-col gap-3">
                <SectionHead title="The crew" aside={!wall && 'Pick someone on the map or the list to open their job'} />
                <MapWell book={book} onSelect={setPicked} className="sm:h-[620px]" />
                <CrewTiles book={book} onPick={setPicked} picked={live?.id} />
              </section>
              <section className="min-w-0">
                <SectionHead title="Job sheet" />
                {sheet}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const views = [
  { key: 'overview', label: 'Overview' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'map', label: 'Map' },
] as const
type View = (typeof views)[number]['key']

/** Three ways to look at the day. Kept in the address, so back and forward and wall mode keep it. */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div role="tablist" aria-label="View" className="inline-flex gap-1 rounded-[11px] bg-surface p-1">
      {views.map((v) => (
        <button
          key={v.key}
          type="button"
          role="tab"
          aria-selected={view === v.key}
          onClick={() => onChange(v.key)}
          className={cn('h-8 rounded-[8px] px-3.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60', view === v.key ? 'bg-raised text-foreground' : 'text-muted hover:text-foreground')}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

/** The crew map in its well, with a live clock in the corner. */
function MapWell({ book, onSelect, className }: { book: Book; onSelect: (id: string) => void; className?: string }) {
  return (
    <div className={cn('relative h-[320px] overflow-hidden rounded-[14px] bg-inset', className)}>
      <LiveClock />
      <CrewMap operators={book.operators} jobs={book.jobs} sites={book.sites} onSelect={onSelect} />
    </div>
  )
}

function LiveClock() {
  const now = useNow()
  return (
    <span className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-[8px] bg-surface/90 px-2.5 py-1.5 backdrop-blur">
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ok" />
        <span className="relative size-1.5 rounded-full bg-ok" />
      </span>
      <span className="cap text-[11px]">Live</span>
      <span className="font-mono text-[12px] text-foreground tabular">{clock(new Date(now).toISOString(), true)}</span>
    </span>
  )
}

function Loading() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-[150px] animate-pulse rounded-[14px] bg-surface/60" />
      ))}
    </div>
  )
}

const hoursOf = (book: Book, d: string, opId?: string) =>
  book.jobs
    .filter((j) => onDay(j.start, d) && j.status !== 'cancelled' && (!opId || j.operatorIds.includes(opId)))
    .reduce((s, j) => s + ((Date.parse(j.end) - Date.parse(j.start)) / 3_600_000) * (opId ? 1 : Math.max(1, j.operatorIds.length)), 0)

/** A working week is five eight-hour days. */
const WEEK_HOURS = 40

function Readouts({ book }: { book: Book }) {
  const day = today()
  const days = Array.from({ length: 8 }, (_, i) => addDays(day, i - 7))
  const todays = book.jobs.filter((j) => onDay(j.start, day) && j.status !== 'cancelled')
  const done = todays.filter(isDone).length
  const onSite = book.operators.filter((o) => o.state === 'on_site').length
  const onRoad = book.operators.filter((o) => o.state === 'en_route' || o.state === 'delayed').length

  const crewToday = new Set(todays.flatMap((j) => j.operatorIds)).size

  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(day), (i - 7) * 7))
  const invoicedIn = (w: string) => book.invoices.filter((inv) => inv.issuedAt && weekStart(inv.issuedAt.slice(0, 10)) === w).reduce((s, inv) => s + invoiceTotal(inv), 0)
  const owing = book.invoices.filter((i) => ['sent', 'part_paid', 'overdue'].includes(i.status))
  const owed = owing.reduce((s, i) => s + invoiceOwed(i), 0)
  const late = owing.filter((i) => i.status === 'overdue' || (i.dueAt && i.dueAt < new Date().toISOString())).reduce((s, i) => s + invoiceOwed(i), 0)

  const ahead = Array.from({ length: 8 }, (_, i) => addDays(weekStart(day), (i - 7) * 7))
  const lapsedBy = (w: string) => book.certificates.filter((c) => c.expires < addDays(w, 7)).length
  const lapsed = book.certificates.filter((c) => c.state === 'overdue').length
  const dueSoon = book.certificates.filter((c) => c.state === 'due_soon').length

  const mon = weekStart(day)
  const week = Array.from({ length: 5 }, (_, i) => addDays(mon, i))
  // Same sums as the Diary: each person's own jobs, against the whole crew's week.
  const crew = book.operators
  const bookedPct = (w: string) => {
    const d5 = Array.from({ length: 5 }, (_, i) => addDays(w, i))
    const h = d5.reduce((s, d) => s + crew.reduce((n, o) => n + hoursOf(book, d, o.id), 0), 0)
    return Math.round((h / Math.max(1, crew.length * WEEK_HOURS)) * 100)
  }
  // A free slot is a crew member with half a day or more open, from today to Friday.
  const free = week.filter((d) => d >= day).reduce((s, d) => s + crew.filter((o) => hoursOf(book, d, o.id) <= 4).length, 0)

  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      <Readout index={0} label="Jobs done today" count={done} unit={`of ${todays.length}`} bars={days.map((d) => book.jobs.filter((j) => onDay(j.start, d) && isDone(j)).length)} labels={days.map((d) => dayDate(d).replace(',', ''))} note={`${onSite} on site, ${onRoad} on the road`} action={{ label: 'Jobs', to: '/jobs' }} />
      <Readout index={1} label="Hours booked" count={hoursOf(book, day)} format={(n) => (Math.round(n * 2) / 2).toString()} unit="h" bars={days.map((d) => hoursOf(book, d))} labels={days.map((d) => dayDate(d).replace(',', ''))} barFormat={(n) => `${Math.round(n * 2) / 2}h`} note={`${crewToday === crew.length ? 'All' : crewToday} of the ${crew.length} crew`} action={{ label: 'Diary', to: '/schedule' }} />
      <Readout index={2} label="Owed to you" count={owed} format={(n) => pounds(Math.round(n / 100) * 100)} bars={weeks.map(invoicedIn)} labels={weeks.map((w) => `w/c ${shortDate(w)}`)} barFormat={(n) => `${pounds(Math.round(n / 100) * 100)} invoiced`} note={late ? `${pounds(late)} late` : 'Nothing late'} action={{ label: 'Record payment', to: '/money' }} />
      <Readout index={3} label="Certs run out" count={lapsed} tone={lapsed ? 'danger' : undefined} bars={ahead.map(lapsedBy)} labels={ahead.map((w) => `by ${shortDate(addDays(w, 6))}`)} barFormat={(n) => `${n} out`} note={`${dueSoon} more in 30 days`} action={{ label: 'Book', to: '/certificates' }} />
      <Readout index={4} label="Crew booked, week" count={bookedPct(mon)} unit="%" bars={weeks.map(bookedPct)} labels={weeks.map((w) => `w/c ${shortDate(w)}`)} barFormat={(n) => `${n}%`} note={`${free} free ${free === 1 ? 'slot' : 'slots'}`} action={{ label: 'Diary', to: '/schedule' }} />
    </div>
  )
}

function NeedsYou({ needs }: { needs?: Need[] }) {
  return (
    <Card>
      <SectionHead
        title={
          <>
            Needs you <span className="text-faint">·</span> <span className="text-foreground">{needs?.length ?? ''}</span>
          </>
        }
      />
      {needs?.length === 0 && <p className="py-6 text-[14px] text-muted">Nothing needs you. The day is running itself.</p>}
      <ol className="rows">
        {needs?.slice(0, 6).map((x, i) => (
          <li key={x.id} className="flex items-center gap-4 py-3">
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full font-mono text-[11px] text-muted shadow-[inset_0_0_0_1.5px_var(--line-strong)]">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{x.title}</span>
              <span className={cn('mt-1 block truncate font-mono text-[11px] tracking-[.08em] uppercase', x.tone === 'danger' ? 'text-danger' : 'text-muted')}>{x.meta.join('   ')}</span>
            </span>
            <RowButton to={x.to}>{x.action}</RowButton>
          </li>
        ))}
      </ol>
      {needs && needs.length > 6 && <p className="pt-3 text-[13px] text-muted">{needs.length - 6} more in the bell, top right.</p>}
    </Card>
  )
}

function FromTheVans({ book }: { book: Book }) {
  const feed = useVanFeed(book, 6)
  return (
    <Card>
      <SectionHead title="From the vans" />
      {feed?.length === 0 && <p className="py-6 text-[14px] text-muted">Nothing in from the vans yet today.</p>}
      <ol className="rows">
        {feed?.map((v) => (
          <li key={v.id} className="flex gap-4 py-3">
            <span className="w-10 shrink-0 pt-0.5 font-mono text-[12px] text-muted">{clock(v.at)}</span>
            <span className="w-6 shrink-0 pt-0.5 font-mono text-[12px] text-muted">{v.initials}</span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate text-[14px]', v.tone === 'warn' && 'text-warn')}>{v.title}</span>
              <span className="mt-1 block truncate font-mono text-[11px] tracking-[.08em] text-muted uppercase">{v.meta.filter(Boolean).join('   ')}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/** Each crew member's booked hours this week, as ten blocks out of forty. */
function ThisWeek({ book }: { book: Book }) {
  const mon = weekStart(today())
  const week = Array.from({ length: 5 }, (_, i) => addDays(mon, i))
  const crew = book.operators
  return (
    <Card>
      <SectionHead title="This week" aside={<a href="#/schedule" className="text-muted hover:text-foreground">Open diary</a>} />
      <ul className="flex flex-col gap-4 pt-1">
        {crew.map((o) => {
          const h = week.reduce((s, d) => s + hoursOf(book, d, o.id), 0)
          const filled = Math.round((h / WEEK_HOURS) * 10)
          return (
            <li key={o.id}>
              <div className="flex justify-between text-[14px]">
                <span>{o.name.split(' ')[0]}</span>
                <span className="font-mono text-[12px] text-muted">{Math.round(h)}h</span>
              </div>
              <div aria-hidden className="mt-2 flex gap-[3px]">
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} className={cn('h-[3px] flex-1 rounded-full', i < filled ? 'bg-foreground' : 'bg-line-strong')} />
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
