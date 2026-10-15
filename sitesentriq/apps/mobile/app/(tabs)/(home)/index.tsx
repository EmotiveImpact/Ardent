import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Navigation, QrCode, CheckCircle2, Map } from 'lucide-react-native'
import { useJobs } from '@/hooks/useJobs'
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus'
import { useAuth } from '@/hooks/useAuth'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { JobCard, ActionTile, StatCard, SectionLabel, NextJobHero, navigateToJob } from '@/components/ui/primitives'
import { JobListSkeleton } from '@/components/ui/Skeletons'
import { CacheStatus } from '@/components/ui/CacheStatus'

export default function TodayScreen() {
  const { profile } = useAuth()
  const { todayJobs, jobs, loading, error, refetch, lastUpdated, isStale } = useJobs()
  useRefetchOnFocus(refetch)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const completed = todayJobs.filter((j) => j.status === 'completed').length
  const pending = todayJobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled').length

  // "Start next job" → the next open job (today first, else any upcoming).
  const nextJob =
    todayJobs.find((j) => j.status !== 'completed' && j.status !== 'cancelled') ??
    jobs.find((j) => j.status !== 'completed' && j.status !== 'cancelled')

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
        {/* Greeting */}
        <Text className="text-[26px] font-extrabold text-foreground" style={{ letterSpacing: -0.5 }}>
          Good day, {firstName}
        </Text>
        <Text className="mt-1 text-[15px] font-medium text-muted">{today}</Text>
        <View className="mt-2">
          <CacheStatus lastUpdated={lastUpdated} isStale={isStale} />
        </View>

        {/* Next-job hero — the headline action */}
        {nextJob && (
          <View className="mt-5">
            <NextJobHero job={nextJob} />
          </View>
        )}

        {/* Overview stats */}
        {todayJobs.length > 0 && (
          <View className="mt-6">
            <SectionLabel>Overview</SectionLabel>
            <View className="flex-row gap-3">
              <StatCard value={pending} label="Remaining" />
              <StatCard value={completed} label="Completed" accent="#10b981" />
            </View>
          </View>
        )}

        {/* Quick actions — each does a real, distinct thing */}
        <View className="mt-5">
          <SectionLabel>Quick Actions</SectionLabel>
          <View className="flex-row gap-2.5">
            <ActionTile
              icon={<Navigation size={20} color="#475569" />}
              label="Navigate"
              disabled={!nextJob}
              onPress={() => nextJob && navigateToJob(nextJob)}
            />
            <ActionTile
              icon={<QrCode size={20} color="#475569" />}
              label="Scan asset"
              onPress={() => router.push('/scan')}
            />
            <ActionTile
              icon={<Map size={20} color="#475569" />}
              label="Job map"
              onPress={() => router.push('/map')}
            />
          </View>
        </View>

        {/* Today's jobs */}
        <View className="mt-5">
          <View className="flex-row items-center justify-between">
            <SectionLabel>Today's Jobs</SectionLabel>
            <Pressable onPress={() => router.push('/map')} hitSlop={8} className="mb-2 flex-row items-center gap-1">
              <Map size={14} color="#e8772e" />
              <Text className="text-[12px] font-semibold text-[#e8772e]">Map</Text>
            </Pressable>
          </View>
          {loading && !todayJobs.length ? (
            <JobListSkeleton />
          ) : error ? (
            <View className="items-center pt-12">
              <Text className="text-base font-semibold text-foreground">Couldn't load jobs</Text>
              <Text className="mt-1 text-[13px] text-muted">{error}</Text>
            </View>
          ) : todayJobs.length === 0 ? (
            <View className="items-center pt-12">
              <CheckCircle2 size={44} color="#e8772e" />
              <Text className="mt-3 text-base font-semibold text-foreground">All clear for today</Text>
              <Text className="mt-1 text-[13px] text-muted">No jobs scheduled for today.</Text>
            </View>
          ) : (
            todayJobs.map((job) => <JobCard key={job.id} job={job} />)
          )}
        </View>
      </ScrollView>
    </View>
  )
}
