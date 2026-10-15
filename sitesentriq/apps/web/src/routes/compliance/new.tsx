import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextField } from '@haumea/ui'
import { FormSelectController, PageHeader, Text } from '@haumea/ui'
import { useCreateComplianceItem } from '@/hooks/use-compliance'
import { useProperties } from '@/hooks/use-properties'
import { useAssets } from '@/hooks/use-assets'
import { useAuth } from '@/hooks/use-auth'
import { COMPLIANCE_TYPES, COMPLIANCE_TYPE_LABELS, COMPLIANCE_STATUSES, FREQUENCIES } from '@/lib/constants'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SuggesterCard } from '@/lib/ai/suggester-card'
import type { ComplianceSuggestion } from '@/lib/ai/client'
import { FormSkeleton } from '@/components/shared/skeletons'
import { toLocalYmd } from '@/lib/time-tracking/compute'

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  six_monthly: '6-Monthly',
  annual: 'Annual',
}

const statusLabels: Record<string, string> = {
  compliant: 'Compliant',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  non_compliant: 'Non-Compliant',
}

const complianceItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  compliance_type: z.string().min(1, 'Compliance type is required'),
  property_id: z.string().min(1, 'Property is required'),
  asset_id: z.string().optional(),
  frequency: z.string().min(1, 'Frequency is required'),
  status: z.string().min(1, 'Status is required'),
  last_completed: z.string().optional(),
  next_due: z.string().optional(),
  notes: z.string().optional(),
})

type ComplianceItemForm = z.infer<typeof complianceItemSchema>

export default function NewComplianceItemPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const createItem = useCreateComplianceItem()
  const { data: properties, isLoading: propertiesLoading } = useProperties()
  const [acceptedSuggestion, setAcceptedSuggestion] = useState<ComplianceSuggestion | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ComplianceItemForm>({
    resolver: zodResolver(complianceItemSchema),
    defaultValues: {
      status: 'compliant',
    },
  })

  const selectedPropertyId = watch('property_id')
  const selectedAssetId = watch('asset_id')
  const watchedName = watch('name')
  const { data: assets } = useAssets(selectedPropertyId || undefined)

  // Assets are property-scoped, so clear a left-over asset_id when the property
  // changes — otherwise an asset from property A is submitted against property B
  // (asset_id is an independent FK with no cross-table CHECK). Mirrors assets/new.tsx.
  const prevPropertyRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevPropertyRef.current
    prevPropertyRef.current = selectedPropertyId
    if (prev && prev !== selectedPropertyId) {
      setValue('asset_id', '')
    }
  }, [selectedPropertyId, setValue])

  const selectedAsset = assets?.find((a) => a.id === selectedAssetId)
  const selectedProperty = properties?.find((p) => p.id === selectedPropertyId)
  // Mount the suggester only once we have a real asset selected OR
  // the user has typed at least three characters into Name. We use
  // the seed values as the React `key` so a new asset triggers a
  // fresh suggestion instead of reusing the cached one.
  const suggesterKey =
    selectedAsset?.id ?? (watchedName && watchedName.length >= 3 ? `name:${watchedName.slice(0, 60)}` : null)

  const handleAcceptSuggestion = (suggestion: ComplianceSuggestion) => {
    setValue('compliance_type', suggestion.suggestion, { shouldValidate: true })
    setValue('frequency', suggestion.suggested_frequency, { shouldValidate: true })
    if (suggestion.next_due_offset_days > 0) {
      const due = new Date()
      due.setDate(due.getDate() + suggestion.next_due_offset_days)
      setValue('next_due', toLocalYmd(due), { shouldValidate: true })
    }
    setAcceptedSuggestion(suggestion)
  }

  const onSubmit = async (values: ComplianceItemForm) => {
    const metadata = acceptedSuggestion
      ? {
          is_ai_suggested: true,
          ai_audit_log_id: acceptedSuggestion.audit_log_id,
          ai_confidence: acceptedSuggestion.confidence,
          ai_reasoning: acceptedSuggestion.reasoning,
        }
      : undefined

    await createItem.mutateAsync({
      name: values.name,
      compliance_type: values.compliance_type,
      property_id: values.property_id,
      asset_id: values.asset_id || undefined,
      frequency: values.frequency,
      status: values.status,
      last_completed: values.last_completed || undefined,
      next_due: values.next_due || undefined,
      organisation_id: profile?.organisation_id,
      ...(metadata ? { metadata } : {}),
    } as Parameters<typeof createItem.mutateAsync>[0])
    navigate('/dashboard/compliance')
  }

  if (propertiesLoading) {
    return <FormSkeleton fields={6} />
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Compliance', path: '/dashboard/compliance' },
        { label: 'New Item' },
      ]} />

      <div className="space-y-3">
        <PageHeader title="New Compliance Item" />
        <p className="text-label text-text-muted">Record a compliance obligation for tracking and audit readiness</p>
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Name */}
            <TextField isRequired isInvalid={!!errors.name}>
              <Label>Name</Label>
              <Input type="text" placeholder="e.g. Ground Floor Fire Extinguisher Check" {...register('name')} />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </TextField>

            {/* AI Suggester — only mounts once we have enough signal */}
            {suggesterKey && (
              <SuggesterCard
                key={suggesterKey}
                assetName={selectedAsset?.name ?? watchedName ?? null}
                assetType={(selectedAsset as { category?: string | null } | undefined)?.category ?? null}
                propertyType={(selectedProperty as { site_type?: string | null } | undefined)?.site_type ?? null}
                currentText={watchedName ?? null}
                onAccept={handleAcceptSuggestion}
              />
            )}

            {/* Compliance Type */}
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Compliance Type <span className="text-status-overdue">*</span>
              </label>
              <FormSelectController
                control={control}
                name="compliance_type"
                ariaLabel="Compliance Type"
                placeholder="Select type..."
                options={Object.values(COMPLIANCE_TYPES).map((t) => ({ value: t, label: COMPLIANCE_TYPE_LABELS[t] || t }))}
              />
              {errors.compliance_type && (
                <p className="text-status-overdue text-micro mt-1">{errors.compliance_type.message}</p>
              )}
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
                <Text scale="micro" tone="muted" className="mt-1">Select a property first to see assets</Text>
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

            {/* Status */}
            <div>
              <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Status <span className="text-status-overdue">*</span>
              </label>
              <FormSelectController
                control={control}
                name="status"
                ariaLabel="Status"
                options={Object.values(COMPLIANCE_STATUSES).map((s) => ({ value: s, label: statusLabels[s] || s }))}
              />
              {errors.status && (
                <p className="text-status-overdue text-micro mt-1">{errors.status.message}</p>
              )}
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField>
                <Label>Last Completed</Label>
                <Input type="date" {...register('last_completed')} />
              </TextField>
              <TextField>
                <Label>Next Due</Label>
                <Input type="date" {...register('next_due')} />
              </TextField>
            </div>

            {/* Error */}
            {createItem.isError && (
              <div className="bg-status-overdue/10 border border-status-overdue/40 rounded-lg p-3">
                <p className="text-status-overdue text-label">
                  Failed to create compliance item. Please try again.
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="primary" isDisabled={isSubmitting || createItem.isPending}>
                {createItem.isPending ? 'Creating...' : 'Create Item'}
              </Button>
              <Button type="button" variant="outline" onPress={() => navigate('/dashboard/compliance')}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
