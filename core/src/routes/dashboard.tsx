import { useState } from 'react'
import { CalendarRange, Clock, LayoutGrid, PoundSterling, ShieldAlert, Wrench } from 'lucide-react'
import { dayDate, longDate, pounds } from '@kit'
import { PageHeader, Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { LiveBoard } from '@/components/dashboard/live-board'
import { JobSheet } from '@/components/dashboard/job-sheet'
import { JobBoard } from '@/components/dashboard/job-board'
import { ExceptionsTable } from '@/components/dashboard/exceptions-table'
import { useArdent, useBook, type Book } from '@/data/ardent'
import { addDays, find, focusJob, invoiceOwed, invoiceTotal, isDone, onDay, today, weekStart } from '@/lib/jobs'

const greeting = (hour: number) => (hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening')
const ukHour = () => Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }))

export function Dashboard() {
  const { me } = useArdent()
  const { data: book } = useBook()
  const [tab, setTab] = useState('overview')
  const [picked, setPicked] = useState<string>()
  const now = new Date().toISOString()
  const out = book?.operators.filter((o) => ['en_route', 'on_site', 'delayed'].includes(o.state)).length ?? 0
  const live = book && (find(book.jobs, picked) ?? focusJob(book.jobs))

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader
        eyebrow={`${greeting(ukHour())}, ${me?.user.name.split(' ')[0]}. ${longDate(now)}`}
        title="Today"
        aside={
          <span className="caps flex h-8 items-center gap-2 rounded-md bg-surface px-3 text-muted">
            <span className={out ? 'size-1.5 rounded-full bg-ok' : 'size-1.5 rounded-full bg-faint'} />
            {out} {out === 1 ? 'van' : 'vans'} out
          </span>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="overview">
              <LayoutGrid /> Overview
            </TabsTrigger>
            <TabsTrigger value="dispatch">
              <CalendarRange /> Dispatch
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!book ? (
        <Loading />
      ) : tab === 'dispatch' ? (
        <Panel>
          <PanelHeader icon={<CalendarRange />} title="Today's jobs" />
          <Well className="p-1">
            <JobBoard book={book} layout="full" onSelect={setPicked} selectedId={live?.id} />
          </Well>
          {live && (
            <div className="mt-3">
              <JobSheet job={live} book={book} title="Job sheet" />
            </div>
          )}
        </Panel>
      ) : (
        <>
          <KpiRow book={book} />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <LiveBoard book={book} withBoard onSelect={setPicked} selectedId={live?.id} />
              <ExceptionsTable />
            </div>
            <div className="min-w-0 xl:sticky xl:top-0 xl:max-h-[calc(100vh-8.5rem)]">
              {live ? (
                <JobSheet job={live} book={book} />
              ) : (
                <Panel>
                  <PanelHeader title="Live job sheet" />
                  <Well className="px-3 py-10 text-center text-[13px] text-faint">No jobs booked today.</Well>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[132px] animate-pulse rounded-xl bg-surface/60" />
      ))}
    </div>
  )
}

/** The four headline numbers for the day, worked out from the records. */
export function KpiRow({ book }: { book: Book }) {
  const day = today()
  const days = Array.from({ length: 8 }, (_, i) => addDays(day, i - 7))
  const todays = book.jobs.filter((j) => onDay(j.start, day) && j.status !== 'cancelled')
  const done = todays.filter(isDone).length
  const onSite = book.operators.filter((o) => o.state === 'on_site').length
  const enRoute = book.operators.filter((o) => o.state === 'en_route' || o.state === 'delayed').length

  const hoursOn = (d: string) =>
    book.jobs.filter((j) => onDay(j.start, d) && j.status !== 'cancelled').reduce((s, j) => s + ((Date.parse(j.end) - Date.parse(j.start)) / 3_600_000) * Math.max(1, j.operatorIds.length), 0)

  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(day), (i - 7) * 7))
  const invoicedIn = (w: string) => book.invoices.filter((inv) => inv.issuedAt && weekStart(inv.issuedAt.slice(0, 10)) === w).reduce((s, inv) => s + invoiceTotal(inv), 0)
  const owing = book.invoices.filter((i) => ['sent', 'part_paid', 'overdue'].includes(i.status))
  const owed = owing.reduce((s, i) => s + invoiceOwed(i), 0)
  const overdue = owing.filter((i) => i.status === 'overdue' || (i.dueAt && i.dueAt < new Date().toISOString()))

  const certs = book.certificates
  const ahead = Array.from({ length: 8 }, (_, i) => addDays(weekStart(day), i * 7))
  const expiringIn = (w: string) => certs.filter((c) => weekStart(c.expires) === w).length
  const lapsed = certs.filter((c) => c.state === 'overdue').length
  const dueSoon = certs.filter((c) => c.state === 'due_soon').length

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <KpiCard
        icon={<Wrench />}
        title="Jobs done today"
        value={done}
        format={(n) => String(Math.round(n))}
        unit={`of ${todays.length}`}
        index={0}
        series={days.map((d) => book.jobs.filter((j) => onDay(j.start, d) && isDone(j)).length)}
        labels={days.map(dayDate)}
        color="var(--fg)"
        note={`${onSite} on site, ${enRoute} on the way`}
      />
      <KpiCard
        icon={<Clock />}
        title="Hours booked"
        value={hoursOn(day)}
        format={(n) => (Math.round(n * 2) / 2).toString()}
        unit="h"
        index={1}
        series={days.map(hoursOn)}
        labels={days.map(dayDate)}
        color="var(--fg)"
        note={`Across ${new Set(todays.flatMap((j) => j.operatorIds)).size} of the crew today`}
      />
      <KpiCard
        icon={<PoundSterling />}
        title="Owed to you"
        prefix="£"
        value={owed}
        format={(n) => (Math.round(n) / 100).toLocaleString('en-GB', { maximumFractionDigits: 0 })}
        index={2}
        series={weeks.map(invoicedIn)}
        labels={weeks.map((w) => `w/c ${dayDate(w)}`)}
        color="var(--fg)"
        note={
          overdue.length ? (
            <>
              <span className="text-warn">{pounds(overdue.reduce((s, i) => s + invoiceOwed(i), 0))}</span> overdue on {overdue.length} {overdue.length === 1 ? 'invoice' : 'invoices'}
            </>
          ) : (
            'Nothing overdue'
          )
        }
      />
      <KpiCard
        icon={<ShieldAlert />}
        title="Overdue certificates"
        value={lapsed}
        format={(n) => String(Math.round(n))}
        index={3}
        series={ahead.map(expiringIn)}
        labels={ahead.map((w) => `w/c ${dayDate(w)}`)}
        color={lapsed ? 'var(--danger)' : 'var(--fg)'}
        note={`${dueSoon} more due in the next 30 days`}
      />
    </div>
  )
}
