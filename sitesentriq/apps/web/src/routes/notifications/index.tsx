import { useMemo, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { Button, Chip } from '@haumea/ui'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SectionHeader } from '@/components/shared/section-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSkeleton } from '@/components/shared/skeletons'
import {
  NotificationRow,
  type NotificationLike,
} from '@/components/shared/notification-row'
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
} from '@/hooks/use-notifications'

type FilterMode = 'all' | 'unread' | 'read'

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
]

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications()
  const { data: unreadCount } = useUnreadCount()
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()
  const [filter, setFilter] = useState<FilterMode>('all')

  // Notifications come back already sorted desc by created_at from the hook.
  const filtered = useMemo(() => {
    const list = (notifications ?? []) as NotificationLike[]
    if (filter === 'unread') return list.filter((n) => !n.read)
    if (filter === 'read') return list.filter((n) => n.read)
    return list
  }, [notifications, filter])

  const total = notifications?.length ?? 0
  const unread = unreadCount ?? 0

  return (
    <div className="space-y-6 max-w-[920px]">
      <div>
        <Breadcrumbs items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Notifications' }]} />
        <SectionHeader
          variant="page"
          title="Notifications"
          subtitle={`${total} total · ${unread} unread`}
          icon={<Bell size={18} />}
          action={
            unread > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => markAllAsRead.mutate()}
                isDisabled={markAllAsRead.isPending}
              >
                <CheckCheck size={14} className="mr-1.5" />
                Mark all read
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const isActive = filter === f.id
          const count =
            f.id === 'all'
              ? total
              : f.id === 'unread'
                ? unread
                : Math.max(0, total - unread)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-medium transition-colors ${
                isActive
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-elevated text-text-secondary hover:bg-surface-page'
              }`}
              aria-pressed={isActive}
            >
              <span>{f.label}</span>
              <Chip
                size="sm"
                variant={isActive ? 'primary' : 'soft'}
                className={`text-[10px] h-4 px-1.5 ${
                  isActive ? '!bg-white/25 !text-white' : ''
                }`}
              >
                {count}
              </Chip>
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {isLoading ? (
          <ListSkeleton rows={6} framed={false} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={
              filter === 'unread'
                ? 'No unread notifications'
                : filter === 'read'
                  ? 'No read notifications yet'
                  : 'No notifications yet'
            }
            description={
              filter === 'unread'
                ? "You're all caught up. We'll let you know when something needs attention."
                : 'When alerts and updates arrive, they will appear here.'
            }
          />
        ) : (
          <div className="divide-y divide-border-default">
            {filtered.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onActivate={(notif) => {
                  if (!notif.read) markAsRead.mutate(notif.id)
                }}
                onSwipeArchive={(notif) => {
                  if (!notif.read) markAsRead.mutate(notif.id)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
