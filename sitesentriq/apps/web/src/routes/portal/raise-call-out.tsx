import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Camera,
  Clock,
  Image as ImageIcon,
  Send,
  X,
} from 'lucide-react'
import { AlertDialog, Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController } from '@haumea/ui'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/storage'
import { compressImage } from '@/lib/image-compress'
import { useAuth } from '@/hooks/use-auth'
import { useProperties } from '@/hooks/use-properties'
import { useAssets } from '@/hooks/use-assets'
import { usePortalProperty } from '@/components/layout/portal-layout'
import { createBulkNotifications } from '@/lib/notifications'
import { logTimelineEvent } from '@/lib/timeline'
import { useSlaPolicies } from '@/lib/sla/hooks'
import {
  ACTION_PRIORITIES,
  NOTIFICATION_TYPES,
  TIMELINE_EVENT_TYPES,
} from '@/lib/constants'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import type { Property } from '@haumea/types'

// ── Const maps (hoisted) ──────────────────────────────────────────

const CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'heating_cooling', label: 'Heating / Cooling' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'lift', label: 'Lift' },
  { value: 'door_access', label: 'Door / Access' },
  { value: 'roof_leak', label: 'Roof / Leak' },
  { value: 'pest', label: 'Pest' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'fire_safety', label: 'Fire / Safety' },
  { value: 'security', label: 'Security' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'other', label: 'Other' },
] as const

const PRIORITY_OPTIONS = [
  {
    value: ACTION_PRIORITIES.LOW,
    label: 'Low',
    description: 'Minor inconvenience, no operational impact',
  },
  {
    value: ACTION_PRIORITIES.MEDIUM,
    label: 'Medium',
    description: 'Affects comfort or productivity but not critical',
  },
  {
    value: ACTION_PRIORITIES.HIGH,
    label: 'High',
    description: 'Significant operational impact, needs attention soon',
  },
  {
    value: ACTION_PRIORITIES.CRITICAL,
    label: 'Critical',
    description: 'Health & safety risk or major operational outage',
  },
] as const

// Fallback SLA text per priority — used when the org has no matching
// sla_policies row yet. The useSlaPolicies() hook below replaces this with
// the live org values when present.
const SLA_FALLBACK: Record<string, string> = {
  low: '5 business days',
  medium: '3 business days',
  high: '1 business day',
  critical: '4 hours',
}

function formatResponseMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`
  if (minutes < 60 * 8) {
    const h = Math.round(minutes / 60)
    return h === 1 ? '1 hour' : `${h} hours`
  }
  const businessHours = 8
  const days = Math.max(1, Math.round(minutes / 60 / businessHours))
  return days === 1 ? '1 business day' : `${days} business days`
}

const MAX_PHOTOS = 5
const MAX_PHOTO_SIZE_MB = 10

// ── Zod schema ────────────────────────────────────────────────────

const calloutSchema = z
  .object({
    property_id: z.string().min(1, 'Select a property'),
    category: z.string().min(1, 'Choose an issue category'),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    asset_id: z.string().optional(),
    description: z.string().min(20, 'Please describe the issue (at least 20 characters)'),
    contact_name: z.string().min(1, 'On-site contact name is required'),
    contact_phone: z.string().min(5, 'On-site contact phone is required'),
    best_access_time: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.priority === 'high' && val.description.trim().length < 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['description'],
        message: 'High priority needs at least 20 characters',
      })
    }
    if (val.priority === 'critical' && val.description.trim().length < 40) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['description'],
        message: 'Critical priority needs at least 40 characters explaining the risk',
      })
    }
  })

type CalloutForm = z.infer<typeof calloutSchema>

// ── Component ─────────────────────────────────────────────────────

export default function RaiseCallOutPage() {
  const navigate = useNavigate()
  const { user, profile, organisation } = useAuth()
  const { selectedPropertyId } = usePortalProperty()
  // Scope the property picker to the client_admin's client (RLS 00096 backs
  // this; NULL for staff preview = all sites).
  const { data: properties, isLoading: propertiesLoading } = useProperties(profile?.client_id ?? undefined)

  const [photos, setPhotos] = useState<File[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [criticalConfirm, setCriticalConfirm] = useState<CalloutForm | null>(null)

  const form = useForm<CalloutForm>({
    resolver: zodResolver(calloutSchema),
    defaultValues: {
      property_id: selectedPropertyId ?? '',
      category: '',
      priority: 'medium',
      asset_id: '',
      description: '',
      contact_name: profile?.full_name ?? '',
      contact_phone: '',
      best_access_time: '',
    },
  })
  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = form

  const watchedProperty = watch('property_id')
  const watchedPriority = watch('priority')

  // Assets at the chosen property (for the optional Asset Affected select)
  const { data: assets } = useAssets(watchedProperty || undefined)

  // Clear the chosen asset when the property changes — otherwise a stale
  // asset_id from the previous property would be submitted in callout_metadata
  // pointing at an asset that doesn't belong to the selected property.
  const prevPropertyRef = useRef(watchedProperty)
  useEffect(() => {
    if (prevPropertyRef.current && prevPropertyRef.current !== watchedProperty) {
      form.setValue('asset_id', '')
    }
    prevPropertyRef.current = watchedProperty
  }, [watchedProperty, form])

  // Resolve SLA text from the org's configured sla_policies (matched on
  // priority). Falls back to the static SLA_FALLBACK map when the org has
  // no policy for this priority yet.
  const { data: slaPolicies } = useSlaPolicies()
  const slaText = useMemo(() => {
    // jobs.priority has no 'critical' in its CHECK, so a critical call-out is
    // stored as 'urgent' (see the insert below) and the SLA engine therefore
    // matches the *Urgent* policy. Quote the target we will actually be held
    // to — quoting the Critical policy here promised a response time the job
    // was never tracked against.
    const effectivePriority = watchedPriority === 'critical' ? 'urgent' : watchedPriority
    const match = slaPolicies?.find(
      (p) => p.applies_to_priority === effectivePriority && !p.applies_to_category,
    )
    if (match) return formatResponseMinutes(match.response_minutes)
    return SLA_FALLBACK[effectivePriority] ?? SLA_FALLBACK[watchedPriority] ?? '—'
  }, [slaPolicies, watchedPriority])

  // ── Photo handling ──────────────────────────────────────────────

  const handleAddPhotos = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPhotoError(null)
      const newFiles = Array.from(e.target.files ?? [])
      if (newFiles.length === 0) return
      const next = [...photos]
      for (const f of newFiles) {
        if (next.length >= MAX_PHOTOS) {
          setPhotoError(`You can attach up to ${MAX_PHOTOS} photos`)
          break
        }
        if (f.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
          setPhotoError(`"${f.name}" is over ${MAX_PHOTO_SIZE_MB}MB`)
          continue
        }
        next.push(f)
      }
      setPhotos(next)
      // reset native input so the same file can be re-selected if needed
      e.target.value = ''
    },
    [photos]
  )

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ── Submit ──────────────────────────────────────────────────────

  const performSubmit = useCallback(
    async (data: CalloutForm) => {
      if (!profile?.organisation_id && !organisation?.id) {
        toast.error('Your account is missing an organisation. Contact support.')
        return
      }

      // Critical safety check: at least one photo
      if (data.priority === 'critical' && photos.length === 0) {
        setPhotoError('Critical call-outs require at least one photo')
        return
      }

      setSubmitting(true)

      const orgId = (organisation?.id ?? profile?.organisation_id)!
      const property = (properties ?? []).find(
        (p: Property & { clients: { name: string } | null }) => p.id === data.property_id
      )
      const clientId = property?.client_id

      const categoryLabel = CATEGORIES.find((c) => c.value === data.category)?.label ?? 'Other'
      const priorityLabel = data.priority.charAt(0).toUpperCase() + data.priority.slice(1)
      const formattedDescription = `[${categoryLabel} - ${priorityLabel}] ${data.description.trim()}`

      // 1. Create the job row first to get a stable id for storage paths
      const insertPayload = {
        organisation_id: orgId,
        property_id: data.property_id,
        client_id: clientId,
        title: `${categoryLabel} call-out`,
        description: formattedDescription,
        status: 'scheduled', // ops queue treats new portal call-outs as needing triage
        priority: data.priority === 'critical' ? 'urgent' : data.priority,
        is_callout: true,
        job_type: 'reactive',
        created_via: 'portal',
        created_by_user_id: user?.id ?? null,
        callout_metadata: {
          category: data.category,
          asset_id: data.asset_id || null,
          contact_name: data.contact_name,
          contact_phone: data.contact_phone,
          best_access_time: data.best_access_time || null,
          photo_urls: [] as string[],
        },
      }

      const { data: insertedJob, error: insertError } = await supabase
        .from('jobs')
        .insert(insertPayload)
        .select()
        .single()

      if (insertError || !insertedJob) {
        console.error('[raise-call-out] insert failed', insertError)
        toast.error(insertError?.message ?? 'Failed to raise call-out')
        setSubmitting(false)
        return
      }

      const jobId = insertedJob.id as string

      // 2. Upload any photos under callout-uploads/{client_id}/{job_id}/
      const photoUrls: string[] = []
      if (photos.length > 0) {
        for (const file of photos) {
          try {
            // Sprint 1.5 / H2 — compress before upload (mirrors the site
            // portal flow). 6-8 MB phone JPEGs become ~200-500 KB and
            // still convey everything needed for triage.
            const compressed = await compressImage(file)
            const safeName = compressed.name.replace(/[^a-z0-9.\-_]/gi, '_')
            const path = `${clientId ?? 'unknown-client'}/${jobId}/${Date.now()}-${safeName}`
            const url = await uploadFile('callout-uploads', path, compressed)
            photoUrls.push(url)
          } catch (err) {
            console.error('[raise-call-out] photo upload failed', err)
            // We continue rather than abort — the job is already created.
          }
        }
        if (photoUrls.length > 0) {
          await supabase
            .from('jobs')
            .update({
              callout_metadata: {
                ...insertPayload.callout_metadata,
                photo_urls: photoUrls,
              },
            })
            .eq('id', jobId)
        }
      }

      // 3. Timeline event on the job/property
      await logTimelineEvent({
        orgId,
        propertyId: data.property_id,
        clientId,
        eventType: TIMELINE_EVENT_TYPES.ACTION_RAISED,
        description: `Portal call-out raised: ${categoryLabel} (${priorityLabel})`,
        userId: user?.id,
        metadata: { job_id: jobId, source: 'portal' },
      })

      // 4. Notify ops staff (org_admin + scheduler) for this organisation
      const { data: opsStaff } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('organisation_id', orgId)
        .in('role', ['org_admin', 'scheduler'])

      if (opsStaff && opsStaff.length > 0) {
        // 4a. In-app bell notifications (durable, visible on dashboard).
        await createBulkNotifications(
          opsStaff.map((s: { id: string }) => ({
            userId: s.id,
            orgId,
            type: NOTIFICATION_TYPES.CALLOUT_RAISED,
            title:
              data.priority === 'critical'
                ? `CRITICAL call-out raised at ${property?.name ?? 'a site'}`
                : `New portal call-out at ${property?.name ?? 'a site'}`,
            message: `${categoryLabel} • ${priorityLabel} priority — ${data.description.slice(0, 80)}`,
            linkUrl: `/dashboard/jobs/${jobId}`,
          })),
        )

        // 4b. Email ops staff via the service-role `portal-callout-notify`
        // function. A portal client (client_admin/tenant_user) can't invoke
        // `send-email` directly — it's locked to internal roles, so the old
        // direct invoke 403'd and was silently dropped. This dedicated function
        // re-reads the job under the caller's JWT (RLS proves they own it),
        // resolves the ops-staff recipients server-side, and sends via the
        // service role. Fire-and-forget — the in-app bell above already landed.
        void supabase.functions
          .invoke('portal-callout-notify', { body: { job_id: jobId } })
          .catch((err) => {
            console.warn('[portal/raise-call-out] callout notify failed:', err)
          })
      }

      // 5. Toast + redirect with highlight param
      const refShort = jobId.slice(0, 8)
      toast.success(`Call-out raised — reference #${refShort}`)
      setSubmitting(false)
      navigate(`/portal/actions?new=${jobId}`)
    },
    [photos, profile, organisation, properties, user, navigate]
  )

  const onSubmit = (data: CalloutForm) => {
    if (data.priority === 'critical') {
      setCriticalConfirm(data)
      return
    }
    void performSubmit(data)
  }

  // ── Render ──────────────────────────────────────────────────────

  if (propertiesLoading) {
    return (
      <div className="flex justify-center py-16 text-text-muted text-label">
        Loading properties…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[820px]">
      <Breadcrumbs
        items={[
          { label: 'Client Hub', path: '/portal' },
          { label: 'Raise a Call-Out' },
        ]}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          {/* TODO(Wave F): Migrate this complex title to PageHeader once icon/adornment support exists. */}
          <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em] flex items-center gap-2">
            <AlertCircle size={20} className="text-brand-500" />
            Raise a Call-Out
          </h1>
          <p className="text-label text-text-muted mt-1">
            Log a reactive issue at one of your sites. Our duty manager will triage and confirm
            an arrival time.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => navigate('/portal')}
          className="hidden sm:inline-flex"
        >
          <ArrowLeft size={14} /> Back
        </Button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Property */}
        <AppCard padding="md">
          <div className="space-y-4">
          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
              Property
            </label>
            <FormSelectController
              control={control}
              name="property_id"
              ariaLabel="Property"
              placeholder="Select a property…"
              options={(properties ?? []).map((p: Property & { clients: { name: string } | null }) => ({ value: p.id, label: p.name }))}
            />
            {errors.property_id && (
              <p className="text-caption text-status-overdue mt-1">{errors.property_id.message}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
              Issue category
            </label>
            <FormSelectController
              control={control}
              name="category"
              ariaLabel="Issue category"
              placeholder="Choose…"
              options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            />
            {errors.category && (
              <p className="text-caption text-status-overdue mt-1">{errors.category.message}</p>
            )}
          </div>

          {/* Asset (optional) */}
          <div>
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
              Asset affected <span className="text-text-muted normal-case">(optional)</span>
            </label>
            <FormSelectController
              control={control}
              name="asset_id"
              ariaLabel="Asset affected"
              placeholder={watchedProperty ? 'Select an asset…' : 'Pick a property first'}
              clearable
              disabled={!watchedProperty}
              options={(assets ?? []).map((a: { id: string; name: string; category?: string }) => ({ value: a.id, label: `${a.name}${a.category ? ` (${a.category})` : ''}` }))}
            />
          </div>
          </div>
        </AppCard>

        {/* Priority */}
        <AppCard padding="md">
          <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-body font-semibold text-text-primary">Priority</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRIORITY_OPTIONS.map((opt) => {
              const active = watchedPriority === opt.value
              return (
                <label
                  key={opt.value}
                  className={`relative flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    active
                      ? 'bg-brand-500/10 border-brand-500'
                      : 'bg-surface-card border-border-default hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    {...register('priority')}
                    className="mt-1 accent-brand-500"
                  />
                  <span>
                    <span className="block text-label font-medium text-text-primary">
                      {opt.label}
                    </span>
                    <span className="block text-micro text-text-muted mt-0.5">
                      {opt.description}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          <p className="flex items-center gap-1.5 text-caption text-text-muted">
            <Clock size={12} />
            Estimated response for {watchedPriority}: <strong className="text-text-primary">{slaText}</strong>
          </p>
          {errors.priority && (
            <p className="text-caption text-status-overdue mt-1">{errors.priority.message}</p>
          )}
          </div>
        </AppCard>

        {/* Description */}
        <AppCard padding="md">
          <div className="space-y-3">
          <TextField isInvalid={!!errors.description}>
            <Label>Description</Label>
            <TextArea rows={5} placeholder="Describe the issue: when it started, who is affected, any safety concerns..." {...register('description')} />
            {errors.description && <FieldError>{errors.description.message}</FieldError>}
          </TextField>
          <p className="text-micro text-text-muted">
            {watchedPriority === 'critical'
              ? 'Critical priority requires at least 40 characters and one photo.'
              : watchedPriority === 'high'
                ? 'High priority requires at least 20 characters.'
                : 'Min 20 characters.'}
          </p>
          </div>
        </AppCard>

        {/* Photos */}
        <AppCard padding="md">
          <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-body font-semibold text-text-primary flex items-center gap-2">
              <Camera size={14} /> Photos
              <span className="text-caption text-text-muted font-normal">
                (optional — up to {MAX_PHOTOS})
              </span>
            </h2>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleAddPhotos}
                disabled={photos.length >= MAX_PHOTOS}
              />
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption font-medium border transition-colors ${
                  photos.length >= MAX_PHOTOS
                    ? 'border-border-default text-text-muted opacity-60 cursor-not-allowed'
                    : 'border-brand-500 text-brand-500 hover:bg-brand-500/10'
                }`}
              >
                <ImageIcon size={12} /> Add photos
              </span>
            </label>
          </div>
          {photos.length > 0 ? (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="relative group bg-surface-card border border-border-default rounded-lg overflow-hidden aspect-[4/3]"
                >
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label={`Remove ${file.name}`}
                    className="absolute top-1 right-1 p-1 rounded-md bg-surface-card/80 text-text-secondary hover:text-status-overdue transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-text-muted">
              Photos help engineers triage faster. Required for Critical priority.
            </p>
          )}
          {photoError && <p className="text-caption text-status-overdue">{photoError}</p>}
          </div>
        </AppCard>

        {/* Contact + access */}
        <AppCard padding="md">
          <div className="space-y-3">
          <h2 className="text-body font-semibold text-text-primary">On-site contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField isInvalid={!!errors.contact_name}>
              <Label>Contact name</Label>
              <Input type="text" {...register('contact_name')} />
              {errors.contact_name && <FieldError>{errors.contact_name.message}</FieldError>}
            </TextField>
            <TextField isInvalid={!!errors.contact_phone}>
              <Label>Contact phone</Label>
              <Input type="tel" {...register('contact_phone')} />
              {errors.contact_phone && <FieldError>{errors.contact_phone.message}</FieldError>}
            </TextField>
          </div>
          <TextField>
            <Label>Best access time (optional)</Label>
            <Input type="text" placeholder="e.g. Weekdays 8am–5pm" {...register('best_access_time')} />
          </TextField>
          </div>
        </AppCard>

        {/* Submit */}
        <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onPress={() => navigate('/portal')}
            isDisabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            isDisabled={submitting}
          >
            <Send size={14} />
            {submitting ? 'Raising…' : 'Raise call-out'}
          </Button>
        </div>
      </form>

      {/* Critical confirmation modal */}
      {criticalConfirm && (
        <CriticalConfirmModal
          onCancel={() => setCriticalConfirm(null)}
          onConfirm={() => {
            const data = criticalConfirm
            setCriticalConfirm(null)
            void performSubmit(data)
          }}
        />
      )}
    </div>
  )
}

// ── Critical priority confirmation modal ──────────────────────────

// Wave 17C — CriticalConfirmModal migrated to HeroUI <AlertDialog>.
function CriticalConfirmModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Backdrop
      isOpen
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      isDismissable
      isKeyboardDismissDisabled={false}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-md">
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger">
              <AlertTriangle className="size-5" />
            </AlertDialog.Icon>
            <AlertDialog.Heading>This will be flagged Critical</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p className="text-label text-text-muted">
              Critical call-outs are surfaced immediately to the duty manager. Please confirm
              this is a health &amp; safety risk or major operational outage.
            </p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={onCancel}>
              Cancel
            </Button>
            <Button variant="danger" onPress={onConfirm}>
              Yes, raise critical call-out
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
