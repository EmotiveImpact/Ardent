import { useMemo, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { Segmented as SegmentedControl } from '@/components/ui/Segmented'
import { Briefcase } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useJobs } from '@/hooks/useJobs'
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus'
import { JobCard } from '@/components/ui/primitives'
import { JobListSkeleton } from '@/components/ui/Skeletons'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import type { Job } from '@/lib/supabase'
import { CacheStatus } from '@/components/ui/CacheStatus'

// Jobs = the full work queue, filtered by status. "What's coming up" (the
// day-grouped view) now lives in its own Schedule tab.
const SEGMENTS = ['All', 'In Progress', 'Completed'] as const
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'revisit'])

export default function JobsScreen() {
  const { jobs, loading, error, refetch, lastUpdated, isStale } = useJobs()
  useRefetchOnFocus(refetch)
  const [segment, setSegment] = useState(0)

  const filtered: Job[] = useMemo(() => {
    if (segment === 1) return jobs.filter(j => IN_PROGRESS_STATUSES.has(j.status))
    if (segment === 2) return jobs.filter(j => j.status === 'completed')
    return jobs
  }, [jobs, segment])

  function onSegmentChange(index: number) {
    Haptics.selectionAsync()
    setSegment(index)
  }

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
        <SegmentedControl
          values={SEGMENTS as unknown as string[]}
          selectedIndex={segment}
          onChange={(e) => onSegmentChange(e.nativeEvent.selectedSegmentIndex)}
          tintColor="#e8772e"
          activeFontStyle={{ color: '#fff' }}
          style={{ marginBottom: 16 }}
        />

        {loading && !jobs.length ? (
          <JobListSkeleton />
        ) : error ? (
          <View className="items-center pt-12">
            <Text className="text-base font-semibold text-foreground">Couldn't load jobs</Text>
            <Text className="mt-1 text-[13px] text-muted">{error}</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View className="items-center pt-12">
            <Briefcase size={44} color="#e8772e" />
            <Text className="mt-3 text-base font-semibold text-foreground">No jobs here</Text>
            <Text className="mt-1 text-[13px] text-muted">
              {segment === 0 ? 'No jobs have been assigned to you yet.' : 'Nothing in this view right now.'}
            </Text>
          </View>
        ) : (
          filtered.map(job => <JobCard key={job.id} job={job} />)
        )}
      </ScrollView>
    </View>
  )
}
