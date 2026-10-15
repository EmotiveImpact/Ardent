import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MapPin, Building, Ruler } from 'lucide-react'
import { Button, FieldError, Input, Label, TextField } from '@haumea/ui'
import { FormSelectController } from '@haumea/ui'
import { toast } from 'sonner'

import { useCreateProperty } from '@/hooks/use-properties'
import { useClients } from '@/hooks/use-clients'
import { useAuthContext } from '@/contexts/auth-context'
import { useUpdateOnboardingState } from '@/hooks/use-onboarding'
import { StepShell } from '../step-shell'

const FORM_ID = 'onboarding-step-3'

const schema = z.object({
  name: z.string().min(1, 'Property name is required'),
  address: z.string().min(1, 'Address is required'),
  client_id: z.string().min(1, 'Client is required'),
  site_type: z.string().optional(),
  square_footage: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const SITE_TYPES = [
  'Commercial Office',
  'Retail Unit',
  'Hospitality',
  'Education',
  'Healthcare',
  'Industrial / Warehouse',
  'Residential',
  'Mixed-Use',
  'Other',
]

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

interface Props {
  defaultClientId?: string | null
  onAdvance: (propertyId: string) => void
  onBack: () => void
  onSkipStep: () => void
}

export function Step3Property({ defaultClientId, onAdvance, onBack, onSkipStep }: Props) {
  const { organisation } = useAuthContext()
  const { data: clients, isLoading: clientsLoading } = useClients()
  const createProperty = useCreateProperty()
  const update = useUpdateOnboardingState()
  const [geocoding, setGeocoding] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      address: '',
      client_id: defaultClientId ?? '',
      site_type: '',
      square_footage: '',
    },
  })

  const handleGeocode = async () => {
    const address = getValues('address').trim()
    if (!address) {
      toast.error('Enter an address first')
      return
    }
    setGeocoding(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error('Geocoding service unavailable')
      const results: NominatimResult[] = await res.json()
      if (!results.length) {
        toast.error('No match — try a more specific address')
        return
      }
      const lat = parseFloat(results[0].lat)
      const lon = parseFloat(results[0].lon)
      setCoords({ lat, lon })
      // If user typed a partial, replace with the canonical form
      setValue('address', results[0].display_name)
      toast.success('Address located on map')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Geocoding failed'
      toast.error(message)
    } finally {
      setGeocoding(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    const sqft = values.square_footage?.trim()
    const accessNotes = sqft ? `Approx. ${sqft} sq ft` : undefined

    const created = await createProperty.mutateAsync({
      organisation_id: organisation?.id ?? '',
      client_id: values.client_id,
      name: values.name,
      address: values.address,
      site_type: values.site_type || undefined,
      access_notes: accessNotes,
      // latitude/longitude live on the DB row (added in 00001) — pass through
      // even though Property TS type doesn't currently expose them.
      ...(coords ? { latitude: coords.lat, longitude: coords.lon } : {}),
    } as Parameters<typeof createProperty.mutateAsync>[0])

    await update.mutateAsync({ current_step: 4 })
    onAdvance(created.id)
  }

  const labelCls =
    'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

  return (
    <>
      <div className="mb-6 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          <Building size={18} />
        </span>
        <div>
          <p className="text-body font-semibold text-text-primary">Add your first property</p>
          <p className="text-label text-text-secondary mt-0.5">
            Properties are the buildings or sites you maintain. We'll geocode the address so it
            appears on your portfolio map.
          </p>
        </div>
      </div>

      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField isRequired isInvalid={!!errors.name}>
          <Label>Property name</Label>
          <Input type="text" placeholder="e.g. Tower A — Head Office" {...register('name')} />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </TextField>

        <div>
          <label className={labelCls}>
            Address <span className="text-status-overdue">*</span>
          </label>
          <div className="flex gap-2">
            <TextField className="flex-1" isInvalid={!!errors.address}>
              <Input type="text" placeholder="12 King Street, London EC2V 8AS" {...register('address')} />
            </TextField>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={handleGeocode}
              isDisabled={geocoding}
              className="shrink-0"
            >
              {!geocoding && <MapPin size={14} />}
              {geocoding ? 'Locating…' : 'Geocode'}
            </Button>
          </div>
          {errors.address && (
            <p className="mt-1 text-caption text-status-overdue">{errors.address.message}</p>
          )}
          {coords && (
            <p className="mt-1 text-[11.5px] text-status-compliant">
              Located at {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls}>
            Client <span className="text-status-overdue">*</span>
          </label>
          <FormSelectController
            control={control}
            name="client_id"
            ariaLabel="Client"
            placeholder={clientsLoading ? 'Loading…' : 'Choose a client'}
            disabled={clientsLoading}
            options={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
          {errors.client_id && (
            <p className="mt-1 text-caption text-status-overdue">{errors.client_id.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Property type</label>
            <FormSelectController
              control={control}
              name="site_type"
              ariaLabel="Property type"
              placeholder="Choose…"
              options={SITE_TYPES.map((s) => ({ value: s, label: s }))}
            />
          </div>

          <TextField>
            <Label>Square footage (optional)</Label>
            <Input type="text" inputMode="numeric" placeholder="e.g. 12500" {...register('square_footage')} />
          </TextField>
        </div>
      </form>

      <StepShell
        formId={FORM_ID}
        onBack={onBack}
        onSkipStep={onSkipStep}
        isSubmitting={isSubmitting || createProperty.isPending}
        submitLabel="Save property and continue"
      >
        <></>
      </StepShell>
    </>
  )
}

export function Step3Preview() {
  return (
    <div className="space-y-4">
      <p className="text-micro uppercase tracking-[0.18em] text-text-muted font-medium">
        Live preview
      </p>
      <div className="rounded-xl bg-surface-card border border-border-default overflow-hidden">
        <div className="aspect-[16/10] bg-gradient-to-br from-brand-500/10 via-surface-elevated to-surface-card relative">
          <div className="absolute inset-0 grid place-items-center">
            <MapPin size={32} className="text-brand-500" />
          </div>
          <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-surface-card/80 backdrop-blur text-[10.5px] text-text-muted font-medium">
            Map preview
          </div>
        </div>
        <div className="p-4">
          <p className="text-label font-semibold text-text-primary">Your first property</p>
          <p className="text-[11.5px] text-text-muted mt-0.5">
            Geocoded location appears here once you enter an address.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
          <Building size={13} className="text-text-muted" /> Linked to your first client
        </li>
        <li className="flex items-center gap-2 text-[12.5px] text-text-secondary">
          <Ruler size={13} className="text-text-muted" /> Capture site footprint for reports
        </li>
      </ul>
    </div>
  )
}
