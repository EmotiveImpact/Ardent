import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button, FieldError, Input, Label, Spinner, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'
import { MapPin } from 'lucide-react'
import { toast } from 'sonner'

import { useCreateProperty } from '@/hooks/use-properties'
import { useClients } from '@/hooks/use-clients'
import { useEngineers } from '@/hooks/use-engineers'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { useAutosaveDraft } from '@/hooks/use-autosave-draft'

const propertySchema = z.object({
  property_code: z.string().optional(),
  name: z.string().min(1, 'Property name is required'),
  address: z.string().min(1, 'Address is required'),
  client_id: z.string().min(1, 'Client is required'),
  region: z.string().optional(),
  takeover_date: z.string().optional(),
  site_type: z.string().optional(),
  operating_hours: z.string().optional(),
  access_notes: z.string().optional(),
  emergency_details: z.string().optional(),
  site_manager_name: z.string().optional(),
  site_manager_phone: z.string().optional(),
  primary_technician_id: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
})

type PropertyFormData = z.infer<typeof propertySchema>

// Module-level rate limiter for Nominatim's 1 req/sec usage policy
let lastGeocodeAt = 0
async function geocodeAddress(address: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  const now = Date.now()
  const wait = Math.max(0, 1000 - (now - lastGeocodeAt))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastGeocodeAt = Date.now()
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  if (!data || data.length === 0) return null
  const hit = data[0]
  return { lat: Number(hit.lat), lon: Number(hit.lon), displayName: hit.display_name }
}

export default function NewPropertyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedClientId = searchParams.get('client_id') || ''
  const { organisation } = useAuth()
  const createProperty = useCreateProperty()
  const { data: clients, isLoading: clientsLoading } = useClients()
  const { data: engineers } = useEngineers()

  const form = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      property_code: '',
      name: '',
      address: '',
      client_id: preselectedClientId,
      region: '',
      takeover_date: '',
      site_type: '',
      operating_hours: '',
      access_notes: '',
      emergency_details: '',
      site_manager_name: '',
      site_manager_phone: '',
      primary_technician_id: '',
      latitude: '',
      longitude: '',
    },
  })
  const { register, handleSubmit, setValue, getValues, control, formState: { errors, isSubmitting } } = form
  const { clearDraft } = useAutosaveDraft(form, { key: 'draft:property:new' })

  const [geocoding, setGeocoding] = useState(false)
  const geocodeBtnRef = useRef<HTMLButtonElement | null>(null)

  const handleGeocode = async () => {
    const address = (getValues('address') || '').trim()
    if (!address) {
      toast.error('Enter an address first')
      return
    }
    setGeocoding(true)
    try {
      const result = await geocodeAddress(address)
      if (!result) {
        toast.error('No matches found for that address')
        return
      }
      setValue('latitude', result.lat.toFixed(6), { shouldDirty: true })
      setValue('longitude', result.lon.toFixed(6), { shouldDirty: true })
      toast.success(`Coordinates set: ${result.displayName.split(',').slice(0, 2).join(',')}`)
    } catch (err) {
      toast.error((err as Error).message || 'Geocoding failed')
    } finally {
      setGeocoding(false)
    }
  }

  const onSubmit = async (data: PropertyFormData) => {
    const latNum = data.latitude && data.latitude.trim() !== '' ? Number(data.latitude) : null
    const lngNum = data.longitude && data.longitude.trim() !== '' ? Number(data.longitude) : null
    await createProperty.mutateAsync({
      ...data,
      property_code: data.property_code || undefined,
      region: data.region || undefined,
      takeover_date: data.takeover_date || undefined,
      site_type: data.site_type || undefined,
      operating_hours: data.operating_hours || undefined,
      access_notes: data.access_notes || undefined,
      emergency_details: data.emergency_details || undefined,
      site_manager_name: data.site_manager_name || undefined,
      site_manager_phone: data.site_manager_phone || undefined,
      primary_technician_id: data.primary_technician_id || undefined,
      latitude: latNum !== null && !Number.isNaN(latNum) ? latNum : null,
      longitude: lngNum !== null && !Number.isNaN(lngNum) ? lngNum : null,
      organisation_id: organisation?.id ?? '',
    })
    clearDraft()
    if (preselectedClientId) {
      navigate(`/dashboard/clients/${preselectedClientId}`)
    } else {
      navigate('/dashboard/properties')
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Properties', path: '/dashboard/properties' },
        { label: 'New Property' },
      ]} />

      {/* Title */}
      <div>
        <PageHeader title="New Property" subtitle="Add a new property or site" />
      </div>

      {/* Form Card */}
      <AppCard padding="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <TextField isRequired isInvalid={!!errors.name}>
          <Label>Property Name</Label>
          <Input
            type="text"
            placeholder="e.g. Main Office Building"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            {...register('name')}
          />
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </TextField>

        <TextField>
          <Label>Property ID</Label>
          <Input
            type="text"
            placeholder="e.g. P-2258"
            autoCorrect="off"
            spellCheck={false}
            {...register('property_code')}
          />
        </TextField>

        <div>
          <Label className="block text-label font-medium text-text-secondary mb-1.5">
            Address <span className="text-status-overdue">*</span>
          </Label>
          <div className="flex gap-2">
            <TextField className="flex-1" isInvalid={!!errors.address}>
              <Input type="text" placeholder="Full property address" {...register('address')} />
            </TextField>
            <Button
              type="button"
              ref={geocodeBtnRef}
              onPress={handleGeocode}
              isDisabled={geocoding}
              variant="secondary"
              aria-label="Geocode address using OpenStreetMap"
            >
              {geocoding ? <Spinner size="sm" /> : <MapPin size={13} />}
              Geocode
            </Button>
          </div>
          {errors.address && (
            <p className="mt-1 text-caption text-status-overdue">{errors.address.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField>
            <Label>Latitude</Label>
            <Input type="text" inputMode="decimal" placeholder="51.5074" {...register('latitude')} />
          </TextField>
          <TextField>
            <Label>Longitude</Label>
            <Input type="text" inputMode="decimal" placeholder="-0.1278" {...register('longitude')} />
          </TextField>
        </div>

        <div>
          <label className="block text-label font-medium text-text-secondary mb-1.5">
            Client <span className="text-status-overdue">*</span>
          </label>
          {clientsLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Spinner size="sm" />
              <span className="text-label text-text-muted">Loading clients...</span>
            </div>
          ) : (
            <FormSelectController
              control={control}
              name="client_id"
              ariaLabel="Client"
              placeholder="Select a client"
              options={(clients ?? []).map((client) => ({ value: client.id, label: client.name }))}
            />
          )}
          {errors.client_id && (
            <p className="mt-1 text-caption text-status-overdue">{errors.client_id.message}</p>
          )}
        </div>

        <TextField>
          <Label>Site Type</Label>
          <Input type="text" placeholder="e.g. Commercial, Residential, Industrial" {...register('site_type')} />
        </TextField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField>
            <Label>Region</Label>
            <Input type="text" placeholder="e.g. Dublin South" {...register('region')} />
          </TextField>
          <TextField>
            <Label>Site Takeover Date</Label>
            <Input type="date" {...register('takeover_date')} />
          </TextField>
        </div>

        <TextField>
          <Label>Operating Hours</Label>
          <Input type="text" placeholder="e.g. Mon-Fri 9am-5pm" {...register('operating_hours')} />
        </TextField>

        <TextField>
          <Label>Access Notes</Label>
          <TextArea rows={3} placeholder="Key codes, parking instructions, security requirements..." {...register('access_notes')} />
        </TextField>

        <TextField>
          <Label>Emergency Details</Label>
          <TextArea rows={2} placeholder="Emergency contact information, shut-off locations..." {...register('emergency_details')} />
        </TextField>

        <div className="border-t border-border-subtle pt-5 space-y-4">
          <label className="block text-label font-semibold text-text-primary">Site Contacts</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField>
              <Label>On-site Access Manager</Label>
              <Input type="text" placeholder="e.g. site facilities lead" autoCapitalize="words" {...register('site_manager_name')} />
            </TextField>
            <TextField>
              <Label>Access Manager Phone</Label>
              <Input type="tel" placeholder="+353 ..." {...register('site_manager_phone')} />
            </TextField>
          </div>
          <div>
            <label className="block text-label font-medium text-text-secondary mb-1.5">Primary Technician</label>
            <FormSelectController
              control={control}
              name="primary_technician_id"
              ariaLabel="Primary Technician"
              placeholder="Select a technician"
              clearable
              options={(engineers ?? []).map((e) => ({ value: e.id, label: e.name }))}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" variant="primary" isDisabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Property'}
          </Button>
          <Link to={preselectedClientId ? `/dashboard/clients/${preselectedClientId}` : '/dashboard/properties'} className="inline-flex items-center border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-4 py-2 text-label font-medium transition-colors">
            Cancel
          </Link>
        </div>

        {createProperty.isError && (
          <p className="text-caption text-status-overdue">
            Failed to create property: {(createProperty.error as Error).message}
          </p>
        )}
      </form>
      </AppCard>
    </div>
  )
}
