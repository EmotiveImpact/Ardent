import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarClock, Repeat, UserCog, PartyPopper } from 'lucide-react'
import { FieldError, Input, Label, TextField } from '@haumea/ui'
import { FormSelectController } from '@haumea/ui'

import { useCreateMaintenancePlan } from '@/hooks/use-maintenance'
import { useEngineers } from '@/hooks/use-engineers'
import { useAssets } from '@/hooks/use-assets'
import { useAuthContext } from '@/contexts/auth-context'
import { useUpdateOnboardingState } from '@/hooks/use-onboarding'
import { StepShell } from '../step-shell'
import { toLocalYmd } from '@/lib/time-tracking/compute'

const FORM_ID = 'onboarding-step-5'

const schema = z.object({
  asset_id: z.string().min(1, 'Asset is required'),
  maintenance_type: z.string().min(1, 'Maintenance type is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  next_due: z.string().min(1, 'Next due date is required'),
  engineer_id: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const MAINTENANCE_TYPES = ['Service', 'Inspection', 'Test', 'Cleaning']

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly', days: 7 },
  { value: 'monthly', label: 'Monthly', days: 30 },
  { value: 'quarterly', label: 'Quarterly', days: 90 },
  { value: 'six_monthly', label: '6-Monthly', days: 180 },
  { value: 'annual', label: 'Annual', days: 365 },
]

function suggestedDueDate(frequencyValue: string): string {
  const f = FREQUENCIES.find((x) => x.value === frequencyValue)
  if (!f) return ''
  const d = new Date()
  d.setDate(d.getDate() + f.days)
  return toLocalYmd(d)
}

interface Props {
  defaultAssetId?: string | null
  onBack: () => void
  onSkipStep: () => void
  onComplete: () => void
}

export function Step5Ppm({ defaultAssetId, onBack, onSkipStep, onComplete }: Props) {
  const { organisation } = useAuthContext()
  const { data: engineers } = useEngineers()
  const { data: assets, isLoading: assetsLoading } = useAssets()
  const createPlan = useCreateMaintenancePlan()
  const update = useUpdateOnboardingState()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      asset_id: defaultAssetId ?? '',
      maintenance_type: 'Service',
      frequency: 'quarterly',
      next_due: suggestedDueDate('quarterly'),
      engineer_id: '',
    },
  })

  const selectedFrequency = watch('frequency')
  const dueDate = watch('next_due')

  // Auto-suggest the next due date when frequency changes (until the user types).
  useEffect(() => {
    setValue('next_due', suggestedDueDate(selectedFrequency))
  }, [selectedFrequency, setValue])

  const selectedAssetName = useMemo(() => {
    const aid = watch('asset_id')
    return assets?.find((a) => a.id === aid)?.name
  }, [assets, watch])

  const onSubmit = async (values: FormValues) => {
    const asset = assets?.find((a) => a.id === values.asset_id)
    const planName = `${values.maintenance_type} — ${asset?.name ?? 'Asset'}`

    await createPlan.mutateAsync({
      organisation_id: organisation?.id ?? '',
      property_id: asset?.property_id ?? '',
      asset_id: values.asset_id,
      name: planName,
      description: `Onboarding-created ${values.maintenance_type.toLowerCase()} plan.`,
      frequency: values.frequency,
      schedule_mode: 'fixed',
      next_due: values.next_due,
      is_active: true,
    })

    await update.mutateAsync({
      completed: true,
      current_step: 6,
      completed_at: new Date().toISOString(),
    })

    onComplete()
  }

  const labelCls =
    'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          <Repeat size={18} />
        </span>
        <div>
          <p className="text-body font-semibold text-text-primary">
            Schedule your first PPM visit
          </p>
          <p className="text-label text-text-secondary mt-0.5">
            Let's set up recurring maintenance so it never falls through the cracks. You can
            tweak everything later.
          </p>
        </div>
      </div>

      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className={labelCls}>
            Asset <span className="text-status-overdue">*</span>
          </label>
          <FormSelectController
            control={control}
            name="asset_id"
            ariaLabel="Asset"
            placeholder={assetsLoading ? 'Loading…' : 'Choose an asset'}
            disabled={assetsLoading}
            options={(assets ?? []).map((a) => ({ value: a.id, label: a.name }))}
          />
          {errors.asset_id && (
            <p className="mt-1 text-caption text-status-overdue">{errors.asset_id.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              Maintenance type <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="maintenance_type"
              ariaLabel="Maintenance type"
              options={MAINTENANCE_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div>
            <label className={labelCls}>
              Frequency <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="frequency"
              ariaLabel="Frequency"
              options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField isRequired isInvalid={!!errors.next_due}>
            <Label>Next due date</Label>
            <Input type="date" {...register('next_due')} />
            {errors.next_due && <FieldError>{errors.next_due.message}</FieldError>}
          </TextField>
          <div>
            <label className={labelCls}>Assigned engineer</label>
            <FormSelectController
              control={control}
              name="engineer_id"
              ariaLabel="Assigned engineer"
              placeholder="Unassigned"
              clearable
              options={(engineers ?? []).map((e) => ({ value: e.id, label: e.name }))}
            />
          </div>
        </div>
      </form>

      <StepShell
        formId={FORM_ID}
        onBack={onBack}
        onSkipStep={onSkipStep}
        isSubmitting={isSubmitting || createPlan.isPending}
        submitLabel="Create plan and finish"
      >
        <></>
      </StepShell>

      {/* Selected summary for screen-readers / clarity */}
      {selectedAssetName && dueDate && (
        <p className="sr-only" aria-live="polite">
          Plan will be created for {selectedAssetName} on {dueDate}.
        </p>
      )}
    </>
  )
}

export function Step5Preview() {
  return (
    <div className="space-y-4">
      <p className="text-micro uppercase tracking-[0.18em] text-text-muted font-medium">
        You're nearly done
      </p>
      <div className="rounded-xl bg-surface-card border border-border-default p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
            <PartyPopper size={16} />
          </span>
          <div>
            <p className="text-label font-semibold text-text-primary">
              Your workspace is ready
            </p>
            <p className="text-[11.5px] text-text-muted">
              We'll generate jobs from this plan automatically.
            </p>
          </div>
        </div>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <CalendarClock size={13} className="text-text-muted" /> Next due date suggested
            from frequency
          </li>
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <Repeat size={13} className="text-text-muted" /> Recurs in your scheduler
          </li>
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <UserCog size={13} className="text-text-muted" /> Assignable to engineers later
          </li>
        </ul>
      </div>
    </div>
  )
}
