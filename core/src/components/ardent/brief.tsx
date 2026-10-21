import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { pounds, shortDate } from '@kit'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Icon } from '@/components/layout/icons'
import { MorningBriefCard } from '@/components/ardent/office'
import { useArdent, useQuery } from '@/data/ardent'
import type { MorningBrief } from '@/data/model'
import { cn } from '@/lib/utils'

/*
 * The morning brief, briefing style. It opens in full the first time Today is
 * looked at each day, tucks itself away into a slim strip after a short while
 * (or when told to), and opens again from the strip or the Brief button in
 * the top bar on any page.
 */

const TUCK_AFTER_S = 25
const KEY = 'ardent.brief'
const read = (k: string) => {
  try {
    return localStorage.getItem(`${KEY}.${k}`) ?? undefined
  } catch {
    return undefined
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(`${KEY}.${k}`)
    else localStorage.setItem(`${KEY}.${k}`, v)
  } catch {
    /* private window: it just opens in full again next time */
  }
}

const greeting = () => {
  const hour = Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }))
  return hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
}

const useBrief = () => useQuery((c) => c.brief.get())

/** On Today: the full brief once a day, then the strip. */
export function BriefOnToday() {
  const { data: brief } = useBrief()
  const [tucked, setTucked] = useState<string | undefined>(() => read('tucked'))
  const [first, setFirst] = useState(() => read('look') === 'first')
  if (!brief) return <div className="h-[340px] animate-pulse rounded-[18px] bg-surface/60" />
  const tuck = () => {
    write('tucked', brief.day)
    setTucked(brief.day)
  }
  const open = () => {
    write('tucked', null)
    setTucked(undefined)
  }
  const flip = (to: boolean) => {
    write('look', to ? 'first' : null)
    setFirst(to)
  }
  if (first) {
    return (
      <div className="flex flex-col gap-2">
        <MorningBriefCard />
        <button type="button" onClick={() => flip(false)} className="self-end rounded text-[12px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
          See the new briefing look
        </button>
      </div>
    )
  }
  if (tucked === brief.day) return <BriefStrip brief={brief} onOpen={open} />
  return <BriefPanel brief={brief} onTuck={tuck} countdown onFirstLook={() => flip(true)} />
}

/** The brief tucked away: one line of what matters, and the way back in. */
export function BriefStrip({ brief, onOpen }: { brief: MorningBrief; onOpen: () => void }) {
  const n = Object.fromEntries(brief.numbers.map((x) => [x.key, x]))
  const facts = [
    n.overdue?.value ? { text: `${pounds(n.overdue.value)} overdue`, warn: true } : undefined,
    { text: `${n.today?.value ?? 0} on today` },
    brief.waiting ? { text: `${brief.waiting} waiting for a yes` } : undefined,
  ].filter(Boolean) as { text: string; warn?: boolean }[]
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open the morning brief"
      className="animate-rise group flex min-h-14 w-full flex-wrap items-center gap-x-5 gap-y-1 rounded-[14px] bg-surface px-5 py-3 text-left outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span className="flex items-center gap-2.5">
        <Icon name="brief" className="size-4 text-muted" />
        <span className="font-display text-[11px] tracking-[.18em] uppercase">Morning brief</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] tracking-[.06em] uppercase">
        {facts.map((f) => (
          <span key={f.text} className={f.warn ? 'text-warn' : 'text-muted'}>
            {f.text}
          </span>
        ))}
      </span>
      <span className="text-[13px] text-muted group-hover:text-foreground">Open</span>
    </button>
  )
}

/** The briefing itself. With countdown, it tucks away by itself unless someone is reading it. */
export function BriefPanel({ brief, onTuck, countdown, onFirstLook, className }: { brief: MorningBrief; onTuck?: () => void; countdown?: boolean; onFirstLook?: () => void; className?: string }) {
  const { me } = useArdent()
  const [left, setLeft] = useState(TUCK_AFTER_S)
  const held = useRef(false)
  const [reading, setReading] = useState(false)
  const tuckRef = useRef(onTuck)
  useEffect(() => {
    tuckRef.current = onTuck
  })
  const live = countdown && !!onTuck
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      if (!held.current) setLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [live])
  useEffect(() => {
    if (live && left === 0) tuckRef.current?.()
  }, [live, left])
  const hold = (on: boolean) => {
    held.current = on
    setReading(on)
    if (on) setLeft(TUCK_AFTER_S)
  }

  // The waiting count has its own panel, so the points leave it out.
  const points = brief.headline.split(/(?<=\.)\s+/).filter((x) => !/waiting for your yes\.$/.test(x))
  const name = me?.user.name.split(' ')[0]
  const n = Object.fromEntries(brief.numbers.map((x) => [x.key, x]))
  const firm = me?.organisation.name

  return (
    <section
      aria-label="Morning brief"
      onPointerEnter={() => hold(true)}
      onPointerLeave={() => hold(false)}
      onFocus={() => hold(true)}
      onBlur={() => hold(false)}
      className={cn('animate-rise relative overflow-hidden rounded-[18px] bg-surface', className)}
    >
      {/* First light: a faint warm wash from the top left, and the engineering grid fading in from the right. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_320px_at_0%_0%,#ff6a1a12,transparent_70%)]" />
      <div aria-hidden className="dot-grid pointer-events-none absolute inset-y-0 right-0 w-1/2 [mask-image:linear-gradient(to_left,black,transparent)] opacity-60" />

      <div className="relative flex flex-col gap-7 p-6 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <span className="font-display text-[12px] tracking-[.24em] uppercase">Morning brief</span>
            <span className="font-mono text-[11px] tracking-[.12em] text-muted uppercase">
              {new Date(`${brief.day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' })}
              {firm && <span className="text-faint"> · {firm}</span>}
            </span>
          </div>
          {onTuck && (
            <button type="button" onClick={onTuck} className="inline-flex h-8 items-center gap-2 rounded-lg bg-raised/70 px-3 text-[12px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
              Tuck away
            </button>
          )}
        </header>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-5">
            <p className="font-display text-[30px] leading-[38px] tracking-[.02em] sm:text-[38px] sm:leading-[46px]">
              {greeting()}
              {name ? `, ${name}` : ''}.
            </p>
            <ol className="flex flex-col gap-3">
              {points.map((line, i) => (
                <li key={i} className={cn('flex gap-4', i === 0 ? 'text-[20px] leading-[28px]' : 'text-[17px] leading-[25px] text-[#c8c8c8]')}>
                  <span className="w-6 shrink-0 pt-1 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, '0')}</span>
                  {line}
                </li>
              ))}
            </ol>
          </div>

          <aside className="flex flex-col justify-between gap-4 rounded-[14px] bg-background/55 p-5">
            <span className="cap text-[11px] text-muted">Waiting for your yes</span>
            <span className="font-display text-[56px] leading-none tabular">{brief.waiting}</span>
            <span className="text-[13px] leading-[19px] text-muted">{brief.waiting ? 'Drafted by Ardent from your records. Nothing goes until you say so.' : 'Nothing waiting. Ardent drafts the next one when a job finishes or an invoice runs late.'}</span>
            {brief.waiting > 0 && (
              <Link to="/approvals" className="inline-flex h-10 items-center justify-center rounded-lg bg-foreground px-4 text-[13px] font-medium text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/60">
                Go through them
              </Link>
            )}
          </aside>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {(['done', 'invoiced', 'cash', 'overdue', 'today'] as const).map((k) => {
            const x = n[k]
            if (!x) return null
            const warn = k === 'overdue' && x.value > 0
            return (
              <div key={k} className="flex flex-col gap-2 rounded-[12px] bg-background/55 px-4 py-3.5">
                <dt className="cap text-[10.5px] text-muted">{x.label}</dt>
                <dd className={cn('font-mono text-[24px] leading-none tabular', warn && 'text-warn')}>{x.money ? pounds(x.value) : x.value}</dd>
                {x.note && <dd className="font-mono text-[11px] text-muted">{x.note}</dd>}
              </div>
            )
          })}
        </dl>

        {brief.items.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="cap pb-1 text-[11px] text-muted">Keep an eye on</span>
            <ul className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
              {brief.items.slice(0, 6).map((it, i) => {
                const body = (
                  <>
                    <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', it.tone === 'danger' ? 'bg-danger' : it.tone === 'warn' ? 'bg-warn' : 'bg-faint')} />
                    <span className="min-w-0 flex-1 text-[14px] leading-[20px]">{it.text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => shortDate(`${d}T12:00:00Z`))}</span>
                  </>
                )
                return (
                  <li key={i} className="shadow-[inset_0_1px_0_var(--line)]">
                    {it.jobId ? (
                      <Link to={`/jobs/${it.jobId}`} className="flex gap-3 rounded py-2.5 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring/60">
                        {body}
                      </Link>
                    ) : (
                      <span className="flex gap-3 py-2.5">{body}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-faint">
          <span>Worked out from your records. Nothing guessed.</span>
          <span className="flex items-center gap-4">
            {onFirstLook && (
              <button type="button" onClick={onFirstLook} className="rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                See the first version
              </button>
            )}
            {countdown && onTuck && <span className="font-mono">{reading ? 'Stays open while you read' : `Tucks away in ${left}s`}</span>}
          </span>
        </footer>
      </div>
      {countdown && onTuck && (
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-line">
          <div className="h-full bg-foreground/40 transition-[width] duration-1000 ease-linear" style={{ width: `${(left / TUCK_AFTER_S) * 100}%` }} />
        </div>
      )}
    </section>
  )
}

/** The Brief button in the top bar: the morning brief from any page. */
export function BriefButton() {
  const { me } = useArdent()
  const { pathname } = useLocation()
  // Open on the page it was opened from, so following a link out of it closes it.
  const [openOn, setOpenOn] = useState<string>()
  const open = openOn === pathname
  const setOpen = (on: boolean) => setOpenOn(on ? pathname : undefined)
  if (me?.role === 'field') return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Morning brief"
        title="Morning brief"
        className="flex h-[38px] shrink-0 items-center gap-2 rounded-[10px] bg-surface px-3 text-[13px] text-foreground outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Icon name="brief" className="size-4" />
        <span className="hidden xl:inline">Brief</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100vh-48px)] max-w-[1080px] overflow-auto bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">Morning brief</DialogTitle>
          <DialogDescription className="sr-only">Yesterday's numbers, what's overdue, what's on today and what waits for a yes.</DialogDescription>
          {open && <BriefInDialog />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function BriefInDialog() {
  const { data: brief } = useBrief()
  if (!brief) return <div className="h-[340px] animate-pulse rounded-[18px] bg-surface" />
  return <BriefPanel brief={brief} />
}
