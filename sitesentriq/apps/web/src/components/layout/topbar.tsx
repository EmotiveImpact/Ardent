import { motion } from 'framer-motion'
import { Avatar, Dropdown, Tooltip } from '@haumea/ui'
import {
  Bell,
  LogOut,
  User,
  Settings,
  CheckCheck,
  Search,
  Menu,
  Eye,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { signOut } from '@/lib/auth'
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from '@/hooks/use-notifications'
import { useOrganisation } from '@/hooks/use-organisation'
import { APP_VERSION, USER_ROLES } from '@/lib/constants'
import { useSidebar } from './sidebar-context'
import { useRef, useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import { useRealtimeNotifications } from '@/hooks/use-realtime-notifications'
import { useRealtimeContext } from '@/contexts/realtime-context'
import { RealtimeStatusPill } from '@/components/layout/realtime-status'
import { NotificationRow } from '@/components/shared/notification-row'

export function Topbar() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { organisation } = useOrganisation()
  const { data: notifications } = useNotifications()
  const { data: unreadCount } = useUnreadCount()
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()
  const { toggleMobile } = useSidebar()

  const [notifOpen, setNotifOpen] = useState(false)
  const [bellRing, setBellRing] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Realtime notification subscription
  const handleNewNotification = useCallback(() => {
    setBellRing(true)
    setTimeout(() => setBellRing(false), 1000)
  }, [])
  useRealtimeNotifications(handleNewNotification)

  // Connection state + presence count from RealtimeProvider
  const {
    status: realtimeStatus,
    presenceCount,
    perTable: realtimeChannels,
    lastEvent: realtimeLastEvent,
  } = useRealtimeContext()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    if (notifOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen])

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'
  const recentNotifications = (notifications || []).slice(0, 5)
  const showRealtimeDiagnostics =
    import.meta.env.DEV ||
    import.meta.env.VITE_DEBUG_REALTIME === 'true' ||
    profile?.role === USER_ROLES.SUPER_ADMIN

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border-default bg-surface-card flex items-center justify-between px-3 md:px-5">
      {/* Left — hamburger + search */}
      <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
        {/* Hamburger — mobile only. ≥40px tap target. */}
        <button
          onClick={toggleMobile}
          className="md:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-lg hover:bg-surface-page transition-colors text-text-secondary hover:text-text-primary"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Search — hidden on very small screens, shown on sm+ */}
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
          className="relative w-full max-w-[260px] hidden sm:flex items-center gap-2 pl-9 pr-2.5 py-1.5 text-caption bg-surface-card border border-border-default rounded-lg hover:border-border-strong hover:bg-surface-card transition-all text-left cursor-text"
          aria-label="Open command palette"
        >
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <span className="text-text-muted flex-1">Search or navigate...</span>
          <kbd className="text-[10px] text-text-muted bg-surface-card border border-border-default rounded px-1.5 py-0.5 font-medium flex-shrink-0">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
        {/* Realtime + presence pills — hidden on the narrowest screens so the
            bar stays uncrowded at ~360px (notifications + avatar are the
            essentials there). */}
        <div className="hidden sm:flex">
          <RealtimeStatusPill
            status={realtimeStatus}
            presenceCount={presenceCount}
            perTable={realtimeChannels}
            lastEvent={realtimeLastEvent}
            appVersion={APP_VERSION}
            showDiagnostics={showRealtimeDiagnostics}
          />
        </div>

        {/* Theme switching now lives in Settings → Appearance only —
            removed the topbar quick-toggle to declutter the bar. */}

        {/* Client View Toggle */}
        <Tooltip delay={400}>
          <Tooltip.Trigger>
            <button
              onClick={() => navigate('/portal')}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-caption font-medium text-text-secondary hover:bg-surface-page hover:text-text-primary transition-colors"
            >
              <Eye size={14} />
              Client Hub
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom">
            <Tooltip.Arrow />
            Open the Client Hub as your client sees it
          </Tooltip.Content>
        </Tooltip>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <Tooltip delay={400}>
            <Tooltip.Trigger>
              <button
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative cursor-pointer flex items-center justify-center w-10 h-10 rounded-lg hover:bg-surface-page transition-colors text-text-secondary hover:text-text-primary"
                aria-label="Notifications"
              >
                <Bell size={18} aria-hidden="true" className={bellRing ? 'animate-bell-ring' : ''} />
                {(unreadCount ?? 0) > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold text-white bg-metric-rose rounded-full px-1">
                    {(unreadCount ?? 0) > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom">
              <Tooltip.Arrow />
              {(unreadCount ?? 0) > 0 ? `${unreadCount} new notifications` : 'Notifications'}
            </Tooltip.Content>
          </Tooltip>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-[calc(100vw-1.5rem)] max-w-80 sm:w-80 bg-surface-card border border-border-default rounded-xl shadow-xl z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
                <span className="text-label font-semibold text-text-primary">Notifications</span>
                {(unreadCount ?? 0) > 0 && (
                  <button
                    onClick={() => markAllAsRead.mutate()}
                    className="text-caption text-brand-500 hover:text-brand-600 flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <CheckCheck size={12} />
                    Mark all read
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="overflow-y-auto max-h-[320px]">
                {recentNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                    <Bell size={22} strokeWidth={1.5} className="mb-2" />
                    <p className="text-label">No notifications yet</p>
                  </div>
                ) : (
                  recentNotifications.map((n, i) => (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
                    >
                      <NotificationRow
                        notification={n}
                        onActivate={(notif) => { if (!notif.read) markAsRead.mutate(notif.id) }}
                        onSwipeArchive={(notif) => { if (!notif.read) markAsRead.mutate(notif.id) }}
                        afterNavigate={() => setNotifOpen(false)}
                      />
                    </motion.div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="py-1 px-2 border-t border-border-default">
                <Link
                  to="/dashboard/notifications"
                  onClick={() => setNotifOpen(false)}
                  className="block text-center text-caption text-brand-500 hover:text-brand-600 py-2 font-medium"
                >
                  View all
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border-default mx-1 md:mx-1.5" />

        {/* User — avatar only. Name + org are in the dropdown header
            and on the profile page; pushing them into the bar squeezes
            other actions on narrower viewports. */}
        <Dropdown>
          {/* HeroUI v3 Dropdown.Trigger renders the underlying <button>; pass
              styling/aria directly so we don't end up with <button><button>...</button></button>
              and the resulting hydration errors. */}
          <Dropdown.Trigger
            className="cursor-pointer flex items-center justify-center w-10 h-10 rounded-full hover:ring-2 hover:ring-border-default transition-all"
            aria-label={`User menu — ${displayName} (${organisation?.name ?? 'Organisation'})`}
          >
            <Avatar size="sm" className="w-8 h-8 bg-brand-500 text-white text-caption">
              <Avatar.Fallback>{displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
            </Avatar>
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <div className="px-3 py-2.5 border-b border-border-default">
              <p className="text-label font-medium text-text-primary leading-tight truncate max-w-[220px]">{displayName}</p>
              <p className="text-micro text-text-muted leading-tight truncate max-w-[220px]">{organisation?.name || 'Organisation'}</p>
            </div>
            <Dropdown.Menu aria-label="User menu">
              <Dropdown.Item id="profile" textValue="Profile" onAction={() => navigate('/dashboard/settings/profile')}>
                <User size={14} className="mr-2 inline text-text-muted" />
                Profile
              </Dropdown.Item>
              <Dropdown.Item id="settings" textValue="Settings" onAction={() => navigate('/dashboard/settings')}>
                <Settings size={14} className="mr-2 inline text-text-muted" />
                Settings
              </Dropdown.Item>
              <Dropdown.Item id="logout" textValue="Log Out" onAction={() => signOut()}>
                <LogOut size={14} className="mr-2 inline text-text-muted" />
                Log Out
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </header>
  )
}
