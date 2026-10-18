import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { CalendarRange, ChevronLeft, ChevronRight, Inbox, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { byId, customers, operators, jobs, sites } from '@/data/mock'
import { priorityMeta, shortDate, statusMeta, time } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useNow } from '@/hooks/use-now'

const START = 7
const END = 18
const HOURS = Array.from({ length: END - START }, (_, i) => START + i)
const today = '2026-10-18'

const hourOf = (iso: string) => {
  const d = new Date(iso)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}
const pct = (h: number) => ((h - START) / (END - START)) * 100

const toneClass: Record<string, string> = {
  ok: 'bg-ok/10 [--bar:var(--ok)]',
  ember: 'bg-ember/10 [--bar:var(--ember)]',
  info: 'bg-info/10 [--bar:var(--info)]',
  warn: 'bg-warn/10 [--bar:var(--warn)]',
  neutral: 'bg-raised [--bar:#555]',
  violet: 'bg-violet/10 [--bar:var(--violet)]',
  danger: 'bg-danger/10 [--bar:var(--danger)]',
}

export function Schedule() {
  const now = useNow(15000)
  const NOW = hourOf(new Date(now).toISOString())
  const todays = jobs.filter((j) => j.start.startsWith(today))
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Previous day">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="sm">
          Today
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Next day">
          <ChevronRight />
        </Button>
        <p className="ml-2 text-[14px]">Sunday 18 October</p>
      </div>

      <Panel>
        <PanelHeader icon={<CalendarRange />} title="Dispatch board" />
        <Well className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[180px_1fr] border-b ">
              <div className="px-3 py-2 text-[12px] text-muted">Crew</div>
              <div className="relative h-9">
                <span
                  className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded bg-ember px-1.5 py-0.5 font-mono text-[10px] font-medium text-black shadow-[0_0_12px_var(--ember)]"
                  style={{ left: `${pct(NOW)}%` }}
                >
                  {time(new Date(now).toISOString())}
                </span>
                {HOURS.map((h) => (
                  <span
                    key={h}
                    className="absolute top-1/2 -translate-y-1/2 pl-1.5 font-mono text-[11px] text-faint"
                    style={{ left: `${pct(h)}%` }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
            </div>
            {operators.map((eng) => {
              const mine = todays.filter((j) => j.operatorIds.includes(eng.id))
              return (
                <div key={eng.id} className="grid grid-cols-[180px_1fr] border-b last:border-0">
                  <div className="flex items-center gap-2.5 px-3 py-4">
                    <Avatar initials={eng.initials} className="size-7" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px]">{eng.name}</p>
                      <p className="font-mono text-[11px] text-faint">{eng.van}</p>
                    </div>
                  </div>
                  <div className="relative">
                    {HOURS.map((h) => (
                      <span key={h} className="absolute inset-y-0 w-px bg-line/60" style={{ left: `${pct(h)}%` }} />
                    ))}
                    <span className="absolute inset-y-0 z-10 w-px bg-ember/70 shadow-[0_0_8px_var(--ember)]" style={{ left: `${pct(NOW)}%` }} />
                    <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${pct(NOW)}%` }} />
                    {mine.map((j) => {
                      const tone = j.priority === 'emergency' ? 'danger' : statusMeta[j.status].tone
                      const left = pct(hourOf(j.start))
                      const width = pct(hourOf(j.end)) - left
                      return (
                        <Link
                          key={j.id}
                          to={`/jobs/${j.id}`}
                          className={cn(
                            'absolute inset-y-2 overflow-hidden rounded-md px-2.5 py-1.5 transition-transform before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--bar)] hover:-translate-y-px',
                            toneClass[tone],
                            j.priority === 'emergency' && 'hatch',
                          )}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          <p className="truncate text-[12px] text-foreground">
                            <span className="font-mono text-muted">{j.ref}</span> {j.title}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted">
                            {time(j.start)} to {time(j.end)} · {byId(sites, j.siteId)?.postcode}
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
        <PanelHeader icon={<Inbox />} title="Waiting for a slot" />
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          {jobs
            .filter((j) => j.operatorIds.length === 0)
            .map((j) => (
              <div key={j.id} className="rounded-lg bg-inset p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] text-faint">{j.ref}</span>
                  <Badge tone={priorityMeta[j.priority].tone}>{priorityMeta[j.priority].label}</Badge>
                  <span className="ml-auto font-mono text-[11px] text-faint">{byId(sites, j.siteId)?.postcode}</span>
                </div>
                <p className="mt-2 text-[13px]">{j.title}</p>
                <p className="text-[12px] text-muted">
                  {byId(customers, j.customerId)?.name} · wants {shortDate(j.start)}
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => toast.success(`${j.ref} given to Tom Byrne`, { description: 'Best fit: free from 13:30, 6 miles away.' })}
                >
                  <UserPlus /> Auto-assign
                </Button>
              </div>
            ))}
        </div>
      </Panel>
    </div>
  )
}
