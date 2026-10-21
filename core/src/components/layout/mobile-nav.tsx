import { NavLink, useLocation } from 'react-router'
import { nav, navFor } from './sidebar'
import { Icon } from './icons'
import { cn } from '@/lib/utils'

/** Bottom bar for narrow screens; the rail takes over from md up. */
export function MobileNav() {
  const { pathname } = useLocation()
  const here = navFor(pathname)
  const items = nav.filter((n) => !!n).slice(0, 5)
  return (
    <nav aria-label="Ardent Core" className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom,0px))] items-stretch bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={cn('flex flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted', here === item && 'text-foreground')}>
          <Icon name={item.icon} className="size-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
