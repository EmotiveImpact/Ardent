import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { pounds } from '@kit'
import { useArdent, type Book } from '@/data/ardent'
import type { ComplianceCheck, Job, JobStatus } from '@/data/model'
import { useCountUp, useNow } from '@/hooks/use-now'
import { act } from '@/lib/act'
import { jobNet } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * The parts the operator look is built from. No borders anywhere: surfaces,
 * spacing and hairline rows do the separating. One ember thing per screen.
 */

const ZONE = 'Europe/London'

/** "Operation · Tuesday 20 Oct · 09:04 · 4 crew out" */
export function OpLine({ book }: { book?: Book }) {
  const now = useNow(15_000)
  const d = new Date(now)
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: ZONE })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ZONE })
  const out = book?.operators.filter((o) => ['en_route', 'on_site', 'delayed'].includes(o.state)).length
  return (
    <p className="cap flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span>Operation</span>
      <Dot />
      <span>{day}</span>
      <Dot />
      <span className="text-foreground">{time}</span>
      {out !== undefined && (
        <>
          <Dot />
          <span>{out} crew out</span>
        </>
      )}
    </p>
  )
}

const Dot = () => <span className="text-faint">·</span>

export interface Figure {
  label: string
  value: ReactNode
  unit?: string
  tone?: 'warn' | 'danger' | 'ok' | 'ember'
  /** A short line under the number, such as "Average 6 days to pay". */
  note?: string
  /** Makes the figure a filter: tap it to show just those. */
  onClick?: () => void
  on?: boolean
}

const toneText = { warn: 'text-warn', danger: 'text-danger', ok: 'text-ok', ember: 'text-ember' } as const

/**
 * A screen's head: the op line (main pages) or a small eyebrow (detail pages),
 * the Michroma title, one plain sentence, and optional big figures (or an `aside`) on the right.
 */
export function PageHead({ title, sub, book, eyebrow, figures, aside, className, children }: { title: string; sub?: ReactNode; book?: Book; eyebrow?: ReactNode; figures?: Figure[]; aside?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('animate-rise flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-8 pb-8', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="cap flex flex-wrap items-center gap-x-2.5 gap-y-1">{eyebrow}</div> : <OpLine book={book} />}
        <h1 className="op-title mt-4 text-[28px] text-foreground sm:text-[38px]">{title}</h1>
        {sub && <p className="mt-3.5 max-w-[68ch] text-[15px] text-foreground/90">{sub}</p>}
        {children}
      </div>
      {figures && figures.length > 0 && (
        <dl className="flex flex-wrap gap-x-12 gap-y-5">
          {figures.map((f) => {
            const body = (
              <>
                <dt className={cn('cap', f.on && 'text-foreground')}>{f.label}</dt>
                <dd className={cn('op-number text-[30px]', f.tone && toneText[f.tone])}>
                  {f.value}
                  {f.unit && <span className="ml-2 font-mono text-[13px] text-muted">{f.unit}</span>}
                </dd>
                {f.note && <dd className="-mt-1.5 font-mono text-[11px] tracking-[.06em] text-muted uppercase">{f.note}</dd>}
              </>
            )
            return f.onClick ? (
              <button
                key={f.label}
                type="button"
                onClick={f.onClick}
                aria-pressed={!!f.on}
                className={cn(
                  '-mx-3 -my-2 flex flex-col gap-3 rounded-[12px] px-3 py-2 text-left outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/60',
                  f.on && 'bg-surface',
                )}
              >
                {body}
              </button>
            ) : (
              <div key={f.label} className="flex flex-col gap-3">
                {body}
              </div>
            )
          })}
        </dl>
      )}
      {aside && <div className="sm:self-start">{aside}</div>}
    </div>
  )
}

/** A quiet surface. Never bordered. */
export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('animate-rise min-w-0 rounded-[14px] bg-surface p-5', className)} {...props} />
}

/** A section's name on the left and a hint or link on the right. */
export function SectionHead({ title, aside, className }: { title: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 pb-3', className)}>
      <h2 className="cap flex items-center gap-2.5">{title}</h2>
      {aside && <div className="hidden text-right text-[13px] text-muted sm:block">{aside}</div>}
    </div>
  )
}

/** The small grey button used in rows: Book, Chase, Renew. */
export function RowButton({ to, onClick, children, className }: { to?: string; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = cn('inline-flex h-[34px] shrink-0 items-center rounded-lg bg-raised px-3.5 text-[13px] text-foreground outline-none transition-colors hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60', className)
  return to ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  )
}

/** A headline number with eight bars of history and the one thing to do about it. */
export function Readout({
  label,
  value,
  count,
  format = (n) => String(Math.round(n)),
  unit,
  bars,
  labels,
  barFormat = (n) => String(Math.round(n * 10) / 10),
  tone,
  note,
  action,
  index = 0,
}: {
  label: string
  /** Shown as is, unless `count` is given. */
  value?: ReactNode
  /** A number to count up to when the page opens, shown through `format`. */
  count?: number
  format?: (n: number) => string
  unit?: string
  bars: number[]
  /** What each bar is, for the hover readout: "Mon 19 Oct". */
  labels?: string[]
  barFormat?: (n: number) => string
  tone?: 'danger' | 'warn'
  note: ReactNode
  action?: { label: string; to: string }
  index?: number
}) {
  const max = Math.max(1, ...bars)
  const shown = useCountUp(count ?? 0)
  const [hover, setHover] = useState<number | null>(null)
  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5" style={{ '--i': index } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-2">
        <p className="cap truncate">{label}</p>
        {hover !== null && labels && (
          <span className="shrink-0 font-mono text-[11px] text-foreground">
            {labels[hover]} <span className="text-muted">·</span> {barFormat(bars[hover])}
          </span>
        )}
      </div>
      <p className={cn('op-number text-[32px]', tone && toneText[tone])}>
        {count !== undefined ? format(shown) : value}
        {unit && <span className="ml-2.5 font-mono text-[13px] text-muted">{unit}</span>}
      </p>
      <div aria-hidden className="flex h-[22px] items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {bars.map((b, i) => {
          const last = i === bars.length - 1
          return (
            <span key={i} onMouseEnter={() => setHover(i)} className="flex h-full flex-1 items-end">
              <span
                className={cn(
                  'animate-grow w-full rounded-[1px] transition-[filter]',
                  last ? (tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-foreground') : 'bg-[#2a2a2a]',
                  hover === i && (last ? 'brightness-125' : 'bg-[#4a4a4a]'),
                )}
                style={{ '--i': i, height: `${Math.max(8, (b / max) * 100)}%` } as React.CSSProperties}
              />
            </span>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-3 text-[12.5px]">
        <span className="min-w-0 truncate text-muted">{note}</span>
        {action && (
          <Link to={action.to} className="shrink-0 text-foreground hover:text-white hover:underline">
            {action.label}
          </Link>
        )}
      </div>
    </Card>
  )
}

const lineStages: { key: JobStatus; label: string }[] = [
  { key: 'enquiry', label: 'Enquiry' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'booked', label: 'Booked' },
  { key: 'en_route', label: 'Road' },
  { key: 'on_site', label: 'On site' },
  { key: 'complete', label: 'Done' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'paid', label: 'Paid' },
]

/** Every open job on one line from enquiry to paid, with the money sitting at each stop. */
export function TheLine({ book, compact }: { book: Book; compact?: boolean }) {
  const live = book.jobs.filter((j) => j.status !== 'cancelled')
  const at = (k: JobStatus) => live.filter((j) => (k === 'on_site' ? j.status === 'on_site' || j.status === 'paused' : j.status === k))
  const total = live.reduce((s, j) => s + jobNet(j), 0)
  return (
    <Card>
      <SectionHead
        title={
          <>
            The line <span className="text-faint">·</span> Enquiry to paid
          </>
        }
        aside={
          <span className="cap">
            {live.length} jobs <span className="ml-2">{pounds(total)} of work</span>
          </span>
        }
      />
      <ol className={cn('relative mt-2 grid grid-cols-4 gap-y-6 sm:grid-cols-8', compact && 'sm:grid-cols-8')}>
        <span aria-hidden className="absolute top-[5px] right-[4%] left-[5px] hidden h-px bg-line-strong sm:block" />
        {lineStages.map((s) => {
          const jobs = at(s.key)
          const here = s.key === 'on_site'
          return (
            <li key={s.key} className="relative flex min-w-0 flex-col gap-2.5">
              <span className={cn('size-[11px] rounded-full', here ? 'bg-foreground ring-4 ring-surface' : 'bg-line-strong ring-4 ring-surface')} />
              <span className={cn('cap truncate text-[11px]', here && 'text-foreground')}>{s.label}</span>
              <span className="op-number text-[24px]">{jobs.length}</span>
              <span className="font-mono text-[11px] text-muted">{pounds(jobs.reduce((n, j) => n + jobNet(j), 0))}</span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

const track: { key: JobStatus; label: string }[] = [
  { key: 'booked', label: 'Booked' },
  { key: 'en_route', label: 'Road' },
  { key: 'on_site', label: 'On site' },
  { key: 'complete', label: 'Done' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'paid', label: 'Paid' },
]

/** StageTrack's stop names, for anything lined up under its dots. */
export const trackLabels = track.map((t) => t.label)

/**
 * Which stop a job has reached. A done job whose invoice has gone out counts
 * as invoiced, so one finished but not yet billed shows as stuck at Done.
 */
export function trackAt(job: Job, invoiced?: boolean) {
  const pos = { booked: 0, en_route: 1, on_site: 2, paused: 2, complete: 3, invoiced: 4, paid: 5 } as Partial<Record<JobStatus, number>>
  const at = pos[job.status] ?? -1
  return at === 3 && invoiced ? 4 : at
}

/** Booked, road, on site, done, invoiced, paid: dots on a line, the current one ringed. */
export function StageTrack({ job, invoiced }: { job: Job; invoiced?: boolean }) {
  const at = trackAt(job, invoiced)
  return (
    <ol className="relative flex justify-between" aria-label="Where the job is">
      <span aria-hidden className="absolute top-[6px] right-1.5 left-1.5 h-px bg-line-strong" />
      <span aria-hidden className="absolute top-[6px] left-1.5 h-px bg-foreground" style={{ width: at > 0 ? `calc(${(at / (track.length - 1)) * 100}% - 12px)` : 0 }} />
      {track.map((t, i) => (
        <li key={t.key} className={cn('relative flex flex-col gap-2.5', i === 0 ? 'items-start' : i === track.length - 1 ? 'items-end' : 'items-center')} aria-current={i === at ? 'step' : undefined}>
          {i === at ? <span className="size-[13px] rounded-full bg-surface shadow-[inset_0_0_0_1.5px_var(--fg),inset_0_0_0_3.5px_var(--surface),inset_0_0_0_13px_var(--fg)]" /> : <span className={cn('mt-[2px] size-[9px] rounded-full', i < at ? 'bg-foreground' : 'bg-line-strong')} />}
          <span className={cn('cap text-[11px]', i === at ? 'text-foreground' : i > at && 'text-faint')}>{t.label}</span>
        </li>
      ))}
    </ol>
  )
}

export interface Step {
  title: string
  time?: string
  state: 'done' | 'live' | 'next'
}

/** Numbered rings: a green tick on a dark disc when done, outlined when live, faded when next. */
export function StepRings({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={i} className={cn('flex items-center gap-3.5 py-2.5', s.state === 'next' && 'opacity-50')}>
          <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden className="shrink-0">
            <circle cx="15" cy="15" r="13" fill={s.state === 'done' ? 'var(--raised)' : 'transparent'} stroke={s.state === 'done' ? 'none' : s.state === 'next' ? 'var(--line-strong)' : 'var(--fg)'} strokeWidth="1.5" />
            {s.state === 'done' ? (
              <path d="M10 15.2l3.4 3.4 6.6-7" fill="none" stroke="var(--ok)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <text x="15" y="19" textAnchor="middle" fontFamily="Geist Mono Variable, monospace" fontSize="12" fill="var(--fg)">
                {i + 1}
              </text>
            )}
          </svg>
          <span className="min-w-0 flex-1 truncate text-[14px]">{s.title}</span>
          <span className="font-mono text-[12px] text-muted">{s.state === 'live' ? 'NOW' : (s.time ?? '--:--')}</span>
          <span className="sr-only">{s.state === 'done' ? 'done' : s.state === 'live' ? 'in progress' : 'to do'}</span>
        </li>
      ))}
    </ol>
  )
}

const nextCheck: Record<ComplianceCheck['state'], ComplianceCheck['state']> = { pending: 'pass', pass: 'fail', fail: 'n/a', 'n/a': 'pending' }
const checkWord: Record<ComplianceCheck['state'], string> = { pass: 'Passed', fail: 'Failed', pending: 'Still to do', 'n/a': 'Not needed' }

/**
 * The job's checks as tiles: Gas Safe, RAMS, tightness test. The engineer sets
 * them on site; the office can override one by clicking it.
 */
export function ChecksRow({ job, editable = true }: { job: Job; editable?: boolean }) {
  const { client } = useArdent()
  if (!job.checks.length) return null
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {job.checks.map((c) => {
        const body = (
          <>
            <span className="cap block truncate text-[11px]">{c.label}</span>
            <span className="mt-2.5 flex items-center justify-between gap-2">
              <span className={cn('truncate text-[13px]', c.state === 'pending' && 'text-warn', c.state === 'fail' && 'text-danger')}>{c.detail ?? checkWord[c.state]}</span>
              <span
                aria-label={checkWord[c.state]}
                className={cn(
                  'size-[9px] shrink-0 rounded-full',
                  c.state === 'pass' && 'bg-ok',
                  c.state === 'fail' && 'bg-danger',
                  c.state === 'pending' && 'shadow-[inset_0_0_0_1.5px_var(--warn)]',
                  c.state === 'n/a' && 'bg-line-strong',
                )}
              />
            </span>
          </>
        )
        return editable ? (
          <button
            key={c.key}
            type="button"
            title="Office override: click to change"
            onClick={() => void act(client.jobs.setCheck(job.id, c.key, nextCheck[c.state], c.detail))}
            className="rounded-[10px] bg-inset px-3.5 py-3 text-left outline-none transition-colors hover:bg-[#101010] focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {body}
          </button>
        ) : (
          <div key={c.key} className="rounded-[10px] bg-inset px-3.5 py-3">
            {body}
          </div>
        )
      })}
    </div>
  )
}

/** Two-letter crew tile. */
export function Initials({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-raised font-mono text-[11px] text-foreground', className)}>{children}</span>
}

/** A status dot in the crew colours. */
export function StateDot({ tone, className }: { tone: 'ok' | 'info' | 'warn' | 'danger' | 'faint'; className?: string }) {
  const bg = { ok: 'bg-ok', info: 'bg-info', warn: 'bg-warn', danger: 'bg-danger', faint: 'bg-[#6b6b6b]' }[tone]
  return <span className={cn('inline-block size-[7px] shrink-0 rounded-full', bg, className)} />
}
