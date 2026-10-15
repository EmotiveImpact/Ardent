import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { FormSelectController, PageHeader } from '@haumea/ui'
import { useCreateMaintenancePlan } from '@/hooks/use-maintenance'
import { useProperties } from '@/hooks/use-properties'
import { useAssets } from '@/hooks/use-assets'
import { useAuth } from '@/hooks/use-auth'
import { FREQUENCIES } from '@/lib/constants'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { FormSkeleton } from '@/components/shared/skeletons'

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  six_monthly: '6-Monthly',
  annual: 'Annual',
}

const maintenancePlanSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  property_id: z.string().min(1, 'Property is required'),
  asset_id: z.string().optional(),
  maintenance_category: z.enum(['routine', 'statutory', 'reactive', 'other']),
  maintenance_type: z.string().optional(),
  frequency: z.string().min(1, 'Frequency is required'),
  schedule_mode: z.enum(['fixed', 'rolling']),
  starts_at: z.string().optional(),
  next_due: z.string().optional(),
  is_active: z.boolean(),
  sfg20_aligned: z.boolean().optional(),
  sfg20_schedule_ref: z.string().optional(),
  sfg20_last_reviewed: z.string().optional(),
})

type MaintenancePlanForm = z.infer<typeof maintenancePlanSchema>

export default function NewMaintenancePlanPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const createPlan = useCreateMaintenancePlan()
  const { data: properties, isLoading: propertiesLoading } = useProperties()

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MaintenancePlanForm>({
    resolver: zodResolver(maintenancePlanSchema),
    defaultValues: {
      is_active: true,
      schedule_mode: 'fixed',
      maintenance_category: 'routine',
      maintenance_type: 'Service',
    },
  })

  const selectedPropertyId = watch('property_id')
  const { data: assets } = useAssets(selectedPropertyId || undefined)

  // Clear a stale asset_id when the property changes — assets are
  // property-scoped, so an asset from property A must not feed PPM job
  // generation under property B. Mirrors assets/new.tsx.
  const prevPropertyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevPropertyRef.current
    prevPropertyRef.current = selectedPropertyId
    if (prev && prev !== selectedPropertyId) {
      setValue('asset_id', '')
    }
  }, [selectedPropertyId, setValue])

  const onSubmit = async (values: MaintenancePlanForm) => {
    await createPlan.mutateAsync({
      name: values.name,
      description: values.description || undefined,
      property_id: values.property_id,
      asset_id: values.asset_id || undefined,
      maintenance_category: values.maintenance_category,
      maintenance_type: values.maintenance_type || undefined,
      frequency: values.frequency,
      schedule_mode: values.schedule_mode,
      starts_at: values.starts_at || undefined,
      next_due: values.next_due || undefined,
      is_active: values.is_active,
      sfg20_aligned: values.sfg20_aligned ?? false,
      sfg20_schedule_ref: values.sfg20_schedule_ref?.trim() || undefined,
      sfg20_last_reviewed: values.sfg20_last_reviewed || undefined,
      organisation_id: profile?.organisation_id,
    })
    navigate('/dashboard/maintenance')
  }

  if (propertiesLoading) {
    return <FormSkeleton fields={6} />
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Maintenance', path: '/dashboard/maintenance' },
        { label: 'New Plan' },
      ]} />

      <div className="space-y-3">
        <PageHeader title="New Maintenance Plan" />
        <p className="text-label text-text-muted">Set up a recurring maintenance schedule</p>
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Name */}
            <TextField isRequired isInvalid={!!errors.name}>
              <Label>Name</Label>
              <Input type="text" placeholder="e.g. Annual Boiler Service" {...register('name')} />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </TextField>

            {/* Description */}
            <TextField>
              <Label>Description</Label>
              <TextArea rows={3} placeholder="Optional description of the maintenance plan" {...register('description')} />
            </TextField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                  Category <span className="text-status-overdue">*</span>
                </label>
                <FormSelectController
                  control={control}
                  name="maintenance_category"
                  ariaLabel="Category"
                  options={[
                    { value: 'routine', label: 'Routine Maintenance' },
                    { value: 'statutory', label: 'Statutory Compliance' },
                    { value: 'reactive', label: 'Reactive' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Routine Type</label>
                <FormSelectController
                  control={control}
                  name="maintenance_type"
                  ariaLabel="Routine Type"
                  options={[
                    { value: 'Fire Extinguisher', label: 'Fire Extinguisher' },
                    { value: 'Intruder Alarm', label: 'Intruder Alarm' },
                    { value: 'Fire Alarm Panel', label: 'Fire Alarm Panel' },
                    { value: 'Emergency Lighting', label: 'Emergency Lighting' },
                    { value: 'Service', label: 'Service' },
                    { value: 'Inspection', label: 'Inspection' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
              </div>
            </div>

            {/* Property */}
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Property <span className="text-status-overdue">*</span>
              </label>
              <FormSelectController
                control={control}
                name="property_id"
                ariaLabel="Property"
                placeholder="Select property..."
                options={(properties ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
              {errors.property_id && (
                <p className="text-status-overdue text-micro mt-1">{errors.property_id.message}</p>
              )}
            </div>

            {/* Asset */}
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">Asset (optional)</label>
              <FormSelectController
                control={control}
                name="asset_id"
                ariaLabel="Asset"
                placeholder="No specific asset"
                clearable
                disabled={!selectedPropertyId}
                options={(assets ?? []).map((a) => ({ value: a.id, label: a.name }))}
              />
              {!selectedPropertyId && (
                <p className="text-text-muted text-micro mt-1">Select a property first to see assets</p>
              )}
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Frequency <span className="text-status-overdue">*</span>
              </label>
              <FormSelectController
                control={control}
                name="frequency"
                ariaLabel="Frequency"
                placeholder="Select frequency..."
                options={Object.values(FREQUENCIES).map((f) => ({ value: f, label: frequencyLabels[f] || f }))}
              />
              {errors.frequency && (
                <p className="text-status-overdue text-micro mt-1">{errors.frequency.message}</p>
              )}
            </div>

            {/* Schedule Mode */}
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-2">
                Schedule Mode <span className="text-status-overdue">*</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="fixed"
                    {...register('schedule_mode')}
                    className="text-brand-500 focus:ring-accent/20"
                  />
                  <div>
                    <span className="text-label font-medium text-text-secondary">Fixed schedule</span>
                    <p className="text-micro text-text-muted">Next due stays on the original calendar date</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="rolling"
                    {...register('schedule_mode')}
                    className="text-brand-500 focus:ring-accent/20"
                  />
                  <div>
                    <span className="text-label font-medium text-text-secondary">Rolling (from last completed)</span>
                    <p className="text-micro text-text-muted">Next due recalculates from completion date</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Next Due */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField>
                <Label>Site Takeover / Start Date</Label>
                <Input type="date" {...register('starts_at')} />
              </TextField>
              <TextField>
                <Label>Next Due Date</Label>
                <Input type="date" {...register('next_due')} />
              </TextField>
            </div>

            {/* SFG20 alignment */}
            <div className="rounded-lg border border-border-subtle p-4">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  {...register('sfg20_aligned')}
                  id="sfg20_aligned"
                  className="rounded border-border-default text-brand-500 focus:ring-accent/20"
                />
                <label htmlFor="sfg20_aligned" className="text-label font-medium text-text-secondary">
                  Aligned to SFG20
                </label>
              </div>
              <p className="mt-1 text-caption text-text-muted">
                Mark this plan as following an SFG20 maintenance schedule. Enter your SFG20 schedule
                reference (you hold the SFG20 licence — we don&apos;t store SFG20 content).
              </p>
              {watch('sfg20_aligned') && (
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField>
                    <Label>SFG20 schedule reference</Label>
                    <Input type="text" placeholder="e.g. 30.01 — Boilers, LTHW" {...register('sfg20_schedule_ref')} />
                  </TextField>
                  <TextField>
                    <Label>Last reviewed against SFG20</Label>
                    <Input type="date" {...register('sfg20_last_reviewed')} />
                  </TextField>
                </div>
              )}
            </div>

            {/* Is Active */}
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                {...register('is_active')}
                id="is_active"
                className="rounded border-border-default text-brand-500 focus:ring-accent/20"
              />
              <label htmlFor="is_active" className="text-label font-medium text-text-secondary">
                Active
              </label>
            </div>

            {/* Error */}
            {createPlan.isError && (
              <div className="bg-status-overdue/10 border border-status-overdue/30 rounded-lg p-3">
                <p className="text-status-overdue text-label">
                  Failed to create plan. Please try again.
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="primary" isDisabled={isSubmitting || createPlan.isPending}>
                {createPlan.isPending ? 'Creating...' : 'Create Plan'}
              </Button>
              <Button type="button" variant="outline" onPress={() => navigate('/dashboard/maintenance')}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
