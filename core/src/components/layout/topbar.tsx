import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router'
import { Popover } from 'radix-ui'
import { clock } from '@kit'
import { openCommandMenu } from '@/components/command-menu'
import { useBook } from '@/data/ardent'
import { useNeeds, useVanFeed } from '@/lib/needs'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useShell, type Crumb } from './bar'
import { Icon } from './icons'
import { ArdentMark } from './logo'
import { navFor } from './sidebar'

export const barButton = 'inline-flex h-[38px] shrink-0 items-center gap-2 rounded-[10px] bg-surface px-3.5 text-[13px] text-foreground outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60'

const newItems = [
  { key: 'n', label: 'Job', to: '/jobs/new' },
  { key: 'q', label: 'Quote', to: '/jobs/new?for=quote' },
  { key: 'i', label: 'Invoice', to: '/invoices/new' },
] as const

/** Back and forward through what you've looked at, like a browser, without leaving the app. */
let furthest = 0
function Arrows() {
  const navigate = useNavigate()
  const type = useNavigationType()
  const { key } = useLocation()
  // The router keeps our place in history.state; a fresh visit cuts off anything ahead.
  const idx = (window.history.state?.idx as number | undefined) ?? 0
  if (type !== 'POP' || idx > furthest) furthest = idx
  void key
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
    <nav aria-label="You are here" className="mr-2 min-w-0 shrink-0">
      <ol className="flex items-center gap-2 text-[14px] whitespace-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <Fragment key={i}>
              {i > 0 && (
                <li aria-hidden className="text-faint">
                  ›
                </li>
              )}
              <li className="min-w-0 truncate">
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

function NewMenu() {
  const navigate = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable], [role="dialog"]')
      if (typing) return
      const hit = newItems.find((x) => x.key === e.key.toLowerCase())
      if (hit) {
        e.preventDefault()
        navigate(hit.to)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-[38px] shrink-0 items-center gap-2 rounded-[10px] bg-foreground pr-3.5 pl-[18px] text-[13px] font-medium text-background outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/60">
        New <Icon name="chevron" className="size-3.5" strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[180px] rounded-xl bg-surface p-1.5">
        {newItems.map((x) => (
          <DropdownMenuItem key={x.key} onSelect={() => navigate(x.to)} className="justify-between rounded-lg px-2.5 py-2">
            {x.label}
            <kbd className="font-mono text-[11px] text-muted uppercase">{x.key}</kbd>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Needs you, on every page. Counts only things that need the office to act. */
function Bell() {
  const needs = useNeeds()
  const { data: book } = useBook()
  const vans = useVanFeed(book, 4)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const n = needs?.length ?? 0
  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={n ? `${n} ${n === 1 ? 'thing needs' : 'things need'} you` : 'Nothing needs you'}
        className="relative flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-surface text-foreground outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Icon name="bell" />
        {n > 0 && <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-[5px] font-mono text-[10px] font-medium text-background">{n}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={10} className="z-50 max-h-[calc(100vh-110px)] w-[min(420px,calc(100vw-32px))] overflow-auto rounded-[14px] bg-surface pt-1.5 pb-2.5 shadow-[0_30px_80px_rgba(0,0,0,.65)] outline-none">
          <h2 className="caps flex justify-between px-5 pt-3.5 pb-1.5 text-muted">
            Needs you <span className="font-mono tracking-normal">{n}</span>
          </h2>
          {!needs && <p className="px-5 py-3 text-[13px] text-muted">Looking…</p>}
          {needs?.length === 0 && <p className="px-5 py-3 text-[13px] text-muted">Nothing needs you right now.</p>}
          {needs?.map((x) => (
            <button key={x.id} type="button" onClick={() => go(x.to)} className="flex w-full items-center gap-3 px-5 py-[11px] text-left outline-none [&+&]:shadow-[inset_0_1px_0_var(--line)] hover:bg-raised focus-visible:bg-raised">
              <span className="flex min-w-0 flex-1 flex-col gap-[3px] text-[14px]">
                <span className="truncate">{x.title}</span>
                <span className="truncate font-mono text-[11px] tracking-[.06em] text-muted uppercase">{x.meta.join('   ')}</span>
              </span>
              <span className="flex h-[30px] shrink-0 items-center rounded-lg bg-raised px-3 text-[12px]">{x.action}</span>
            </button>
          ))}
          {vans && vans.length > 0 && (
            <>
              <h2 className="caps px-5 pt-4 pb-1.5 text-muted">From the vans</h2>
              {vans.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-5 py-[9px] [&+&]:shadow-[inset_0_1px_0_var(--line)]">
                  <span className="w-10 shrink-0 font-mono text-[11px] text-muted">{clock(v.at)}</span>
                  <span className="w-6 shrink-0 font-mono text-[11px] text-muted">{v.initials}</span>
                  <span className={cn('min-w-0 flex-1 truncate text-[13px]', v.tone === 'warn' && 'text-warn')}>{v.title}</span>
                </div>
              ))}
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function Topbar() {
  const { bar, setSlot } = useShell()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const here = navFor(pathname)
  const crumbs = bar.crumbs ?? [{ label: pathname.startsWith('/settings') ? 'Settings' : (here?.label ?? 'Ardent Core') }]
  return (
    // Stays at the top while the page scrolls under it, edge to edge across the page's padding.
    <header className="sticky top-0 z-30 -mx-4 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-background/85 px-4 py-3.5 shadow-[inset_0_-1px_0_var(--line)] backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-9 lg:px-9">
      <div className="flex min-w-0 flex-[1_1_520px] items-center gap-2">
        <ArdentMark className="md:hidden" />
        <Arrows />
        <span className="ml-2.5" />
        <Crumbs crumbs={crumbs} />
        <button type="button" onClick={openCommandMenu} className="hidden h-[38px] min-w-0 flex-[0_1_380px] items-center gap-2.5 rounded-[10px] bg-surface px-3 text-[13px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:flex">
          <Icon name="search" className="size-4" />
          <span className="min-w-0 flex-1 truncate text-left">Find a job, customer, postcode or invoice</span>
          <kbd className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted">⌘K</kbd>
        </button>
        <button type="button" onClick={openCommandMenu} aria-label="Search" className={cn(barButton, 'px-0 size-[38px] justify-center sm:hidden')}>
          <Icon name="search" className="size-4" />
        </button>
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div ref={setSlot} className="hidden items-center gap-2 empty:hidden sm:flex after:mx-1 after:h-[22px] after:w-px after:bg-line" />
        {!bar.noCallout && (
          <button type="button" onClick={() => navigate('/callout')} className={barButton}>
            <span className="size-[7px] rounded-full bg-danger" />
            <span className="hidden sm:inline">Emergency callout</span>
            <span className="sm:hidden">Callout</span>
          </button>
        )}
        {!bar.noNew && <NewMenu />}
        <Bell />
      </div>
    </header>
  )
}
