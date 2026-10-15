import { useNavigate, useSearchParams, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'
import { useProperties } from '@/hooks/use-properties'
import { useJobs } from '@/hooks/use-jobs'
import { useCreateAction } from '@/hooks/use-actions'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import type { Property, JobWithRelations, Action } from '@haumea/types'

const actionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.string().min(1, 'Priority is required'),
  property_id: z.string().optional(),
  job_id: z.string().optional(),
  due_date: z.string().optional(),
})

type ActionFormData = z.infer<typeof actionSchema>

export default function NewActionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()
  const createAction = useCreateAction()

  const defaultPropertyId = searchParams.get('property_id') || ''
  const defaultJobId = searchParams.get('job_id') || ''

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ActionFormData>({
    resolver: zodResolver(actionSchema),
    defaultValues: {
      priority: 'medium',
      property_id: defaultPropertyId,
      job_id: defaultJobId,
    },
  })

  const { data: properties, isLoading: propertiesLoading } = useProperties()
  const { data: jobs, isLoading: jobsLoading } = useJobs()

  const onSubmit = (data: ActionFormData) => {
    createAction.mutate(
      {
        ...data,
        status: 'open',
        organisation_id: profile?.organisation_id,
        property_id: data.property_id || undefined,
        job_id: data.job_id || undefined,
        due_date: data.due_date || undefined,
      },
      {
        onSuccess: (result: Action) => {
          navigate(`/dashboard/actions/${result.id}`)
        },
      }
    )
  }

  const labelClass = 'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'
  const errorClass = 'text-micro text-status-overdue mt-1'

  return (
    <div className="space-y-6 max-w-[720px]">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Actions', path: '/dashboard/actions' },
        { label: 'New Action' },
      ]} />

      <div>
        <PageHeader title="New Action" subtitle="Create a new action or defect to track" />
      </div>

      <AppCard padding="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Title */}
        <TextField isRequired isInvalid={!!errors.title}>
          <Label>Title</Label>
          <Input type="text" placeholder="e.g. Fix broken fire exit sign" {...register('title')} />
          {errors.title && <FieldError>{errors.title.message}</FieldError>}
        </TextField>

        {/* Description */}
        <TextField>
          <Label>Description</Label>
          <TextArea placeholder="Describe the action or defect..." rows={4} {...register('description')} />
        </TextField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Priority */}
          <div>
            <label className={labelClass}>Priority *</label>
            <FormSelectController
              control={control}
              name="priority"
              ariaLabel="Priority"
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'critical', label: 'Critical' },
              ]}
            />
            {errors.priority && <p className={errorClass}>{errors.priority.message}</p>}
          </div>

          {/* Due Date */}
          <TextField>
            <Label>Due Date</Label>
            <Input type="date" {...register('due_date')} />
          </TextField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Property */}
          <div>
            <label className={labelClass}>Property</label>
            <FormSelectController
              control={control}
              name="property_id"
              ariaLabel="Property"
              placeholder="-- No property --"
              clearable
              disabled={propertiesLoading}
              options={(properties ?? []).map((p: Property) => ({ value: p.id, label: p.name }))}
            />
          </div>

          {/* Linked Job */}
          <div>
            <label className={labelClass}>Linked Job</label>
            <FormSelectController
              control={control}
              name="job_id"
              ariaLabel="Linked Job"
              placeholder="-- No linked job --"
              clearable
              disabled={jobsLoading}
              options={(jobs ?? []).map((j: JobWithRelations) => ({ value: j.id, label: j.title }))}
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" isDisabled={createAction.isPending}>
            {createAction.isPending ? 'Creating...' : 'Create Action'}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/dashboard/actions">
              Cancel
            </Link>
          </Button>
        </div>
      </form>
      </AppCard>
    </div>
  )
}
