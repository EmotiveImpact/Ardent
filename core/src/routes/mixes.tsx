import { useState, type CSSProperties } from 'react'
import { CalendarRange, LayoutGrid, ListChecks } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, Panel, PanelHeader, Well } from '@/components/ui/panel'
import { KpiRow } from '@/routes/dashboard'
import { LiveBoard } from '@/components/dashboard/live-board'
import { JobSheet } from '@/components/dashboard/job-sheet'
import { JobBoard, useBoardCards } from '@/components/dashboard/job-board'
import { ExceptionsTable } from '@/components/dashboard/exceptions-table'
import { jobs } from '@/data/mock'
import { cn } from '@/lib/utils'

/* Three ways of combining looks A, B and C on the Today screen. */

function useSelected() {
  const [ref, setRef] = useState('J-1042')
  const job = jobs.find((j) => j.ref === ref) ?? jobs.find((j) => j.ref === 'J-1042')!
  return { ref, setRef, job }
}

function VansChip() {
  return (
    <span className="caps flex h-8 items-center gap-2 rounded-md bg-surface px-3 text-muted">
      <span className="size-1.5 rounded-full bg-ok" />4 vans out
    </span>
  )
}

function Sheet({ job }: { job: ReturnType<typeof useSelected>['job'] }) {
  return (
    <div className="min-w-0 xl:sticky xl:top-0 xl:max-h-[calc(100vh-8.5rem)]">
      <JobSheet key={job.id} job={job} />
    </div>
  )
}

/** Mix 1: A as it is, with B's board one click away in the crew panel and in full on Dispatch. */
export function MixOne() {
  const s = useSelected()
  const [tab, setTab] = useState('overview')
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader eyebrow="Morning, Edem. Sunday 18 October" title="Today" aside={<VansChip />} />
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
      {tab === 'overview' ? (
        <>
          <KpiRow />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <LiveBoard withBoard onSelect={s.setRef} selectedRef={s.ref} />
              <ExceptionsTable />
            </div>
            <Sheet job={s.job} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <Panel>
            <PanelHeader icon={<ListChecks />} title="Jobs today" />
            <Well className="p-1">
              <JobBoard layout="full" onSelect={s.setRef} selectedRef={s.ref} />
            </Well>
          </Panel>
          <LiveBoard />
        </div>
      )}
    </div>
  )
}

/** Mix 2: board first. A's numbers on top, B's five-column board across the page, map and job sheet below. */
export function MixTwo() {
  const s = useSelected()
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader eyebrow="Morning, Edem. Sunday 18 October" title="Today" aside={<VansChip />} />
      <KpiRow />
      <Panel style={{ '--i': 4 } as CSSProperties}>
        <PanelHeader icon={<ListChecks />} title="Jobs today" actions={<span className="text-[12px] text-faint">Drag to move. Tap an unassigned job to send someone.</span>} />
        <Well className="p-1">
          <JobBoard layout="full" onSelect={s.setRef} selectedRef={s.ref} />
        </Well>
      </Panel>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <LiveBoard />
        <Sheet job={s.job} />
      </div>
    </div>
  )
}

/** Mix 3: A's layout and job sheet, dressed in C's calm voice. Quiet header and numbers, board in place of the stat cards. */
export function MixThree() {
  const s = useSelected()
  const cards = useBoardCards()
  const [view, setView] = useState<'board' | 'map'>('board')
  const waiting = cards.filter((c) => c.col === 'unassigned').length
  const stats = [
    { label: 'Done', value: '24 of 31' },
    { label: 'Avg. response', value: '1h 42m' },
    { label: 'Invoiced', value: '£8,420' },
    { label: 'Certs overdue', value: '7', bad: true },
  ]
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 pt-1">
      <div className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-title text-[26px] sm:text-[30px]">Today</h1>
          <p className="mt-2 text-[13px] text-muted">
            Sunday 18 October. 4 vans out, {waiting} {waiting === 1 ? 'job' : 'jobs'} waiting for someone.
          </p>
        </div>
        <dl className="flex gap-8">
          {stats.map((st) => (
            <div key={st.label}>
              <dt className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">{st.label}</dt>
              <dd className={cn('mt-1 font-mono text-[20px] font-light tabular', st.bad ? 'text-danger' : 'text-foreground')}>{st.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">{view === 'board' ? 'Jobs today' : 'Crew on the road'}</h2>
              <div className="flex gap-1.5">
                {(['map', 'board'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn('h-8 rounded-md px-3 text-[13px] transition-colors', view === v ? 'bg-white text-black' : 'bg-raised text-foreground hover:bg-[#242424]')}
                  >
                    {v === 'map' ? 'Map' : 'Board'}
                  </button>
                ))}
              </div>
            </div>
            {view === 'board' ? <JobBoard layout="lanes" onSelect={s.setRef} selectedRef={s.ref} className="-mx-1.5" /> : <LiveBoard />}
          </section>
          <section>
            <h2 className="mb-2 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">Needs a look</h2>
            <div className="flex flex-col gap-1.5">
              {[
                ['Kofi Asante', 'NICEIC registration lapses 2 Nov', 'Chasing'],
                ['J-1047', 'Ryan is 38 minutes behind at Northgate', 'Customer told'],
                ['Northgate Lettings', 'Invoice 12 days overdue, £1,840', 'Reminder sent'],
              ].map(([who, what, state]) => (
                <div key={what} className="flex items-center gap-4 rounded-md bg-[#101010] px-3 py-3 text-[13px]">
                  <span className="w-36 shrink-0 truncate text-muted">{who}</span>
                  <span className="min-w-0 flex-1 truncate">{what}</span>
                  <span className="hidden font-mono text-[11px] text-faint sm:block">{state}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <Sheet job={s.job} />
      </div>
    </div>
  )
}
