import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { clock, dayDate, longDate, ukDay, ukToIso } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Icon } from '@/components/layout/icons'
import { autoAssign, slotDay, type Slot } from '@/components/ardent/book-plan'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { Monogram } from '@/components/ardent/people-parts'
import { dayParts, hoursBetween, hoursWord, rangeWord } from '@/components/ardent/people-kit'
import { useArdent, useBook, type Book } from '@/data/ardent'
import type { Job } from '@/data/model'
import { useNow } from '@/hooks/use-now'
import { act } from '@/lib/act'
import { addDays, find, isDone, onDay, today, weekStart } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * The diary: the week by crew member, from the booked jobs. Drag a job to
 * another day or person to rebook it; open a day to move it by the hour.
 */

/** A working week is five eight-hour days, the same measure Today uses. */
const WEEK_HOURS = 40
const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const say = (n: number) => words[n] ?? String(n)

/** A job being dragged, and whose row it was picked up from. */
type Drag = { jobId: string; from?: string; grab: number; hours: number }
/** Holds the job in hand between drag start and drop. */
type Hand = { get(): Drag | null; set(d: Drag | null): void }

const navButton = 'flex size-[34px] items-center justify-center rounded-lg bg-surface text-foreground outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60'

export function Schedule() {
  const { client } = useArdent()
  const { data: book } = useBook()
  const [params, setParams] = useSearchParams()
  const now = today()
  const mon = weekStart(params.get('w') ?? now)
  const focus = params.get('d') ?? undefined
  const held = useRef<Drag | null>(null)
  const drag = useMemo<Hand>(() => ({ get: () => held.current, set: (d) => void (held.current = d) }), [])

  const go = (next: { w?: string; d?: string }) => {
    const p = new URLSearchParams()
    if (next.w && next.w !== weekStart(now)) p.set('w', next.w)
    if (next.d) p.set('d', next.d)
    setParams(p)
  }

  /** Rebook a job: keep its length, put it on `day` at `hhmm`, and swap the person it was dragged from for `to`. */
  const rebook = (d: Drag, to: string | undefined, day: string, hhmm?: string) => {
    const job = find(book?.jobs, d.jobId)
    if (!job || !book) return
    const sameDay = ukDay(job.start) === day
    const start = sameDay && !hhmm ? job.start : ukToIso(day, hhmm ?? clock(job.start))
    const end = new Date(Date.parse(start) + (Date.parse(job.end) - Date.parse(job.start))).toISOString()
    let crew = job.operatorIds
    if (to) crew = d.from ? crew.map((x) => (x === d.from ? to : x)) : [to]
    else if (d.from) crew = crew.filter((x) => x !== d.from)
    crew = [...new Set(crew)]
    if (start === job.start && crew.join() === job.operatorIds.join()) return
    const who = to ? find(book.operators, to)?.name.split(' ')[0] : undefined
    const when = `${dayDate(`${day}T12:00:00Z`)} at ${clock(start)}`
    void act(client.jobs.update(job.id, { start, end, operatorIds: crew }), who ? `${job.ref} with ${who}, ${when}` : crew.length ? `${job.ref} moved to ${when}` : `${job.ref} has nobody on it, ${when}`)
  }

  const days = book ? weekDays(book, mon) : []
  const stats = book ? weekStats(book, mon, now) : undefined

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Diary' }]} />
      <PageHead
        title="Diary"
        book={book}
        className="pb-0"
        sub={stats ? sentence(stats) : ' '}
        figures={
          stats && [
            { label: 'Jobs this week', value: stats.jobs },
            { label: 'Crew booked', value: stats.booked, unit: '%' },
            { label: 'Free slots', value: stats.free },
            { label: 'No crew yet', value: stats.nobody, tone: stats.nobody ? 'warn' : undefined },
          ]
        }
      />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {focus ? (
            <>
              <button type="button" className={navButton} aria-label="Day before" onClick={() => go({ w: weekStart(addDays(focus, -1)), d: addDays(focus, -1) })}>
                ‹
              </button>
              <span className="min-w-[13ch] text-center font-mono text-[14px] uppercase">{longDate(`${focus}T12:00:00Z`)}</span>
              <button type="button" className={navButton} aria-label="Day after" onClick={() => go({ w: weekStart(addDays(focus, 1)), d: addDays(focus, 1) })}>
                ›
              </button>
              <button type="button" className={cn(navButton, 'ml-1 w-auto px-3.5 text-[13px]')} onClick={() => go({ w: weekStart(focus) })}>
                Back to the week
              </button>
            </>
          ) : (
            <>
              <button type="button" className={navButton} aria-label="Last week" onClick={() => go({ w: addDays(mon, -7) })}>
                ‹
              </button>
              <span className="min-w-[13ch] text-center font-mono text-[14px]">{rangeWord(mon, addDays(mon, days.length - 1 || 5))}</span>
              <button type="button" className={navButton} aria-label="Next week" onClick={() => go({ w: addDays(mon, 7) })}>
                ›
              </button>
              {mon !== weekStart(now) && (
                <button type="button" className={cn(navButton, 'ml-1 w-auto px-3.5 text-[13px]')} onClick={() => go({})}>
                  This week
                </button>
              )}
            </>
          )}
          <span className="ml-auto hidden text-[13px] text-muted md:inline">{focus ? 'Drag a job along a row to change its time, or onto another row to give it to someone else.' : 'Drag a job to another day or person to rebook it. Open a day to move jobs by the hour.'}</span>
        </div>

        {!book ? (
          <div className="h-[420px] animate-pulse rounded-[14px] bg-surface/60" />
        ) : focus ? (
          <DayView book={book} day={focus} drag={drag} rebook={rebook} />
        ) : (
          <>
            <WeekGrid book={book} days={days} drag={drag} rebook={rebook} openDay={(d) => go({ w: mon, d })} />
            <WeekAgenda book={book} days={days} openDay={(d) => go({ w: mon, d })} />
            <Elsewhere book={book} days={days} drag={drag} />
          </>
        )}
      </section>
    </div>
  )
}

/* ---------- The week's numbers, from the booked jobs ---------- */

interface WeekStats {
  jobs: number
  crewOn: number
  booked: number
  free: number
  nobody: number
}

const live = (book: Book) => book.jobs.filter((j) => j.status !== 'cancelled')

/** Hours someone is booked for on a day. */
const hoursOn = (book: Book, day: string, opId: string) => live(book).filter((j) => j.operatorIds.includes(opId) && onDay(j.start, day)).reduce((s, j) => s + hoursBetween(j.start, j.end), 0)

/** Monday to Saturday, and Sunday too when something is booked on it. */
function weekDays(book: Book, mon: string) {
  const days = Array.from({ length: 6 }, (_, i) => addDays(mon, i))
  const sun = addDays(mon, 6)
  return live(book).some((j) => onDay(j.start, sun)) ? [...days, sun] : days
}

function weekStats(book: Book, mon: string, now: string): WeekStats {
  const all = weekDays(book, mon)
  const weekdays = all.slice(0, 5)
  const jobs = live(book).filter((j) => all.some((d) => onDay(j.start, d)))
  const crew = book.operators
  const hours = crew.reduce((s, o) => s + weekdays.reduce((h, d) => h + hoursOn(book, d, o.id), 0), 0)
  // A free slot is someone with half a day or more open on a weekday still to come.
  const free = weekdays.filter((d) => d >= now).reduce((s, d) => s + crew.filter((o) => hoursOn(book, d, o.id) <= 4).length, 0)
  return {
    jobs: jobs.length,
    crewOn: new Set(jobs.flatMap((j) => j.operatorIds)).size,
    booked: Math.round((hours / Math.max(1, crew.length * WEEK_HOURS)) * 100),
    free,
    nobody: jobs.filter((j) => !j.operatorIds.length && !isDone(j)).length,
  }
}

function sentence(s: WeekStats) {
  if (!s.jobs) return 'Nothing booked this week yet.'
  const head = `${s.jobs} ${s.jobs === 1 ? 'job' : 'jobs'} across ${s.crewOn} of the crew this week`
  if (!s.nobody) return `${head}, and every one has someone on it.`
  return `${head}. ${say(s.nobody)} ${s.nobody === 1 ? 'has' : 'have'} nobody on ${s.nobody === 1 ? 'it' : 'them'} yet.`
}

/* ---------- A job in a day cell ---------- */

/** Ten minutes past the booked start with nobody on site yet. */
const LATE_AFTER = 10 * 60_000

function tileState(job: Job, now = Date.now()) {
  if (isDone(job)) return 'done' as const
  if (!job.operatorIds.length) return 'need' as const
  if (job.status === 'on_site') return 'live' as const
  if ((job.status === 'booked' || job.status === 'en_route') && Date.parse(job.start) < now - LATE_AFTER) return 'late' as const
  if (job.status === 'en_route') return 'road' as const
  if (job.status === 'paused') return 'paused' as const
  return 'booked' as const
}

const dotFor = { done: 'bg-faint', live: 'bg-ok', road: 'bg-info', late: 'bg-danger', paused: 'bg-warn', need: 'bg-warn', booked: '' } as const
const stateWord = { done: 'done', live: 'on site', road: 'on the road', late: 'running late', paused: 'paused', need: 'nobody on it yet', booked: 'booked' } as const
/** Each block takes its state's colour, so a late job stands out without reading it. */
const fillFor = {
  done: 'bg-raised',
  live: 'bg-ok/[0.16] hover:bg-ok/[0.22]',
  road: 'bg-info/[0.14] hover:bg-info/[0.2]',
  late: 'tile-late',
  paused: 'bg-warn/[0.14] hover:bg-warn/[0.2]',
  need: 'bg-raised hover:bg-[#242424]',
  booked: 'bg-raised hover:bg-[#242424]',
} as const

function JobTile({ job, from, drag, extra }: { job: Job; from?: string; drag: Hand; extra?: string }) {
  const st = tileState(job)
  const when = st === 'need' && job.priority === 'emergency' ? 'ASAP' : clock(job.start)
  const movable = st !== 'done'
  return (
    <Link
      to={`/jobs/${job.id}`}
      draggable={movable}
      onDragStart={(e) => {
        drag.set({ jobId: job.id, from, grab: 0, hours: hoursBetween(job.start, job.end) })
        e.dataTransfer.setData('text/plain', job.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => drag.set(null)}
      aria-label={`${job.ref} ${job.title}, ${when}, ${stateWord[st]}`}
      className={cn(
        'flex min-w-0 flex-col gap-[3px] rounded-[8px] px-2.5 py-[9px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
        fillFor[st],
        st === 'done' && 'opacity-50 hover:opacity-80',
        movable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <span className="flex items-center justify-between gap-1.5">
        <span className={cn('truncate font-mono text-[11px] whitespace-pre', st === 'need' ? 'text-warn' : 'text-muted')}>
          {when}
          {'  '}
          {job.ref}
        </span>
        {dotFor[st] && <span className={cn('size-1.5 shrink-0 rounded-full', dotFor[st])} />}
      </span>
      <span className="line-clamp-2 text-[12px] leading-4 text-foreground">{job.title}</span>
      {extra && <span className="truncate font-mono text-[11px] tracking-[.08em] text-muted">{extra}</span>}
    </Link>
  )
}

/* ---------- The week grid, from a tablet up ---------- */

function WeekGrid({ book, days, drag, rebook, openDay }: { book: Book; days: string[]; drag: Hand; rebook: (d: Drag, to: string | undefined, day: string) => void; openDay: (d: string) => void }) {
  const now = today()
  const [over, setOver] = useState<string>()
  const jobs = live(book).sort((a, b) => a.start.localeCompare(b.start))
  const cols = { gridTemplateColumns: `170px repeat(${days.length}, minmax(0, 1fr))` }
  const nobody = jobs.filter((j) => !j.operatorIds.length && days.some((d) => onDay(j.start, d)))
  const rows: { id?: string; initials: string; name: string; meta: string }[] = [
    ...book.operators.map((o) => ({ id: o.id, initials: o.initials, name: o.name, meta: `${hoursWord(days.reduce((s, d) => s + hoursOn(book, d, o.id), 0))} booked` })),
    { initials: '--', name: 'Nobody yet', meta: `${nobody.length} ${nobody.length === 1 ? 'job' : 'jobs'}` },
  ]

  const cell = (row: string | undefined, day: string) => {
    const key = `${row ?? '-'}|${day}`
    return {
      key,
      onDragOver: (e: DragEvent) => {
        if (!drag.get()) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (over !== key) setOver(key)
      },
      onDragLeave: () => over === key && setOver(undefined),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setOver(undefined)
        const d = drag.get()
        drag.set(null)
        if (d) rebook(d, row, day)
      },
    }
  }

  return (
    <Card className="hidden overflow-x-auto px-[18px] pt-1 pb-2.5 md:block">
      <div className={cn(days.length > 6 ? 'min-w-[1180px]' : 'min-w-[1060px]')} onDragEnd={() => setOver(undefined)}>
        <div className="grid gap-2 pt-3.5 pb-3" style={cols}>
          <span />
          {days.map((d) => {
            const { name, date } = dayParts(d)
            const isToday = d === now
            return (
              <button
                key={d}
                type="button"
                onClick={() => openDay(d)}
                title="Open this day by the hour"
                className={cn('flex items-baseline gap-2 rounded-md px-2 py-1 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring/60', isToday ? 'text-foreground' : 'text-muted')}
              >
                <span className={cn('cap', isToday && 'text-foreground')}>{isToday ? 'Today' : name}</span>
                <span className="font-mono text-[16px]">{date}</span>
              </button>
            )
          })}
        </div>
        <div className="rows">
          {rows.map((r) => (
            <div key={r.id ?? 'nobody'} className="grid gap-2 py-2.5" style={cols}>
              <div className="flex items-start gap-3 pt-1">
                <Monogram tone={r.id ? undefined : 'warn'}>{r.initials}</Monogram>
                <span className="flex min-w-0 flex-col gap-[3px]">
                  {r.id ? (
                    <Link to="/crew" className="truncate text-[13px] font-medium outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="truncate text-[13px] font-medium">{r.name}</span>
                  )}
                  <span className="font-mono text-[11px] tracking-[.1em] text-muted uppercase">{r.meta}</span>
                </span>
              </div>
              {days.map((d) => {
                const here = jobs.filter((j) => onDay(j.start, d) && (r.id ? j.operatorIds.includes(r.id) : !j.operatorIds.length))
                const c = cell(r.id, d)
                return (
                  <div
                    key={c.key}
                    onDragOver={c.onDragOver}
                    onDragLeave={c.onDragLeave}
                    onDrop={c.onDrop}
                    className={cn('flex min-h-[92px] min-w-0 flex-col gap-1.5 rounded-[10px] p-1.5 transition-colors', d === now && 'bg-white/[0.035]', over === c.key && 'bg-white/[0.08]')}
                  >
                    {here.map((j) => (
                      <JobTile key={j.id} job={j} from={r.id} drag={drag} />
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

/* ---------- The week as a list, on a phone ---------- */

function WeekAgenda({ book, days, openDay }: { book: Book; days: string[]; openDay: (d: string) => void }) {
  const now = today()
  const jobs = live(book).sort((a, b) => a.start.localeCompare(b.start))
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {days.map((d) => {
        const here = jobs.filter((j) => onDay(j.start, d))
        const { name, date } = dayParts(d)
        return (
          <Card key={d} className={cn('p-4', d === now && 'bg-[#161616]')}>
            <button type="button" onClick={() => openDay(d)} className="flex w-full items-baseline gap-2 pb-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
              <span className={cn('cap', d === now && 'text-foreground')}>{d === now ? 'Today' : name}</span>
              <span className="font-mono text-[16px]">{date}</span>
              <span className="ml-auto font-mono text-[11px] text-muted">{here.length ? `${here.length} ${here.length === 1 ? 'JOB' : 'JOBS'}` : 'NOTHING BOOKED'}</span>
            </button>
            <ul className="rows">
              {here.map((j) => {
                const st = tileState(j)
                const crew = j.operatorIds.map((id) => find(book.operators, id)?.initials).filter(Boolean)
                return (
                  <li key={j.id}>
                    <Link to={`/jobs/${j.id}`} className={cn('flex items-center gap-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60', st === 'done' && 'opacity-50')}>
                      <span className={cn('w-11 shrink-0 font-mono text-[12px]', st === 'need' ? 'text-warn' : 'text-muted')}>{st === 'need' && j.priority === 'emergency' ? 'ASAP' : clock(j.start)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{j.title}</span>
                        <span className="mt-0.5 block font-mono text-[11px] tracking-[.08em] text-muted uppercase">
                          {j.ref}
                          {'   '}
                          {crew.length ? crew.join(' ') : <span className="text-warn">Nobody yet</span>}
                        </span>
                      </span>
                      {dotFor[st] && <span className={cn('size-1.5 shrink-0 rounded-full', dotFor[st])} />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}

/** Jobs with nobody on them that sit outside this week, ready to drag in. */
function Elsewhere({ book, days, drag }: { book: Book; days: string[]; drag: Hand }) {
  const waiting = live(book)
    .filter((j) => !j.operatorIds.length && !isDone(j) && !days.some((d) => onDay(j.start, d)))
    .sort((a, b) => a.start.localeCompare(b.start))
  if (!waiting.length) return null
  return (
    <Card>
      <SectionHead title={`Nobody on these yet, other weeks · ${waiting.length}`} aside={<span className="hidden md:inline">Drag one onto a day above, or let Auto-assign find a gap</span>} />
      <div className="grid grid-cols-1 items-start gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
        {waiting.map((j) => (
          <WaitingCard key={j.id} book={book} job={j} drag={drag} />
        ))}
      </div>
    </Card>
  )
}

/* ---------- One day by the hour ---------- */

const START = 7
const END = 19
const HOURS = Array.from({ length: END - START }, (_, i) => START + i)
const SNAP = 0.25
const hourOf = (iso: string) => {
  const [h, m] = clock(iso).split(':').map(Number)
  return h + m / 60
}
const pct = (h: number) => ((h - START) / (END - START)) * 100
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

function DayView({ book, day, drag, rebook }: { book: Book; day: string; drag: Hand; rebook: (d: Drag, to: string | undefined, day: string, hhmm?: string) => void }) {
  const nowMs = useNow(15_000)
  const NOW = hourOf(new Date(nowMs).toISOString())
  const isToday = day === today()
  const [ghost, setGhost] = useState<{ op: string; at: number; hours: number } | null>(null)
  const jobs = live(book).filter((j) => onDay(j.start, day))
  const waiting = live(book)
    .filter((j) => !j.operatorIds.length && !isDone(j))
    .sort((a, b) => a.start.localeCompare(b.start))

  const hourAt = (e: DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const raw = START + ((e.clientX - rect.left) / rect.width) * (END - START) - (drag.get()?.grab ?? 0)
    const hours = drag.get()?.hours ?? 1
    return Math.min(END - hours, Math.max(START, Math.round(raw / SNAP) * SNAP))
  }
  const start = (e: DragEvent, job: Job, from: string | undefined) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const row = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
    drag.set({ jobId: job.id, from, grab: ((e.clientX - rect.left) / row.width) * (END - START), hours: hoursBetween(job.start, job.end) })
    e.dataTransfer.setData('text/plain', job.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <>
      <Card className="overflow-x-auto px-[18px] pt-1 pb-2.5">
        <div className="min-w-[960px]" onDragEnd={() => setGhost(null)}>
          <div className="grid grid-cols-[170px_1fr] gap-2 pt-3.5 pb-3">
            <span className="cap self-center">Crew</span>
            <div className="relative h-6">
              {HOURS.map((h) => (
                <span key={h} className="absolute top-1/2 -translate-y-1/2 pl-1.5 font-mono text-[11px] text-muted" style={{ left: `${pct(h)}%` }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
              {isToday && NOW > START && NOW < END && (
                <span className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded bg-ember px-1.5 py-0.5 font-mono text-[11px] font-medium text-black" style={{ left: `${pct(NOW)}%` }}>
                  {clock(new Date(nowMs).toISOString())}
                </span>
              )}
            </div>
          </div>
          <div className="rows">
            {book.operators.map((o) => {
              const mine = jobs.filter((j) => j.operatorIds.includes(o.id))
              return (
                <div key={o.id} className="grid grid-cols-[170px_1fr] gap-2 py-2.5">
                  <div className="flex items-center gap-3">
                    <Monogram>{o.initials}</Monogram>
                    <span className="flex min-w-0 flex-col gap-[3px]">
                      <span className="truncate text-[13px] font-medium">{o.name}</span>
                      <span className="font-mono text-[11px] tracking-[.1em] text-muted uppercase">{hoursWord(hoursOn(book, day, o.id))} booked</span>
                    </span>
                  </div>
                  <div
                    className="relative min-h-[70px] rounded-[10px] bg-inset"
                    onDragOver={(e) => {
                      const held = drag.get()
                      if (!held) return
                      e.preventDefault()
                      const at = hourAt(e)
                      if (!ghost || ghost.op !== o.id || ghost.at !== at) setGhost({ op: o.id, at, hours: held.hours })
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const d = drag.get()
                      const at = hourAt(e)
                      drag.set(null)
                      setGhost(null)
                      if (d) rebook(d, o.id, day, hhmm(at))
                    }}
                  >
                    {HOURS.map((h) => (
                      <span key={h} className="absolute inset-y-0 w-px bg-line/70" style={{ left: `${pct(h)}%` }} />
                    ))}
                    {isToday && NOW > START && <span className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[10px] bg-black/30" style={{ width: `${Math.min(100, pct(NOW))}%` }} />}
                    {isToday && NOW > START && NOW < END && <span className="pointer-events-none absolute inset-y-0 z-10 w-px bg-ember/70" style={{ left: `${pct(NOW)}%` }} />}
                    {ghost?.op === o.id && (
                      <span className="pointer-events-none absolute inset-y-1.5 z-20 flex items-center rounded-[8px] bg-white/[0.1] px-2 font-mono text-[11px] text-foreground" style={{ left: `${pct(ghost.at)}%`, width: `${pct(ghost.at + ghost.hours) - pct(ghost.at)}%` }}>
                        {hhmm(ghost.at)}
                      </span>
                    )}
                    {mine.map((j) => {
                      const st = tileState(j)
                      const left = pct(Math.max(START, hourOf(j.start)))
                      const width = Math.max(4, pct(Math.min(END, hourOf(j.end))) - left)
                      return (
                        <Link
                          key={j.id}
                          to={`/jobs/${j.id}`}
                          draggable={st !== 'done'}
                          onDragStart={(e) => start(e, j, o.id)}
                          className={cn(
                            'absolute inset-y-1.5 flex flex-col justify-center overflow-hidden rounded-[8px] px-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
                            fillFor[st],
                            st === 'done' ? 'opacity-50' : 'cursor-grab active:cursor-grabbing',
                          )}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          <span className="flex items-center gap-1.5 truncate font-mono text-[11px] text-muted">
                            {dotFor[st] && <span className={cn('size-1.5 shrink-0 rounded-full', dotFor[st])} />}
                            {j.ref}
                            {st === 'late' && <span className="text-danger">LATE</span>}
                          </span>
                          <span className="truncate text-[12px]">{j.title}</span>
                          <span className="truncate font-mono text-[11px] text-muted">
                            {clock(j.start)} to {clock(j.end)}
                            {find(book.sites, j.siteId)?.postcode ? `  ·  ${find(book.sites, j.siteId)?.postcode}` : ''}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHead title={`Nobody on these yet · ${waiting.length}`} aside={waiting.length ? <span className="hidden md:inline">Drag one onto someone's row, or let Auto-assign find a gap</span> : undefined} />
        {waiting.length ? (
          <div className="grid grid-cols-1 items-start gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
            {waiting.map((j) => (
              <WaitingCard key={j.id} book={book} job={j} drag={drag} when={onDay(j.start, day) ? 'this day' : undefined} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-[13px] text-muted">Every job has someone on it.</p>
        )}
      </Card>
    </>
  )
}

/* ---------- A job nobody is on yet, with Auto-assign ---------- */

const wantedWord = (iso: string) => `wanted ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}`

function WaitingCard({ book, job, drag, when }: { book: Book; job: Job; drag: Hand; when?: string }) {
  const { client } = useArdent()
  const [pick, setPick] = useState<Slot | null>()
  const [busy, setBusy] = useState(false)
  const who = pick ? find(book.operators, pick.opId) : undefined

  const book_ = async () => {
    if (!pick || !who) return
    setBusy(true)
    const done = await act(client.jobs.update(job.id, { start: pick.start, end: pick.end, operatorIds: [pick.opId] }), `${job.ref} with ${who.name.split(' ')[0]}, ${slotDay(pick.start)} at ${clock(pick.start)}`)
    setBusy(false)
    if (done) setPick(undefined)
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[8px] bg-raised px-2.5 py-[9px]">
      <Link
        to={`/jobs/${job.id}`}
        draggable
        onDragStart={(e) => {
          drag.set({ jobId: job.id, grab: 0, hours: hoursBetween(job.start, job.end) })
          e.dataTransfer.setData('text/plain', job.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => drag.set(null)}
        className="flex min-w-0 cursor-grab flex-col gap-[3px] rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing"
      >
        <span className="flex items-center justify-between gap-1.5 font-mono text-[11px] whitespace-pre text-warn">
          {job.priority === 'emergency' ? 'ASAP' : clock(job.start)}
          {'  '}
          {job.ref}
          <Icon name="forward" className="ml-auto size-3 text-muted" />
        </span>
        <span className="truncate text-[12px]">{job.title}</span>
        <span className="truncate font-mono text-[11px] tracking-[.08em] text-muted uppercase">
          {find(book.customers, job.customerId)?.name}
          {'  '}
          {when ?? wantedWord(job.start)}
        </span>
      </Link>

      {pick === undefined ? (
        <button
          type="button"
          onClick={() => setPick(autoAssign(book, job) ?? null)}
          className="flex h-8 items-center justify-center gap-2 rounded-[6px] bg-white/[0.06] text-[12px] text-foreground outline-none transition-colors hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Icon name="crew" className="size-3.5 text-muted" />
          Auto-assign
        </button>
      ) : pick === null ? (
        <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
          <span>Nobody with the trade has a gap in the next three weeks.</span>
          <button type="button" className="shrink-0 text-foreground underline-offset-2 hover:underline" onClick={() => setPick(undefined)}>
            Close
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-[6px] bg-inset px-2.5 py-2">
          <span className="text-[12px] text-foreground">
            {who?.name ?? 'Someone'}, {slotDay(pick.start)} {clock(pick.start)} to {clock(pick.end)}
          </span>
          <span className="text-[11.5px] leading-4 text-muted">{pick.why}</span>
          <span className="flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={book_}
              className="h-7 flex-1 rounded-[6px] bg-foreground text-[12px] font-medium text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              Book it
            </button>
            <button type="button" onClick={() => setPick(undefined)} className="h-7 rounded-[6px] bg-white/[0.06] px-3 text-[12px] text-foreground outline-none hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-ring/60">
              Not this
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
