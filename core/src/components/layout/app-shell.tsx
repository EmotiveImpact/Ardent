import { Outlet, useLocation } from 'react-router'
import { Sidebar, nav } from './sidebar'
import { Topbar } from './topbar'
import { MobileNav } from './mobile-nav'
import { CommandMenu } from '@/components/command-menu'

function trailFor(pathname: string) {
  const match = nav.find((n) => n && n.to !== '/' && pathname.startsWith(n.to))
  if (pathname === '/') return ['Operations', 'Today']
  if (pathname.startsWith('/settings')) return ['Settings']
  if (pathname.startsWith('/jobs/')) return ['Jobs', 'Job sheet']
  if (pathname.startsWith('/customers/')) return ['Customers', 'Customer']
  return match ? [match.label] : ['Ardent Core']
}

export function AppShell() {
  const { pathname } = useLocation()
  return (
    <div className="calm app-atmosphere grain flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar trail={trailFor(pathname)} />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 md:pb-4">
          <div key={pathname} className="contents">
            <Outlet />
          </div>
        </main>
        <MobileNav />
        <CommandMenu />
      </div>
    </div>
  )
}
