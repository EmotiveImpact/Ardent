import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'

import { useCreateSubcontractor } from '@/hooks/use-subcontractors'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'

const subcontractorSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  contact_person: z.string().optional(),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone: z.string().optional(),
  trade: z.string().optional(),
  status: z.enum(['approved', 'pending', 'suspended']),
  notes: z.string().optional(),
})

type SubcontractorFormData = z.infer<typeof subcontractorSchema>

export default function NewSubcontractorPage() {
  const navigate = useNavigate()
  const { organisation } = useAuth()
  const createSubcontractor = useCreateSubcontractor()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SubcontractorFormData>({
    resolver: zodResolver(subcontractorSchema),
    defaultValues: {
      company_name: '',
      contact_person: '',
      email: '',
      phone: '',
      trade: '',
      status: 'pending',
      notes: '',
    },
  })

  const onSubmit = async (data: SubcontractorFormData) => {
    await createSubcontractor.mutateAsync({
      ...data,
      contact_person: data.contact_person || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      trade: data.trade || undefined,
      notes: data.notes || undefined,
      organisation_id: organisation?.id ?? '',
    })
    navigate('/dashboard/subcontractors')
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Subcontractors', path: '/dashboard/subcontractors' },
        { label: 'New Subcontractor' },
      ]} />

      {/* Title */}
      <div>
        <PageHeader title="New Subcontractor" subtitle="Add a new external contractor or supplier" />
      </div>

      {/* Form Card */}
      <AppCard padding="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField isRequired isInvalid={!!errors.company_name}>
          <Label>Company Name</Label>
          <Input type="text" placeholder="Enter company name" {...register('company_name')} />
          {errors.company_name && <FieldError>{errors.company_name.message}</FieldError>}
        </TextField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <TextField>
            <Label>Contact Person</Label>
            <Input type="text" placeholder="Full name" {...register('contact_person')} />
          </TextField>

          <TextField>
            <Label>Trade</Label>
            <Input type="text" placeholder="e.g. Electrical, Plumbing" {...register('trade')} />
          </TextField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <TextField isInvalid={!!errors.email}>
            <Label>Email</Label>
            <Input type="email" placeholder="contact@company.com" {...register('email')} />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </TextField>

          <TextField>
            <Label>Phone</Label>
            <Input type="tel" placeholder="+44 123 456 7890" {...register('phone')} />
          </TextField>
        </div>

        <div>
          <label className="block text-label font-medium text-text-secondary mb-1.5">Status</label>
          <FormSelectController
            control={control}
            name="status"
            ariaLabel="Status"
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
        </div>

        <TextField>
          <Label>Notes</Label>
          <TextArea rows={3} placeholder="Any additional notes..." {...register('notes')} />
        </TextField>

        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" isDisabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Subcontractor'}
          </Button>
          <Link to="/dashboard/subcontractors" className="inline-flex items-center border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-4 py-2 text-label font-medium transition-colors">
            Cancel
          </Link>
        </div>

        {createSubcontractor.isError && (
          <p className="text-caption text-status-overdue">
            Failed to create subcontractor: {(createSubcontractor.error as Error).message}
          </p>
        )}
      </form>
      </AppCard>
    </div>
  )
}
