import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useNow } from '@/hooks/use-now'
import { time } from '@/lib/format'
import { MoreHorizontal, Truck, Warehouse } from 'lucide-react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { byId, operators, jobs, sites } from '@/data/mock'
import type { Operator, OperatorState } from '@/data/model'
import { cn } from '@/lib/utils'

const stateMeta: Record<OperatorState, { label: string; tone: 'ok' | 'ember' | 'warn' | 'neutral'; stroke: string }> = {
  on_site: { label: 'On site', tone: 'ok', stroke: 'var(--ok)' },
  en_route: { label: 'En route', tone: 'ember', stroke: 'var(--ember)' },
  delayed: { label: 'Delayed', tone: 'warn', stroke: 'var(--warn)' },
  on_call: { label: 'On call', tone: 'neutral', stroke: '#4a4a4a' },
  workshop: { label: 'Workshop', tone: 'neutral', stroke: '#6b6b6b' },
  off_shift: { label: 'Off shift', tone: 'neutral', stroke: '#333' },
}

/** Where each crew card sits on the board, in percent of the board. */
const slots: Record<string, { x: number; y: number }> = {
  opr_01: { x: 19, y: 47 },
  opr_02: { x: 81, y: 47 },
  opr_03: { x: 33, y: 83 },
  opr_04: { x: 67, y: 83 },
}
const yard = { x: 50, y: 15 }

/** Orthogonal wire from the yard to a crew card, in pixels. */
function connector(to: { x: number; y: number }, w: number, h: number) {
  const px = (v: number) => (v / 100) * w
  const py = (v: number) => (v / 100) * h
  const bus = py(to.y < 60 ? 31 : 64)
  const x0 = px(yard.x)
  const y0 = py(yard.y)
  const x1 = px(to.x)
  const y1 = py(to.y)
  const r = 8
  const dir = x1 > x0 ? 1 : -1
  return `M${x0} ${y0} V${bus - r} q0 ${r} ${dir * r} ${r} H${x1 - dir * r} q${dir * r} 0 ${dir * r} ${r} V${y1}`
}

function Wires() {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { w, h } = size
  return (
    <svg ref={ref} className="absolute inset-0 size-full" aria-hidden>
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {w > 0 &&
        operators.map((eng, i) => {
          const meta = stateMeta[eng.state]
          const d = connector(slots[eng.id], w, h)
          const moving = eng.state === 'en_route' || eng.state === 'delayed'
          const live = eng.state !== 'on_call' && eng.state !== 'off_shift'
          return (
            <g key={eng.id}>
              <path d={d} fill="none" stroke="#2a2a2a" strokeWidth={1.25} />
              {live && (
                <>
                  <path
                    d={d}
                    fill="none"
                    stroke={meta.stroke}
                    strokeOpacity={0.55}
                    strokeWidth={1.25}
                    strokeDasharray={moving ? '4 6' : undefined}
                    className={cn(moving && 'animate-dash')}
                  />
                  {/* light pulse running down the wire */}
                  <path
                    d={d}
                    fill="none"
                    stroke={meta.stroke}
                    strokeWidth={2}
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray="10 90"
                    filter="url(#glow)"
                  >
                    <animate attributeName="stroke-dashoffset" from="100" to="0" dur={`${moving ? 2.4 : 3.6}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
                  </path>
                  {moving && (
                    <circle r={3.5} fill={meta.stroke} filter="url(#glow)">
                      <animateMotion
                        dur={eng.state === 'delayed' ? '9s' : '6s'}
                        repeatCount="indefinite"
                        path={d}
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="spline"
                        keySplines="0.4 0 0.2 1"
                      />
                    </circle>
                  )}
                </>
              )}
            </g>
          )
        })}
    </svg>
  )
}

function LiveClock() {
  const now = useNow()
  return (
    <span className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md border border-line bg-surface/90 px-2 py-1 text-[11px] text-muted backdrop-blur">
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ember" />
        <span className="relative size-1.5 rounded-full bg-ember" />
      </span>
      Live
      <span className="font-mono text-foreground tabular">{time(new Date(now).toISOString(), true)}</span>
    </span>
  )
}

function CrewCard({ eng, className }: { eng: Operator; className?: string }) {
  const job = byId(jobs, eng.currentJobId)
  const site = byId(sites, job?.siteId)
  const meta = stateMeta[eng.state]
  return (
    <div className={cn('w-[208px] rounded-lg border border-line-strong bg-surface/95 p-1 shadow-xl shadow-black/50 backdrop-blur', className)}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Avatar initials={eng.initials} className="size-5 text-[9px]" />
        <span className="truncate text-[13px]">{eng.name}</span>
        <Badge tone={meta.tone} dot className="ml-auto">
          {meta.label}
        </Badge>
      </div>
      <div className="rounded-md border border-line bg-inset text-[12px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-muted">Job</span>
          {job ? (
            <Link to={`/jobs/${job.id}`} className="font-mono text-foreground hover:text-ember">
              {job.ref}
            </Link>
          ) : (
            <span className="text-faint">Unassigned</span>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-2 py-1.5">
          <span className="text-muted">{eng.etaMinutes ? 'ETA' : 'Site'}</span>
          <span className="font-mono">
            {eng.etaMinutes ? (
              <>
                {eng.etaMinutes}
                <span className="text-muted">min</span>
              </>
            ) : (
              (site?.postcode ?? 'Yard')
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

export function LiveBoard() {
  const out = operators.filter((e) => e.state !== 'on_call' && e.state !== 'off_shift').length
  return (
    <Panel>
      <PanelHeader
        icon={<Truck />}
        title="Crew on the road"
        actions={
          <>
            <Button variant="outline" size="xs" asChild>
              <Link to="/schedule">Open schedule</Link>
            </Button>
            <Button variant="outline" size="icon-sm" className="size-7" aria-label="Board options">
              <MoreHorizontal />
            </Button>
          </>
        }
      />
      <Well className="dot-grid relative hidden h-[400px] overflow-hidden sm:block [background-color:#0a0a0a]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,#ff6a1a0d,transparent_70%)]" />
        <LiveClock />

        <Wires />

        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${yard.x}%`, top: `${yard.y}%` }}>
          <div className="w-[228px] rounded-lg border border-line-strong bg-surface p-1 shadow-xl shadow-black/50">
            <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
              <Warehouse className="size-4 text-muted" />
              Yard, Trafford Park
              <span className="relative ml-auto flex size-2">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ok" />
                <span className="relative size-2 rounded-full bg-ok" />
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-line bg-inset px-2 py-1.5 text-[12px]">
              <span className="text-muted">Vans out</span>
              <span className="font-mono">
                {out}
                <span className="text-muted"> / {operators.length}</span>
              </span>
            </div>
          </div>
        </div>

        {operators.map((eng) => (
          <div
            key={eng.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${slots[eng.id].x}%`, top: `${slots[eng.id].y}%` }}
          >
            <CrewCard eng={eng} />
          </div>
        ))}
      </Well>

      <div className="grid gap-1.5 sm:hidden">
        {operators.map((eng) => (
          <CrewCard key={eng.id} eng={eng} className="w-full" />
        ))}
      </div>
    </Panel>
  )
}
