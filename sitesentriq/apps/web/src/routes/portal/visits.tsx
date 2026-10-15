import { useState } from 'react'
import { Chip, Tabs } from '@haumea/ui'
import { CalendarDays } from 'lucide-react'
import { useJobs } from '@/hooks/use-jobs'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import { formatDate } from '@haumea/utils'
import type { JobWithRelations } from '@haumea/types'
import { TableSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'
import { usePortalProperty } from '@/components/layout/portal-layout'

type TabKey = 'upcoming' | 'past'
type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const VISIT_STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  scheduled: 'accent',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'default',
}

export default function PortalVisitsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming')
  const today = toLocalYmd(new Date())
  // Honour the global site switcher (was previously ignored on this page).
  const { selectedPropertyId } = usePortalProperty()
  const propertyId = selectedPropertyId ?? undefined

  const { data: upcomingJobs, isLoading: upcomingLoading } = useJobs({ date: today, property_id: propertyId })
  const { data: allJobs, isLoading: allLoading } = useJobs({ property_id: propertyId })

  // useJobs({ date }) filters scheduled_date >= today with NO status filter, so
  // a job completed earlier today or a cancelled future visit would otherwise
  // show under "Upcoming". Narrow to genuinely-open statuses (matches the
  // portal overview page).
  const upcoming = (upcomingJobs ?? []).filter(
    (j: JobWithRelations) => j.status === 'scheduled' || j.status === 'in_progress',
  )

  // Past visits sorted most-recent-first (the upstream query orders ascending
  // for the upcoming view, which is backwards for a history list).
  const pastJobs = (allJobs ?? [])
    .filter((j: JobWithRelations) => j.scheduled_date && j.scheduled_date < today)
    .sort((a, b) => (a.scheduled_date && b.scheduled_date ? b.scheduled_date.localeCompare(a.scheduled_date) : 0))

  const jobs = activeTab === 'upcoming' ? upcoming : pastJobs
  const isLoading = activeTab === 'upcoming' ? upcomingLoading : allLoading

  return (
    <div className="space-y-6">
      <PageHeader title="Visits" />

      {/* Tabs */}
      <Tabs
        variant="secondary"
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as TabKey)}
        aria-label="Visits filter"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Visits filter">
            <Tabs.Tab id="upcoming">
              Upcoming
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="past">
              Past
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} showHeader={false} showSearch={false} />
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <CalendarDays size={28} strokeWidth={1.5} className="mb-2" />
            <p className="text-label text-text-muted">
              {activeTab === 'upcoming' ? 'No upcoming visits scheduled' : 'No past visits found'}
            </p>
            <p className="text-micro text-text-muted mt-1">
              {activeTab === 'upcoming' ? 'Scheduled visits will appear here' : 'Completed visits will be listed here'}
            </p>
          </div>
        ) : (
          <table aria-label="Visits" className="overflow-hidden">
              <thead><tr>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Date</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Title</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">ETA</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Engineer</th>
              </tr></thead>
              <tbody>
                {jobs.map((job: JobWithRelations) => {
                  const engineerName = job.engineer_assignments?.[0]?.profiles?.full_name ?? '-'
                  return (
                    <tr key={job.id} id={job.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                      <td className="py-3 px-4 text-label text-text-secondary">
                        {job.scheduled_date ? formatDate(job.scheduled_date) : 'TBD'}
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">{job.properties?.name ?? '-'}</td>
                      <td className="py-3 px-4 text-label font-medium text-text-secondary">{job.title}</td>
                      <td className="py-3 px-4">
                        <Chip variant="soft" color={VISIT_STATUS_CHIP_COLOR[job.status] ?? 'default'} size="sm" className="capitalize">
                          {job.status.replace('_', ' ')}
                        </Chip>
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">
                        {job.expected_arrival_at
                          ? new Date(job.expected_arrival_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : job.time_start || 'TBD'}
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">{engineerName}</td>
                    </tr>
                  )
                })}
              </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
