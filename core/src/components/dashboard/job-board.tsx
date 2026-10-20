import { useState } from 'react'
import { toast } from 'sonner'
import { clock, duration, initials } from '@kit'
import { Avatar } from '@/components/ui/avatar'
import { HoldButton } from '@/components/ui/hold-button'
import { useNow } from '@/hooks/use-now'
import { useArdent, type Book } from '@/data/ardent'
import type { Job, JobStatus, Operator } from '@/data/model'
import { act } from '@/lib/act'
import { find, laneOf, onDay, today, type Lane } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/* Today's jobs as a board. Drag a card to move the job on; tap an unassigned job to give it to someone. */

export const columns: { key: Lane; label: string; to: JobStatus }[] = [
  { key: 'unassigned', label: 'Unassigned', to: 'booked' },
  { key: 'booked', label: 'Booked', to: 'booked' },
  { key: 'en_route', label: 'En route', to: 'en_route' },
  { key: 'on_site', label: 'On site', to: 'on_site' },
  { key: 'signed_off', label: 'Signed off', to: 'complete' },
]

/** The overview has less room, so it folds the five stages into three. */
const lanes: { label: string; cols: Lane[]; to: JobStatus }[] = [
  { label: 'Waiting', cols: ['unassigned', 'booked'], to: 'booked' },
  { label: 'Out now', cols: ['en_route', 'on_site'], to: 'en_route' },
  { label: 'Signed off', cols: ['signed_off'], to: 'complete' },
]

function LiveDetail({ job, op }: { job: Job; op?: Operator }) {
  const now = useNow(1000)
  if (job.status === 'on_site') return <>{duration(Math.max(0, now - Date.parse(job.start)))}</>
  if (job.status === 'en_route' && op?.etaMinutes) return <>{op.etaMinutes}m away</>
  if (job.status === 'paused') return <span className="text-warn">Paused</span>
  return <>{clock(job.start)}</>
}

function Card({
  job,
  book,
  selected,
  onSelect,
  dragging,
  setDragging,
}: {
  job: Job
  book: Book
  selected?: boolean
  onSelect?: (id: string) => void
  dragging: boolean
  setDragging: (id: string | null) => void
}) {
  const { client } = useArdent()
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<string>()
  const site = find(book.sites, job.siteId)
  const crew = job.operatorIds.map((id) => find(book.operators, id)).filter((o): o is Operator => !!o)
  const late = crew.some((o) => o.state === 'delayed' && o.currentJobId === job.id)
  const flag = job.priority === 'emergency' ? ['Emergency', 'text-ember'] : late ? ['Running late', 'text-warn'] : job.priority === 'high' ? ['High', 'text-muted'] : null
  const unassigned = !crew.length
  // Free hands first: on call or in the workshop.
  const free = [...book.operators].sort((a, b) => Number(!['on_call', 'workshop'].includes(a.state)) - Number(!['on_call', 'workshop'].includes(b.state))).filter((o) => o.state !== 'off_shift')
  const chosen = find(book.operators, pick ?? free[0]?.id)
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', job.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(job.id)
      }}
      onDragEnd={() => setDragging(null)}
      onClick={() => {
        onSelect?.(job.id)
        if (unassigned) setOpen((o) => !o)
      }}
      className={cn(
        'animate-rise relative cursor-grab overflow-hidden rounded-md bg-[#101010] px-3 py-2.5 transition-[background-color,opacity] hover:bg-[#161616] active:cursor-grabbing',
        selected && 'bg-[#181818]',
        dragging && 'opacity-40',
      )}
    >
      {job.priority === 'emergency' && <span className="absolute inset-y-0 left-0 w-[2px] bg-ember" />}
      <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
        <span className="text-faint">{job.ref}</span>
        {flag && <span className={flag[1]}>{flag[0]}</span>}
      </div>
      <p className="mt-1 truncate text-[13px] text-foreground">{job.title}</p>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-faint tabular">
        <span className="rounded-[4px] bg-raised px-1.5 py-0.5 text-[10px] text-foreground">{site?.postcode}</span>
        <span>
          <LiveDetail job={job} op={crew[0]} />
        </span>
        <span className="ml-auto flex -space-x-1">
          {crew.length ? crew.map((o) => <Avatar key={o.id} initials={o.initials} className="size-5 text-[9px]" />) : 'No one yet'}
        </span>
      </div>
      {open && unassigned && chosen && (
        <div className="mt-2.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-1">
            {free.slice(0, 4).map((o) => (
              <button
                key={o.id}
                onClick={() => setPick(o.id)}
                className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors', chosen.id === o.id ? 'bg-foreground text-black' : 'bg-raised text-muted hover:text-foreground')}
              >
                {initials(o.name)} <span className="font-sans">{o.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
          <HoldButton
            label={`Hold to give it to ${chosen.name.split(' ')[0]}`}
            className="h-9 rounded-md"
            ms={900}
            onCommit={() => void act(client.jobs.update(job.id, { operatorIds: [chosen.id] }), `${job.ref} is with ${chosen.name}`)}
          />
        </div>
      )}
    </article>
  )
}

/**
 * `lanes` folds the board into three columns for tight spaces; `full` shows all five stages.
 * Drag a card between columns to move the job on.
 */
export function JobBoard({ book, layout, selectedId, onSelect, className }: { book: Book; layout: 'lanes' | 'full'; selectedId?: string; onSelect?: (id: string) => void; className?: string }) {
  const { client } = useArdent()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const day = today()
  const todays = book.jobs.filter((j) => onDay(j.start, day) && laneOf(j)).sort((a, b) => a.start.localeCompare(b.start))
  const groups = layout === 'full' ? columns.map((c) => ({ label: c.label, cols: [c.key], to: c.to })) : lanes

  const move = (id: string, to: JobStatus, label: string) => {
    const job = find(book.jobs, id)
    if (!job || job.status === to) return
    if (to !== 'booked' && !job.operatorIds.length) return void toast('Give the job to someone first', { description: 'Tap the card to choose who goes.' })
    void act(client.jobs.setStatus(id, to), `${job.ref} moved to ${label}`)
  }

  return (
    <div className={cn('grid gap-2', layout === 'full' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-5' : 'grid-cols-1 sm:grid-cols-3', className)}>
      {groups.map((g) => {
        const list = todays.filter((j) => g.cols.includes(laneOf(j)!))
        const waiting = g.cols.includes('unassigned') && list.some((j) => laneOf(j) === 'unassigned')
        return (
          <section
            key={g.label}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(g.label)
            }}
            onDragLeave={() => setOver((o) => (o === g.label ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              move(e.dataTransfer.getData('text/plain'), g.to, g.label)
              setOver(null)
              setDragging(null)
            }}
            className={cn('flex min-h-[200px] flex-col rounded-lg p-1.5 transition-colors', over === g.label ? 'bg-white/[0.03]' : 'bg-transparent')}
          >
            <header className="flex h-8 items-center gap-2 px-1.5">
              <h3 className="caps text-muted">{g.label}</h3>
              <span className={cn('font-mono text-[12px] tabular', waiting ? 'text-foreground' : 'text-faint')}>{list.length}</span>
            </header>
            <div className={cn('flex flex-col gap-1.5', g.cols[0] === 'signed_off' && 'opacity-50')}>
              {list.map((j) => (
                <Card key={j.id} job={j} book={book} selected={selectedId === j.id} onSelect={onSelect} dragging={dragging === j.id} setDragging={setDragging} />
              ))}
              {!list.length && <p className="py-8 text-center text-[12px] text-faint">Drop a job here</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
