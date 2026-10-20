import { useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { Link } from 'react-router'
import { CalendarRange, ChevronLeft, ChevronRight, GripVertical, Inbox } from 'lucide-react'
import { clock, jobStatus, longDate, operatorState, priority as priorityMeta, shortDate, ukDay, ukToIso, window as timeWindow } from '@kit'
import { Badge } from '@/components/ui/badge'
import { Panel, PanelHeader, Well, PageHeader } from '@/components/ui/panel'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useArdent, useBook } from '@/data/ardent'
import type { Job } from '@/data/model'
import { act } from '@/lib/act'
import { addDays, find, isDone, onDay, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { useNow } from '@/hooks/use-now'

const START = 7
const END = 19
const HOURS = Array.from({ length: END - START }, (_, i) => START + i)
const SNAP = 0.25

/** UK clock hour of a moment, as a number: 09:30 is 9.5. */
const hourOf = (iso: string) => {
  const [h, m] = clock(iso).split(':').map(Number)
  return h + m / 60
}
const pct = (h: number) => ((h - START) / (END - START)) * 100
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

const toneClass: Record<string, string> = {
  ok: 'bg-ok/10 [--bar:var(--ok)]',
  ember: 'bg-ember/10 [--bar:var(--ember)]',
  info: 'bg-info/10 [--bar:var(--info)]',
  warn: 'bg-warn/10 [--bar:var(--warn)]',
  neutral: 'bg-raised [--bar:#555]',
  faint: 'bg-raised/60 [--bar:var(--fg-faint)]',
  violet: 'bg-violet/10 [--bar:var(--violet)]',
  danger: 'bg-danger/10 [--bar:var(--danger)]',
}

type Drag = { jobId: string; grab: number; hours: number }

export function Schedule() {
  const { client } = useArdent()
  const { data: book } = useBook()
  const now = useNow(15000)
  const [day, setDay] = useState(today())
  const drag = useRef<Drag | null>(null)
  const [ghost, setGhost] = useState<{ op: string; at: number; hours: number } | null>(null)
  const NOW = hourOf(new Date(now).toISOString())
  const isToday = day === today()
  const dayJobs = book?.jobs.filter((j) => onDay(j.start, day) && j.status !== 'cancelled') ?? []
  const waiting = book?.jobs.filter((j) => !j.operatorIds.length && !isDone(j) && j.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start)) ?? []

  const startDrag = (e: DragEvent, job: Job, fromBlock: boolean) => {
    const hours = (Date.parse(job.end) - Date.parse(job.start)) / 3_600_000
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const row = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
    const grab = fromBlock ? ((e.clientX - rect.left) / row.width) * (END - START) : 0
    drag.current = { jobId: job.id, grab, hours }
    e.dataTransfer.setData('text/plain', job.id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const hourAt = (e: DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const raw = START + ((e.clientX - rect.left) / rect.width) * (END - START) - (drag.current?.grab ?? 0)
    const hours = drag.current?.hours ?? 1
    return Math.min(END - hours, Math.max(START, Math.round(raw / SNAP) * SNAP))
  }
  const over = (e: DragEvent, op: string) => {
    if (!drag.current) return
    e.preventDefault()
    const at = hourAt(e)
    if (!ghost || ghost.op !== op || ghost.at !== at) setGhost({ op, at, hours: drag.current.hours })
  }
  const drop = (e: DragEvent, op: string) => {
    e.preventDefault()
    const d = drag.current
    const job = find(book?.jobs, d?.jobId)
    setGhost(null)
    drag.current = null
    if (!d || !job) return
    const at = hourAt(e)
    const start = ukToIso(day, hhmm(at))
    const end = new Date(Date.parse(start) + d.hours * 3_600_000).toISOString()
    const who = find(book?.operators, op)
    void act(client.jobs.update(job.id, { start, end, operatorIds: [op] }), `${job.ref} with ${who?.name.split(' ')[0]}, ${hhmm(at)} on ${shortDate(start)}`)
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader eyebrow="Who is where, and what is waiting. Drag a job to move it." title="Schedule" />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
          <ChevronLeft />
        </Button>
        <Button variant={isToday ? 'default' : 'outline'} size="sm" onClick={() => setDay(today())}>
          Today
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}>
          <ChevronRight />
        </Button>
        <p className="ml-2 text-[14px]">{longDate(`${day}T12:00:00Z`)}</p>
        <span className="ml-auto font-mono text-[12px] text-faint">{dayJobs.length} jobs</span>
      </div>

      <Panel>
        <PanelHeader icon={<CalendarRange />} title="The day" />
        <Well className="overflow-x-auto">
          <div className="min-w-[960px]" onDragEnd={() => setGhost(null)}>
            <div className="grid grid-cols-[190px_1fr] border-b">
              <div className="px-3 py-2 text-[12px] text-muted">Crew</div>
              <div className="relative h-9">
                {isToday && NOW > START && NOW < END && (
                  <span className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded bg-ember px-1.5 py-0.5 font-mono text-[10px] font-medium text-black shadow-[0_0_12px_var(--ember)]" style={{ left: `${pct(NOW)}%` }}>
                    {clock(new Date(now).toISOString())}
                  </span>
                )}
                {HOURS.map((h) => (
                  <span key={h} className="absolute top-1/2 -translate-y-1/2 pl-1.5 font-mono text-[11px] text-faint" style={{ left: `${pct(h)}%` }}>
                    {String(h).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
            </div>
            {book?.operators.map((eng) => {
              const mine = dayJobs.filter((j) => j.operatorIds.includes(eng.id))
              const st = operatorState[eng.state]
              return (
                <div key={eng.id} className="grid grid-cols-[190px_1fr] border-b last:border-0">
                  <div className="flex items-center gap-2.5 px-3 py-4">
                    <Avatar initials={eng.initials} className="size-7" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px]">{eng.name}</p>
                      <p className="truncate font-mono text-[11px] text-faint">
                        {eng.van}
                        {isToday && <span className="font-sans"> · {st.label}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="relative min-h-[64px]" onDragOver={(e) => over(e, eng.id)} onDrop={(e) => drop(e, eng.id)}>
                    {HOURS.map((h) => (
                      <span key={h} className="absolute inset-y-0 w-px bg-line/60" style={{ left: `${pct(h)}%` }} />
                    ))}
                    {isToday && NOW > START && (
                      <>
                        <span className="pointer-events-none absolute inset-y-0 left-0 bg-black/25" style={{ width: `${Math.min(100, pct(NOW))}%` }} />
                        {NOW < END && <span className="pointer-events-none absolute inset-y-0 z-10 w-px bg-ember/70 shadow-[0_0_8px_var(--ember)]" style={{ left: `${pct(NOW)}%` }} />}
                      </>
                    )}
                    {ghost?.op === eng.id && (
                      <span className="pointer-events-none absolute inset-y-2 z-20 flex items-center rounded-md bg-white/[0.06] px-2 font-mono text-[11px] text-foreground outline-1 outline-dashed outline-white/30" style={{ left: `${pct(ghost.at)}%`, width: `${pct(ghost.at + ghost.hours) - pct(ghost.at)}%` }}>
                        {hhmm(ghost.at)}
                      </span>
                    )}
                    {mine.map((j) => {
                      const tone = j.priority === 'emergency' ? 'danger' : jobStatus[j.status].tone
                      const left = pct(Math.max(START, hourOf(j.start)))
                      const width = Math.max(4, pct(Math.min(END, hourOf(j.end))) - left)
                      const site = find(book.sites, j.siteId)
                      return (
                        <Link
                          key={j.id}
                          to={`/jobs/${j.id}`}
                          draggable={!isDone(j)}
                          onDragStart={(e) => startDrag(e, j, true)}
                          className={cn(
                            'absolute inset-y-2 overflow-hidden rounded-md px-2.5 py-1.5 transition-transform before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--bar)] hover:-translate-y-px',
                            toneClass[tone],
                            j.priority === 'emergency' && 'hatch',
                            isDone(j) ? 'opacity-60' : 'cursor-grab active:cursor-grabbing',
                          )}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          <p className="truncate text-[12px] text-foreground">
                            <span className="font-mono text-muted">{j.ref}</span> {j.title}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted">
                            {timeWindow(j.start, j.end)} · {site?.postcode}
                          </p>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Well>
      </Panel>

      <Panel style={{ '--i': 1 } as CSSProperties}>
        <PanelHeader icon={<Inbox />} title={`Waiting for someone · ${waiting.length}`} />
        {waiting.length ? (
          <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
            {waiting.map((j) => (
              <div key={j.id} draggable onDragStart={(e) => startDrag(e, j, false)} className="group cursor-grab rounded-lg bg-inset p-3 transition-colors hover:bg-[#101010] active:cursor-grabbing">
                <div className="flex items-center gap-2">
                  <GripVertical className="size-3.5 text-faint" />
                  <span className="font-mono text-[12px] text-faint">{j.ref}</span>
                  <Badge tone={priorityMeta[j.priority].tone}>{priorityMeta[j.priority].label}</Badge>
                  <span className="ml-auto font-mono text-[11px] text-faint">{find(book?.sites, j.siteId)?.postcode}</span>
                </div>
                <Link to={`/jobs/${j.id}`} className="mt-2 block text-[13px] hover:text-white">
                  {j.title}
                </Link>
                <p className="text-[12px] text-muted">
                  {find(book?.customers, j.customerId)?.name} · wants {ukDay(j.start) === today() ? 'today' : shortDate(j.start)} {clock(j.start)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-6 text-center text-[13px] text-faint">Every job has someone on it.</p>
        )}
        <p className="px-2.5 pt-2 pb-1 text-[12px] text-faint">Drag a job onto someone's row to book it with them at that time.</p>
      </Panel>
    </div>
  )
}
