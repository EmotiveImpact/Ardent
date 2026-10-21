import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router'
import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { LogOut, RotateCcw } from 'lucide-react'
import { clock, initials, jobStatus, trade as TRADE } from '@kit'
import { ShellProvider, useShell, type Crumb } from '@/components/layout/bar'
import { Icon } from '@/components/layout/icons'
import { ArdentMark } from '@/components/layout/logo'
import { Tooltip } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { act } from '@/lib/act'
import { cn } from '@/lib/utils'
import { useHq, useHqQuery } from './data'
import { Dot, HqIcon, jobTone, stageWord, type HqIconName } from './parts'

/*
 * HQ's frame: Core's slim rail with HQ's places on it, one top bar with back
 * and forward, the trail, search across every firm and today's jobs, and who
 * is signed in. On phones the rail becomes a bar along the bottom.
 */

export const hqNav: { to: string; label: string; icon: HqIconName; end?: boolean }[] = [
  { to: '/', label: 'Live', icon: 'live', end: true },
  { to: '/firms', label: 'Firms', icon: 'firms' },
  { to: '/playbook', label: 'Playbook', icon: 'playbook' },
  { to: '/shared', label: 'Shared', icon: 'shared' },
  { to: '/usage', label: 'Usage', icon: 'usage' },
  { to: '/activity', label: 'Activity', icon: 'activity' },
]

const navFor = (pathname: string) => (pathname === '/' ? hqNav[0] : hqNav.find((n) => n.to !== '/' && (pathname === n.to || pathname.startsWith(n.to + '/'))))

/** The Ardent mark with HQ's name beside it. */
export function Wordmark({ className, full }: { className?: string; full?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <ArdentMark name="Ardent HQ" />
      {full && <span className="caps text-muted">Ardent HQ</span>}
    </span>
  )
}

function RailLink({ to, label, icon, active }: { to: string; label: string; icon: HqIconName; active: boolean }) {
  return (
    <Tooltip content={label}>
      <NavLink
        to={to}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex size-10 items-center justify-center rounded-[10px] text-muted outline-none transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
          active && 'bg-raised text-foreground hover:bg-raised',
        )}
      >
        <HqIcon name={icon} />
      </NavLink>
    </Tooltip>
  )
}

function Rail() {
  const { pathname } = useLocation()
  const here = navFor(pathname)
  return (
    <aside aria-label="Ardent HQ" className="hidden w-14 shrink-0 flex-col items-center py-3.5 md:flex">
      <Tooltip content="Ardent HQ">
        <Link to="/" aria-label="Ardent HQ, live map" className="rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
          <ArdentMark name="Ardent HQ" />
        </Link>
      </Tooltip>
      <span className="mt-2 font-mono text-[9px] tracking-[.2em] text-faint">HQ</span>
      <nav aria-label="Main" className="mt-5 flex flex-col items-center gap-1.5">
        {hqNav.map((item, i) => (
          <Fragment key={item.to}>
            {i === 2 && <span className="my-2.5 h-px w-5 bg-line-strong" />}
            <RailLink {...item} active={here === item} />
          </Fragment>
        ))}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-3">
        <UserMenu side="right" />
      </div>
    </aside>
  )
}

function MobileNav() {
  const { pathname } = useLocation()
  const here = navFor(pathname)
  return (
    <nav aria-label="Ardent HQ" className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom,0px))] items-stretch bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden">
      {hqNav.map((item) => (
        <NavLink key={item.to} to={item.to} className={cn('flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted', here === item && 'text-foreground')}>
          <HqIcon name={item.icon} className="size-5" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

const roleWord = { admin: 'Admin, changes the playbook', support: 'Support, can look at everything' } as const

function UserMenu({ side }: { side: 'right' | 'bottom' }) {
  const { me, signOut, reset, mode } = useHq()
  if (!me) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`${me.name}, account`} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised font-mono text-[11px] text-foreground outline-none hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60">
        {initials(me.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-64">
        <div className="px-2 py-2">
          <p className="text-[13px] text-foreground">{me.name}</p>
          <p className="text-[12px] text-muted">{me.email}</p>
          <p className="mt-1.5 text-[12px] text-faint">{roleWord[me.role]} at Ardent</p>
        </div>
        {mode === 'demo' && reset && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Sample firms</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void act(reset(), 'Sample firms put back as they started')}>
              <RotateCcw /> Start the demo again
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Back and forward through what you've looked at, like a browser. */
let furthest = 0
function Arrows() {
  const navigate = useNavigate()
  const type = useNavigationType()
  useLocation()
  const idx = (window.history.state?.idx as number | undefined) ?? 0
  if (type !== 'POP' || idx > furthest) furthest = idx
  const btn = 'flex size-[34px] items-center justify-center rounded-[9px] bg-surface text-foreground outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60 disabled:bg-transparent disabled:text-faint'
  return (
    <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
      <button type="button" className={btn} aria-label="Back" disabled={idx <= 0} onClick={() => navigate(-1)}>
        <Icon name="back" className="size-4" />
      </button>
      <button type="button" className={btn} aria-label="Forward" disabled={idx >= furthest} onClick={() => navigate(1)}>
        <Icon name="forward" className="size-4" />
      </button>
    </div>
  )
}

function Crumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="You are here" className="mr-1 min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-[14px] whitespace-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <Fragment key={i}>
              {i > 0 && (
                <li aria-hidden className="text-faint">
                  ›
                </li>
              )}
              <li className={cn('min-w-0 truncate', !last && 'hidden sm:block')}>
                {last || !c.to ? (
                  <span aria-current={last ? 'page' : undefined} className={last ? 'text-foreground' : 'text-muted'}>
                    {c.label}
                  </span>
                ) : (
                  <Link to={c.to} className="text-muted hover:text-foreground">
                    {c.label}
                  </Link>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

let openSearch: () => void = () => {}

function Topbar() {
  const { bar, setSlot } = useShell()
  const { mode } = useHq()
  const { pathname } = useLocation()
  const crumbs = bar.crumbs ?? [{ label: navFor(pathname)?.label ?? 'Ardent HQ' }]
  return (
    <header className="sticky top-0 z-30 -mx-4 flex shrink-0 items-center justify-between gap-3 bg-background/85 px-4 py-3.5 shadow-[inset_0_-1px_0_var(--line)] backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-9 lg:px-9">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link to="/" aria-label="Ardent HQ, live map" className="md:hidden">
          <ArdentMark className="size-8" name="Ardent HQ" />
        </Link>
        <Arrows />
        <span className="hidden sm:ml-2.5 sm:block" />
        <Crumbs crumbs={crumbs} />
        <button type="button" onClick={() => openSearch()} className="ml-2 hidden h-[38px] min-w-0 flex-[0_1_380px] items-center gap-2.5 rounded-[10px] bg-surface px-3 text-[13px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 lg:flex">
          <Icon name="search" className="size-4" />
          <span className="min-w-0 flex-1 truncate text-left">Find a firm, job, ref or postcode</span>
          <kbd className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">⌘K</kbd>
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div ref={setSlot} className="hidden items-center gap-2 empty:hidden md:flex after:mx-1 after:h-[22px] after:w-px after:bg-line" />
        {mode === 'demo' && (
          <Tooltip content="A prototype on made-up firms. Everything you change stays in this browser." side="bottom">
            <span tabIndex={0} className="hidden h-[26px] items-center rounded-full bg-surface px-2.5 font-mono text-[11px] tracking-[.06em] text-faint uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:inline-flex">
              Sample data
            </span>
          </Tooltip>
        )}
        <button type="button" onClick={() => openSearch()} aria-label="Search" className="flex size-[38px] items-center justify-center rounded-[10px] bg-surface text-foreground outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60 lg:hidden">
          <Icon name="search" className="size-4" />
        </button>
        <span className="md:hidden">
          <UserMenu side="bottom" />
        </span>
      </div>
    </header>
  )
}

interface Row {
  id: string
  to: string
  lead: string
  title: string
  detail: string
  state?: { label: string; tone: Parameters<typeof Dot>[0]['tone'] }
  hay: string
}

/** One box for every firm and every job on today's map. */
function Search() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { data } = useHqQuery(async (hq) => (open ? Promise.all([hq.firms(), hq.live()]) : undefined), [open])

  useEffect(() => {
    openSearch = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rows = useMemo(() => {
    if (!data) return undefined
    const [firms, board] = data
    const firmRows: Row[] = firms.map((f) => ({
      id: `firm_${f.id}`,
      to: `/firms/${f.id}`,
      lead: 'FIRM',
      title: f.name,
      detail: `${f.town} · ${f.trades.map((t) => TRADE[t] ?? t).join(', ')} · ${f.engineers} engineers`,
      state: { label: stageWord[f.stage], tone: f.stage === 'live' ? 'ok' : 'warn' },
      hay: `${f.name} ${f.town} ${f.slug} ${f.trades.join(' ')}`.toLowerCase(),
    }))
    const jobRows: Row[] = board.jobs.map((j) => ({
      id: `job_${j.id}`,
      to: `/?job=${encodeURIComponent(j.id)}`,
      lead: j.ref,
      title: j.title,
      detail: `${j.firmName} · ${j.customer} · ${j.area} · ${clock(j.start)}`,
      state: { label: jobStatus[j.status].label, tone: jobTone(j) },
      hay: `${j.ref} ${j.title} ${j.firmName} ${j.customer} ${j.address} ${j.area} ${j.operators.map((o) => o.name).join(' ')}`.toLowerCase(),
    }))
    return { firmRows, jobRows }
  }, [data])

  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const hit = (list: Row[], n: number) => list.filter((r) => words.every((w) => r.hay.includes(w) || r.hay.replace(/\s+/g, '').includes(w))).slice(0, n)
  const groups = rows ? [{ label: 'Firms', rows: hit(rows.firmRows, words.length ? 5 : 6) }, { label: "Today's jobs", rows: hit(rows.jobRows, words.length ? 8 : 6) }].filter((g) => g.rows.length) : []
  const close = (on: boolean) => {
    setOpen(on)
    if (!on) setQ('')
  }

  return (
    <D.Root open={open} onOpenChange={close}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[3px]" />
        <D.Content className="fixed top-[8vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[720px] -translate-x-1/2 outline-none">
          <D.Title className="sr-only">Search Ardent HQ</D.Title>
          <D.Description className="sr-only">Find a firm, or a job on today's map by ref, customer, street or postcode.</D.Description>
          <Command loop shouldFilter={false} label="Search Ardent HQ" className="flex max-h-[84vh] flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_30px_80px_rgba(0,0,0,.6)]">
            <div className="flex h-[62px] shrink-0 items-center gap-3 px-5 shadow-[inset_0_-1px_0_var(--line)]">
              <Icon name="search" className="size-[18px] text-muted" strokeWidth={1.8} />
              <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Find a firm, job, ref or postcode" className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-foreground outline-none placeholder:text-faint" />
              <button type="button" onClick={() => close(false)} className="rounded font-mono text-[11px] text-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                ESC
              </button>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto px-2.5 pt-2 pb-2.5">
              {!rows && <Command.Loading className="px-3 py-8 text-center text-[13px] text-muted">Looking across the firms…</Command.Loading>}
              {rows && groups.length === 0 && <p className="px-3 py-10 text-center text-[14px] text-muted">No firm or job today matches “{q.trim()}”.</p>}
              {groups.map((g) => (
                <Command.Group key={g.label} heading={g.label} className="[&_[cmdk-group-heading]]:cap [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5">
                  {g.rows.map((r) => (
                    <Command.Item
                      key={r.id}
                      value={r.id}
                      onSelect={() => {
                        close(false)
                        navigate(r.to)
                      }}
                      className="flex cursor-default items-center gap-3.5 rounded-[10px] px-3 py-[11px] outline-none data-[selected=true]:bg-raised"
                    >
                      <span className="w-14 shrink-0 truncate font-mono text-[12px] text-muted sm:w-[70px]">{r.lead}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="truncate text-[14px] text-foreground">{r.title}</span>
                        <span className="truncate text-[12px] text-muted">{r.detail}</span>
                      </span>
                      {r.state && (
                        <span className="hidden shrink-0 items-center gap-[7px] text-[12px] text-muted sm:flex">
                          <Dot tone={r.state.tone} />
                          {r.state.label}
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

function Frame() {
  const { pathname } = useLocation()
  return (
    <div className="app-atmosphere grain flex h-full">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="hq-main" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-24 sm:px-6 md:pb-10 lg:px-9">
          <div className="mx-auto max-w-[1680px]">
            <Topbar />
            <div key={pathname} className="contents">
              <Outlet />
            </div>
          </div>
        </main>
        <MobileNav />
        <Search />
      </div>
    </div>
  )
}

export function HqShell() {
  return (
    <ShellProvider>
      <Frame />
    </ShellProvider>
  )
}
