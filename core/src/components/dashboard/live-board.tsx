import { useState } from 'react'
import { JobBoard } from '@/components/dashboard/job-board'
import { CrewMap } from '@/components/dashboard/crew-map'
import { Link } from 'react-router'
import { useNow } from '@/hooks/use-now'
import { clock, operatorState } from '@kit'
import { Truck } from 'lucide-react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import type { Book } from '@/data/ardent'
import type { Operator } from '@/data/model'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

function LiveClock() {
  const now = useNow()
  return (
    <span className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md bg-surface/90 px-2 py-1 text-[11px] text-muted backdrop-blur">
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ok" />
        <span className="relative size-1.5 rounded-full bg-ok" />
      </span>
      <span className="caps text-faint">Live</span>
      <span className="font-mono text-foreground tabular">{clock(new Date(now).toISOString(), true)}</span>
    </span>
  )
}

function CrewCard({ eng, book, className }: { eng: Operator; book: Book; className?: string }) {
  const job = find(book.jobs, eng.currentJobId)
  const site = find(book.sites, job?.siteId)
  const meta = operatorState[eng.state]
  return (
    <div className={cn('w-[208px] rounded-lg bg-surface/95 p-1 shadow-xl shadow-black/50 backdrop-blur', className)}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Avatar initials={eng.initials} className="size-5 text-[9px]" />
        <span className="truncate text-[13px]">{eng.name}</span>
        <Badge tone={meta.tone} dot className="ml-auto">
          {meta.label}
        </Badge>
      </div>
      <div className="rounded-md bg-inset text-[12px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-muted">Job</span>
          {job ? (
            <Link to={`/jobs/${job.id}`} className="font-mono text-foreground hover:text-white">
              {job.ref}
            </Link>
          ) : (
            <span className="text-faint">Unassigned</span>
          )}
        </div>
        <div className="flex items-center justify-between border-t px-2 py-1.5">
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

/** Crew map, with an optional switch to today's job board in the same panel. */
export function LiveBoard({ book, withBoard, onSelect, selectedId }: { book: Book; withBoard?: boolean; onSelect?: (id: string) => void; selectedId?: string }) {
  const [view, setView] = useState<'map' | 'board'>('map')
  return (
    <Panel>
      <PanelHeader
        icon={<Truck />}
        title={view === 'map' ? 'Crew on the road' : 'Jobs today'}
        actions={
          <>
            {withBoard && (
              <div className="mr-1 flex gap-1">
                {(['map', 'board'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn('h-7 rounded-md px-2.5 text-xs transition-colors', view === v ? 'bg-white text-black' : 'bg-raised text-foreground hover:bg-[#222]')}
                  >
                    {v === 'map' ? 'Map' : 'Board'}
                  </button>
                ))}
              </div>
            )}
            <Button variant="outline" size="xs" asChild>
              <Link to="/schedule">Open schedule</Link>
            </Button>
          </>
        }
      />
      {view === 'board' ? (
        <Well className="min-h-[400px] p-1">
          <JobBoard book={book} layout="lanes" onSelect={onSelect} selectedId={selectedId} />
        </Well>
      ) : (
      <>
      <Well className="relative hidden h-[480px] overflow-hidden sm:block">
        <LiveClock />
        <CrewMap operators={book.operators} jobs={book.jobs} sites={book.sites} onSelect={onSelect} />
      </Well>

      <div className="grid gap-1.5 sm:hidden">
        {book.operators.map((eng) => (
          <CrewCard key={eng.id} eng={eng} book={book} className="w-full" />
        ))}
      </div>
      </>
      )}
    </Panel>
  )
}
