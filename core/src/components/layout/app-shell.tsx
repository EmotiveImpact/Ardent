import { Outlet, useLocation } from 'react-router'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { MobileNav } from './mobile-nav'
import { ShellProvider, useShell } from './bar'
import { CommandMenu } from '@/components/command-menu'
import { cn } from '@/lib/utils'

function Frame() {
  const { pathname } = useLocation()
  const { wall, setWall } = useShell()
  return (
    <div className="app-atmosphere grain flex h-full">
      {!wall && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className={cn('min-h-0 flex-1 overflow-y-auto px-4 pb-24 sm:px-6 md:pb-10 lg:px-9', wall && 'pt-6')}>
          <div className="mx-auto max-w-[1600px]">
            {!wall && <Topbar />}
            <div key={pathname} className="contents">
              <Outlet />
            </div>
          </div>
        </main>
        {!wall && <MobileNav />}
        <CommandMenu />
      </div>
      {wall && (
        <button type="button" onClick={() => setWall(false)} className="fixed top-4 right-4 z-40 inline-flex h-9 items-center rounded-full bg-raised px-3.5 text-[13px] text-foreground hover:bg-[#262626]">
          Leave wall mode
        </button>
      )}
    </div>
  )
}

export function AppShell() {
  return (
    <ShellProvider>
      <Frame />
    </ShellProvider>
  )
}
