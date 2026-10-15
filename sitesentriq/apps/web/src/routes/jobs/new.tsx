import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { useProperties } from '@/hooks/use-properties'
import { useCreateJob, useAssignEngineer } from '@/hooks/use-jobs'
import { useAuth } from '@/hooks/use-auth'
import { useAutosaveDraft } from '@/hooks/use-autosave-draft'
import { Button, FieldError, Input, Label, Modal, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'
import { JOB_OUTCOMES, SLA_PRIORITIES, JOB_TYPES, ROUTINE_CHECK_TYPES, SERVICE_GROUPS } from '@/lib/constants'
import { AutoAssignSuggestions } from '@/components/shared/auto-assign-suggestions'
import type { Property } from '@haumea/types'
import { FormSkeleton } from '@/components/shared/skeletons'

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  property_id: z.string().min(1, 'Property is required'),
  scheduled_date: z.string().min(1, 'Scheduled date is required'),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], {
    message: 'Priority is required',
  }),
  sla_priority: z.string().optional(),
  job_type: z.enum(['reactive', 'ppm', 'service']).optional(),
  service_group: z.string().optional(),
  routine_check_type: z.string().optional(),
  is_out_of_hours: z.boolean().optional(),
  requires_permit: z.boolean().optional(),
  time_start: z.string().optional(),
  time_end: z.string().optional(),
  notes: z.string().optional(),
  outcome: z.enum(['pass', 'fail', 'incomplete', 'n_a', 'revisit']).optional().or(z.literal('')),
})

type JobFormData = z.infer<typeof jobSchema>

export default function NewJobPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const createJob = useCreateJob()
  const assignEngineer = useAssignEngineer()
  const { data: properties, isLoading: propertiesLoading } = useProperties()

  const form = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      priority: 'medium',
      sla_priority: 'p3',
      job_type: 'reactive',
      is_out_of_hours: false,
      requires_permit: false,
    },
  })
  const { register, handleSubmit, watch, control, formState: { errors } } = form
  const { clearDraft } = useAutosaveDraft(form, { key: 'draft:job:new' })

  const jobType = watch('job_type')
  const propertyId = watch('property_id')
  const scheduledDate = watch('scheduled_date')
  const timeStart = watch('time_start')
  const timeEnd = watch('time_end')
  const routineCheckType = watch('routine_check_type')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestedEngineerId, setSuggestedEngineerId] = useState<string | null>(null)

  const onSubmit = (data: JobFormData) => {
    createJob.mutate(
      {
        title: data.title,
        property_id: data.property_id,
        scheduled_date: data.scheduled_date,
        priority: data.priority,
        sla_priority: data.sla_priority || undefined,
        job_type: data.job_type || undefined,
        service_group: data.service_group || undefined,
        routine_check_type: data.job_type === 'ppm' ? (data.routine_check_type || undefined) : undefined,
        is_out_of_hours: data.is_out_of_hours || false,
        requires_permit: data.requires_permit || false,
        time_start: data.time_start || undefined,
        time_end: data.time_end || undefined,
        description: data.notes || undefined,
        outcome: (data.outcome || undefined) as 'pass' | 'fail' | 'incomplete' | 'n_a' | 'revisit' | undefined,
        is_callout: data.job_type === 'reactive',
        status: 'scheduled',
        organisation_id: profile?.organisation_id,
      },
      {
        onSuccess: (job) => {
          // Honour the engineer picked in the "Suggest engineer" modal — the
          // form promised "will be assigned after creation" but previously
          // dropped it silently. Assign via engineer_assignments now.
          const newJobId = (job as { id?: string } | undefined)?.id
          if (suggestedEngineerId && newJobId) {
            assignEngineer.mutate({ job_id: newJobId, engineer_id: suggestedEngineerId })
          }
          clearDraft()
          navigate('/dashboard/jobs')
        },
      },
    )
  }

  if (propertiesLoading) {
    return <FormSkeleton fields={6} />
  }

  return (
    <div className="space-y-6 max-w-[800px]">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onPress={() => navigate('/dashboard/jobs')}
        >
          <ArrowLeft size={16} />
        </Button>
        <div>
          <PageHeader title="New Job" subtitle="Create a new work order" />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <AppCard padding="md">
          <h3 className="text-body font-semibold text-text-primary mb-4">Job Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField className="md:col-span-2" isRequired isInvalid={!!errors.title}>
              <Label>Title</Label>
              <Input placeholder="e.g. Quarterly boiler service" {...register('title')} />
              {errors.title && <FieldError>{errors.title.message}</FieldError>}
            </TextField>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                Property *
              </label>
              <FormSelectController
                control={control}
                name="property_id"
                ariaLabel="Property"
                placeholder="Select property..."
                options={(properties ?? []).map((p: Property) => ({ value: p.id, label: p.name }))}
              />
              {errors.property_id && (
                <p className="text-status-overdue text-xs mt-1">{errors.property_id.message}</p>
              )}
            </div>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                Job Type
              </label>
              <FormSelectController
                control={control}
                name="job_type"
                ariaLabel="Job Type"
                options={Object.entries(JOB_TYPES).map(([value, label]) => ({ value, label }))}
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                Service Group
              </label>
              <FormSelectController
                control={control}
                name="service_group"
                ariaLabel="Service Group"
                placeholder="Select a service group..."
                clearable
                options={SERVICE_GROUPS.map((g) => ({ value: g, label: g }))}
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                SLA Priority
              </label>
              <FormSelectController
                control={control}
                name="sla_priority"
                ariaLabel="SLA Priority"
                options={Object.entries(SLA_PRIORITIES).map(([value, { label, response }]) => ({ value, label: `${label} (${response})` }))}
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                Priority *
              </label>
              <FormSelectController
                control={control}
                name="priority"
                ariaLabel="Priority"
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'urgent', label: 'Urgent' },
                ]}
              />
              {errors.priority && (
                <p className="text-status-overdue text-xs mt-1">{errors.priority.message}</p>
              )}
            </div>

            {jobType === 'ppm' && (
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                  Routine Check Type
                </label>
                <FormSelectController
                  control={control}
                  name="routine_check_type"
                  ariaLabel="Routine Check Type"
                  placeholder="Select type..."
                  clearable
                  options={Object.entries(ROUTINE_CHECK_TYPES).map(([value, label]) => ({ value, label }))}
                />
              </div>
            )}

            <TextField isRequired isInvalid={!!errors.scheduled_date}>
              <Label>Scheduled Date</Label>
              <Input type="date" {...register('scheduled_date')} />
              {errors.scheduled_date && <FieldError>{errors.scheduled_date.message}</FieldError>}
            </TextField>

            <TextField>
              <Label>Time Start</Label>
              <Input type="time" {...register('time_start')} />
            </TextField>

            <TextField>
              <Label>Time End</Label>
              <Input type="time" {...register('time_end')} />
            </TextField>

            <TextField className="md:col-span-2">
              <Label>Notes</Label>
              <TextArea rows={4} placeholder="Additional notes or instructions..." {...register('notes')} />
            </TextField>
          </div>
        </AppCard>

        {/* Visit Details */}
        <AppCard padding="md">
          <h3 className="text-body font-semibold text-text-primary mb-4">Visit Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                Outcome
              </label>
              <FormSelectController
                control={control}
                name="outcome"
                ariaLabel="Outcome"
                placeholder="Select outcome..."
                clearable
                options={Object.entries(JOB_OUTCOMES).map(([value, label]) => ({ value, label }))}
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('is_out_of_hours')}
                  className="w-4 h-4 rounded border-border-default text-brand-500 focus:ring-accent/20"
                />
                <div>
                  <span className="text-label font-medium text-text-primary">Out of Hours</span>
                  <p className="text-micro text-text-muted mt-0.5">Work performed outside normal business hours</p>
                </div>
              </label>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('requires_permit')}
                  className="w-4 h-4 rounded border-border-default text-brand-500 focus:ring-accent/20"
                />
                <div>
                  <span className="text-label font-medium text-text-primary">Permit to work</span>
                  <p className="text-micro text-text-muted mt-0.5">Job cannot start until a permit is issued (DB-enforced)</p>
                </div>
              </label>
            </div>
          </div>
        </AppCard>

        {/* Auto-assign suggestion CTA */}
        <AppCard padding="md">
          <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-body font-semibold text-text-primary">Suggest engineer</h3>
            <p className="text-caption text-text-muted mt-0.5">
              Use the rule engine to find the best engineer for this job.
            </p>
            {suggestedEngineerId && (
              <p className="text-caption text-brand-600 mt-1">
                Suggestion picked. The engineer will be assigned after creation.
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            isDisabled={!propertyId || !scheduledDate}
            onPress={() => setSuggestOpen(true)}
          >
            <Sparkles size={14} /> Suggest engineer
          </Button>
          </div>
        </AppCard>

        <div className="flex gap-3">
          <Button
            type="submit"
            variant="primary"
            isDisabled={createJob.isPending}
          >
            {createJob.isPending ? 'Creating...' : 'Create Job'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onPress={() => navigate('/dashboard/jobs')}
          >
            Cancel
          </Button>
        </div>
      </form>

      {/* Suggested engineers — Wave 17C: HeroUI <Modal> */}
      <Modal.Backdrop
        isOpen={suggestOpen}
        onOpenChange={(next) => {
          if (!next) setSuggestOpen(false)
        }}
      >
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Suggested engineers</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <AutoAssignSuggestions
                jobId={null}
                mode="suggest"
                candidate={{
                  property_id: propertyId,
                  category: routineCheckType || jobType,
                  scheduled_date: scheduledDate,
                  time_start: timeStart,
                  time_end: timeEnd,
                }}
                onSelect={(engId) => {
                  setSuggestedEngineerId(engId)
                  setSuggestOpen(false)
                }}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
