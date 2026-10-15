// Edit Subcontractor page. Mirrors subcontractors/new.tsx so the fields and
// validation stay in lock-step. Pre-fills from useSubcontractor(id) and persists
// via useUpdateSubcontractor. Added because the entity previously had no Update
// path in the UI — the only way to amend a subcontractor was delete-and-recreate.
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'

import { useSubcontractor, useUpdateSubcontractor } from '@/hooks/use-subcontractors'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { FormSkeleton } from '@/components/shared/skeletons'

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

export default function EditSubcontractorPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { data: subcontractor, isLoading } = useSubcontractor(id ?? '')
  const updateSubcontractor = useUpdateSubcontractor()

  const {
    register,
    handleSubmit,
    control,
    reset,
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

  // Hydrate once the record loads — keyed on id so a background refetch can't
  // reset() over the user's in-progress edits.
  const hydratedId = useRef<string | null>(null)
  useEffect(() => {
    if (!subcontractor) return
    if (hydratedId.current === subcontractor.id) return
    hydratedId.current = subcontractor.id
    reset({
      company_name: subcontractor.company_name ?? '',
      contact_person: subcontractor.contact_person ?? '',
      email: subcontractor.email ?? '',
      phone: subcontractor.phone ?? '',
      trade: subcontractor.trade ?? '',
      status: (subcontractor.status as SubcontractorFormData['status']) ?? 'pending',
      notes: subcontractor.notes ?? '',
    })
  }, [subcontractor, reset])

  const onSubmit = async (data: SubcontractorFormData) => {
    if (!id) return
    // Normalise empty optional strings → null so the DB clears a previously-set
    // value. Cast because the Subcontractor type models optionals as
    // `string | undefined` (undefined would be dropped from the update payload).
    const updates: Record<string, unknown> = {
      id,
      company_name: data.company_name,
      status: data.status,
      contact_person: data.contact_person || null,
      email: data.email || null,
      phone: data.phone || null,
      trade: data.trade || null,
      notes: data.notes || null,
    }
    await updateSubcontractor.mutateAsync(
      updates as Parameters<typeof updateSubcontractor.mutateAsync>[0],
    )
    navigate(`/dashboard/subcontractors/${id}`)
  }

  if (isLoading) return <FormSkeleton fields={6} />
  if (!subcontractor) return <p className="text-label text-text-muted">Subcontractor not found.</p>

  return (
    <div className="space-y-5 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Subcontractors', path: '/dashboard/subcontractors' },
        { label: subcontractor.company_name, path: `/dashboard/subcontractors/${id}` },
        { label: 'Edit' },
      ]} />

      <div>
        <PageHeader title="Edit Subcontractor" subtitle="Update this contractor's details" />
      </div>

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
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
          <Link to={`/dashboard/subcontractors/${id}`} className="inline-flex items-center border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-4 py-2 text-label font-medium transition-colors">
            Cancel
          </Link>
        </div>

        {updateSubcontractor.isError && (
          <p className="text-caption text-status-overdue">
            Failed to update subcontractor: {(updateSubcontractor.error as Error).message}
          </p>
        )}
      </form>
      </AppCard>
    </div>
  )
}
