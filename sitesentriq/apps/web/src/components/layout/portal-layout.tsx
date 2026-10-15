import { createContext, Suspense, useCallback, useContext, useEffect, useState } from 'react'
import { Outlet, Link, Navigate, useLocation } from 'react-router'
import { Spinner } from '@haumea/ui'
import { ErrorBoundary } from '@/components/shared/error-boundary'
import { Avatar, Dropdown } from '@haumea/ui'
import { LogOut, Building2, ChevronDown, AlertCircle, ArrowLeft } from 'lucide-react'
import { APP_NAME, CLIENT_HUB_NAME } from '@/lib/constants'
import { Wordmark } from '@haumea/ui'
import { useAuth } from '@/hooks/use-auth'
import { useProperties } from '@/hooks/use-properties'
import { signOut } from '@/lib/auth'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { ShortcutsHelp } from '@/components/shared/shortcuts-help'
import { OPEN_HELP_EVENT } from '@/lib/shortcut-events'
import { useOrgBranding } from '@/lib/branding/hooks'
import { applyOrgBranding, clearOrgBranding } from '@/lib/branding/apply'
import { isValidHex } from '@/lib/branding/validate'
import { RealtimeProvider } from '@/contexts/realtime-context'

const portalNav = [
  { label: 'Overview', path: '/portal' },
  { label: 'Portfolio', path: '/portal/portfolio' },
  { label: 'Compliance', path: '/portal/compliance' },
  { label: 'Visits', path: '/portal/visits' },
  { label: 'Documents', path: '/portal/documents' },
  { label: 'Invoices', path: '/portal/invoices' },
  { label: 'Quotes', path: '/portal/quotes' },
  { label: 'Actions', path: '/portal/actions' },
  { label: 'Contact', path: '/portal/contact' },
]

interface PortalPropertyContextValue {
  selectedPropertyId: string | null
  setSelectedPropertyId: (id: string | null) => void
}

const PortalPropertyContext = createContext<PortalPropertyContextValue>({
  selectedPropertyId: null,
  setSelectedPropertyId: () => {},
})

export function usePortalProperty() {
  return useContext(PortalPropertyContext)
}

export function PortalLayout() {
  const { user, profile, organisation } = useAuth()
  const location = useLocation()
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'
  // Scope the site switcher to the client_admin's client (RLS 00096 backs this;
  // NULL for staff preview = all sites).
  const { data: properties } = useProperties(profile?.client_id ?? undefined)
  const { data: branding } = useOrgBranding(profile?.organisation_id ?? null)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // Apply branding CSS vars to <html> while we're in the portal scope.
  useEffect(() => {
    applyOrgBranding(branding ?? null)
    return () => clearOrgBranding()
  }, [branding])

  const brandingOn = !!branding?.branding_enabled
  const accentValid = brandingOn && isValidHex(branding?.accent_color ?? null)
  const orgName = organisation?.name ?? APP_NAME

  const selectedProperty = properties?.find((p: any) => p.id === selectedPropertyId)
  const siteLabel = selectedProperty ? selectedProperty.name : 'All Sites'

  const openHelp = useCallback(() => setHelpOpen(true), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])
  const openPalette = useCallback(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    )
  }, [])

  useKeyboardShortcuts({ onOpenHelp: openHelp, onOpenPalette: openPalette })

  useEffect(() => {
    const open = () => setHelpOpen(true)
    window.addEventListener(OPEN_HELP_EVENT, open)
    return () => window.removeEventListener(OPEN_HELP_EVENT, open)
  }, [])

  // Wave G1 — Escape closes the site picker. Without this the only way to
  // dismiss it without selecting was to click the backdrop, which is hidden
  // from keyboard users.
  useEffect(() => {
    if (!siteDropdownOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSiteDropdownOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [siteDropdownOpen])

  // Surface isolation (F1): the client portal is for `client_admin` tenants only.
  // Internal staff and site (tenant_user) accounts get redirected to their own
  // handled auth + the loading spinner, so `profile` is settled here.)
  //
  // Surface isolation: `tenant_user` (single-property) accounts belong on /site,
  // so bounce them there. `client_admin` is the portal's primary audience. But
  // INTERNAL STAFF are allowed in as a preview — the dashboard topbar's "Client
  // Hub" button exists specifically to "open the Client Hub as your client sees
  // it", so staff must NOT be redirected straight back to /dashboard (which made
  // the button appear to do nothing). Staff already have broader access than the
  // portal exposes, so this is a narrower read-only view, not an escalation.
  if (profile && profile.role === 'tenant_user') {
    return <Navigate to="/site" replace />
  }

  return (
    <RealtimeProvider>
      <PortalPropertyContext.Provider value={{ selectedPropertyId, setSelectedPropertyId }}>
        <div className="min-h-screen bg-surface-page">
        <header className="border-b border-border-default bg-surface-card">
          {/* Top row: logo, site switcher, primary actions, user. The nav tabs
              live on their OWN row below (desktop) / a scroll strip (mobile) so
              this bar never crams onto two lines. */}
          <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-nowrap items-center min-h-[56px] py-2 md:py-0 gap-2">
            <div className="flex items-center gap-2.5 mr-2 md:mr-6 min-w-0 flex-shrink">
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

            {/* Site / Property Switcher — mr-auto pushes the action group right */}
            <div className="relative mr-auto min-w-0">
              <button
                type="button"
                onClick={() => setSiteDropdownOpen(!siteDropdownOpen)}
                aria-haspopup="listbox"
                aria-expanded={siteDropdownOpen}
                aria-label={`Switch site, currently ${siteLabel}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-default bg-surface-card hover:bg-surface-page transition-colors text-label"
              >
                <Building2 size={14} className="text-text-muted" />
                <span className="font-medium text-text-secondary max-w-[140px] md:max-w-[180px] truncate">{siteLabel}</span>
                <ChevronDown size={12} className="text-text-muted" />
              </button>
              {siteDropdownOpen && (
                <>
                  {/* Wave G1 — backdrop for click-outside dismiss. Was a
                      <div onClick> which was un-keyboard-reachable. Now a real
                      <button> so keyboard users can also tab to it and Esc
                      handler covers the rest. aria-hidden so the SR doesn't
                      announce a "Close site picker" button while it's reading
                      the listbox content immediately above. */}
                  <button
                    type="button"
                    aria-label="Close site picker"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setSiteDropdownOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div className="absolute top-full left-0 mt-1 z-20 w-64 bg-surface-card border border-border-default rounded-xl shadow-lg py-1 max-h-72 overflow-y-auto" role="listbox">
                    <button
                      onClick={() => { setSelectedPropertyId(null); setSiteDropdownOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-label transition-colors ${
                        selectedPropertyId === null
                          ? 'bg-accent-soft text-accent-soft-foreground font-medium'
                          : 'text-text-secondary hover:bg-surface-page'
                      }`}
                    >
                      All Sites
                    </button>
                    {properties?.map((property: any) => (
                      <button
                        key={property.id}
                        onClick={() => { setSelectedPropertyId(property.id); setSiteDropdownOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-label transition-colors ${
                          selectedPropertyId === property.id
                            ? 'bg-accent-soft text-accent-soft-foreground font-medium'
                            : 'text-text-secondary hover:bg-surface-page'
                        }`}
                      >
                        <div className="truncate">{property.name}</div>
                        <div className="text-micro text-text-muted truncate">{property.address}</div>
                      </button>
                    ))}
                    {(!properties || properties.length === 0) && (
                      <div className="px-3 py-2 text-caption text-text-muted">No properties found</div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Raise a Call-Out — primary CTA, separate from nav */}
            <Link
              to="/portal/raise-call-out"
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-semibold text-background border transition-colors mr-2 shadow-sm ${
                accentValid
                  ? ''
                  : 'bg-brand-500 hover:bg-brand-600 border-brand-500'
              }`}
              style={
                accentValid
                  ? {
                      background: 'var(--portal-accent)',
                      borderColor: 'var(--portal-accent)',
                    }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (accentValid) {
                  e.currentTarget.style.background = 'var(--portal-accent-dark)'
                  e.currentTarget.style.borderColor = 'var(--portal-accent-dark)'
                }
              }}
              onMouseLeave={(e) => {
                if (accentValid) {
                  e.currentTarget.style.background = 'var(--portal-accent)'
                  e.currentTarget.style.borderColor = 'var(--portal-accent)'
                }
              }}
            >
              <AlertCircle size={13} />
              Raise a Call-Out
            </Link>

            {/* Staff preview escape hatch: internal staff reach the Client Hub
                via the dashboard's "Client Hub" button to see it as the client
                does — give them an obvious way back. (tenant_user is redirected
                to /site before render, so a non-client_admin here is staff.) */}
            {profile && profile.role !== 'client_admin' && (
              <Link
                to="/dashboard"
                title="You're previewing the Client Hub — back to your dashboard"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 mr-1 rounded-lg text-caption font-medium text-text-secondary hover:bg-surface-page hover:text-text-primary transition-colors"
              >
                <ArrowLeft size={14} />
                Exit preview
              </Link>
            )}

            {/* User dropdown */}
            <Dropdown>
              {/* HeroUI v3 Dropdown.Trigger renders the underlying <button>;
                  pass class/aria directly so we don't nest <button> inside <button>. */}
              <Dropdown.Trigger className="cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-page transition-colors">
                <Avatar size="sm" className="w-7 h-7 bg-foreground text-background text-micro">
                  <Avatar.Fallback>{displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
                </Avatar>
                <span className="text-label font-medium text-text-secondary hidden sm:inline">{displayName}</span>
              </Dropdown.Trigger>
              <Dropdown.Popover>
                <Dropdown.Menu aria-label="User menu">
                  {/* No "Profile" item: there is no /portal profile route, so it
                      was a dead no-op. Removed rather than ship a button that does
                      nothing. (A client profile page would be a separate feature.) */}
                  <Dropdown.Item id="logout" textValue="Log Out" onAction={() => signOut()}>
                    <LogOut size={14} className="mr-2 inline text-text-muted" />
                    Log Out
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>

          {/* Desktop nav tabs — their OWN row (md+) so the top bar can't wrap.
              Horizontally scrollable if the tab set ever outgrows the width. */}
          <div className="hidden md:block border-t border-border-subtle">
            <nav className="max-w-7xl mx-auto px-4 md:px-6 flex gap-1 overflow-x-auto scrollbar-hide py-1.5 items-center">
              {portalNav.map((item) => (
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

          {/* Mobile nav tabs — horizontally scrollable, shown below md */}
          <div className="md:hidden border-t border-border-default">
            <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto scrollbar-hide py-2 items-center">
              <Link
                to="/portal/raise-call-out"
                className={`text-label px-3 py-1.5 rounded-md transition-colors whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 text-background font-semibold ${
                  accentValid ? '' : 'bg-brand-500 hover:bg-brand-600'
                }`}
                style={
                  accentValid
                    ? { background: 'var(--portal-accent)' }
                    : undefined
                }
              >
                <AlertCircle size={12} />
                Call-Out
              </Link>
              {portalNav.map((item) => (
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
        <main className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6">
          {/*
           * Inner Suspense + ErrorBoundary around the route Outlet so a
           * lazy chunk loading the portal page doesn't collapse the entire
           * SPA back to the App-root spinner (which unmounts the portal
           * chrome and looks like the whole page has stalled). On a chunk
           * load failure (e.g. stale precache after a deploy), the
           * ErrorBoundary's ChunkLoadError detection forces a single
           * hard reload to recover.
           */}
          <ErrorBoundary homePath="/portal">
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
        <footer className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-micro text-text-muted">
            {brandingOn ? (
              <>
                <span className="font-medium text-text-secondary">{orgName}</span>
                <span className="mx-1.5">·</span>
                <span>{CLIENT_HUB_NAME}</span>
                <span className="mx-1.5">·</span>
                <span className="text-text-muted/80">Powered by {APP_NAME}</span>
                {branding?.portal_terms_url && (
                  <>
                    <span className="mx-1.5">·</span>
                    <a
                      href={branding.portal_terms_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-text-secondary underline-offset-2 hover:underline"
                    >
                      Terms
                    </a>
                  </>
                )}
              </>
            ) : (
              <span>Powered by Haumea</span>
            )}
          </div>
          <button
            type="button"
            onClick={openHelp}
            className="text-text-muted text-micro hover:text-text-secondary transition-colors"
          >
            Press ? for shortcuts
          </button>
        </footer>
        <ShortcutsHelp open={helpOpen} onClose={closeHelp} />
        </div>
      </PortalPropertyContext.Provider>
    </RealtimeProvider>
  )
}
