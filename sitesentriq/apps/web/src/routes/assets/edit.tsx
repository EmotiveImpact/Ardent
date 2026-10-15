// Wave A1 — Edit Asset page. Mirrors the assets/new.tsx form so the
// fields and validation stay in lock-step. Pre-fills from useAsset(id)
// and persists via useUpdateAsset.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, Spinner, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'
import { useAsset, useUpdateAsset } from '@/hooks/use-assets'
import { useProperties } from '@/hooks/use-properties'
import { supabase } from '@/lib/supabase'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import type { Area } from '@haumea/types'

const CATEGORIES = [
  'Fire Safety',
  'HVAC',
  'Electrical',
  'Plumbing',
  'Lifts',
  'Security',
  'Other',
]

const assetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1, 'Category is required'),
  property_id: z.string().min(1, 'Property is required'),
  area_id: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  install_date: z.string().optional(),
  status: z.string().min(1, 'Status is required'),
  notes: z.string().optional(),
})

type AssetFormData = z.infer<typeof assetSchema>

const labelClass = 'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

export default function EditAssetPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: asset, isLoading } = useAsset(id ?? '')
  const updateAsset = useUpdateAsset()
  const { data: properties, isLoading: propertiesLoading } = useProperties()
  const [areas, setAreas] = useState<Area[]>([])
  const [areasLoading, setAreasLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: '',
      category: '',
      property_id: '',
      area_id: '',
      make: '',
      model: '',
      serial_number: '',
      install_date: '',
      status: 'active',
      notes: '',
    },
  })

  const selectedPropertyId = watch('property_id')

  // Hydrate form once the asset has loaded — keyed on id so a background
  // refetch can't reset() over the user's in-progress edits.
  const hydratedId = useRef<string | null>(null)
  useEffect(() => {
    if (!asset) return
    if (hydratedId.current === asset.id) return
    hydratedId.current = asset.id
    reset({
      name: asset.name ?? '',
      category: asset.category ?? '',
      property_id: asset.property_id ?? '',
      area_id: asset.area_id ?? '',
      make: asset.make ?? '',
      model: asset.model ?? '',
      serial_number: asset.serial_number ?? '',
      install_date: asset.install_date ?? '',
      status: asset.status ?? 'active',
      notes: asset.notes ?? '',
    })
  }, [asset, reset])

  // Track the property the area list was last loaded for, so we can tell a
  // genuine user-driven property switch from the initial hydration reset.
  const prevPropertyRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const prev = prevPropertyRef.current
    prevPropertyRef.current = selectedPropertyId
    // On a real property change (prev is a non-empty different id, i.e. NOT the
    // first hydration), clear the stale area_id — otherwise the asset is saved
    // linked to an area belonging to the OLD property. If the new property has
    // no areas the dropdown is disabled and can't clear it via onChange, so the
    // stale value would be hidden yet still persisted (silent cross-property FK).
    if (prev && prev !== selectedPropertyId) {
      setValue('area_id', '')
    }
    if (!selectedPropertyId) {
      setAreas([])
      return
    }
    setAreasLoading(true)
    supabase
      .from('areas')
      .select('*')
      .eq('property_id', selectedPropertyId)
      .order('name')
      // Two-arg then (the PostgREST builder is a thenable without .catch): the
      // 2nd handler covers a rejected query, which otherwise left
      // areasLoading=true forever → the Area dropdown spun with no feedback.
      .then(
        ({ data }) => {
          setAreas(data || [])
          setAreasLoading(false)
        },
        () => {
          setAreas([])
          setAreasLoading(false)
        },
      )
  }, [selectedPropertyId, setValue])

  const onSubmit = async (formData: AssetFormData) => {
    if (!id) return
    const payload: Record<string, unknown> = { ...formData, id }
    // Normalise empty optional strings → null so DB clears them.
    payload.area_id = formData.area_id || null
    payload.make = formData.make || null
    payload.model = formData.model || null
    payload.serial_number = formData.serial_number || null
    payload.install_date = formData.install_date || null
    payload.notes = formData.notes || null

    await updateAsset.mutateAsync(payload as Parameters<typeof updateAsset.mutateAsync>[0])
    navigate(`/dashboard/assets/${id}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!asset) {
    return (
      <div className="space-y-4">
        <p className="text-label text-text-muted">Asset not found.</p>
        <Link to="/dashboard/assets" className="text-label text-brand-600 underline">Back to assets</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Assets', path: '/dashboard/assets' },
        { label: asset.name, path: `/dashboard/assets/${id}` },
        { label: 'Edit' },
      ]} />

      <PageHeader title="Edit Asset" />

      <AppCard padding="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <TextField isRequired isInvalid={!!errors.name}>
            <Label>Name</Label>
            <Input
              type="text"
              placeholder="e.g. Fire Alarm Panel - Ground Floor"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              {...register('name')}
            />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </TextField>

          <div>
            <label className={labelClass}>
              Category <span className="text-status-overdue">*</span>
            </label>
            <FormSelectController
              control={control}
              name="category"
              ariaLabel="Category"
              placeholder="Select category"
              options={CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
            />
            {errors.category && (
              <p className="text-status-overdue text-micro mt-1">{errors.category.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>
              Property <span className="text-status-overdue">*</span>
            </label>
            {propertiesLoading ? (
              <Spinner size="sm" />
            ) : (
              <FormSelectController
                control={control}
                name="property_id"
                ariaLabel="Property"
                placeholder="Select property"
                options={(properties ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
            {errors.property_id && (
              <p className="text-status-overdue text-micro mt-1">{errors.property_id.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Area</label>
            {areasLoading ? (
              <Spinner size="sm" />
            ) : (
              <FormSelectController
                control={control}
                name="area_id"
                ariaLabel="Area"
                disabled={!selectedPropertyId || areas.length === 0}
                placeholder={
                  !selectedPropertyId
                    ? 'Select a property first'
                    : areas.length === 0
                      ? 'No areas for this property'
                      : 'Select area (optional)'
                }
                options={areas.map((a) => ({ value: a.id, label: `${a.name}${a.floor ? ` (${a.floor})` : ''}` }))}
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField>
              <Label>Make</Label>
              <Input type="text" placeholder="e.g. Honeywell" {...register('make')} />
            </TextField>
            <TextField>
              <Label>Model</Label>
              <Input type="text" placeholder="e.g. XLS3000" {...register('model')} />
            </TextField>
          </div>

          <TextField>
            <Label>Serial Number</Label>
            <Input type="text" placeholder="e.g. SN-2024-00123" {...register('serial_number')} />
          </TextField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField>
              <Label>Install Date</Label>
              <Input type="date" {...register('install_date')} />
            </TextField>
            <div>
              <label className={labelClass}>Status</label>
              <FormSelectController
                control={control}
                name="status"
                ariaLabel="Status"
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'decommissioned', label: 'Decommissioned' },
                ]}
              />
            </div>
          </div>

          <TextField>
            <Label>Notes</Label>
            <TextArea rows={3} placeholder="Additional notes about this asset..." {...register('notes')} />
          </TextField>

          {updateAsset.isError && (
            <p className="text-status-overdue text-label">
              Failed to update asset: {(updateAsset.error as Error).message}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              isDisabled={isSubmitting || updateAsset.isPending}
            >
              {updateAsset.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to={`/dashboard/assets/${id}`}>
                Cancel
              </Link>
            </Button>
          </div>
        </form>
      </AppCard>
    </div>
  )
}
