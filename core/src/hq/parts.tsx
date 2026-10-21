import type { ReactNode } from 'react'
import { clock, jobStatus, shortDate, type Tone } from '@kit'
import type { FirmHealth, FirmStage, HqLogEntry, LiveJob } from '@/data/hq'
import type { ActionEntry, JobStatus, OperatorState } from '@/data/model'
import { cn } from '@/lib/utils'

/*
 * The small parts HQ's screens share. Built on Core's look: surfaces and
 * fills, never borders; state colours only mean state.
 */

/** HQ's own icons, drawn like Core's: one stroke weight on a 24 grid. */
export const hqPaths = {
  live: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  firms: 'M4 20.5V8l6-3.5v16M10 20.5V4.5l10 4v12M2.5 20.5h19M13.5 11h3M13.5 14.5h3M6.5 11h1M6.5 14.5h1',
  playbook: 'M4 5.5c2.8-1.4 5.5-1.4 8 0v14c-2.5-1.4-5.2-1.4-8 0zM20 5.5c-2.8-1.4-5.5-1.4-8 0v14c2.5-1.4 5.2-1.4 8 0z',
  shared: 'M3.5 13.5L6 5h12l2.5 8.5V19h-17zM3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5M12 7.5v5M9.5 10l2.5 2.5 2.5-2.5',
  usage: 'M4 19.5a8 8 0 1 1 16 0M12 19.5l4-6M7.5 15.5h.01M12 11h.01M16.5 15.5h.01',
  activity: 'M2.5 12h4l2.5-6 4.5 12 2.5-6h5.5',
} as const
export type HqIconName = keyof typeof hqPaths

export function HqIcon({ name, className }: { name: HqIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('size-[18px] shrink-0', className)}>
      <path d={hqPaths[name]} />
    </svg>
  )
}

/** A tone as a dot colour. Ember is kept for each screen's one thing, so in lists it reads grey. */
export const toneBg: Record<Tone, string> = {
  ok: 'bg-ok',
  info: 'bg-info',
  warn: 'bg-warn',
  danger: 'bg-danger',
  violet: 'bg-violet',
  neutral: 'bg-muted',
  faint: 'bg-faint',
  ember: 'bg-faint',
}
export const toneText: Record<Tone, string> = {
  ok: 'text-ok',
  info: 'text-info',
  warn: 'text-warn',
  danger: 'text-danger',
  violet: 'text-violet',
  neutral: 'text-muted',
  faint: 'text-faint',
  ember: 'text-muted',
}

export const Dot = ({ tone, className }: { tone: Tone; className?: string }) => <span aria-hidden className={cn('inline-block size-[7px] shrink-0 rounded-full', toneBg[tone], className)} />

/** A state in words with its dot. */
export function State({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[13px] whitespace-nowrap', className)}>
      <Dot tone={tone} />
      {children}
    </span>
  )
}

/** A small filled label: no border, ever. */
export function Tag({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const fill: Record<Tone, string> = {
    neutral: 'bg-raised text-muted',
    faint: 'bg-raised/60 text-faint',
    ok: 'bg-ok/10 text-ok',
    warn: 'bg-warn/10 text-warn',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-info/10 text-info',
    violet: 'bg-violet/10 text-violet',
    ember: 'bg-raised text-muted',
  }
  return <span className={cn('inline-flex h-[22px] items-center rounded-[6px] px-2 font-mono text-[11px] tracking-[.04em] whitespace-nowrap uppercase', fill[tone], className)}>{children}</span>
}

export const healthTone: Record<FirmHealth['tone'], Tone> = { ok: 'ok', warn: 'warn', bad: 'danger', quiet: 'faint' }
export const stageWord: Record<FirmStage, string> = { live: 'Live', setting_up: 'Setting up' }

/** What the master map calls a job's state, with the emergencies picked out. */
export function jobTone(j: Pick<LiveJob, 'status' | 'priority'>): Tone {
  if (j.priority === 'emergency' && !['complete', 'invoiced', 'paid', 'cancelled'].includes(j.status)) return 'danger'
  return jobStatus[j.status].tone === 'ember' ? 'faint' : jobStatus[j.status].tone
}

export const LIVE: JobStatus[] = ['en_route', 'on_site', 'paused']
export const DONE: JobStatus[] = ['complete', 'invoiced', 'paid']
export const isLive = (s: JobStatus) => LIVE.includes(s)
export const isDone = (s: JobStatus) => DONE.includes(s)

/** Van ring colours, as on Core's crew map. */
export const vanColour: Record<OperatorState, string> = {
  on_site: 'var(--ok)',
  en_route: 'var(--info)',
  delayed: 'var(--warn)',
  on_call: '#8a8a8a',
  workshop: '#6b6b6b',
  off_shift: '#444',
}

/** Who did it: a person in the firm, Ardent itself, or someone from Ardent's own team. */
export function who(e: ActionEntry | HqLogEntry): { name: string; kind: 'person' | 'ardent' | 'staff' } {
  // HQ's own lines (opening an account, adopting a firm's question) are Ardent's team, not the AI.
  if (e.action.startsWith('hq.')) {
    const named = e.by.kind === 'person' ? e.by.name : /\(([^)]+)\)/.exec(e.summary)?.[1]
    return { name: named ? `${named}, Ardent staff` : 'Ardent staff', kind: 'staff' }
  }
  if (e.by.kind === 'ardent') return { name: 'Ardent', kind: 'ardent' }
  return { name: e.by.name, kind: 'person' }
}

/** "Today 09:30", "Mon 19 Oct 14:02". */
export function when(iso: string, now = Date.now()) {
  const day = (d: number) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  if (day(Date.parse(iso)) === day(now)) return `Today ${clock(iso)}`
  if (day(Date.parse(iso)) === day(now - 86_400_000)) return `Yesterday ${clock(iso)}`
  return `${shortDate(iso)} ${clock(iso)}`
}

/** A row of choices: white when picked, grey otherwise. */
export function Chip({ on, onClick, children, count, tone }: { on: boolean; onClick: () => void; children: ReactNode; count?: number; tone?: Tone }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
        on ? 'bg-foreground text-background' : 'bg-raised text-foreground hover:bg-[#262626]',
      )}
    >
      {tone && <Dot tone={tone} />}
      {children}
      {count !== undefined && <span className={cn('font-mono text-[11px]', on ? 'text-background/70' : 'text-muted')}>{count}</span>}
    </button>
  )
}

/** A loading block the size of what's coming. */
export const Loading = ({ className }: { className?: string }) => <div className={cn('h-60 animate-pulse rounded-[14px] bg-surface/60', className)} />

/** Said when something could not load, so a blank never pretends to be empty. */
export function Failed({ error }: { error?: Error }) {
  if (!error) return null
  return <p className="rounded-[14px] bg-surface p-5 text-[14px] text-muted">That did not load: {error.message}</p>
}

/** A bar out of a whole, with the part past the line in warn. */
export function Meter({ used, of, cap, className }: { used: number; of?: number; cap?: number; className?: string }) {
  const whole = Math.max(1, cap ?? of ?? used)
  const pct = Math.min(100, (used / whole) * 100)
  const inc = of && cap ? Math.min(100, (of / cap) * 100) : undefined
  const over = (of !== undefined && used > of) || (cap !== undefined && used >= cap)
  return (
    <div className={cn('relative h-[5px] w-full overflow-hidden rounded-full bg-raised', className)} aria-hidden>
      <span className={cn('absolute inset-y-0 left-0 rounded-full', over ? 'bg-warn' : 'bg-foreground')} style={{ width: `${pct}%` }} />
      {inc !== undefined && <span className="absolute inset-y-0 w-[2px] bg-background" style={{ left: `${inc}%` }} />}
    </div>
  )
}
