import { Suspense, useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { EASE_OUT, DURATION } from '@/lib/motion'
import { Outlet, Navigate, useLocation } from 'react-router'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { SidebarProvider } from '@/components/layout/sidebar-context'
import { CommandPalette } from '@/components/shared/command-palette'
import { ShortcutsHelp } from '@/components/shared/shortcuts-help'
import { ErrorBoundary } from '@/components/shared/error-boundary'
import { RealtimeProvider } from '@/contexts/realtime-context'
import { InstallPrompt } from '@/components/shared/install-prompt'
import { TrialBanner } from '@/components/shared/trial-banner'
import { TableSkeleton } from '@/components/shared/skeletons'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { OPEN_HELP_EVENT } from '@/lib/shortcut-events'
import { useAuthContext } from '@/contexts/auth-context'
import { useOnboarding } from '@/hooks/use-onboarding'
import { startSpan } from '@/lib/observability'

const ONBOARDING_RESUME_WINDOW_DAYS = 30

function DashboardPageFallback() {
  return (
    <div aria-label="Loading page" aria-live="polite">
      <TableSkeleton rows={6} cols={5} />
    </div>
  )
}

function shouldRedirectToOnboarding(state: ReturnType<typeof useOnboarding>['data']): boolean {
  if (!state) return false
  if (state.completed) return false
  // Brand-new state: no started_at yet → take them straight there.
  if (!state.started_at) return true
  // Started recently — resume the wizard.
  const startedAt = new Date(state.started_at).getTime()
  if (Number.isNaN(startedAt)) return true
  const daysSince = (Date.now() - startedAt) / (1000 * 60 * 60 * 24)
  return daysSince <= ONBOARDING_RESUME_WINDOW_DAYS
}

export default function DashboardLayout() {
  const location = useLocation()
  const { profile } = useAuthContext()
  const { data: onboardingState, isLoading: onboardingLoading } = useOnboarding()
  const [helpOpen, setHelpOpen] = useState(false)

  const openHelp = useCallback(() => setHelpOpen(true), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])
  const openPalette = useCallback(() => {
    // CommandPalette listens to Cmd/Ctrl-K. Fire a synthetic event so `/` and
    // the footer "Press ?" link can trigger the same surface without lifting
    // its open-state into context.
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    )
  }, [])

  useKeyboardShortcuts({ onOpenHelp: openHelp, onOpenPalette: openPalette })

  // Allow components elsewhere (e.g. sidebar footer link) to open the help overlay.
  useEffect(() => {
    const open = () => setHelpOpen(true)
    window.addEventListener(OPEN_HELP_EVENT, open)
    return () => window.removeEventListener(OPEN_HELP_EVENT, open)
  }, [])

  // Sentry shell-mount marker. Closes synchronously after layout hydrates;
  // child queries roll into their own nav-transactions.
  useEffect(() => {
    startSpan('dashboard.shell.mount', 'navigation', () => {
      /* marker only */
    })
  }, [])

  // First-run onboarding redirect for org admins. Runs before rendering the
  // dashboard chrome so new tenants never see the wrong shell flash.
  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'super_admin'
  const onOnboardingPath = location.pathname.startsWith('/onboarding')
  if (
    !onboardingLoading &&
    isAdmin &&
    !onOnboardingPath &&
    shouldRedirectToOnboarding(onboardingState)
  ) {
    return <Navigate to="/onboarding" replace />
  }

  // Surface isolation (F2): external tenant roles must not render the internal
  // staff dashboard, even by deep-link. Mirror the app's canonical landing
  // mapping (public-route.tsx / auth/invite.tsx): tenant_user → /site,
  // client_admin → /portal. (Data was already RLS-scoped, but this stops the
  // wrong-surface chrome + read-only views from rendering at all.)
  if (profile?.role === 'tenant_user') return <Navigate to="/site" replace />
  if (profile?.role === 'client_admin') return <Navigate to="/portal" replace />

  return (
    <RealtimeProvider>
      <SidebarProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-md focus:bg-brand-500 focus:text-white focus:shadow-lg"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen bg-surface-page">
          <Sidebar />
          {/* overflow-x-clip here (not on html/body) keeps the horizontal-overflow
              safety net WITHOUT breaking the sticky sidebar — this is a sibling of
              <Sidebar/>, so clipping its overflow can't affect the sidebar. */}
          <div className="flex-1 flex flex-col min-w-0 overflow-x-clip">
            <TrialBanner />
            <Topbar />
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 px-4 py-4 md:px-6 md:py-5 outline-none"
            >
              <ErrorBoundary>
                <Suspense fallback={<DashboardPageFallback />}>
                  {/* Subtle page-enter (rise + fade), re-keyed per route. No exit
                      animation so it never competes with Suspense/lazy loading. */}
                  <motion.div
                    key={location.pathname}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DURATION.base, ease: EASE_OUT }}
                  >
                    <Outlet />
                  </motion.div>
                </Suspense>
              </ErrorBoundary>
            </main>
          </div>
        </div>
        <CommandPalette />
        <ShortcutsHelp open={helpOpen} onClose={closeHelp} />
        <InstallPrompt />
      </SidebarProvider>
    </RealtimeProvider>
  )
}
