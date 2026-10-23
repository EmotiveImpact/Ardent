import type { ReactNode } from 'react'
import type { Job, JobStatus } from '@/data/model'
import { pressAgain, useHold } from '@/lib/use-hold'
import { cn } from '@/lib/utils'
import { stageColour, trackLabels } from './parts'

/*
 * Pieces for the Jobs list and the job page. Same rules as parts.tsx:
 * no borders, white and grey, hairline rows, and each stage in its own colour.
 */

/** Every stop from the first call to the money in. */
const lineStops: { key: JobStatus; label: string }[] = [
  { key: 'enquiry', label: 'Enquiry' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'booked', label: 'Booked' },
  { key: 'en_route', label: 'On the road' },
  { key: 'on_site', label: 'On site' },
  { key: 'complete', label: 'Done' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'paid', label: 'Paid' },
]

/** Where a job sits on the line, and what to call it. -1 when cancelled. */
function stopOf(job: Pick<Job, 'status'>): { at: number; label: string } {
  if (job.status === 'cancelled') return { at: -1, label: 'Cancelled' }
  if (job.status === 'paused') return { at: 4, label: 'On hold' }
  const at = lineStops.findIndex((s) => s.key === job.status)
  return { at, label: lineStops[at]?.label ?? '' }
}

/** Eight dots on a hairline: past ones in their stage colour, the current one bigger, the rest grey. */
export function MiniTrack({ job }: { job: Pick<Job, 'status'> }) {
  const { at, label } = stopOf(job)
  return (
    <span className="flex flex-col gap-[7px]">
      <span aria-hidden className="flex items-center">
        {lineStops.map((s, i) => (
          <span key={s.key} className="flex items-center">
            <span className={cn('shrink-0 rounded-full', i === at ? 'size-[9px]' : 'size-[6px]', i > at && 'bg-line-strong')} style={i <= at ? { background: stageColour[i === at && job.status === 'paused' ? 'paused' : s.key] } : undefined} />
            {i < lineStops.length - 1 && <span className={cn('mx-[3px] h-px w-[10px] xl:w-[12px]', i < at ? 'bg-muted' : 'bg-line-strong')} />}
          </span>
        ))}
      </span>
      <span className="font-mono text-[11px] tracking-[.12em]" style={{ color: at >= 0 ? stageColour[job.status] : 'var(--fg-faint)' }}>
        {label}
      </span>
    </span>
  )
}

/** A pill in the filter row: name and count. The picked one is white. */
export function FilterPill({ on, label, count, onClick }: { on: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-[34px] shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
        on ? 'bg-foreground text-background' : 'bg-surface text-foreground hover:bg-raised',
      )}
    >
      {label}
      <span className={cn('font-mono text-[12px]', on ? 'text-background/55' : 'text-muted')}>{count}</span>
    </button>
  )
}

/** A label over a value, for the facts beside the clock. */
export function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="cap">{label}</span>
      {children}
    </div>
  )
}

/**
 * The office override for finishing a job. Finishing is the engineer's call on
 * site, so this is quiet: grey, small, and it only fires after a full hold.
 */
export function OverrideHold({ label, onCommit, ms = 1400, className }: { label: string; onCommit: () => void; ms?: number; className?: string }) {
  const { progress, armed, props } = useHold({ ms, onCommit, label })
  return (
    <button
      {...props}
      className={cn(
        'relative isolate inline-flex h-[34px] touch-none items-center overflow-hidden rounded-lg bg-inset px-3.5 text-[13px] text-muted select-none outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
        armed && 'text-foreground',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 -z-10 bg-foreground/20" style={{ width: `${progress * 100}%` }} />
      {armed ? pressAgain : label}
    </button>
  )
}


/**
 * A line of times under <StageTrack>: each sits under its dot. Every cell holds
 * an invisible copy of StageTrack's label so the widths, and so the spacing, match.
 */
export function StageTimes({ times }: { times: { text: string; reached: boolean }[] }) {
  return (
    <ol aria-label="When each stop happened" className="relative -mt-1 flex justify-between">
      {trackLabels.map((label, i) => {
        const t = times[i]
        const edge = i === 0 ? 'left-0 text-left' : i === trackLabels.length - 1 ? 'right-0 text-right' : 'left-1/2 -translate-x-1/2 text-center'
        return (
          <li key={label} className="relative">
            <span aria-hidden className="cap invisible text-[11px]">{label}</span>
            <span className={cn('absolute top-0 font-mono text-[11px] whitespace-nowrap uppercase', edge, t?.reached ? 'text-muted' : 'text-faint')}>{t?.text}</span>
          </li>
        )
      })}
    </ol>
  )
}
