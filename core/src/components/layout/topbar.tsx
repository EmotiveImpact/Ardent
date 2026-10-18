import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Bell, ChevronRight, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewJobDialog } from '@/components/new-job-dialog'
import { openCommandMenu } from '@/components/command-menu'
import { ArdentMark } from './logo'

export function Topbar({ trail }: { trail: string[] }) {
  const navigate = useNavigate()
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 px-3 md:px-4">
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
          className="group hidden h-8 w-72 items-center gap-2 rounded-md border border-line bg-surface/80 px-2.5 text-[13px] text-faint transition-colors hover:border-line-strong hover:text-muted lg:flex"
        >
          <Search className="size-4" />
          Search jobs, customers, postcodes
          <kbd className="ml-auto rounded border border-line-strong px-1 font-mono text-[10px]">⌘K</kbd>
        </button>
        <Button variant="outline" size="icon-sm" aria-label="Search" className="lg:hidden" onClick={openCommandMenu}>
          <Search />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Notifications" className="relative">
          <Bell />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-ember" />
        </Button>
        <NewJobDialog>
          <Button size="sm" className="gap-1.5">
            <Plus /> <span className="hidden sm:inline">New job</span>
            <kbd className="ml-1 hidden rounded border border-black/15 px-1 font-mono text-[10px] text-black/50 sm:inline">N</kbd>
          </Button>
        </NewJobDialog>
      </div>
    </div>
  )
}
