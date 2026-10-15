import { useState, useMemo } from 'react'
import { Button, Chip, Tabs } from '@haumea/ui'
import { AppCard, FormSelect, PageHeader } from '@haumea/ui'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useJobs } from '@/hooks/use-jobs'
import { useProperties } from '@/hooks/use-properties'
import { formatDate } from '@haumea/utils'
import { JOB_STATUSES } from '@/lib/constants'
import { Link } from 'react-router'
import { CalendarDays, List, ChevronLeft, ChevronRight, Briefcase, Clock, Users, CheckCircle, AlertTriangle, RotateCcw, PlayCircle, CalendarClock } from 'lucide-react'
import type { JobWithRelations, EngineerAssignmentWithProfile } from '@haumea/types'
import { TableSkeleton } from '@/components/shared/skeletons'

function formatTimeWindow(timeStart?: string, timeEnd?: string): string | null {
  if (!timeStart && !timeEnd) return null
  const format = (t: string) => {
    const [h, m] = t.split(':')
    const hour = parseInt(h, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${m} ${ampm}`
  }
  if (timeStart && timeEnd) return `${format(timeStart)} - ${format(timeEnd)}`
  if (timeStart) return `From ${format(timeStart)}`
  return `Until ${format(timeEnd!)}`
}



const STATUS_CHIP_COLOR: Record<string, 'accent' | 'warning' | 'success' | 'danger' | 'default'> = {
  scheduled: 'accent',
  in_progress: 'warning',
  completed: 'success',
  failed_access: 'danger',
  revisit: 'warning',
}

// Wave G1 — leading icon for non-color status signaling. The chip palette
// alone is invisible to colour-blind users; the glyph carries the meaning.
const STATUS_CHIP_ICON: Record<string, typeof CheckCircle> = {
  scheduled: CalendarClock,
  in_progress: PlayCircle,
  completed: CheckCircle,
  failed_access: AlertTriangle,
  revisit: RotateCcw,
}

const PRIORITY_CHIP_COLOR: Record<string, 'default' | 'warning' | 'danger'> = {
  low: 'default',
  medium: 'warning',
  high: 'danger',
  urgent: 'danger',
}

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_CHIP_ICON[status] ?? Clock
  return (
    <Chip variant="soft" color={STATUS_CHIP_COLOR[status] || 'default'} size="sm">
      <span className="inline-flex items-center gap-1">
        <Icon size={11} aria-hidden />
        {status.replace(/_/g, ' ')}
      </span>
    </Chip>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Chip variant="soft" color={PRIORITY_CHIP_COLOR[priority] || 'default'} size="sm">
      {priority}
    </Chip>
  )
}

function CalendarView({ jobs }: { jobs: JobWithRelations[] }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  // Adjust so Monday = 0
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

  const jobsByDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const job of jobs) {
      if (job.scheduled_date) {
        const dateStr = job.scheduled_date.substring(0, 10)
        map[dateStr] = (map[dateStr] || 0) + 1
      }
    }
    return map
  }, [jobs])

  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  while (days.length % 7 !== 0) days.push(null)

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="sm" onPress={prevMonth}>
          <ChevronLeft size={14} />
          Previous
        </Button>
        <h3 className="text-body font-semibold text-text-primary">{monthName}</h3>
        <Button variant="outline" size="sm" onPress={nextMonth}>
          Next
          <ChevronRight size={14} />
        </Button>
      </div>
      <div className="grid grid-cols-7 rounded-xl overflow-hidden border border-border-default">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="bg-surface-page px-2 py-2.5 text-center text-micro font-medium text-text-muted uppercase tracking-[0.04em] border-b border-border-default">{d}</div>
        ))}
        {days.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="bg-surface-card min-h-[80px] border border-border-default" />
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const count = jobsByDate[dateStr] || 0
          const isToday = dateStr === todayStr

          return (
            <div
              key={dateStr}
              className={`bg-surface-card min-h-[80px] p-2 border border-border-default ${isToday ? 'ring-2 ring-brand-500/20 ring-inset' : ''}`}
            >
              <div className={`text-label ${isToday ? 'font-semibold text-brand-600' : 'text-text-secondary'}`}>{day}</div>
              {count > 0 && (
                <div className="mt-1.5">
                  <Chip variant="primary" color="accent" size="sm">
                    {count} job{count !== 1 ? 's' : ''}
                  </Chip>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function useEngineers() {
  return useQuery({
    // `profiles` rows, not `engineers` rows — must not share the
    // ['engineers'] key used by use-engineers.ts (different shape).
    queryKey: ['engineer-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'engineer')
        .order('full_name')
      if (error) throw error
      return data as { id: string; full_name: string; email: string }[]
    },
  })
}

function useEngineerJobCounts(date: string) {
  return useQuery({
    queryKey: ['engineer_job_counts', date],
    queryFn: async () => {
      // jobs.scheduled_date is timestamptz — an `.eq('YYYY-MM-DD')` only matched
      // rows stored at exactly 00:00:00Z, so any timed job was uncounted. Use a
      // [day, day+1) range instead.
      const dayEndDate = new Date(`${date}T00:00:00Z`)
      dayEndDate.setUTCDate(dayEndDate.getUTCDate() + 1)
      const dayEnd = dayEndDate.toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('engineer_assignments')
        .select('engineer_id, jobs!inner(scheduled_date)')
        .gte('jobs.scheduled_date', date)
        .lt('jobs.scheduled_date', dayEnd)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data || []) {
        counts[row.engineer_id] = (counts[row.engineer_id] || 0) + 1
      }
      return counts
    },
    enabled: !!date,
  })
}

export default function SchedulerPage() {
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [statusFilter, setStatusFilter] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('')
  const [availabilityDate, setAvailabilityDate] = useState(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })

  const filters: { status?: string; property_id?: string } = {}
  if (statusFilter) filters.status = statusFilter
  if (propertyFilter) filters.property_id = propertyFilter

  const { data: jobs, isLoading } = useJobs(Object.keys(filters).length > 0 ? filters : undefined)
  const { data: properties } = useProperties()
  const { data: engineers } = useEngineers()
  const { data: engineerJobCounts } = useEngineerJobCounts(availabilityDate)

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="Scheduler" subtitle="Manage and view scheduled work" />
        </div>
        <Tabs
          selectedKey={view}
          onSelectionChange={(key) => setView(key as 'list' | 'calendar')}
          aria-label="Scheduler view"
          className="w-fit"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Scheduler view">
              <Tabs.Tab id="list">
                <span className="inline-flex items-center gap-1.5">
                  <List size={14} />
                  List
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="calendar">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} />
                  Calendar
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>

      {/* Filters */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4">
          <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Filters</span>
          <div className="flex gap-3 flex-wrap mt-3">
            <div className="w-48">
              <FormSelect
                value={statusFilter}
                onChange={setStatusFilter}
                ariaLabel="Filter by status"
                placeholder="All Statuses"
                clearable
                options={Object.values(JOB_STATUSES).map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
              />
            </div>
            <div className="w-56">
              <FormSelect
                value={propertyFilter}
                onChange={setPropertyFilter}
                ariaLabel="Filter by property"
                placeholder="All Properties"
                clearable
                options={(properties ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={7} showHeader={false} showSearch={false} />
      ) : !jobs || jobs.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
              <Briefcase size={24} strokeWidth={1.5} className="text-text-muted" />
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">No scheduled jobs</h2>
            <p className="text-label text-text-muted">Create jobs to populate the scheduler and calendar view.</p>
          </div>
        </div>
      ) : view === 'calendar' ? (
        <AppCard padding="md">
          <CalendarView jobs={jobs} />
        </AppCard>
      ) : (
        <table aria-label="Scheduled jobs" className="w-full bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <thead><tr>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Title</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Engineer</th>
              <th id="scheduledDate" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Scheduled Date</th>
              <th id="timeWindow" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Time Window</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Priority</th>
            </tr></thead>
            <tbody>
              {jobs.map((job: JobWithRelations) => {
                const engineerNames = job.engineer_assignments
                  ?.map((a: EngineerAssignmentWithProfile) => a.profiles?.full_name)
                  .filter(Boolean)
                  .join(', ')

                return (
                  <tr key={job.id} id={job.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                    <td className="py-3 px-4">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{job.properties?.name || '-'}</td>
                    <td className="py-3 px-4">
                      <Link to={`/dashboard/jobs/${job.id}`} className="text-label font-medium text-text-primary hover:text-brand-600 transition-colors">
                        {job.title}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{engineerNames || 'Unassigned'}</td>
                    <td className="py-3 px-4 text-label text-text-secondary">{job.scheduled_date ? formatDate(job.scheduled_date) : '-'}</td>
                    <td className="py-3 px-4">
                      {formatTimeWindow(job.time_start, job.time_end) ? (
                        <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
                          <Clock size={11} className="text-text-muted" />
                          {formatTimeWindow(job.time_start, job.time_end)}
                        </span>
                      ) : (
                        <span className="text-caption text-text-muted">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={job.priority} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
        </table>
      )}

      {/* Engineer Availability */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 pt-5 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users size={16} className="text-text-muted" />
                <h3 className="text-body font-semibold text-text-primary">Engineer Availability</h3>
              </div>
              <p className="text-caption text-text-muted mt-0.5">Job assignments for the selected date</p>
            </div>
            <input
              type="date"
              value={availabilityDate}
              onChange={(e) => setAvailabilityDate(e.target.value)}
              aria-label="Select date for availability"
              className="border border-border-default rounded-lg px-3 py-1.5 text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
            />
          </div>
        </div>
        <div className="p-5">
          {!engineers || engineers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-muted">
              <Users size={24} strokeWidth={1.5} className="mb-2" />
              <p className="text-label">No engineers found</p>
              <p className="text-micro text-text-muted mt-1">Add profiles with the engineer role to see availability</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {engineers.map((engineer) => {
                const jobCount = engineerJobCounts?.[engineer.id] || 0
                return (
                  <div
                    key={engineer.id}
                    className="flex items-center justify-between p-3 border border-border-default rounded-lg bg-surface-card"
                  >
                    <div className="min-w-0">
                      <p className="text-label font-medium text-text-primary truncate">{engineer.full_name}</p>
                      <p className="text-micro text-text-muted truncate">{engineer.email}</p>
                    </div>
                    <div className="flex-shrink-0 ml-3">
                      <span className={`inline-flex items-center justify-center min-w-[28px] h-7 rounded-full text-caption font-semibold ${
                        jobCount === 0
                          ? 'bg-status-compliant/10 text-status-compliant'
                          : jobCount <= 2
                            ? 'bg-status-due-soon/10 text-status-due-soon'
                            : 'bg-status-overdue/10 text-status-overdue'
                      }`}>
                        {jobCount} {jobCount === 1 ? 'job' : 'jobs'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
