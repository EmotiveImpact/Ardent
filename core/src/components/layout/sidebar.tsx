import { NavLink, useLocation } from 'react-router'
import {
  CalendarRange,
  FileBadge2,
  LayoutGrid,
  PoundSterling,
  Settings,
  Users,
  Wrench,
  HardHat,
} from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ArdentMark } from './logo'
import { UserMenu } from './user-menu'

export const nav = [
  { to: '/', label: 'Operations', icon: LayoutGrid, end: true },
  { to: '/jobs', label: 'Jobs', icon: Wrench },
  { to: '/schedule', label: 'Schedule', icon: CalendarRange },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/money', label: 'Quotes and invoices', icon: PoundSterling },
  null,
  { to: '/certificates', label: 'Certificates', icon: FileBadge2 },
  { to: '/crew', label: 'Crew and vans', icon: HardHat },
] as const

function RailLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Wrench; end?: boolean }) {
  // Work out the active state here: the tooltip trigger merges classes, so NavLink's className function can't be used.
  const { pathname } = useLocation()
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(to + '/')
  return (
    <Tooltip content={label}>
      <NavLink
        to={to}
        end={end}
        aria-label={label}
        className={cn(
          'relative flex size-9 items-center justify-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-foreground',
          isActive && 'bg-raised text-foreground before:absolute before:-left-[11px] before:h-4 before:w-[3px] before:rounded-r before:bg-foreground',
        )}
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </NavLink>
    </Tooltip>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden w-14 shrink-0 flex-col items-center py-3 md:flex">
      <ArdentMark />
      <nav className="mt-6 flex flex-col items-center gap-1">
        {nav.map((item, i) =>
          item ? <RailLink key={item.to} {...item} /> : <span key={i} className="my-2 h-px w-6 bg-line" />,
        )}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-2">
        <RailLink to="/settings" label="Settings" icon={Settings} />
        <UserMenu className="mt-1" />
      </div>
    </aside>
  )
}
