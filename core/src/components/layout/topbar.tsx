import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Bell, ChevronRight, Maximize, Minimize, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewJobDialog } from '@/components/new-job-dialog'
import { openCommandMenu } from '@/components/command-menu'
import { ArdentMark } from './logo'
import { UserMenu } from './user-menu'
import { useQuery } from '@/data/ardent'
import { clock } from '@kit'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/** Whole-app full screen, so the browser bars disappear on a wall screen or a laptop. */
function FullScreenButton() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const toggle = () => {
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {})
    const req = document.documentElement.requestFullscreen?.()
    if (!req) return blocked()
    req.catch(blocked)
  }
  return (
    <Button variant="outline" size="icon-sm" aria-label={on ? 'Exit full screen' : 'Full screen'} title={on ? 'Exit full screen' : 'Full screen'} onClick={toggle}>
      {on ? <Minimize /> : <Maximize />}
    </Button>
  )
}

function blocked() {
  toast('Full screen is blocked on this page', {
    description: 'Open Ardent in its own tab, then press F11 on Windows or Ctrl Cmd F on a Mac.',
  })
}

export function Topbar({ trail }: { trail: string[] }) {
  const navigate = useNavigate()
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 px-4">
      <ArdentMark className="md:hidden" />
      <div className="hidden items-center gap-0.5 sm:flex">
        <Button variant="outline" size="icon-sm" aria-label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Forward" onClick={() => navigate(1)}>
          <ArrowRight />
        </Button>
      </div>
      <ol className="ml-2 flex min-w-0 items-center gap-1.5 text-[14px]">
        {trail.map((crumb, i) => (
          <li key={crumb} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-faint" />}
            <span className={i === trail.length - 1 ? 'truncate text-foreground' : 'truncate text-muted'}>{crumb}</span>
          </li>
        ))}
      </ol>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={openCommandMenu}
          className="group hidden h-8 w-72 items-center gap-2 rounded-md bg-surface/80 px-2.5 text-[13px] text-faint transition-colors hover:text-muted lg:flex"
        >
          <Search className="size-4" />
          Search jobs, customers, postcodes
          <kbd className="ml-auto rounded px-1 font-mono text-[10px]">⌘K</kbd>
        </button>
        <Button variant="outline" size="icon-sm" aria-label="Search" className="lg:hidden" onClick={openCommandMenu}>
          <Search />
        </Button>
        <FullScreenButton />
        <AttentionBell />
        <NewJobDialog>
          <Button size="sm" className="gap-1.5">
            <Plus /> <span className="hidden sm:inline">New job</span>
            <kbd className="ml-1 hidden rounded px-1 font-mono text-[10px] text-black/50 sm:inline">N</kbd>
          </Button>
        </NewJobDialog>
        <UserMenu side="bottom" className="md:hidden" />
      </div>
    </div>
  )
}

/** What needs the office now, worked out by the engine from the records. */
function AttentionBell() {
  const { data = [] } = useQuery((c) => c.attention.list())
  const navigate = useNavigate()
  const open = data.filter((x) => x.outcome !== 'resolved')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={`Needs attention, ${open.length}`} className="relative">
          <Bell />
          {open.length > 0 && <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-mono text-[9px] text-black">{open.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px]">
        <DropdownMenuLabel>Needs attention</DropdownMenuLabel>
        {open.length === 0 && <p className="px-2 pb-2 text-[13px] text-muted">Nothing needs you right now.</p>}
        {open.slice(0, 7).map((x) => (
          <DropdownMenuItem key={x.id} onSelect={() => navigate('/')} className="items-start">
            <span className="mt-0.5 w-10 shrink-0 font-mono text-[11px] text-faint">{clock(x.at)}</span>
            <span className="min-w-0">
              <span className="block truncate text-foreground">{x.rule}</span>
              <span className="block truncate text-[12px] text-muted">{x.who}, {x.detail}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
