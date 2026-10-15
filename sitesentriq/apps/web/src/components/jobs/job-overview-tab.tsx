import { type ReactNode } from 'react'
import { Button, Chip } from '@haumea/ui'
import { AppCard, FormSelect, Heading, Text } from '@haumea/ui'
import { Clock, ListChecks, PhoneCall, Plus, Sparkles, Trash2, Users } from 'lucide-react'

import { JOB_OUTCOMES, JOB_STATUSES, JOB_STATUS_LABELS, TASK_OUTCOMES } from '@/lib/constants'
import { formatDate } from '@haumea/utils'
import { AutoAssignSuggestions } from '@/components/shared/auto-assign-suggestions'
import { ListSkeleton } from '@/components/shared/skeletons'
import { SlaIndicator } from '@/components/shared/sla-indicator'
import type { SlaPolicy } from '@/lib/sla'
import type { EngineerAssignmentWithProfile, JobTask, JobWithRelations } from '@haumea/types'

const TASK_OUTCOME_COLORS: Record<string, string> = {
  complete: 'bg-status-compliant/10 text-status-compliant',
  incomplete: 'bg-status-due-soon/10 text-status-due-soon',
  revisit: 'bg-status-overdue/10 text-status-overdue',
}

const STATUS_CHIP_MAP: Record<string, 'accent' | 'warning' | 'success' | 'danger' | 'default'> = {
  scheduled: 'accent',
  in_progress: 'warning',
  completed: 'success',
  failed_access: 'danger',
  revisit: 'warning',
}

const PRIORITY_CHIP_MAP: Record<string, 'default' | 'warning' | 'danger'> = {
  low: 'default',
  medium: 'warning',
  high: 'danger',
  urgent: 'danger',
}

const OUTCOME_CHIP_MAP: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  pass: 'success',
  fail: 'danger',
  incomplete: 'warning',
  revisit: 'warning',
  n_a: 'default',
}

interface JobOverviewTabProps {
  job: JobWithRelations & {
    routine_check_type?: string | null
    sla_priority?: string | null
    is_callout?: boolean | null
    is_out_of_hours?: boolean | null
    created_via?: string | null
    callout_metadata?: Record<string, unknown> | null
    response_target_at?: string | null
    response_at?: string | null
    completion_target_at?: string | null
    sla_policy_id?: string | null
  }
  jobTypeLabel: string | null
  routineCheckLabel: string | null
  slaPriority: { label: string; response: string; color: string } | null
  slaPolicy?: SlaPolicy | null
  tasks?: JobTask[]
  tasksLoading: boolean
  taskCount: number
  newTaskDescription: string
  onNewTaskDescriptionChange: (value: string) => void
  onAddTask: () => void
  onTaskOutcomeChange: (task: JobTask, outcome: string) => void
  onDeleteTask: (task: JobTask) => void
  isCreatingTask: boolean
  statusUpdate: string
  onStatusUpdateChange: (value: string) => void
  onStatusUpdate: () => void
  outcomeUpdate: string
  onOutcomeUpdateChange: (value: string) => void
  onOutcomeUpdate: () => void
  isUpdatingJob: boolean
  engineers?: { id: string; full_name: string | null; email: string | null }[]
  selectedEngineer: string
  onSelectedEngineerChange: (value: string) => void
  onAssignEngineer: () => void
  isAssigningEngineer: boolean
}

export function JobOverviewTab({
  job,
  jobTypeLabel,
  routineCheckLabel,
  slaPriority,
  slaPolicy,
  tasks,
  tasksLoading,
  taskCount,
  newTaskDescription,
  onNewTaskDescriptionChange,
  onAddTask,
  onTaskOutcomeChange,
  onDeleteTask,
  isCreatingTask,
  statusUpdate,
  onStatusUpdateChange,
  onStatusUpdate,
  outcomeUpdate,
  onOutcomeUpdateChange,
  onOutcomeUpdate,
  isUpdatingJob,
  engineers,
  selectedEngineer,
  onSelectedEngineerChange,
  onAssignEngineer,
  isAssigningEngineer,
}: JobOverviewTabProps) {
  return (
    <div className="space-y-5">
      <AppCard>
        <div className="mb-5 flex flex-wrap gap-2">
          <Chip variant="soft" color={STATUS_CHIP_MAP[job.status] || 'default'} size="sm">
            {job.status.replace(/_/g, ' ')}
          </Chip>
          <Chip variant="soft" color={PRIORITY_CHIP_MAP[job.priority] || 'default'} size="sm">
            {job.priority}
          </Chip>
          {slaPriority ? (
            <span className="inline-block rounded-full px-2.5 py-0.5 text-micro font-medium text-white" style={{ backgroundColor: slaPriority.color }}>
              {slaPriority.label} ({slaPriority.response})
            </span>
          ) : null}
          {jobTypeLabel ? (
            <Chip variant="soft" color="accent" size="sm">
              {jobTypeLabel}
            </Chip>
          ) : null}
          {job.outcome ? (
            <Chip variant="soft" color={OUTCOME_CHIP_MAP[job.outcome] || 'default'} size="sm">
              {JOB_OUTCOMES[job.outcome] || job.outcome}
            </Chip>
          ) : null}
          {job.is_callout ? (
            <Chip variant="soft" color="danger" size="sm">
              <span className="inline-flex items-center gap-1"><PhoneCall size={11} /> Reactive</span>
            </Chip>
          ) : null}
          {job.is_out_of_hours ? (
            <Chip variant="soft" color="accent" size="sm">
              <span className="inline-flex items-center gap-1"><Clock size={11} /> Out of Hours</span>
            </Chip>
          ) : null}
        </div>

        <Heading level={2} scale="body" className="mb-4">
          Job Details
        </Heading>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Property" value={job.properties?.name || '-'} />
          <Detail label="Address" value={job.properties?.address || '-'} />
          <Detail label="Client" value={job.client_id || '-'} />
          <Detail label="Scheduled Date" value={job.scheduled_date ? formatDate(job.scheduled_date) : '-'} />
          <Detail label="Completed Date" value={job.completed_date ? formatDate(job.completed_date) : '-'} />
          {job.time_start ? <Detail label="Time Start" value={job.time_start} /> : null}
          {job.time_end ? <Detail label="Time End" value={job.time_end} /> : null}
          <Detail label="Job Type" value={jobTypeLabel || '-'} />
          <Detail
            label="SLA Priority"
            value={
              slaPriority ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slaPriority.color }} />
                  {slaPriority.label} - {slaPriority.response}
                </span>
              ) : '-'
            }
          />
          {routineCheckLabel ? <Detail label="Routine Check Type" value={routineCheckLabel} /> : null}
          <Detail label="Out of Hours" value={job.is_out_of_hours ? 'Yes' : 'No'} />
          <div className="sm:col-span-2">
            <Detail label="Description" value={job.description || 'No description provided.'} muted />
          </div>
        </dl>
      </AppCard>

      {job.created_via === 'portal' ? <PortalCalloutCard job={job} /> : null}

      <AppCard>
        <div className="mb-4 flex items-center gap-2">
          <Clock size={14} className="text-brand-500" />
          <Heading level={2} scale="body">
            SLA
          </Heading>
        </div>
        <SlaIndicator job={job} policy={slaPolicy} />
      </AppCard>

      <TasksCard
        tasks={tasks}
        tasksLoading={tasksLoading}
        taskCount={taskCount}
        newTaskDescription={newTaskDescription}
        onNewTaskDescriptionChange={onNewTaskDescriptionChange}
        onAddTask={onAddTask}
        onTaskOutcomeChange={onTaskOutcomeChange}
        onDeleteTask={onDeleteTask}
        isCreatingTask={isCreatingTask}
      />

      <JobStatusCards
        statusUpdate={statusUpdate}
        onStatusUpdateChange={onStatusUpdateChange}
        onStatusUpdate={onStatusUpdate}
        outcomeUpdate={outcomeUpdate}
        onOutcomeUpdateChange={onOutcomeUpdateChange}
        onOutcomeUpdate={onOutcomeUpdate}
        isUpdatingJob={isUpdatingJob}
      />

      {(!job.engineer_assignments || job.engineer_assignments.length === 0) ? (
        // id is the scroll target for the "Auto-assign" button above.
        <div id="auto-assign-card">
          <AutoAssignSuggestions jobId={job.id} mode="apply" />
        </div>
      ) : null}

      <AssignedEngineersCard
        assignments={job.engineer_assignments}
        engineers={engineers}
        selectedEngineer={selectedEngineer}
        onSelectedEngineerChange={onSelectedEngineerChange}
        onAssignEngineer={onAssignEngineer}
        isAssigningEngineer={isAssigningEngineer}
      />
    </div>
  )
}

function Detail({ label, value, muted = false }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div>
      <dt className="text-caption font-medium uppercase tracking-[0.04em] text-text-muted">{label}</dt>
      <dd className={`mt-1 text-label ${muted ? 'text-text-secondary' : 'font-medium text-text-primary'}`}>{value}</dd>
    </div>
  )
}

function PortalCalloutCard({ job }: { job: JobOverviewTabProps['job'] }) {
  const meta = job.callout_metadata ?? {}
  const photoUrls = Array.isArray(meta.photo_urls) ? (meta.photo_urls as string[]) : []

  return (
    <AppCard>
      <div className="mb-4 flex items-center gap-2">
        <PhoneCall size={14} className="text-brand-500" />
        <Heading level={2} scale="body">
          Originally raised via Portal
        </Heading>
        <span className="text-micro text-text-muted">ref #{job.id.slice(0, 8)}</span>
      </div>
      <div className="space-y-3">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Category" value={String(meta.category ?? '-').replace(/_/g, ' ')} />
          <Detail
            label="On-site contact"
            value={`${String(meta.contact_name ?? '-')}${meta.contact_phone ? ` - ${String(meta.contact_phone)}` : ''}`}
          />
          <div className="sm:col-span-2">
            <Detail label="Best access time" value={String(meta.best_access_time ?? '-')} />
          </div>
          <div className="sm:col-span-2">
            <Detail label="Reported description" value={job.description ?? '-'} muted />
          </div>
        </dl>
        {photoUrls.length > 0 ? (
          <div>
            <p className="mb-2 text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Photos at time of raising</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {photoUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="aspect-[4/3] overflow-hidden rounded-lg border border-border-default bg-surface-page">
                  <img src={url} alt="Call-out photo" className="h-full w-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppCard>
  )
}

function TasksCard({
  tasks,
  tasksLoading,
  taskCount,
  newTaskDescription,
  onNewTaskDescriptionChange,
  onAddTask,
  onTaskOutcomeChange,
  onDeleteTask,
  isCreatingTask,
}: {
  tasks?: JobTask[]
  tasksLoading: boolean
  taskCount: number
  newTaskDescription: string
  onNewTaskDescriptionChange: (value: string) => void
  onAddTask: () => void
  onTaskOutcomeChange: (task: JobTask, outcome: string) => void
  onDeleteTask: (task: JobTask) => void
  isCreatingTask: boolean
}) {
  return (
    <AppCard>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heading level={2} scale="body">
            Tasks
          </Heading>
          {taskCount > 0 ? (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-soft px-1.5 text-micro font-medium text-accent-soft-foreground">
              {taskCount}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          value={newTaskDescription}
          onChange={(e) => onNewTaskDescriptionChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAddTask()}
          placeholder="Add a new task..."
          className="flex-1 rounded-lg border border-border-default bg-surface-card px-3 py-2 text-label text-text-secondary transition-colors focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <Button variant="primary" size="sm" onPress={onAddTask} isDisabled={!newTaskDescription.trim() || isCreatingTask}>
          <Plus size={14} />
          Add
        </Button>
      </div>
      {tasksLoading ? (
        <ListSkeleton rows={3} withAvatar={false} framed={false} />
      ) : tasks && tasks.length > 0 ? (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-page p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-label font-medium text-text-primary">{task.description || 'Untitled task'}</p>
                <p className="mt-0.5 text-micro text-text-muted">
                  {task.created_at ? formatDate(task.created_at) : '-'}
                  {task.outcome ? (
                    <span className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${TASK_OUTCOME_COLORS[task.outcome] || 'bg-surface-elevated text-text-muted'}`}>
                      {TASK_OUTCOMES[task.outcome] || task.outcome}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="w-40">
                  <FormSelect
                    value={task.outcome || ''}
                    onChange={(value) => onTaskOutcomeChange(task, value)}
                    ariaLabel="Task outcome"
                    placeholder="No outcome"
                    clearable
                    options={Object.entries(TASK_OUTCOMES).map(([value, label]) => ({ value, label }))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteTask(task)}
                  className="rounded-lg p-1 text-text-muted transition-colors hover:bg-status-overdue/10 hover:text-status-overdue"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-text-muted">
          <ListChecks size={28} strokeWidth={1.5} className="mb-2" />
          <Text scale="caption" tone="muted">
            No tasks yet
          </Text>
          <Text scale="micro" tone="muted" className="mt-1">
            Add tasks to track work items for this job
          </Text>
        </div>
      )}
    </AppCard>
  )
}

function JobStatusCards({
  statusUpdate,
  onStatusUpdateChange,
  onStatusUpdate,
  outcomeUpdate,
  onOutcomeUpdateChange,
  onOutcomeUpdate,
  isUpdatingJob,
}: {
  statusUpdate: string
  onStatusUpdateChange: (value: string) => void
  onStatusUpdate: () => void
  outcomeUpdate: string
  onOutcomeUpdateChange: (value: string) => void
  onOutcomeUpdate: () => void
  isUpdatingJob: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AppCard>
        <Heading level={2} scale="body" className="mb-4">
          Update Status
        </Heading>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">New Status</label>
            <FormSelect
              value={statusUpdate}
              onChange={onStatusUpdateChange}
              ariaLabel="New Status"
              placeholder="Select status..."
              clearable
              options={Object.values(JOB_STATUSES).map((s) => ({ value: s, label: JOB_STATUS_LABELS[s] ?? s.replace(/_/g, ' ') }))}
            />
          </div>
          <Button variant="primary" size="sm" onPress={onStatusUpdate} isDisabled={!statusUpdate || isUpdatingJob}>
            Update
          </Button>
        </div>
      </AppCard>
      <AppCard>
        <Heading level={2} scale="body" className="mb-4">
          Set Outcome
        </Heading>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Outcome</label>
            <FormSelect
              value={outcomeUpdate}
              onChange={onOutcomeUpdateChange}
              ariaLabel="Outcome"
              placeholder="Select outcome..."
              clearable
              options={Object.entries(JOB_OUTCOMES).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <Button variant="primary" size="sm" onPress={onOutcomeUpdate} isDisabled={!outcomeUpdate || isUpdatingJob}>
            Update
          </Button>
        </div>
      </AppCard>
    </div>
  )
}

function AssignedEngineersCard({
  assignments,
  engineers,
  selectedEngineer,
  onSelectedEngineerChange,
  onAssignEngineer,
  isAssigningEngineer,
}: {
  assignments?: EngineerAssignmentWithProfile[]
  engineers?: { id: string; full_name: string | null; email: string | null }[]
  selectedEngineer: string
  onSelectedEngineerChange: (value: string) => void
  onAssignEngineer: () => void
  isAssigningEngineer: boolean
}) {
  return (
    <AppCard>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Heading level={2} scale="body">
          Assigned Engineers
        </Heading>
        {(!assignments || assignments.length === 0) ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              document.getElementById('auto-assign-card')?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            <Sparkles size={14} /> Auto-assign
          </Button>
        ) : null}
      </div>
      {assignments && assignments.length > 0 ? (
        <ul className="space-y-2">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="flex items-center gap-3 rounded-lg bg-surface-page p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-label font-medium text-accent-soft-foreground">
                {assignment.profiles?.full_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <Text scale="caption" weight="medium">
                  {assignment.profiles?.full_name || 'Unknown'}
                </Text>
                <Text scale="micro" tone="muted">
                  {assignment.profiles?.email || ''}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-text-muted">
          <Users size={28} strokeWidth={1.5} className="mb-2" />
          <Text scale="caption" tone="muted">
            No engineers assigned yet
          </Text>
        </div>
      )}
      <div className="mt-4 border-t border-border-subtle pt-4">
        <Heading level={3} scale="micro" tone="muted" className="mb-2 uppercase tracking-[0.04em]">
          Assign Engineer
        </Heading>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <FormSelect
              value={selectedEngineer}
              onChange={onSelectedEngineerChange}
              ariaLabel="Engineer"
              placeholder="Select engineer..."
              clearable
              options={(engineers ?? []).map((eng) => ({ value: eng.id, label: `${eng.full_name} (${eng.email})` }))}
            />
          </div>
          <Button variant="primary" size="sm" onPress={onAssignEngineer} isDisabled={!selectedEngineer || isAssigningEngineer}>
            Assign
          </Button>
        </div>
      </div>
    </AppCard>
  )
}
