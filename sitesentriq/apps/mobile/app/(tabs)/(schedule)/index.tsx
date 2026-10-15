import { useMemo } from 'react'
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { CalendarRange } from 'lucide-react-native'
import { useJobs } from '@/hooks/useJobs'
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus'
import { JobCard } from '@/components/ui/primitives'
import { JobListSkeleton } from '@/components/ui/Skeletons'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import type { Job } from '@/lib/supabase'
import { CacheStatus } from '@/components/ui/CacheStatus'

// Forward-looking, day-grouped view of upcoming work — its own tab so engineers
// who think in "what's coming up" have a dedicated calendar-style surface.
const OPEN_STATUSES = new Set(['scheduled', 'due', 'in_progress', 'revisit', 'pending'])

// Bucket by the engineer's LOCAL calendar day (matching JobCard's local time
// rendering and useJobs.todayJobs) — slicing the raw timestamptz would key by
// UTC date and push an evening job into the wrong day for non-UTC engineers.
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayKey(d: string): string {
  return localYmd(new Date(d))
}

function formatDayHeading(isoDay: string): string {
  const today = new Date()
  const todayKey = localYmd(today)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const tomorrowKey = localYmd(tomorrow)
  if (isoDay === todayKey) return 'Today'
  if (isoDay === tomorrowKey) return 'Tomorrow'
  const d = new Date(`${isoDay}T00:00:00`)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function ScheduleScreen() {
  const { jobs, loading, error, refetch, lastUpdated, isStale } = useJobs()
  useRefetchOnFocus(refetch)

  const groups = useMemo(() => {
    const todayKey = localYmd(new Date())
    const byDay = new Map<string, Job[]>()
    for (const job of jobs) {
      if (!job.scheduled_date) continue
      if (!OPEN_STATUSES.has(job.status)) continue
      if (dayKey(job.scheduled_date) < todayKey) continue
      const key = dayKey(job.scheduled_date)
      const list = byDay.get(key) ?? []
      list.push(job)
      byDay.set(key, list)
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [jobs])

  return (
    <View className="flex-1 bg-background">
      <OfflineBanner />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-8"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#e8772e" />}
      >
        <CacheStatus lastUpdated={lastUpdated} isStale={isStale} />
        {loading && !jobs.length ? (
          <JobListSkeleton />
        ) : error ? (
          <View className="items-center pt-12">
            <Text className="text-base font-semibold text-foreground">Couldn't load schedule</Text>
            <Text className="mt-1 text-[13px] text-muted">{error}</Text>
          </View>
        ) : groups.length === 0 ? (
          <View className="items-center pt-12">
            <CalendarRange size={44} color="#e8772e" />
            <Text className="mt-3 text-base font-semibold text-foreground">Nothing scheduled</Text>
            <Text className="mt-1 text-[13px] text-muted">Upcoming assigned visits will appear here.</Text>
          </View>
        ) : (
          groups.map(([day, list]) => (
            <View key={day} className="mb-5">
              <View className="mb-2 flex-row items-center justify-between px-0.5">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  {formatDayHeading(day)}
                </Text>
                <Text className="text-[11px] font-bold text-[#e8772e]">{list.length}</Text>
              </View>
              {list.map(job => <JobCard key={job.id} job={job} />)}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}
