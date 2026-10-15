import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link } from 'react-router'
import { Button, FieldError, Input, Label, Spinner, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'
import { useCreateContract } from '@/hooks/use-contracts'
import { useClients } from '@/hooks/use-clients'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import type { Client } from '@haumea/types'

const contractSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    client_id: z.string().min(1, 'Client is required'),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    services_included: z.string().min(1, 'Services included is required'),
    // Real column is singular `frequency_commitment`.
    frequency_commitment: z.string().optional(),
    sla_notes: z.string().optional(),
    // Must match the DB CHECK constraint exactly.
    status: z.enum(['draft', 'active', 'expired', 'cancelled']),
  })
  .refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, {
    message: 'End date must be on or after the start date',
    path: ['end_date'],
  })

type ContractFormData = z.infer<typeof contractSchema>

export default function NewContractPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: clients, isLoading: clientsLoading } = useClients()
  const createContract = useCreateContract()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ContractFormData>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      title: '',
      client_id: '',
      start_date: '',
      end_date: '',
      services_included: '',
      frequency_commitment: '',
      sla_notes: '',
      status: 'active',
    },
  })

  const onSubmit = async (data: ContractFormData) => {
    if (!profile?.organisation_id) {
      toast.error('No organisation found — please sign in again.')
      return
    }
    // Map ONLY real contract columns (the form previously sent phantom
    // `frequency_commitments`/`renewal_reminder` and omitted the NOT NULL
    // organisation_id + title, so every insert failed).
    await createContract.mutateAsync({
      organisation_id: profile.organisation_id,
      client_id: data.client_id,
      title: data.title,
      start_date: data.start_date,
      end_date: data.end_date,
      services_included: data.services_included,
      frequency_commitment: data.frequency_commitment || undefined,
      sla_notes: data.sla_notes || undefined,
      status: data.status,
    })
    navigate('/dashboard/contracts')
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Contracts', path: '/dashboard/contracts' },
        { label: 'New Contract' },
      ]} />

      <PageHeader title="New Contract" />

      <AppCard padding="lg" className="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Title */}
        <TextField isRequired isInvalid={!!errors.title}>
          <Label>Contract Title</Label>
          <Input placeholder="e.g. Acme FM — Annual Service Agreement" {...register('title')} />
          {errors.title && <FieldError>{errors.title.message}</FieldError>}
        </TextField>

        {/* Client */}
        <div>
          <label className="text-label font-medium text-text-secondary block mb-1.5">
            Client <span className="text-status-overdue">*</span>
          </label>
          {clientsLoading ? (
            <Spinner size="sm" />
          ) : (
            <FormSelectController
              control={control}
              name="client_id"
              ariaLabel="Client"
              placeholder="Select a client"
              options={(clients || []).map((c: Client) => ({ value: c.id, label: c.name }))}
            />
          )}
          {errors.client_id && (
            <p className="text-micro text-status-overdue mt-1">{errors.client_id.message}</p>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField isRequired isInvalid={!!errors.start_date}>
            <Label>Start Date</Label>
            <Input type="date" {...register('start_date')} />
            {errors.start_date && <FieldError>{errors.start_date.message}</FieldError>}
          </TextField>
          <TextField isRequired isInvalid={!!errors.end_date}>
            <Label>End Date</Label>
            <Input type="date" {...register('end_date')} />
            {errors.end_date && <FieldError>{errors.end_date.message}</FieldError>}
          </TextField>
        </div>

        {/* Status */}
        <div>
          <label className="text-label font-medium text-text-secondary block mb-1.5">Status</label>
          <FormSelectController
            control={control}
            name="status"
            ariaLabel="Status"
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'active', label: 'Active' },
              { value: 'expired', label: 'Expired' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>

        {/* Services Included */}
        <TextField isRequired isInvalid={!!errors.services_included}>
          <Label>Services Included</Label>
          <TextArea rows={3} placeholder="Describe the services included in this contract..." {...register('services_included')} />
          {errors.services_included && <FieldError>{errors.services_included.message}</FieldError>}
        </TextField>

        {/* Frequency Commitments */}
        <TextField>
          <Label>Frequency Commitments</Label>
          <TextArea rows={2} placeholder="e.g., Monthly inspections, Quarterly deep cleans..." {...register('frequency_commitment')} />
        </TextField>

        {/* SLA Notes */}
        <TextField>
          <Label>SLA Notes</Label>
          <TextArea rows={2} placeholder="Response time commitments, penalty clauses, etc." {...register('sla_notes')} />
        </TextField>

        {/* Note: renewal reminders are sent automatically for all active
            contracts (notify-renewals cron at 60/30/7/0 days) — no per-contract
            toggle is needed, so the old non-functional switch was removed. */}

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" variant="primary" isDisabled={isSubmitting || createContract.isPending}>
            {isSubmitting || createContract.isPending ? 'Creating...' : 'Create Contract'}
          </Button>
          <Link
            to="/dashboard/contracts"
            className="px-4 py-2 rounded-lg text-label font-medium text-text-secondary hover:bg-surface-page transition-colors"
          >
            Cancel
          </Link>
        </div>

        {createContract.isError && (
          <p className="text-caption text-status-overdue">Failed to create contract. Please try again.</p>
        )}
      </form>
      </AppCard>
    </div>
  )
}
