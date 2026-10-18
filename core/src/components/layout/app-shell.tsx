import { Outlet, useLocation } from 'react-router'
import { Sidebar, nav } from './sidebar'
import { Topbar } from './topbar'
import { MobileNav } from './mobile-nav'

function trailFor(pathname: string) {
  const match = nav.find((n) => n && n.to !== '/' && pathname.startsWith(n.to))
  if (pathname === '/') return ['Operations', 'Today']
  if (pathname.startsWith('/settings')) return ['Settings']
  return match ? [match.label] : ['Ardent Core']
}

export function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar trail={trailFor(pathname)} />
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-20 md:px-4 md:pb-4">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  )
}
