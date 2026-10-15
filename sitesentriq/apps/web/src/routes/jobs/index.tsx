import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { listRowMotion } from '@/lib/motion'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { useJobs } from '@/hooks/use-jobs'
import { useAuth } from '@/hooks/use-auth'
import { formatDate, exportToCsv } from '@haumea/utils'
import { JOB_STATUSES, SERVICE_GROUPS } from '@/lib/constants'
import { useNavigate, useSearchParams } from 'react-router'
import { AlertTriangle, Briefcase, Download, Plus, RefreshCw } from 'lucide-react'
import { SearchInput } from '@haumea/ui'
import { Button, Chip, Tabs } from '@haumea/ui'
import { TableCheckbox } from '@haumea/ui'
import { SavedViews, type SavedView, type ViewFilter } from '@/components/shared/saved-views'
import { BulkActionBar } from '@/components/shared/bulk-action-bar'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { SlaIndicator } from '@/components/shared/sla-indicator'
import { useSlaPolicies } from '@/lib/sla'
import { prefetchRoute } from '@/lib/route-prefetch'
import type { JobWithRelations, EngineerAssignmentWithProfile } from '@haumea/types'

const STATUS_CHIP_COLOR: Record<string, 'accent' | 'warning' | 'success' | 'danger' | 'default'> = {
  not_ready: 'default',
  ready: 'accent',
  scheduled: 'accent',
  due: 'warning',
  in_progress: 'warning',
  pending: 'warning',
  pending_external: 'warning',
  contractor_review: 'accent',
  revisit: 'warning',
  performed: 'success',
  completed: 'success',
  incomplete: 'warning',
  failed_access: 'danger',
  rejected: 'danger',
  cancelled: 'default',
}

const PRIORITY_CHIP_COLOR: Record<string, 'default' | 'warning' | 'danger'> = {
  low: 'default',
  medium: 'warning',
  high: 'danger',
  urgent: 'danger',
}

const ALL_STATUSES = [
  { label: 'All', value: '' },
  { label: 'Not Ready', value: JOB_STATUSES.NOT_READY },
  { label: 'Ready', value: JOB_STATUSES.READY },
  { label: 'Scheduled', value: JOB_STATUSES.SCHEDULED },
  { label: 'In Progress', value: JOB_STATUSES.IN_PROGRESS },
  { label: 'Pending External', value: JOB_STATUSES.PENDING_EXTERNAL },
  { label: 'Contractor Review', value: JOB_STATUSES.CONTRACTOR_REVIEW },
  { label: 'Revisit', value: JOB_STATUSES.REVISIT },
  { label: 'Performed', value: JOB_STATUSES.PERFORMED },
  { label: 'Completed', value: JOB_STATUSES.COMPLETED },
  { label: 'Failed Access', value: JOB_STATUSES.FAILED_ACCESS },
  { label: 'Rejected', value: JOB_STATUSES.REJECTED },
]

const toRow = (job: JobWithRelations) => ({
  Title: job.title ?? '',
  'Property Name': job.properties?.name ?? '',
  Status: job.status,
  Priority: job.priority,
  'Scheduled Date': job.scheduled_date ? formatDate(job.scheduled_date) : '',
})

function jobMatchesView(job: JobWithRelations, filters: ViewFilter, currentUserId?: string): boolean {
  // Source (portal-raised call-outs)
  if (filters.source === 'portal_callout') {
    if (!(job.is_callout && job.created_via === 'portal' && (job.status === 'scheduled' || job.status === 'in_progress'))) {
      return false
    }
  }
  // Status (string or array)
  if (filters.status) {
    const arr = Array.isArray(filters.status) ? filters.status : [filters.status]
    if (!arr.includes(job.status)) return false
  }
  // Assignee — the built-in "My open" view sets assignee:'me'. engineer_assignments
  // key on profiles.id, so match against the current user's id. (Previously this
  // filter term was dropped, so "My open" showed every open job org-wide.)
  if (filters.assignee === 'me') {
    if (!currentUserId) return false
    const mine = job.engineer_assignments?.some((a) => a.engineer_id === currentUserId)
    if (!mine) return false
  }
  // Priority
  if (filters.priority) {
    const arr = Array.isArray(filters.priority) ? filters.priority : [filters.priority]
    if (!arr.includes(job.priority)) return false
  }
  // Due — these views ("Overdue", "Due this week"…) mean OUTSTANDING work, so
  // exclude already-finished jobs (a completed job with a past scheduled_date is
  // not overdue). Previously they were classified purely by date and included
  // completed/cancelled jobs.
  if (filters.due) {
    if (job.status === 'completed' || job.status === 'cancelled') return false
    if (!job.scheduled_date) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const sched = new Date(job.scheduled_date)
    sched.setHours(0, 0, 0, 0)
    if (filters.due === 'overdue' && sched >= today) return false
    if (filters.due === 'today' && sched.getTime() !== today.getTime()) return false
    if (filters.due === 'this_week') {
      const weekEnd = new Date(today)
      weekEnd.setDate(weekEnd.getDate() + 7)
      if (sched < today || sched > weekEnd) return false
    }
    if (filters.due === 'this_month') {
      const monthEnd = new Date(today)
      monthEnd.setMonth(monthEnd.getMonth() + 1)
      if (sched < today || sched > monthEnd) return false
    }
  }
  return true
}

export default function JobsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryFilter = searchParams.get('filter')
  const unassignedOnly = queryFilter === 'unassigned'
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<SavedView | null>(null)

  const clearUnassignedFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('filter')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const filters: { status?: string } = {}
  if (statusFilter) filters.status = statusFilter

  const {
    data: jobs,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useJobs(Object.keys(filters).length > 0 ? filters : undefined)

  // Pre-fetch SLA policies so the indicator chips can resolve a matching
  // policy without N+1 queries. Cached by `useSlaPolicies` for 60s.
  const { data: slaPolicies } = useSlaPolicies()

  const filteredJobs = useMemo(() => {
    if (!jobs) return []
    let result = jobs as JobWithRelations[]
    if (search) {
      const term = search.toLowerCase()
      result = result.filter((job) =>
        job.title?.toLowerCase().includes(term) || job.properties?.name?.toLowerCase().includes(term)
      )
    }
    if (activeView && activeView.id !== 'all') {
      result = result.filter((job) => jobMatchesView(job, activeView.filters, profile?.id))
    }
    if (unassignedOnly) {
      result = result.filter(
        (job) => !job.engineer_assignments || job.engineer_assignments.length === 0,
      )
    }
    return result
  }, [jobs, search, activeView, unassignedOnly, profile?.id])

  // Smart suggestion: if many overdue + high-priority jobs match, suggest a saved view
  const smartSuggestion = useMemo(() => {
    if (!jobs) return null
    const matches = (jobs as JobWithRelations[]).filter((j) =>
      jobMatchesView(j, { due: 'overdue', priority: ['high', 'urgent'] })
    )
    if (matches.length >= 3) {
      return {
        label: 'Overdue & high-priority',
        filters: { due: 'overdue' as const, priority: ['high', 'urgent'] },
        count: matches.length,
      }
    }
    return null
  }, [jobs])

  const allSelected = filteredJobs.length > 0 && filteredJobs.every((j) => selectedIds.has(j.id))
  const someSelected = selectedIds.size > 0
  const loadError = !jobs && error

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredJobs.map((j) => j.id)))
    } else {
      setSelectedIds(new Set())
    }
  }, [filteredJobs])

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  return (
    <div className="space-y-6 max-w-[1200px]">
      <SectionHeader
        variant="page"
        title="Jobs"
        subtitle="Track and manage all work orders"
        action={
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <SearchInput
              value={search}
              onChange={setSearch}
              ariaLabel="Search jobs"
              placeholder="Search jobs..."
              className="flex-1 sm:flex-none sm:w-64"
            />
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('jobs.csv', (jobs ?? []).map(toRow))}
            >
              <Download size={14} />
              Export
            </Button>
            <Button variant="primary" size="sm" onPress={() => navigate('/dashboard/jobs/new')}>
              <Plus size={14} className="mr-1.5" /> New Job
            </Button>
          </div>
        }
      />

      {/* Saved Views chip strip */}
      <SavedViews
        entity="jobs"
        activeViewId={activeView?.id ?? 'all'}
        onChange={(v) => setActiveView(v)}
        smartSuggestion={smartSuggestion}
      />

      {unassignedOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-caption text-text-muted">Filter:</span>
          <Chip variant="soft" color="warning" size="sm">
            Unassigned only
          </Chip>
          <Button
            size="sm"
            variant="ghost"
            onPress={clearUnassignedFilter}
            aria-label="Clear unassigned filter"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Status filter tabs */}
      <Tabs
        selectedKey={statusFilter || 'all'}
        onSelectionChange={(key) => setStatusFilter(key === 'all' ? '' : String(key))}
        aria-label="Filter jobs by status"
        className="w-fit"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Filter jobs by status">
            {ALL_STATUSES.map((s) => (
              <Tabs.Tab key={s.value || 'all'} id={s.value || 'all'}>
                {s.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {isLoading ? (
        <ListPageSkeleton cols={5} />
      ) : loadError ? (
        <div className="rounded-xl border border-status-overdue/30 bg-surface-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-overdue/10">
                <AlertTriangle size={18} className="text-status-overdue" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">Jobs failed to load</h2>
                <p className="mt-1 text-label text-text-secondary">
                  {(error as Error).message || 'The jobs list did not return from Supabase.'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onPress={() => void refetch()}
              isDisabled={isFetching}
            >
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} />
              Retry
            </Button>
          </div>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <EmptyState
            icon={Briefcase}
            title={search || statusFilter ? 'No matching jobs' : 'No jobs yet'}
            description={
              search || statusFilter
                ? 'Try adjusting your search or filters.'
                : 'Jobs will appear here when created from maintenance plans or manually.'
            }
            action={
              !search && !statusFilter ? (
                <Button variant="primary" size="sm" onPress={() => navigate('/dashboard/jobs/new')}>
                  <Plus size={14} className="mr-1.5" /> New Job
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <table aria-label="Jobs" className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <thead><tr>
              <th className="w-10 py-3 px-4">
                <TableCheckbox
                  isSelected={allSelected}
                  isIndeterminate={someSelected && !allSelected}
                  onChange={handleSelectAll}
                  ariaLabel="Select all jobs"
                />
              </th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Title</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Service Group</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Priority</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">SLA</th>
              <th id="scheduledDate" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Scheduled Date</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Engineer</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
            </tr></thead>
            <tbody>
              <AnimatePresence>
              {filteredJobs.map((job: JobWithRelations, rowIndex: number) => {
                const engineerNames = job.engineer_assignments
                  ?.map((a: EngineerAssignmentWithProfile) => a.profiles?.full_name)
                  .filter(Boolean)
                  .join(', ')
                return (
                  <motion.tr key={job.id} id={job.id} {...listRowMotion(rowIndex)} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                    <td className="py-3 px-4">
                      <TableCheckbox
                        isSelected={selectedIds.has(job.id)}
                        onChange={(isSelected) => handleSelectOne(job.id, isSelected)}
                        ariaLabel={`Select ${job.title}`}
                      />
                    </td>
                    <td className="py-3 px-4 text-label font-medium text-text-primary">
                      {job.job_number && (
                        <span className="block text-[11px] font-mono tracking-tight text-text-muted">{job.job_number}</span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        {job.title}
                        {job.created_via === 'portal' && (
                          <Chip variant="soft" color="accent" size="sm">
                            via Portal
                          </Chip>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{job.properties?.name || '-'}</td>
                    <td className="py-3 px-4 text-label text-text-secondary">{job.service_group || '-'}</td>
                    <td className="py-3 px-4">
                      <Chip variant="soft" color={STATUS_CHIP_COLOR[job.status] || 'default'} size="sm">
                        {job.status.replace(/_/g, ' ')}
                      </Chip>
                    </td>
                    <td className="py-3 px-4">
                      <Chip variant="soft" color={PRIORITY_CHIP_COLOR[job.priority] || 'default'} size="sm">
                        {job.priority}
                      </Chip>
                    </td>
                    <td className="py-3 px-4">
                      <SlaIndicator
                        job={job}
                        policy={
                          (job as { sla_policy_id?: string | null }).sla_policy_id
                            ? slaPolicies?.find(
                                (p) =>
                                  p.id ===
                                  (job as { sla_policy_id?: string | null }).sla_policy_id,
                              )
                            : undefined
                        }
                        compact
                      />
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{job.scheduled_date ? formatDate(job.scheduled_date) : '-'}</td>
                    <td className="py-3 px-4 text-label text-text-secondary">{engineerNames || 'Unassigned'}</td>
                    <td className="py-3 px-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onFocus={() => prefetchRoute(`/dashboard/jobs/${job.id}`)}
                        onPointerEnter={() => prefetchRoute(`/dashboard/jobs/${job.id}`)}
                        onPress={() => navigate(`/dashboard/jobs/${job.id}`)}
                      >
                        View
                      </Button>
                    </td>
                  </motion.tr>
                )
              })}
              </AnimatePresence>
            </tbody>
        </table>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <BulkActionBar
          table="jobs"
          selectedIds={Array.from(selectedIds)}
          selectedRows={filteredJobs.filter((j) => selectedIds.has(j.id)) as unknown as Record<string, unknown>[]}
          toCsvRow={(row) => toRow(row as unknown as JobWithRelations)}
          exportFilename="jobs-selected.csv"
          actions={['status', 'serviceGroup', 'tag', 'export', 'archive', 'delete']}
          serviceGroupOptions={SERVICE_GROUPS.map((g) => ({ label: g, value: g }))}
          invalidateKeys={[['jobs']]}
          statusOptions={[
            { label: 'Not Ready', value: 'not_ready' },
            { label: 'Ready', value: 'ready' },
            { label: 'Scheduled', value: 'scheduled' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Pending External', value: 'pending_external' },
            { label: 'Contractor Review', value: 'contractor_review' },
            { label: 'Revisit', value: 'revisit' },
            { label: 'Performed', value: 'performed' },
            { label: 'Completed', value: 'completed' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'Cancelled', value: 'cancelled' },
          ]}
          onClearSelection={clearSelection}
        />
      )}
    </div>
  )
}
