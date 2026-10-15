import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native'
import { Stack, router } from 'expo-router'
import { Bell, BellOff } from 'lucide-react-native'
import { useNotifications, type MobileNotification } from '@/hooks/useNotifications'
import { SectionLabel } from '@/components/ui/primitives'

// Compact relative time, e.g. "just now", "5m ago", "2h ago", "3d ago".
// Falls back to a short date for anything older than ~a week.
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// Extract a navigable in-app job id from a notification link. We keep this
// deliberately conservative: only follow links that look like an in-app job
// route ('/job/<uuid>') or that embed a uuid we can route to. Returns the bare
// job id so the caller can build the statically-typed `/job/${id}` route
// (expo-router typed routes reject a plain string). Anything else returns null
// and the notification is just marked read (e.g. web-only deep links).
function jobIdFromLink(link: string | null): string | null {
  if (!link) return null
  // ONLY extract a job id from job-shaped links. The old catch-all matched a
  // uuid in ANY link, so a contract/invoice notification (/dashboard/contracts/
  // <id>) routed to /job/<that-id> and rendered "Job not found". Non-job links
  // now return null → the notification is just marked read.
  if (link.startsWith('/job/') || link.startsWith('/dashboard/jobs/')) {
    const m = link.match(UUID_RE)
    return m ? m[0] : null
  }
  return null
}

function NotificationCard({
  item,
  onPress,
}: {
  item: MobileNotification
  onPress: () => void
}) {
  const unread = !item.read
  return (
    <Pressable
      onPress={onPress}
      className="mb-2.5 rounded-2xl border border-border bg-surface"
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <View className="p-3.5">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 flex-row items-start gap-2">
            {unread ? (
              <View className="mt-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: '#e8772e' }} />
            ) : null}
            <Text
              className="flex-1 text-base text-foreground"
              style={{ fontWeight: unread ? '700' : '600' }}
              numberOfLines={2}
            >
              {item.title}
            </Text>
          </View>
          <Text className="text-[12px] text-muted">{relativeTime(item.created_at)}</Text>
        </View>
        {item.message ? (
          <Text className="mt-1 text-[13px] text-muted" numberOfLines={2}>
            {item.message}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

export default function NotificationsScreen() {
  const { notifications, unreadCount, loading, error, refetch, markRead, markAllRead } =
    useNotifications()

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Notifications' }} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-8"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#e8772e" />}
      >
        <View className="mb-1 flex-row items-center justify-between">
          <SectionLabel>Inbox</SectionLabel>
          {unreadCount > 0 ? (
            <Pressable onPress={() => void markAllRead()} hitSlop={8}>
              <Text className="mb-2 text-[13px] font-semibold text-[#e8772e]">Mark all read</Text>
            </Pressable>
          ) : null}
        </View>

        {loading && notifications.length === 0 ? (
          <ActivityIndicator color="#e8772e" style={{ marginTop: 32 }} />
        ) : error ? (
          <View className="items-center pt-12">
            <BellOff size={44} color="#94a3b8" />
            <Text className="mt-3 text-base font-semibold text-foreground">Couldn't load notifications</Text>
            <Text className="mt-1 text-[13px] text-muted">{error}</Text>
          </View>
        ) : notifications.length === 0 ? (
          <View className="items-center pt-12">
            <Bell size={44} color="#e8772e" />
            <Text className="mt-3 text-base font-semibold text-foreground">You're all caught up</Text>
            <Text className="mt-1 text-[13px] text-muted">No notifications right now.</Text>
          </View>
        ) : (
          notifications.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              onPress={() => {
                if (!item.read) void markRead(item.id)
                const jobId = jobIdFromLink(item.link)
                if (jobId) router.push(`/job/${jobId}`)
              }}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}
