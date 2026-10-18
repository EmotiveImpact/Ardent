import { NavLink } from 'react-router'
import { nav } from './sidebar'
import { cn } from '@/lib/utils'

/** Bottom bar for narrow screens; the rail takes over from md up. */
export function MobileNav() {
  const items = nav.filter(Boolean).slice(0, 5)
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-line bg-background/95 backdrop-blur md:hidden">
      {items.map((item) => {
        if (!item) return null
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item}
            className={({ isActive }) =>
              cn('flex flex-1 flex-col items-center justify-center gap-1 text-[10px] text-faint', isActive && 'text-foreground')
            }
          >
            <Icon className="size-5" strokeWidth={1.75} />
            {item.label.split(' ')[0]}
          </NavLink>
        )
      })}
    </nav>
  )
}
