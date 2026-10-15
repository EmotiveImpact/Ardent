import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, Spinner, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'
import { useCreateAsset } from '@/hooks/use-assets'
import { useProperties } from '@/hooks/use-properties'
import { useOrganisation } from '@/hooks/use-organisation'
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

export default function NewAssetPage() {
  const navigate = useNavigate()
  const createAsset = useCreateAsset()
  const { data: properties, isLoading: propertiesLoading } = useProperties()
  const { organisation } = useOrganisation()
  const [areas, setAreas] = useState<Area[]>([])
  const [areasLoading, setAreasLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      status: 'active',
    },
  })

  const selectedPropertyId = watch('property_id')
  const prevPropertyRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const prev = prevPropertyRef.current
    prevPropertyRef.current = selectedPropertyId
    // Clear any area selected under the previously-chosen property — areas are
    // property-scoped, so a left-over area_id from property A must not be saved
    // against property B (the dropdown can even be disabled if B has no areas,
    // hiding the stale value while still submitting it).
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
    const payload: Record<string, unknown> = {
      ...formData,
      organisation_id: organisation?.id,
    }
    // Remove empty optional strings
    if (!payload.area_id) delete payload.area_id
    if (!payload.make) delete payload.make
    if (!payload.model) delete payload.model
    if (!payload.serial_number) delete payload.serial_number
    if (!payload.install_date) delete payload.install_date
    if (!payload.notes) delete payload.notes

    await createAsset.mutateAsync(payload as Record<string, unknown> & { name: string })
    navigate('/dashboard/assets')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Assets', path: '/dashboard/assets' },
        { label: 'New Asset' },
      ]} />

      <PageHeader title="Register New Asset" />

      <AppCard padding="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Name */}
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

          {/* Category */}
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

          {/* Property */}
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

          {/* Area */}
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

          {/* Make & Model row */}
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

          {/* Serial Number */}
          <TextField>
            <Label>Serial Number</Label>
            <Input type="text" placeholder="e.g. SN-2024-00123" {...register('serial_number')} />
          </TextField>

          {/* Install Date & Status row */}
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

          {/* Notes */}
          <TextField>
            <Label>Notes</Label>
            <TextArea rows={3} placeholder="Additional notes about this asset..." {...register('notes')} />
          </TextField>

          {/* Error message */}
          {createAsset.isError && (
            <p className="text-status-overdue text-label">
              Failed to create asset: {(createAsset.error as Error).message}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              isDisabled={isSubmitting || createAsset.isPending}
            >
              {createAsset.isPending ? 'Creating...' : 'Create Asset'}
            </Button>
            <Button asChild type="button" variant="outline">
              <Link to="/dashboard/assets">
                Cancel
              </Link>
            </Button>
          </div>
        </form>
      </AppCard>
    </div>
  )
}
