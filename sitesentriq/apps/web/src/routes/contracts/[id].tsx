import { useParams, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Chip, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader, Heading, Text } from '@haumea/ui'
import { Plus, Wrench } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useContract, useContractRoutineTemplates, useCreateContractRoutineTemplate, useGenerateContractRoutines } from '@/hooks/use-contracts'
import { useProperties } from '@/hooks/use-properties'
import { formatDate } from '@haumea/utils'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ContractSlaSection } from '@/components/contracts/contract-sla-section'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { toLocalYmd } from '@/lib/time-tracking/compute'

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  active: 'success',
  expired: 'danger',
  renewal_due: 'warning',
  draft: 'default',
}

const routineSchema = z.object({
  property_id: z.string().min(1, 'Property is required'),
  name: z.string().min(1, 'Routine name is required'),
  maintenance_type: z.string().min(1, 'Maintenance type is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  schedule_mode: z.enum(['fixed', 'rolling']),
  starts_at: z.string().min(1, 'Start date is required'),
  description: z.string().optional(),
})

type RoutineForm = z.infer<typeof routineSchema>

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-border-subtle last:border-0">
      <Text scale="caption" tone="muted" weight="medium" className="uppercase tracking-[0.04em] mb-1">{label}</Text>
      <p className="text-label text-text-secondary">{value || '-'}</p>
    </div>
  )
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { organisation } = useAuth()
  const { data: contract, isLoading } = useContract(id!)
  const { data: templates } = useContractRoutineTemplates(id)
  const { data: properties } = useProperties(contract?.client_id)
  const createTemplate = useCreateContractRoutineTemplate()
  const generateRoutines = useGenerateContractRoutines()

  const routineForm = useForm<RoutineForm>({
    resolver: zodResolver(routineSchema),
    defaultValues: {
      property_id: '',
      name: '',
      maintenance_type: 'Fire Alarm Panel',
      frequency: 'quarterly',
      schedule_mode: 'fixed',
      starts_at: toLocalYmd(new Date()),
      description: '',
    },
  })

  if (isLoading) {
    return <DetailPageSkeleton withTabs={false} />
  }

  if (!contract) {
    return (
      <div className="text-center py-16 text-text-muted text-label">
        Contract not found.{' '}
        <Link to="/dashboard/contracts" className="text-navy-600 hover:underline">Back to contracts</Link>
      </div>
    )
  }

  const handleRoutineSubmit = async (values: RoutineForm) => {
    await createTemplate.mutateAsync({
      ...values,
      organisation_id: organisation?.id,
      contract_id: contract.id,
      asset_id: null,
      description: values.description || null,
    })
    routineForm.reset({
      ...values,
      name: '',
      description: '',
    })
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Contracts', path: '/dashboard/contracts' },
        { label: contract.clients?.name || 'Contract Details' },
      ]} />

      <div className="flex items-center gap-3">
        <div>
          <PageHeader title="Contract Details" subtitle={contract.clients?.name || 'Unknown client'} />
        </div>
        <span className="ml-auto">
          <Chip variant="soft" color={STATUS_CHIP_COLOR[contract.status ?? 'draft'] ?? 'default'} size="sm" className="capitalize">
            {(contract.status || 'draft').replace('_', ' ')}
          </Chip>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-card border border-border-default rounded-xl px-6 py-4">
          <Heading level={2} scale="body" className="mb-2">Contract Information</Heading>
          <DetailRow label="Client" value={contract.clients?.name} />
          <DetailRow label="Start Date" value={contract.start_date ? formatDate(contract.start_date) : undefined} />
          <DetailRow label="End Date" value={contract.end_date ? formatDate(contract.end_date) : undefined} />
          <DetailRow label="Status" value={contract.status?.replace('_', ' ')} />
          <DetailRow
            label="Contract Value"
            value={contract.value != null ? `£${Number(contract.value).toLocaleString()}` : undefined}
          />
        </div>

        <div className="bg-surface-card border border-border-default rounded-xl px-6 py-4">
          <Heading level={2} scale="body" className="mb-2">Service Details</Heading>
          <DetailRow label="Services Included" value={contract.services_included} />
          <DetailRow label="Frequency Commitments" value={contract.frequency_commitment} />
          <DetailRow label="SLA Notes" value={contract.sla_notes} />
        </div>
      </div>

      {/* SLA engine (00117, W2-T6) */}
      <ContractSlaSection contractId={contract.id} />

      <AppCard padding="md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <Heading level={2} scale="body">Contract-to-Routine Wizard</Heading>
            <p className="text-label text-text-muted mt-0.5">
              Define contracted routines, then generate live Routine Maintenance plans from the templates.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            isDisabled={generateRoutines.isPending || !templates?.length}
            onPress={() => generateRoutines.mutate(contract.id)}
          >
            <Wrench size={14} />
            {generateRoutines.isPending ? 'Generating...' : 'Create Routines'}
          </Button>
        </div>

        <form onSubmit={routineForm.handleSubmit(handleRoutineSubmit)} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-start">
          <div className="md:col-span-2">
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Property</label>
            <FormSelectController
              control={routineForm.control}
              name="property_id"
              ariaLabel="Property"
              placeholder="Select property..."
              options={(properties ?? []).map((property) => ({ value: property.id, label: property.name }))}
            />
            {routineForm.formState.errors.property_id && <p className="text-status-overdue text-xs mt-1">{routineForm.formState.errors.property_id.message}</p>}
          </div>
          <TextField isRequired isInvalid={!!routineForm.formState.errors.name} className="md:col-span-2">
            <Label>Routine</Label>
            <Input placeholder="Emergency Lighting" {...routineForm.register('name')} />
            {routineForm.formState.errors.name && <FieldError>{routineForm.formState.errors.name.message}</FieldError>}
          </TextField>
          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Frequency</label>
            <FormSelectController
              control={routineForm.control}
              name="frequency"
              ariaLabel="Frequency"
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'biannual', label: 'Bi-annual' },
                { value: 'annual', label: 'Annual' },
              ]}
            />
          </div>
          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Mode</label>
            <FormSelectController
              control={routineForm.control}
              name="schedule_mode"
              ariaLabel="Mode"
              options={[
                { value: 'fixed', label: 'Fixed' },
                { value: 'rolling', label: 'Rolling' },
              ]}
            />
          </div>
          <TextField className="md:col-span-2">
            <Label>Type</Label>
            <Input {...routineForm.register('maintenance_type')} />
          </TextField>
          <TextField className="md:col-span-2">
            <Label>Starts At</Label>
            <Input type="date" {...routineForm.register('starts_at')} />
          </TextField>
          <TextField className="md:col-span-2">
            <Label>Description</Label>
            <TextArea rows={1} {...routineForm.register('description')} />
          </TextField>
          <div className="md:col-span-6">
            <Button type="submit" variant="outline" size="sm" isDisabled={createTemplate.isPending}>
              <Plus size={14} />
              {createTemplate.isPending ? 'Adding...' : 'Add Template'}
            </Button>
          </div>
        </form>

        <div className="mt-5 space-y-2">
          {!templates?.length ? (
            <p className="text-label text-text-muted">No routine templates yet.</p>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between gap-4 rounded-lg border border-border-subtle px-3 py-2">
                <div>
                  <p className="text-label font-medium text-text-primary">{template.name}</p>
                  <Text scale="caption" tone="muted">
                    {template.properties?.name ?? 'Property'} · {template.frequency} · {template.schedule_mode}
                  </Text>
                </div>
                <Chip variant="soft" color="accent" size="sm">{template.maintenance_type}</Chip>
              </div>
            ))
          )}
        </div>
      </AppCard>
    </div>
  )
}
