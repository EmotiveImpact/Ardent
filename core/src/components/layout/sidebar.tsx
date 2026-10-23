import { NavLink, useLocation } from 'react-router'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Icon, type IconName } from './icons'
import { ArdentMark } from './logo'
import { UserMenu } from './user-menu'

export const nav: ({ to: string; label: string; icon: IconName; end?: boolean } | null)[] = [
  { to: '/', label: 'Today', icon: 'today', end: true },
  { to: '/jobs', label: 'Jobs', icon: 'jobs' },
  { to: '/schedule', label: 'Diary', icon: 'diary' },
  { to: '/customers', label: 'Customers', icon: 'customers' },
  { to: '/money', label: 'Money', icon: 'money' },
  { to: '/approvals', label: 'Approvals', icon: 'approvals' },
  null,
  { to: '/certificates', label: 'Certs', icon: 'certs' },
  { to: '/crew', label: 'Crew', icon: 'crew' },
]

/** Where a path sits in the rail, so detail pages light their parent. */
export const navFor = (pathname: string) =>
  pathname === '/' || pathname.startsWith('/callout')
    ? nav[0]
    : nav.find((n) => n && n.to !== '/' && (pathname === n.to || pathname.startsWith(n.to + '/'))) ??
      (pathname.startsWith('/quotes') || pathname.startsWith('/invoices') ? nav[4] : undefined)

function RailLink({ to, label, icon, active }: { to: string; label: string; icon: IconName; active: boolean }) {
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
        <Icon name={icon} />
      </NavLink>
    </Tooltip>
  )
}

/** The slim rail: icons only, names on hover and focus. */
export function Sidebar() {
  const { pathname } = useLocation()
  const here = navFor(pathname)
  return (
    <aside aria-label="Ardent Core" className="hidden w-14 shrink-0 flex-col items-center py-3.5 md:flex">
      <ArdentMark />
      <nav aria-label="Main" className="mt-7 flex flex-col items-center gap-1.5">
        {nav.map((item, i) => (item ? <RailLink key={item.to} {...item} active={here === item} /> : <span key={i} className="my-2.5 h-px w-5 bg-line-strong" />))}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-3">
        <RailLink to="/settings" label="Settings" icon="settings" active={pathname.startsWith('/settings')} />
        <UserMenu />
      </div>
    </aside>
  )
}
