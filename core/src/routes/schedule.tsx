import { Link } from 'react-router'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { byId, engineers, jobs, sites } from '@/data/mock'
import { statusMeta, time } from '@/lib/format'
import { cn } from '@/lib/utils'

const START = 7
const END = 18
const HOURS = Array.from({ length: END - START }, (_, i) => START + i)
const today = '2026-10-18'
const NOW = 10 + 3 / 60

const hourOf = (iso: string) => {
  const d = new Date(iso)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}
const pct = (h: number) => ((h - START) / (END - START)) * 100

const toneClass: Record<string, string> = {
  ok: 'border-ok/40 bg-ok/10 [--bar:var(--ok)]',
  ember: 'border-ember/40 bg-ember/10 [--bar:var(--ember)]',
  info: 'border-info/40 bg-info/10 [--bar:var(--info)]',
  warn: 'border-warn/40 bg-warn/10 [--bar:var(--warn)]',
  neutral: 'border-line-strong bg-raised [--bar:#555]',
  violet: 'border-violet/40 bg-violet/10 [--bar:var(--violet)]',
  danger: 'border-danger/40 bg-danger/10 [--bar:var(--danger)]',
}

export function Schedule() {
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
            <div className="grid grid-cols-[180px_1fr] border-b border-line">
              <div className="px-3 py-2 text-[12px] text-muted">Crew</div>
              <div className="relative h-9">
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
            {engineers.map((eng) => {
              const mine = todays.filter((j) => j.engineerIds.includes(eng.id))
              return (
                <div key={eng.id} className="grid grid-cols-[180px_1fr] border-b border-line/70 last:border-0">
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
                    <span className="absolute inset-y-0 z-10 w-px bg-ember/70" style={{ left: `${pct(NOW)}%` }} />
                    {mine.map((j) => {
                      const tone = j.priority === 'emergency' ? 'danger' : statusMeta[j.status].tone
                      const left = pct(hourOf(j.start))
                      const width = pct(hourOf(j.end)) - left
                      return (
                        <Link
                          key={j.id}
                          to={`/jobs/${j.id}`}
                          className={cn(
                            'absolute inset-y-2 overflow-hidden rounded-md border px-2.5 py-1.5 transition-transform before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--bar)] hover:-translate-y-px',
                            toneClass[tone],
                          )}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          <p className="truncate text-[12px] text-foreground">
                            <span className="font-mono text-muted">{j.number}</span> {j.title}
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
    </div>
  )
}
