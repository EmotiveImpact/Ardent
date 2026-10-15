import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Boxes, Wrench, MapPin } from 'lucide-react'
import { FieldError, Input, Label, TextField } from '@haumea/ui'
import { FormSelectController } from '@haumea/ui'

import { useCreateAsset } from '@/hooks/use-assets'
import { useProperties } from '@/hooks/use-properties'
import { useAuthContext } from '@/contexts/auth-context'
import { useUpdateOnboardingState } from '@/hooks/use-onboarding'
import { StepShell } from '../step-shell'

const FORM_ID = 'onboarding-step-4'

const schema = z.object({
  name: z.string().min(1, 'Asset name is required'),
  category: z.string().min(1, 'Category is required'),
  property_id: z.string().min(1, 'Property is required'),
  install_date: z.string().optional(),
  model: z.string().optional(),
  location_in_property: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const ASSET_TYPES = [
  'Boiler',
  'Air Conditioning Unit',
  'Lift / Elevator',
  'Fire Alarm Panel',
  'Emergency Lighting',
  'Electrical Distribution Board',
  'Water Heater',
  'Fire Extinguisher',
  'Generator',
  'Kitchen Equipment',
  'Refrigeration',
  'Security System',
  'Other',
]

interface Props {
  defaultPropertyId?: string | null
  onAdvance: (assetId: string) => void
  onBack: () => void
  onSkipStep: () => void
}

export function Step4Asset({ defaultPropertyId, onAdvance, onBack, onSkipStep }: Props) {
  const { organisation } = useAuthContext()
  const { data: properties, isLoading: propertiesLoading } = useProperties()
  const createAsset = useCreateAsset()
  const update = useUpdateOnboardingState()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      category: '',
      property_id: defaultPropertyId ?? '',
      install_date: '',
      model: '',
      location_in_property: '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    const created = await createAsset.mutateAsync({
      organisation_id: organisation?.id ?? '',
      property_id: values.property_id,
      name: values.name,
      category: values.category,
      model: values.model || undefined,
      install_date: values.install_date || undefined,
      // We pack location-in-property into notes since `notes` is the existing
      // free-text column on assets and `location` is captured via areas.
      ...(values.location_in_property
        ? { notes: `Location: ${values.location_in_property}` }
        : {}),
      status: 'active',
    })
    await update.mutateAsync({ current_step: 5 })
    onAdvance(created.id)
  }

  const labelCls =
    'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          <Boxes size={18} />
        </span>
        <div>
          <p className="text-body font-semibold text-text-primary">Register your first asset</p>
          <p className="text-label text-text-secondary mt-0.5">
            Assets are the things you maintain — boilers, fire panels, lifts, anything inspected
            or serviced.
          </p>
        </div>
      </div>

      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField isRequired isInvalid={!!errors.name}>
          <Label>Asset name</Label>
          <Input type="text" placeholder="e.g. Boiler — Plant Room" {...register('name')} />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </TextField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              Asset type <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="category"
              ariaLabel="Asset type"
              placeholder="Choose…"
              options={ASSET_TYPES.map((t) => ({ value: t, label: t }))}
            />
            {errors.category && (
              <p className="mt-1 text-caption text-status-overdue">{errors.category.message}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>
              Property <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="property_id"
              ariaLabel="Property"
              placeholder={propertiesLoading ? 'Loading…' : 'Choose a property'}
              disabled={propertiesLoading}
              options={(properties ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
            {errors.property_id && (
              <p className="mt-1 text-caption text-status-overdue">{errors.property_id.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField>
            <Label>Install date</Label>
            <Input type="date" {...register('install_date')} />
          </TextField>
          <TextField>
            <Label>Model number</Label>
            <Input type="text" placeholder="e.g. Greenstar 60" {...register('model')} />
          </TextField>
        </div>

        <TextField>
          <Label>Location in property</Label>
          <Input type="text" placeholder="e.g. Plant room, ground floor" {...register('location_in_property')} />
        </TextField>
      </form>

      <StepShell
        formId={FORM_ID}
        onBack={onBack}
        onSkipStep={onSkipStep}
        isSubmitting={isSubmitting || createAsset.isPending}
        submitLabel="Save asset and continue"
      >
        <></>
      </StepShell>
    </>
  )
}

export function Step4Preview() {
  return (
    <div className="space-y-4">
      <p className="text-micro uppercase tracking-[0.18em] text-text-muted font-medium">
        Live preview
      </p>
      <div className="rounded-xl bg-surface-card border border-border-default p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
            <Wrench size={16} />
          </span>
          <div>
            <p className="text-label font-semibold text-text-primary">Your first asset</p>
            <p className="text-[11.5px] text-text-muted">
              Tracked through service history, compliance, and PPM.
            </p>
          </div>
        </div>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <Boxes size={13} className="text-text-muted" /> Type-tagged for reporting
          </li>
          <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <MapPin size={13} className="text-text-muted" /> Located in your first property
          </li>
        </ul>
      </div>
      <p className="text-[11.5px] text-text-muted">
        Next step: schedule recurring maintenance for this asset.
      </p>
    </div>
  )
}
