import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useLocation } from 'react-router'
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  ShieldCheck,
  Wrench,
  Calendar,
  CalendarDays,
  Briefcase,
  FileText,
  FolderOpen,
  FileBarChart,
  Receipt,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeft,
  AlertTriangle,
  ScrollText,
  HardHat,
  Truck,
  Smartphone,
  Boxes,
  X,
  ChevronDown,
  Archive,
  BookOpen,
  Sparkles,
  Plug,
  Activity,
  Clock,
  Upload,
  Timer,
  Palette,
  ShieldHalf,
  ShoppingCart,
  MapPinned,
  Store,
  Bell,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Permission } from '@/lib/permissions'
import { Tooltip } from '@haumea/ui'
import { Wordmark } from '@haumea/ui'
import { useSidebar } from './sidebar-context'
import { usePermissions } from '@/hooks/use-permissions'
import { prefetchRoute } from '@/lib/route-prefetch'
import { OPEN_HELP_EVENT } from '@/lib/shortcut-events'
import { useSubscription } from '@/hooks/use-subscription'
import { useUnreadCount } from '@/hooks/use-notifications'
import { planAllows, type GatedFeature } from '@/lib/billing/plan-gating'
import { APP_VERSION } from '@/lib/constants'

interface NavItem {
  label: string
  icon: LucideIcon
  path: string
  permission?: Permission
  /** If set, only visible to these roles. */
  roles?: string[]
  /** When set, a "Growth"/"Enterprise" badge shows if the current plan can't access. */
  planFeature?: GatedFeature
  /** Optional dynamic count badge (e.g. unread notifications). */
  badgeKey?: 'notificationsUnread'
}

interface NavSection {
  key: string
  title: string
  icon: LucideIcon
  items: NavItem[]
}

const STORAGE_KEY = 'haumea_sidebar_sections'

const navSections: NavSection[] = [
  {
    key: 'crm',
    title: 'CRM',
    icon: Users,
    items: [
      { label: 'Clients', icon: Users, path: '/dashboard/clients', permission: 'clients:read' },
      { label: 'Properties', icon: Building2, path: '/dashboard/properties', permission: 'properties:read' },
    ],
  },
  {
    key: 'assets',
    title: 'Asset Management',
    icon: Package,
    items: [
      { label: 'Assets', icon: Package, path: '/dashboard/assets', permission: 'assets:read' },
      { label: 'Stock', icon: Boxes, path: '/dashboard/stock', permission: 'assets:read' },
      { label: 'Actions', icon: AlertTriangle, path: '/dashboard/actions', permission: 'compliance:read' },
    ],
  },
  {
    key: 'jobs',
    title: 'Job Management',
    icon: Briefcase,
    items: [
      { label: 'Jobs', icon: Briefcase, path: '/dashboard/jobs', permission: 'jobs:read' },
      { label: 'Scheduler', icon: Calendar, path: '/dashboard/scheduler', permission: 'scheduler:read' },
      { label: 'Visit Schedule', icon: CalendarDays, path: '/dashboard/schedule', permission: 'scheduler:read' },
      { label: 'Engineer Tracker', icon: MapPinned, path: '/dashboard/engineer-tracker', permission: 'scheduler:read' },
      { label: 'Field Mode', icon: Smartphone, path: '/dashboard/field', permission: 'jobs:read', roles: ['engineer', 'org_admin', 'super_admin'] },
    ],
  },
  {
    key: 'workforce',
    title: 'Workforce',
    icon: HardHat,
    items: [
      { label: 'Engineers', icon: HardHat, path: '/dashboard/engineers', permission: 'users:read' },
      { label: 'Subcontractors', icon: Truck, path: '/dashboard/subcontractors', permission: 'users:read' },
      { label: 'My timesheet', icon: Timer, path: '/dashboard/timesheet' },
    ],
  },
  {
    key: 'compliance',
    title: 'Compliance',
    icon: ShieldCheck,
    items: [
      { label: 'Compliance', icon: ShieldCheck, path: '/dashboard/compliance', permission: 'compliance:read' },
      { label: 'Maintenance', icon: Wrench, path: '/dashboard/maintenance', permission: 'maintenance:read' },
    ],
  },
  {
    key: 'finance',
    title: 'Finance',
    icon: Receipt,
    items: [
      { label: 'Quotes', icon: FileBarChart, path: '/dashboard/quotes', permission: 'quotes:read' },
      { label: 'Invoices', icon: Receipt, path: '/dashboard/invoices', permission: 'invoices:read' },
      { label: 'Purchase Orders', icon: ShoppingCart, path: '/dashboard/purchase-orders', permission: 'invoices:read' },
      { label: 'Suppliers', icon: Store, path: '/dashboard/suppliers', permission: 'invoices:read' },
      { label: 'Contracts', icon: ScrollText, path: '/dashboard/contracts', permission: 'invoices:read' },
    ],
  },
  {
    key: 'reports',
    title: 'Reports & Docs',
    icon: FileText,
    items: [
      { label: 'Reports', icon: FileText, path: '/dashboard/reports', permission: 'reports:read' },
      { label: 'Documents', icon: FolderOpen, path: '/dashboard/documents', permission: 'documents:read' },
      { label: 'Analytics', icon: BarChart3, path: '/dashboard/analytics', permission: 'analytics:read' },
      { label: 'Insights', icon: Sparkles, path: '/dashboard/insights', planFeature: 'insights' },
    ],
  },
  {
    key: 'knowledge',
    title: 'Knowledge Base',
    icon: BookOpen,
    items: [
      { label: 'Knowledge Base', icon: BookOpen, path: '/dashboard/knowledge-base' },
    ],
  },
  {
    key: 'system',
    title: 'System',
    icon: Settings,
    items: [
      { label: 'Notifications', icon: Bell, path: '/dashboard/notifications', badgeKey: 'notificationsUnread' },
      { label: 'Archives', icon: Archive, path: '/dashboard/archives' },
      { label: 'Integrations', icon: Plug, path: '/dashboard/integrations' },
      { label: 'Audit log', icon: Activity, path: '/dashboard/audit', permission: 'audit:read', roles: ['org_admin', 'super_admin', 'auditor'] },
      { label: 'Auto-assign', icon: Sparkles, path: '/dashboard/auto-assign', permission: 'settings:read' },
      { label: 'SLA Policies', icon: Clock, path: '/dashboard/settings/sla', permission: 'settings:write', roles: ['org_admin', 'super_admin'] },
      { label: 'Bulk import', icon: Upload, path: '/dashboard/import', permission: 'import:write', roles: ['org_admin', 'super_admin'] },
      { label: 'Branding', icon: Palette, path: '/dashboard/settings/branding', permission: 'branding:write', roles: ['org_admin', 'super_admin'], planFeature: 'branding' },
      // GDPR — Wave 12 / Task 108. Admins land on the admin console; everyone
      // else gets the self-service privacy page. One nav entry per user.
      { label: 'Data & Privacy', icon: ShieldHalf, path: '/dashboard/settings/data', permission: 'data:export', roles: ['org_admin', 'super_admin'] },
      { label: 'Data & Privacy', icon: ShieldHalf, path: '/dashboard/settings/privacy', permission: 'privacy:read', roles: ['scheduler', 'finance', 'engineer', 'client_admin', 'auditor'] },
      { label: 'Settings', icon: Settings, path: '/dashboard/settings', permission: 'settings:read' },
    ],
  },
]

function loadOpenSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  // Default: all sections COLLAPSED on first visit. The auto-open
  // effect (route-driven) below opens whichever section contains the
  // current page so users always see where they are. Choice persists
  // in localStorage.
  const defaults: Record<string, boolean> = {}
  for (const s of navSections) defaults[s.key] = false
  return defaults
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(loadOpenSections)
  const { mobileOpen, setMobileOpen } = useSidebar()
  const location = useLocation()
  const { can, role } = usePermissions()
  const { data: subscription } = useSubscription()
  const { data: unreadCount } = useUnreadCount()

  // Persist open sections
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(openSections)) } catch { /* ignore */ }
  }, [openSections])

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Filter nav sections to only show items the user has permission for
  const filteredSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              (!item.permission || can(item.permission)) &&
              (!item.roles || (role ? item.roles.includes(role) : false))
          ),
        }))
        .filter((section) => section.items.length > 0),
    [can, role]
  )

  const activeSectionKey = useMemo(() => {
    const activeSection = filteredSections.find((section) =>
      section.items.some((item) =>
        item.path === '/dashboard'
          ? location.pathname === '/dashboard'
          : location.pathname.startsWith(item.path)
      )
    )
    return activeSection?.key ?? null
  }, [filteredSections, location.pathname])

  // Auto-open the active section ON ROUTE CHANGE only.
  //
  // Previously this was derived during render via
  //   isOpen = openSections[key] || activeSectionKey === key
  // which had a nasty side-effect: toggling a section closed while
  // its route was active was a no-op — the OR clause forced it back
  // open every render. Switching to an effect keyed on
  // `activeSectionKey` means the auto-open fires exactly once when
  // the user navigates into a new section, and `toggleSection`
  // stays in full control after that.
  useEffect(() => {
    if (!activeSectionKey) return
    setOpenSections((prev) =>
      prev[activeSectionKey] ? prev : { ...prev, [activeSectionKey]: true }
    )
  }, [activeSectionKey])

  const handleNavClick = () => {
    setMobileOpen(false)
  }

  // Wave G1 a11y — Escape closes the mobile sidebar overlay. Without this
  // keyboard users had no way out except tabbing to a nav link or the
  // hamburger button itself.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen, setMobileOpen])

  const sidebarContent = (
    <>
      {/* Logo — H mark + HAUMEA wordmark (lockup). Collapsed sidebar
          renders the mark only. Left padding = 20px (pl-5) to match
          the nav-item icon column below: nav items use px-2.5 outer
          container + px-2.5 inner link = 10+10px, so all icons —
          dashboard, section icons, item icons — share the same left
          edge as the H tile. */}
      <div className="flex items-center justify-between h-14 pl-3 pr-4 border-b border-white/[0.08]">
        <Link to="/dashboard" className="flex items-center min-w-0" onClick={handleNavClick}>
          {collapsed ? (
            <Wordmark size="md" textOnly />
          ) : (
            <Wordmark size="md" className="text-white truncate" />
          )}
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-surface-card/[0.06] transition-colors"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Dashboard link — always visible at top */}
      <div className="px-2.5 pt-3 pb-1">
        <NavLinkMaybeTooltip label="Dashboard" collapsed={collapsed}>
          <Link
            to="/dashboard"
            onClick={handleNavClick}
            onMouseEnter={() => prefetchRoute('/dashboard')}
            onFocus={() => prefetchRoute('/dashboard')}
            className={`group relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-label transition-all duration-150 ${
              location.pathname === '/dashboard'
                ? 'text-white font-medium'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            {location.pathname === '/dashboard' && (
              <motion.span
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-md bg-white/[0.08]"
                transition={{ type: 'spring', stiffness: 600, damping: 42 }}
              />
            )}
            <LayoutDashboard
              size={18}
              strokeWidth={location.pathname === '/dashboard' ? 2 : 1.5}
              className={`flex-shrink-0 transition-colors ${
                location.pathname === '/dashboard' ? 'text-brand-400' : 'text-white/40 group-hover:text-white/60'
              }`}
            />
            {!collapsed && <span>Dashboard</span>}
          </Link>
        </NavLinkMaybeTooltip>
      </div>

      {/* Navigation — collapsible sections */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-1 px-2.5">
        {filteredSections.map((section) => {
          const isOpen = openSections[section.key] ?? false
          // Boundary-aware match (same rule as the per-item isActive below) so a
          // prefix collision like /dashboard/scheduler vs /dashboard/schedule
          // can't light up the wrong section header.
          const hasActiveItem = section.items.some(item =>
            item.path === '/dashboard'
              ? location.pathname === '/dashboard'
              : location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          )

          return (
            <div key={section.key} className="mt-4 first:mt-1.5">
              {/* Section header — clickable toggle */}
              {!collapsed ? (
                <button
                  onClick={() => toggleSection(section.key)}
                  className={`w-full flex items-center justify-between px-2.5 py-[6px] rounded-md text-xs font-medium uppercase tracking-wider transition-colors ${
                    hasActiveItem
                      ? 'text-white/60'
                      : 'text-text-muted hover:text-white/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <section.icon size={14} className={hasActiveItem ? 'text-brand-400' : 'text-white/30'} />
                    {section.title}
                  </span>
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                  />
                </button>
              ) : (
                <div className="mx-auto w-5 h-px bg-surface-card/10 my-2" />
              )}

              {/* Section items — smooth height collapse/expand (always mounted;
                  animates auto↔0). Collapsed sidebar always shows the icons. */}
              <motion.div
                initial={false}
                animate={{
                  height: collapsed || isOpen ? 'auto' : 0,
                  opacity: collapsed || isOpen ? 1 : 0,
                }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-0.5 overflow-hidden"
              >
                {section.items.map((item) => {
                  const isActive =
                    item.path === '/dashboard'
                      ? location.pathname === '/dashboard'
                      : // Boundary-aware match: a bare startsWith made
                        // '/dashboard/scheduler' also light up the sibling
                        // '/dashboard/schedule' item (prefix collision). Require
                        // either an exact match or a real path-segment boundary.
                        location.pathname === item.path ||
                        location.pathname.startsWith(item.path + '/')
                  return (
                    <NavLinkMaybeTooltip key={item.path} label={item.label} collapsed={collapsed}>
                      <Link
                        to={item.path}
                        onClick={handleNavClick}
                        aria-current={isActive ? 'page' : undefined}
                        onMouseEnter={() => prefetchRoute(item.path)}
                        onFocus={() => prefetchRoute(item.path)}
                        className={`group relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-label transition-all duration-150 ${
                          isActive
                            ? 'text-white font-medium'
                            : 'text-white/50 hover:text-white/80'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="sidebar-active-pill"
                            className="absolute inset-0 rounded-md bg-white/[0.08]"
                            transition={{ type: 'spring', stiffness: 600, damping: 42 }}
                          />
                        )}
                        <item.icon
                          size={18}
                          strokeWidth={isActive ? 2 : 1.5}
                          className={`flex-shrink-0 transition-colors ${
                            isActive ? 'text-brand-400' : 'text-white/40 group-hover:text-white/60'
                          }`}
                        />
                        {!collapsed && (
                          <span className="flex-1 flex items-center justify-between gap-2 min-w-0">
                            <span className="truncate">{item.label}</span>
                            {item.planFeature && !planAllows(subscription?.plan, item.planFeature) && (
                              <span
                                className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 border border-brand-500/30 flex-shrink-0"
                                aria-label="Available on Growth plan"
                              >
                                Growth
                              </span>
                            )}
                            {item.badgeKey === 'notificationsUnread' && (unreadCount ?? 0) > 0 && (
                              <span
                                className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-metric-rose rounded-full px-1.5 flex-shrink-0"
                                aria-label={`${unreadCount} unread notifications`}
                              >
                                {(unreadCount ?? 0) > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </span>
                        )}
                      </Link>
                    </NavLinkMaybeTooltip>
                  )
                })}
              </motion.div>
            </div>
          )
        })}
      </nav>

      {/* Shortcuts hint + version — hidden when collapsed for breathing room */}
      {!collapsed && (
        <div className="hidden md:flex items-center justify-between gap-2 px-3 pt-2.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_HELP_EVENT))}
            className="text-white/35 hover:text-white/65 text-micro transition-colors"
          >
            Press <span className="font-mono">?</span> for shortcuts
          </button>
          <span
            className="text-white/25 text-[10px] font-mono"
            title="Application version (semver). See CHANGELOG.md for history."
          >
            v{APP_VERSION.split('@').pop() ?? '0.0.0'}
          </span>
        </div>
      )}

      {/* Collapse toggle — hidden on mobile */}
      <div className="hidden md:block p-2.5 border-t border-white/[0.08]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-label text-white/40 hover:text-white/70 hover:bg-surface-card/[0.06] transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        role="navigation"
        aria-label="Primary"
        className={`hidden md:flex h-screen sticky top-0 flex-col bg-surface-sidebar transition-all duration-200 ${
          collapsed ? 'w-[68px]' : 'w-[240px]'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
      {mobileOpen && (
        <>
          {/* Wave G1 — backdrop is now a real <button> so click-outside
              dismiss is announced + reachable. aria-hidden + tabIndex=-1
              keeps the SR focus on the sidebar nav itself; the ESC handler
              above owns keyboard dismiss. */}
          <motion.button
            type="button"
            aria-label="Close navigation menu"
            aria-hidden
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm cursor-default"
            onClick={() => setMobileOpen(false)}
          />
          <motion.aside
            role="navigation"
            aria-label="Primary"
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            className="md:hidden fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col bg-surface-sidebar shadow-xl"
          >
            {sidebarContent}
          </motion.aside>
        </>
      )}
      </AnimatePresence>
    </>
  )
}

/**
 * Wraps a sidebar nav link with a HeroUI <Tooltip> that surfaces the
 * link's label when the sidebar is in icon-only (collapsed) mode.
 *
 * When the sidebar is expanded, the Tooltip is bypassed entirely so we
 * don't pay for a popover per nav item or risk inadvertently triggering
 * one when hovering a label that's already visible.
 */
function NavLinkMaybeTooltip({
  label,
  collapsed,
  children,
}: {
  label: string
  collapsed: boolean
  children: React.ReactNode
}) {
  if (!collapsed) return <>{children}</>
  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger>{children}</Tooltip.Trigger>
      {/* Clean rectangular chip — no arrow, no border. Matches the
          sidebar's dark navy with white text. The slight offset keeps
          it visually separate from the icon without needing a pointer. */}
      <Tooltip.Content
        placement="right"
        className="!bg-surface-sidebar !text-white !rounded-md !border-0 !shadow-lg !px-3 !py-1.5 !text-caption !font-medium !ml-2"
      >
        {label}
      </Tooltip.Content>
    </Tooltip>
  )
}
