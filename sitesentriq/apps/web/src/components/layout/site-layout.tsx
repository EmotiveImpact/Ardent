// Wave 14 / Task 114 — Tenant portal layout.
//
// Single-property scoped. The signed-in user is a `tenant_user`
// (a property_contact) and only ever sees ONE property.
//
// Visually similar to the client portal but with a fixed
// property/client context in the header (no site switcher).
import { Suspense, useCallback, useEffect } from 'react'
import { Outlet, Link, useLocation, Navigate } from 'react-router'
import { Avatar, Dropdown, Spinner } from '@haumea/ui'
import { ErrorBoundary } from '@/components/shared/error-boundary'
import { LogOut, AlertCircle, Building2 } from 'lucide-react'
import { APP_NAME, CLIENT_HUB_NAME } from '@/lib/constants'
import { Wordmark } from '@haumea/ui'
import { useAuth } from '@/hooks/use-auth'
import { useTenantProperty } from '@/lib/site-portal/hooks'
import { signOut } from '@/lib/auth'
import { useOrgBranding } from '@/lib/branding/hooks'
import { applyOrgBranding, clearOrgBranding } from '@/lib/branding/apply'
import { isValidHex } from '@/lib/branding/validate'

const siteNav = [
  { label: 'Overview', path: '/site' },
  { label: 'Compliance', path: '/site/compliance' },
  { label: 'Visits', path: '/site/visits' },
  { label: 'Quotes', path: '/site/quotes' },
  { label: 'Contacts', path: '/site/contacts' },
]

export function SiteLayout() {
  const { user, profile, organisation, loading } = useAuth()
  const location = useLocation()
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'
  const { data: branding } = useOrgBranding(profile?.organisation_id ?? null)
  const { data: property } = useTenantProperty()

  // Apply org branding for the duration of this layout's mount.
  useEffect(() => {
    applyOrgBranding(branding ?? null)
    return () => clearOrgBranding()
  }, [branding])

  const handleSignOut = useCallback(() => {
    void signOut()
  }, [])

  // Auth gate — wait for auth context, then ensure tenant_user.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  // Non-tenant users get redirected back to the dashboard.
  if (profile && profile.role !== 'tenant_user') {
    return <Navigate to="/dashboard" replace />
  }

  const brandingOn = !!branding?.branding_enabled
  const accentValid = brandingOn && isValidHex(branding?.accent_color ?? null)
  const orgName = organisation?.name ?? APP_NAME
  const propertyName = property?.name ?? 'Your site'
  const clientName = property?.clients?.name

  return (
    <div className="min-h-screen bg-surface-page flex flex-col">
      <header className="border-b border-border-default bg-surface-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-wrap md:flex-nowrap items-center gap-y-2 min-h-[56px] py-2 md:py-0">
          {/* Logo / FM org name. White-label takes priority — when the
              FM org has branding on we show their mark; otherwise we
              show the Haumea lockup (Wordmark already includes the H mark). */}
          <div className="flex items-center gap-2.5 mr-4 md:mr-6 min-w-0">
            {brandingOn && branding?.logo_url ? (
              <img
                src={branding.logo_url}
                alt={`${orgName} logo`}
                className="h-7 max-w-[140px] object-contain"
              />
            ) : brandingOn ? (
              <>
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    accentValid ? '' : 'bg-brand-500'
                  }`}
                  style={accentValid ? { background: 'var(--portal-accent)' } : undefined}
                >
                  <span className="text-background font-bold text-micro">
                    {orgName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-body font-semibold text-text-primary tracking-[-0.01em] truncate max-w-[120px] sm:max-w-none">
                  {orgName}
                </span>
              </>
            ) : (
              <Wordmark size="sm" className="text-text-primary" />
            )}
          </div>

          {/* Site context — fixed (no switcher). */}
          <div className="flex items-center gap-2 mr-auto px-3 py-1.5 rounded-lg border border-border-default bg-surface-page text-label">
            <Building2 size={14} className="text-text-muted" />
            <div className="leading-tight">
              <div className="font-medium text-text-secondary max-w-[160px] md:max-w-[260px] truncate">
                {propertyName}
              </div>
              {clientName && (
                <div className="text-micro text-text-muted truncate max-w-[160px] md:max-w-[260px]">
                  {clientName}
                </div>
              )}
            </div>
          </div>

          {/* Raise call-out CTA */}
          <Link
            to="/site/raise-callout"
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-semibold text-background border transition-colors mr-2 shadow-sm ${
              accentValid ? '' : 'bg-brand-500 hover:bg-brand-600 border-brand-500'
            }`}
            style={
              accentValid
                ? { background: 'var(--portal-accent)', borderColor: 'var(--portal-accent)' }
                : undefined
            }
          >
            <AlertCircle size={13} />
            Raise a Call-Out
          </Link>

          {/* Nav tabs */}
          <nav className="hidden md:flex gap-1 flex-1">
            {siteNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-label px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                  location.pathname === item.path
                    ? 'text-text-primary font-medium bg-surface-elevated'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-page'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* User dropdown */}
          <Dropdown>
            {/* HeroUI v3 Dropdown.Trigger renders the underlying <button>;
                pass class/aria directly so we don't nest <button> inside <button>. */}
            <Dropdown.Trigger className="cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-page transition-colors">
              <Avatar size="sm" className="w-7 h-7 bg-foreground text-background text-micro">
                <Avatar.Fallback>{displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
              </Avatar>
              <span className="text-label font-medium text-text-secondary hidden sm:inline">
                {displayName}
              </span>
            </Dropdown.Trigger>
            <Dropdown.Popover>
              <Dropdown.Menu aria-label="User menu">
                {/* No "Profile" item: there is no /site profile route, so it was
                    a dead no-op. Removed rather than ship a button that does
                    nothing. (A tenant profile page would be a separate feature.) */}
                <Dropdown.Item id="logout" textValue="Log Out" onAction={handleSignOut}>
                  <LogOut size={14} className="mr-2 inline text-text-muted" />
                  Log Out
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-border-default">
          <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto scrollbar-hide py-2 items-center">
            <Link
              to="/site/raise-callout"
              className={`text-label px-3 py-1.5 rounded-md whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 text-background font-semibold ${
                accentValid ? '' : 'bg-brand-500 hover:bg-brand-600'
              }`}
              style={accentValid ? { background: 'var(--portal-accent)' } : undefined}
            >
              <AlertCircle size={12} />
              Call-Out
            </Link>
            {siteNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-label px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
                  location.pathname === item.path
                    ? 'text-text-primary font-medium bg-surface-elevated'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-page'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6 w-full flex-1">
        {/*
         * Inner Suspense + ErrorBoundary around the route Outlet — same
         * reasoning as PortalLayout. Without this, a lazy chunk for the
         * single-property /site/* page would bubble up to the App-root
         * spinner and the whole site portal chrome would disappear while
         * loading, looking like a hang. ChunkLoadError now triggers a
         * recovery reload via the ErrorBoundary.
         */}
        <ErrorBoundary homePath="/site">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <Spinner size="lg" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="max-w-7xl mx-auto px-4 md:px-6 py-3 w-full">
        <div className="text-micro text-text-muted">
          {brandingOn ? (
            <>
              <span className="font-medium text-text-secondary">{orgName}</span>
              <span className="mx-1.5">·</span>
              <span>{CLIENT_HUB_NAME}</span>
              <span className="mx-1.5">·</span>
              <span className="text-text-muted/80">Powered by {APP_NAME}</span>
            </>
          ) : (
            <span>Powered by {APP_NAME}</span>
          )}
        </div>
      </footer>
    </div>
  )
}
