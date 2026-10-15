import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { AppCard, PageHeader, Text } from '@haumea/ui'
import { useQuery } from '@tanstack/react-query'
import { Activity, Camera, ClipboardList, FileText, Receipt, Trash2 } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { JOB_STATUSES, JOB_TYPES, ROUTINE_CHECK_TYPES, SLA_PRIORITIES } from '@/lib/constants'
import { useAuth } from '@/hooks/use-auth'
import { useJob, useUpdateJob, useDeleteJob, useAssignEngineer } from '@/hooks/use-jobs'
import { useJobPhotos, useUploadJobPhoto, useDeleteJobPhoto } from '@/hooks/use-job-photos'
import { useJobTasks, useCreateJobTask, useUpdateJobTask, useDeleteJobTask } from '@/hooks/use-job-tasks'
import { useSlaPolicies } from '@/lib/sla'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { MobileActionBar } from '@/components/shared/mobile-action-bar'
import { JobEtaPanel } from '@/components/jobs/job-eta-panel'
import { JobInvoiceTab } from '@/components/jobs/job-invoice-tab'
import { JobOverviewTab } from '@/components/jobs/job-overview-tab'
import { JobPhotosTab } from '@/components/jobs/job-photos-tab'
import { JobTimelineTab } from '@/components/jobs/job-timeline-tab'
import { JobLinkedTasks } from '@/components/jobs/job-linked-tasks'
import { JobCertForms } from '@/components/jobs/job-cert-forms'
import { JobServiceGroup } from '@/components/jobs/job-service-group'
import { JobFieldLog } from '@/components/jobs/job-field-log'
import { JobSubcontractorPanel } from '@/components/jobs/job-subcontractor-panel'
import { JobSlaIndicator } from '@/components/jobs/job-sla-indicator'
import { JobPermitsPanel } from '@/components/jobs/job-permits-panel'
import { JobPermitChip } from '@/components/jobs/job-permit-chip'
import type { Job, JobPhoto, JobPhotoType, JobTask, JobWithRelations } from '@haumea/types'

type JobTab = 'overview' | 'timeline' | 'photos' | 'invoice'

type JobDetail = JobWithRelations & {
  labor_hours?: number | null
  labor_rate?: number | null
  parts_cost?: number | null
  eta_earliest_at?: string | null
  eta_latest_at?: string | null
  routine_check_type?: string | null
  sla_priority?: string | null
  is_callout?: boolean | null
  is_out_of_hours?: boolean | null
  created_via?: string | null
  callout_metadata?: Record<string, unknown> | null
  properties?: {
    name?: string | null
    address?: string | null
    latitude?: number | null
    longitude?: number | null
  } | null
  sla_policy_id?: string | null
}

type EngineerOption = {
  id: string
  full_name: string | null
  email: string | null
}

const tabs: { id: JobTab; label: string; icon: typeof ClipboardList }[] = [
  { id: 'overview', label: 'Overview', icon: ClipboardList },
  { id: 'timeline', label: 'Timeline', icon: Activity },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'invoice', label: 'Invoice', icon: Receipt },
]

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, organisation } = useAuth()
  const { data: jobData, isLoading } = useJob(id!)
  const job = jobData as JobDetail | undefined
  const updateJob = useUpdateJob()
  const deleteJob = useDeleteJob()
  const assignEngineer = useAssignEngineer()
  const [activeTab, setActiveTab] = useState<JobTab>('overview')
  const [selectedEngineer, setSelectedEngineer] = useState('')
  const [statusUpdate, setStatusUpdate] = useState('')
  const [outcomeUpdate, setOutcomeUpdate] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showCertificate, setShowCertificate] = useState(false)

  const { data: photos, isLoading: photosLoading } = useJobPhotos(id)
  const uploadPhoto = useUploadJobPhoto()
  const deletePhoto = useDeleteJobPhoto()
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadCaption, setUploadCaption] = useState('')
  const [uploadPhotoType, setUploadPhotoType] = useState<JobPhotoType>('general')
  const [deletePhotoConfirm, setDeletePhotoConfirm] = useState<JobPhoto | null>(null)
  const [lightboxPhoto, setLightboxPhoto] = useState<JobPhoto | null>(null)

  const { data: tasks, isLoading: tasksLoading } = useJobTasks(id)
  const createTask = useCreateJobTask()
  const updateTask = useUpdateJobTask()
  const deleteTask = useDeleteJobTask()
  const [newTaskDescription, setNewTaskDescription] = useState('')

  const [laborHours, setLaborHours] = useState(0)
  const [laborRate, setLaborRate] = useState(0)
  const [partsCost, setPartsCost] = useState(0)

  useEffect(() => {
    if (!job) return
    setLaborHours(typeof job.labor_hours === 'number' ? job.labor_hours : 0)
    setLaborRate(typeof job.labor_rate === 'number' ? job.labor_rate : 0)
    setPartsCost(typeof job.parts_cost === 'number' ? job.parts_cost : 0)
    // Re-seed the editable cost fields only when navigating to a different job —
    // not on every refetch, which would clobber the engineer's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id])

  const { data: engineers } = useQuery<EngineerOption[]>({
    // NOT ['engineers'] — that key belongs to the `engineers` table query in
    // use-engineers.ts, which has a different row shape. Sharing it made
    // whichever page loaded first poison the other's cache for 60s.
    queryKey: ['engineer-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email').eq('role', 'engineer')
      if (error) throw error
      return (data ?? []) as EngineerOption[]
    },
  })

  const { data: slaPolicies } = useSlaPolicies()
  const slaPolicy =
    job && job.sla_policy_id
      ? slaPolicies?.find((p) => p.id === job.sla_policy_id)
      : undefined

  if (isLoading) return <DetailPageSkeleton />

  if (!job || !id) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Job not found"
          breadcrumbs={<Breadcrumbs items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Jobs', path: '/dashboard/jobs' }]} />}
        />
        <AppCard>
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <FileText size={28} strokeWidth={1.5} className="mb-2" />
            <Text scale="caption" tone="muted">
              Job not found
            </Text>
          </div>
        </AppCard>
      </div>
    )
  }

  const totalCost = laborHours * laborRate + partsCost
  const photoCount = photos?.length ?? 0
  const taskCount = tasks?.length ?? 0
  const slaPriority = job.sla_priority ? SLA_PRIORITIES[job.sla_priority] : null
  const jobTypeLabel = job.job_type ? JOB_TYPES[job.job_type] : null
  const routineCheckLabel = job.routine_check_type ? ROUTINE_CHECK_TYPES[job.routine_check_type] : null

  const handleStatusUpdate = () => {
    if (!statusUpdate) return
    // W3-T10: when the DB permit gate blocks this transition, useUpdateJob's
    // onError translates the gate code into a human message.
    updateJob.mutate({ id: job.id, status: statusUpdate })
    setStatusUpdate('')
  }

  const handleOutcomeUpdate = () => {
    if (!outcomeUpdate) return
    updateJob.mutate({ id: job.id, outcome: outcomeUpdate as Job['outcome'] })
    setOutcomeUpdate('')
  }

  const handleAssign = () => {
    if (!selectedEngineer) return
    assignEngineer.mutate({ job_id: job.id, engineer_id: selectedEngineer })
    setSelectedEngineer('')
  }

  const handleDelete = () => {
    deleteJob.mutate(job.id, {
      onSuccess: () => navigate('/dashboard/jobs'),
    })
  }

  const handleUploadPhoto = async () => {
    if (!uploadFile) return
    await uploadPhoto.mutateAsync({
      jobId: id,
      organisationId: organisation?.id ?? job.organisation_id,
      file: uploadFile,
      caption: uploadCaption || undefined,
      photoType: uploadPhotoType,
      uploadedBy: profile?.id,
    })
    setUploadFile(null)
    setUploadCaption('')
    setUploadPhotoType('general')
    setShowUploadForm(false)
  }

  const handleDeletePhoto = (photo: JobPhoto) => {
    deletePhoto.mutate(photo)
    setDeletePhotoConfirm(null)
  }

  const handleAddTask = () => {
    if (!newTaskDescription.trim()) return
    createTask.mutate({
      job_id: id,
      description: newTaskDescription.trim(),
      organisation_id: organisation?.id ?? job.organisation_id,
    })
    setNewTaskDescription('')
  }

  const handleTaskOutcomeChange = (task: JobTask, outcome: string) => {
    updateTask.mutate({
      id: task.id,
      outcome: outcome as 'complete' | 'incomplete' | 'revisit',
      completed_at: outcome === 'complete' ? new Date().toISOString() : undefined,
    })
  }

  const saveCosts = async () => {
    await supabase
      .from('jobs')
      .update({ labor_hours: laborHours, labor_rate: laborRate, parts_cost: partsCost })
      .eq('id', job.id)
    type JobCostUpdate = Parameters<typeof updateJob.mutate>[0] & {
      labor_hours: number
      labor_rate: number
      parts_cost: number
    }
    updateJob.mutate({ id: job.id, labor_hours: laborHours, labor_rate: laborRate, parts_cost: partsCost } as JobCostUpdate)
  }

  return (
    <div className="max-w-[1200px] space-y-6">
      <PageHeader
        title={job.job_number ? `${job.job_number} · ${job.title}` : job.title}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: 'Dashboard', path: '/dashboard' },
              { label: 'Jobs', path: '/dashboard/jobs' },
              { label: job.job_number || job.title },
            ]}
          />
        }
        actions={
          <>
            <JobSlaIndicator job={job} />
            <JobPermitChip jobId={job.id} requiresPermit={job.requires_permit} />
            {photoCount > 0 ? (
              <Chip variant="soft" color="default" size="sm">
                <span className="inline-flex items-center gap-1">
                  <Camera size={11} />
                  {photoCount} photo{photoCount !== 1 ? 's' : ''}
                </span>
              </Chip>
            ) : null}
            <Button variant="danger" size="sm" onPress={() => setConfirmOpen(true)} className="hidden sm:inline-flex">
              <Trash2 size={14} />
              Delete
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Job"
        message="Are you sure you want to delete this job?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <div className="overflow-x-auto border-b border-border-default">
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-label font-medium transition-colors ${
                      isActive
                        ? 'border-navy-950 text-navy-950'
                        : 'border-transparent text-text-muted hover:border-border-default hover:text-text-secondary'
                    }`}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {activeTab === 'overview' ? (
            <div className="space-y-6">
            <div className="flex justify-end">
              <Link
                to={`/dashboard/quotes/new?job=${job.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 text-label font-medium transition-colors"
              >
                <Receipt size={14} /> Raise quote from this job
              </Link>
            </div>
            <JobOverviewTab
              job={job}
              jobTypeLabel={jobTypeLabel}
              routineCheckLabel={routineCheckLabel}
              slaPriority={slaPriority}
              slaPolicy={slaPolicy}
              tasks={tasks}
              tasksLoading={tasksLoading}
              taskCount={taskCount}
              newTaskDescription={newTaskDescription}
              onNewTaskDescriptionChange={setNewTaskDescription}
              onAddTask={handleAddTask}
              onTaskOutcomeChange={handleTaskOutcomeChange}
              onDeleteTask={(task) => deleteTask.mutate({ id: task.id, jobId: task.job_id })}
              isCreatingTask={createTask.isPending}
              statusUpdate={statusUpdate}
              onStatusUpdateChange={setStatusUpdate}
              onStatusUpdate={handleStatusUpdate}
              outcomeUpdate={outcomeUpdate}
              onOutcomeUpdateChange={setOutcomeUpdate}
              onOutcomeUpdate={handleOutcomeUpdate}
              isUpdatingJob={updateJob.isPending}
              engineers={engineers}
              selectedEngineer={selectedEngineer}
              onSelectedEngineerChange={setSelectedEngineer}
              onAssignEngineer={handleAssign}
              isAssigningEngineer={assignEngineer.isPending}
            />
            <JobServiceGroup jobId={job.id} value={job.service_group} />
            <JobSubcontractorPanel job={job} />
            <JobPermitsPanel job={job} />
            <JobFieldLog jobId={job.id} />
            <JobCertForms jobId={job.id} />
            <JobLinkedTasks jobId={job.id} propertyId={job.property_id} parentJobId={job.parent_job_id} />
            </div>
          ) : null}

          {activeTab === 'timeline' ? (
            <JobTimelineTab
              jobId={job.id}
              organisationId={organisation?.id ?? job.organisation_id}
              status={job.status}
              isEngineer={profile?.role === 'engineer'}
              engineerId={profile?.id}
              property={{
                latitude: job.properties?.latitude ?? null,
                longitude: job.properties?.longitude ?? null,
                address: job.properties?.address ?? null,
              }}
            />
          ) : null}

          {activeTab === 'photos' ? (
            <JobPhotosTab
              photos={photos}
              isLoading={photosLoading}
              showUploadForm={showUploadForm}
              onToggleUploadForm={() => setShowUploadForm((open) => !open)}
              uploadFile={uploadFile}
              onUploadFileChange={setUploadFile}
              uploadCaption={uploadCaption}
              onUploadCaptionChange={setUploadCaption}
              uploadPhotoType={uploadPhotoType}
              onUploadPhotoTypeChange={setUploadPhotoType}
              onUploadPhoto={handleUploadPhoto}
              isUploading={uploadPhoto.isPending}
              deletePhotoConfirm={deletePhotoConfirm}
              onDeletePhotoConfirmChange={setDeletePhotoConfirm}
              onDeletePhoto={handleDeletePhoto}
              lightboxPhoto={lightboxPhoto}
              onLightboxPhotoChange={setLightboxPhoto}
            />
          ) : null}

          {activeTab === 'invoice' ? (
            <JobInvoiceTab
              job={job}
              profileRole={profile?.role}
              laborHours={laborHours}
              laborRate={laborRate}
              partsCost={partsCost}
              onLaborHoursChange={setLaborHours}
              onLaborRateChange={setLaborRate}
              onPartsCostChange={setPartsCost}
              totalCost={totalCost}
              onSaveCosts={saveCosts}
              showCertificate={showCertificate}
              onToggleCertificate={() => setShowCertificate((show) => !show)}
            />
          ) : null}
        </div>

        <JobEtaPanel
          jobId={job.id}
          organisationId={job.organisation_id}
          status={job.status}
          earliestAt={job.eta_earliest_at ?? null}
          latestAt={job.eta_latest_at ?? null}
          propertyAddress={job.properties?.address ?? null}
          propertyName={job.properties?.name ?? null}
          clientId={job.client_id ?? null}
          assignments={job.engineer_assignments}
        />
      </div>

      <MobileActionBar>
        <Button
          variant="primary"
          fullWidth
          onPress={() => updateJob.mutate({ id: job.id, status: JOB_STATUSES.COMPLETED })}
          isDisabled={job.status === JOB_STATUSES.COMPLETED || updateJob.isPending}
        >
          Mark complete
        </Button>
        <Button variant="danger" onPress={() => setConfirmOpen(true)} aria-label="Delete job">
          <Trash2 size={16} />
        </Button>
      </MobileActionBar>
    </div>
  )
}
