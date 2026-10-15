import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'

import { useCreateEngineer } from '@/hooks/use-engineers'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'

const engineerSchema = z.object({
  name: z.string().min(1, 'Engineer name is required'),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone: z.string().optional(),
  trade: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  notes: z.string().optional(),
})

type EngineerFormData = z.infer<typeof engineerSchema>

export default function NewEngineerPage() {
  const navigate = useNavigate()
  const { organisation } = useAuth()
  const createEngineer = useCreateEngineer()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EngineerFormData>({
    resolver: zodResolver(engineerSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      trade: '',
      status: 'active',
      notes: '',
    },
  })

  const onSubmit = async (data: EngineerFormData) => {
    await createEngineer.mutateAsync({
      ...data,
      email: data.email || undefined,
      phone: data.phone || undefined,
      trade: data.trade || undefined,
      notes: data.notes || undefined,
      organisation_id: organisation?.id ?? '',
    })
    navigate('/dashboard/engineers')
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Engineers', path: '/dashboard/engineers' },
        { label: 'New Engineer' },
      ]} />

      {/* Title */}
      <div>
        <PageHeader title="New Engineer" subtitle="Add a new engineer to your workforce" />
      </div>

      {/* Form Card */}
      <AppCard padding="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField isRequired isInvalid={!!errors.name}>
          <Label>Engineer Name</Label>
          <Input type="text" placeholder="Enter engineer name" {...register('name')} />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </TextField>

        <TextField isInvalid={!!errors.email}>
          <Label>Email</Label>
          <Input type="email" placeholder="engineer@example.com" {...register('email')} />
          {errors.email && <FieldError>{errors.email.message}</FieldError>}
        </TextField>

        <TextField>
          <Label>Phone</Label>
          <Input type="tel" placeholder="+44 123 456 7890" {...register('phone')} />
        </TextField>

        <TextField>
          <Label>Trade</Label>
          <Input type="text" placeholder="e.g. Electrician, Plumber, HVAC" {...register('trade')} />
        </TextField>

        <div>
          <label className="block text-label font-medium text-text-secondary mb-1.5">Status</label>
          <FormSelectController
            control={control}
            name="status"
            ariaLabel="Status"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </div>

        <TextField>
          <Label>Notes</Label>
          <TextArea rows={3} placeholder="Any additional notes..." {...register('notes')} />
        </TextField>

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            isDisabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Engineer'}
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard/engineers">
              Cancel
            </Link>
          </Button>
        </div>

        {createEngineer.isError && (
          <p className="text-caption text-status-overdue">
            Failed to create engineer: {(createEngineer.error as Error).message}
          </p>
        )}
      </form>
      </AppCard>
    </div>
  )
}
