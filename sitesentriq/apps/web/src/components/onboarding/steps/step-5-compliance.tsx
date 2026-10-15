import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldCheck, FileCheck2, Gauge, CalendarClock } from 'lucide-react'
import { Input, Label, TextField } from '@haumea/ui'
import { FormSelectController } from '@haumea/ui'

import { useCreateComplianceItem } from '@/hooks/use-compliance'
import { useUploadDocument } from '@/hooks/use-documents'
import { useAssets } from '@/hooks/use-assets'
import { useAuthContext } from '@/contexts/auth-context'
import { useUpdateOnboardingState } from '@/hooks/use-onboarding'
import { FileUpload } from '@/components/shared/file-upload'
import {
  COMPLIANCE_TYPES,
  COMPLIANCE_TYPE_LABELS,
  FREQUENCIES,
} from '@/lib/constants'
import { StepShell } from '../step-shell'
import { addDaysIso, toLocalYmd } from '@/lib/time-tracking/compute'

const FORM_ID = 'onboarding-step-5'

const schema = z.object({
  asset_id: z.string().min(1, 'Asset is required'),
  compliance_type: z.string().min(1, 'Compliance type is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  last_completed: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  six_monthly: '6-Monthly',
  annual: 'Annual',
}

const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  six_monthly: 180,
  annual: 365,
}

/**
 * Best-effort mapping from an asset category to a sensible
 * default compliance type. Pure heuristic — the user can always
 * override before submitting.
 */
function suggestComplianceType(category?: string | null): string {
  if (!category) return COMPLIANCE_TYPES.OTHER
  const c = category.toLowerCase()
  if (c.includes('boiler') || c.includes('gas') || c.includes('water heater')) {
    return COMPLIANCE_TYPES.GAS_SAFETY
  }
  if (c.includes('fire alarm') || c.includes('alarm')) return COMPLIANCE_TYPES.ALARMS
  if (c.includes('fire extinguisher')) return COMPLIANCE_TYPES.FIRE_EXTINGUISHERS
  if (c.includes('emergency lighting')) return COMPLIANCE_TYPES.EMERGENCY_LIGHTING
  if (c.includes('electrical') || c.includes('distribution')) return COMPLIANCE_TYPES.ELECTRICAL
  if (c.includes('lift') || c.includes('elevator')) return COMPLIANCE_TYPES.OTHER
  if (c.includes('air conditioning') || c.includes('hvac') || c.includes('refrigeration')) {
    return COMPLIANCE_TYPES.HVAC
  }
  if (c.includes('legionella') || c.includes('water hygiene')) return COMPLIANCE_TYPES.LEGIONELLA
  return COMPLIANCE_TYPES.OTHER
}

function todayIso(): string {
  return toLocalYmd(new Date())
}

interface Props {
  defaultAssetId?: string | null
  onAdvance: () => void
  onBack: () => void
  onSkipStep: () => void
}

export function Step5Compliance({ defaultAssetId, onAdvance, onBack, onSkipStep }: Props) {
  const { organisation, user } = useAuthContext()
  const { data: assets, isLoading: assetsLoading } = useAssets()
  const createItem = useCreateComplianceItem()
  const uploadDoc = useUploadDocument()
  const update = useUpdateOnboardingState()

  const [proofFile, setProofFile] = useState<File | null>(null)

  const initialAsset = useMemo(
    () => assets?.find((a) => a.id === defaultAssetId) ?? null,
    [assets, defaultAssetId],
  )

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
      compliance_type: suggestComplianceType(initialAsset?.category),
      frequency: 'annual',
      last_completed: todayIso(),
    },
  })

  const watchedAssetId = watch('asset_id')

  // When the asset changes (because of late-arriving data or user
  // reselects), re-suggest the compliance type — only if the user
  // hasn't already chosen one for this asset.
  useEffect(() => {
    const a = assets?.find((x) => x.id === watchedAssetId)
    if (a) {
      setValue('compliance_type', suggestComplianceType(a.category), {
        shouldValidate: false,
        shouldDirty: false,
      })
    }
    // Only re-run when the picked asset id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedAssetId])

  const onSubmit = async (values: FormValues) => {
    const asset = assets?.find((a) => a.id === values.asset_id)
    if (!asset || !organisation?.id) return

    const typeLabel =
      COMPLIANCE_TYPE_LABELS[values.compliance_type] || values.compliance_type
    const itemName = `${typeLabel} — ${asset.name}`

    const lastCompletedIso = values.last_completed || todayIso()
    const nextDueIso = addDaysIso(lastCompletedIso, FREQUENCY_DAYS[values.frequency] ?? 365)

    const created = await createItem.mutateAsync({
      organisation_id: organisation.id,
      property_id: asset.property_id,
      asset_id: asset.id,
      name: itemName,
      compliance_type: values.compliance_type,
      frequency: values.frequency,
      status: 'compliant',
      last_completed: lastCompletedIso,
      next_due: nextDueIso,
    })

    // Optional proof upload — failure here must not block the wizard.
    if (proofFile) {
      try {
        await uploadDoc.mutateAsync({
          name: proofFile.name,
          file: proofFile,
          organisation_id: organisation.id,
          property_id: asset.property_id,
          asset_id: asset.id,
          compliance_item_id: created.id,
          document_type: 'Certificate',
          uploaded_by: user?.id,
        })
      } catch {
        // Toast already raised by the hook; keep the wizard moving.
      }
    }

    await update.mutateAsync({ current_step: 6 })
    onAdvance()
  }

  const labelCls =
    'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          <ShieldCheck size={18} />
        </span>
        <div>
          <p className="text-body font-semibold text-text-primary">
            Add your first compliance item
          </p>
          <p className="text-label text-text-secondary mt-0.5">
            Compliance items drive your Compliance Score — the live read-out of how
            audit-ready your sites are. We've pre-filled this one from the asset you just added.
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
              Compliance type <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="compliance_type"
              ariaLabel="Compliance type"
              options={Object.values(COMPLIANCE_TYPES).map((t) => ({
                value: t,
                label: COMPLIANCE_TYPE_LABELS[t] || t,
              }))}
            />
            {errors.compliance_type && (
              <p className="mt-1 text-caption text-status-overdue">
                {errors.compliance_type.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>
              Frequency <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="frequency"
              ariaLabel="Frequency"
              options={Object.values(FREQUENCIES).map((f) => ({
                value: f,
                label: FREQUENCY_LABELS[f] || f,
              }))}
            />
            {errors.frequency && (
              <p className="mt-1 text-caption text-status-overdue">{errors.frequency.message}</p>
            )}
          </div>
        </div>

        <TextField>
          <Label>Last completed (optional — defaults to today)</Label>
          <Input type="date" {...register('last_completed')} />
        </TextField>

        <div>
          <p className={labelCls}>Proof of compliance (optional)</p>
          <FileUpload
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
            onChange={setProofFile}
            value={proofFile}
            description="Drop a certificate or inspection report — you can always add this later."
          />
        </div>
      </form>

      <StepShell
        formId={FORM_ID}
        onBack={onBack}
        onSkipStep={onSkipStep}
        isSubmitting={isSubmitting || createItem.isPending || uploadDoc.isPending}
        submitLabel="Save compliance item and continue"
      >
        <></>
      </StepShell>
    </>
  )
}

export function Step5CompliancePreview() {
  return (
    <div className="space-y-4">
      <p className="text-micro uppercase tracking-[0.18em] text-text-muted font-medium">
        Why this matters
      </p>
      <div className="rounded-xl bg-surface-card border border-border-default p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
            <Gauge size={16} />
          </span>
          <div>
            <p className="text-label font-semibold text-text-primary">
              Your Compliance Score starts here
            </p>
            <p className="text-[11.5px] text-text-muted">
              We need at least one item to give you a real score on day 1.
            </p>
          </div>
        </div>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <ShieldCheck size={13} className="text-text-muted" /> Tracked against the right
            frequency
          </li>
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <CalendarClock size={13} className="text-text-muted" /> Next due date auto-calculated
          </li>
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <FileCheck2 size={13} className="text-text-muted" /> Proof file attached as a
            certificate
          </li>
        </ul>
      </div>
      <p className="text-[11.5px] text-text-muted">
        Next step: schedule recurring PPM so this never lapses.
      </p>
    </div>
  )
}
