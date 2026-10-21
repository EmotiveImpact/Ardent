import { useState } from 'react'
import { clock, pounds } from '@kit'
import { PageBar, useShell } from '@/components/layout/bar'
import { barButton } from '@/components/layout/topbar'
import { Icon } from '@/components/layout/icons'
import { Card, PageHead, Readout, RowButton, SectionHead, TheLine } from '@/components/ardent/parts'
import { CrewTiles, LiveJobSheet } from '@/components/ardent/job-live'
import { CrewMap } from '@/components/dashboard/crew-map'
import { JobBoard } from '@/components/dashboard/job-board'
import { useArdent, useBook, type Book } from '@/data/ardent'
import { useNeeds, useVanFeed, type Need } from '@/lib/needs'
import { addDays, find, focusJob, invoiceOwed, invoiceTotal, isDone, onDay, today, weekStart } from '@/lib/jobs'
import { cn } from '@/lib/utils'

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
      <PageHead title="Today" book={book} sub={book && needs ? summary(book, needs.length, me?.user.name.split(' ')[0]) : ' '} className="pb-0" />

      {!book ? (
        <Loading />
      ) : (
        <>
          <Readouts book={book} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <NeedsYou needs={needs} />
            <FromTheVans book={book} />
          </div>

          <section>
            <SectionHead title="The crew" aside={!wall && 'Pick someone on the map or the list to open their job'} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-3">
                <div className="relative hidden h-[420px] overflow-hidden rounded-[14px] bg-inset sm:block">
                  <CrewMap operators={book.operators} jobs={book.jobs} sites={book.sites} onSelect={setPicked} />
                </div>
                <CrewTiles book={book} onPick={setPicked} picked={live?.id} />
              </div>
              <div className="min-w-0">{live ? <LiveJobSheet job={live} book={book} /> : <Card className="py-12 text-center text-[13px] text-muted">No jobs booked today.</Card>}</div>
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
    </div>
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
      <Readout index={0} label="Jobs done today" value={done} unit={`of ${todays.length}`} bars={days.map((d) => book.jobs.filter((j) => onDay(j.start, d) && isDone(j)).length)} note={`${onSite} on site, ${onRoad} on the road`} action={{ label: 'Jobs', to: '/jobs' }} />
      <Readout index={1} label="Hours booked" value={(Math.round(hoursOf(book, day) * 2) / 2).toString()} unit="h" bars={days.map((d) => hoursOf(book, d))} note={`${crewToday === crew.length ? 'All' : crewToday} of the ${crew.length} crew`} action={{ label: 'Diary', to: '/schedule' }} />
      <Readout index={2} label="Owed to you" value={pounds(owed)} bars={weeks.map(invoicedIn)} note={late ? `${pounds(late)} late` : 'Nothing late'} action={{ label: 'Record payment', to: '/money' }} />
      <Readout index={3} label="Certs run out" value={lapsed} tone={lapsed ? 'danger' : undefined} bars={ahead.map(lapsedBy)} note={`${dueSoon} more in 30 days`} action={{ label: 'Book', to: '/certificates' }} />
      <Readout index={4} label="Crew booked, week" value={bookedPct(mon)} unit="%" bars={weeks.map(bookedPct)} note={`${free} free ${free === 1 ? 'slot' : 'slots'}`} action={{ label: 'Diary', to: '/schedule' }} />
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
              <span className={cn('mt-1 block truncate font-mono text-[10.5px] tracking-[.08em] uppercase', x.tone === 'danger' ? 'text-danger' : 'text-muted')}>{x.meta.join('   ')}</span>
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
              <span className="mt-1 block truncate font-mono text-[10.5px] tracking-[.08em] text-muted uppercase">{v.meta.filter(Boolean).join('   ')}</span>
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
