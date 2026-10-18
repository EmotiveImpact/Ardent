import { Link } from 'react-router'
import { MoreHorizontal, Truck, Warehouse } from 'lucide-react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { byId, engineers, jobs, sites } from '@/data/mock'
import type { Engineer, EngineerState } from '@/data/model'
import { cn } from '@/lib/utils'

const stateMeta: Record<EngineerState, { label: string; tone: 'ok' | 'ember' | 'warn' | 'neutral'; stroke: string }> = {
  on_site: { label: 'On site', tone: 'ok', stroke: 'var(--ok)' },
  en_route: { label: 'En route', tone: 'ember', stroke: 'var(--ember)' },
  delayed: { label: 'Delayed', tone: 'warn', stroke: 'var(--warn)' },
  available: { label: 'Free', tone: 'neutral', stroke: '#4a4a4a' },
  off: { label: 'Off', tone: 'neutral', stroke: '#333' },
}

/** Where each crew card sits on the board, in percent of the board. */
const slots: Record<string, { x: number; y: number }> = {
  eng_01: { x: 19, y: 47 },
  eng_02: { x: 81, y: 47 },
  eng_03: { x: 33, y: 83 },
  eng_04: { x: 67, y: 83 },
}
const yard = { x: 50, y: 15 }

function connector(to: { x: number; y: number }) {
  const bus = to.y < 60 ? 31 : 64
  return `M${yard.x} ${yard.y + 7} V${bus} H${to.x} V${to.y - 9}`
}

function CrewCard({ eng, className }: { eng: Engineer; className?: string }) {
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
              {job.number}
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
  const out = engineers.filter((e) => e.state !== 'available' && e.state !== 'off').length
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
      <Well className="dot-grid relative hidden h-[400px] overflow-hidden sm:block">
        <span className="absolute top-3 left-3 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-muted">
          Live · updated 10:03
        </span>

        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {engineers.map((eng) => {
            const meta = stateMeta[eng.state]
            const moving = eng.state === 'en_route' || eng.state === 'delayed'
            return (
              <g key={eng.id}>
                <path d={connector(slots[eng.id])} fill="none" stroke="#2c2c2c" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
                {eng.state !== 'available' && (
                  <path
                    d={connector(slots[eng.id])}
                    fill="none"
                    stroke={meta.stroke}
                    strokeWidth={1.5}
                    strokeDasharray={moving ? '6 6' : undefined}
                    strokeOpacity={0.75}
                    vectorEffect="non-scaling-stroke"
                    className={cn(moving && 'animate-dash')}
                    style={{ filter: `drop-shadow(0 0 3px ${meta.stroke})` }}
                  />
                )}
              </g>
            )
          })}
        </svg>

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
                <span className="text-muted"> / {engineers.length}</span>
              </span>
            </div>
          </div>
        </div>

        {engineers.map((eng) => (
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
        {engineers.map((eng) => (
          <CrewCard key={eng.id} eng={eng} className="w-full" />
        ))}
      </div>
    </Panel>
  )
}
