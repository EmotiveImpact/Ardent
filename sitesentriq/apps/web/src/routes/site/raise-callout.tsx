// Wave 14 / Task 114 — Tenant raises a reactive call-out.
// B8 (Apr 2026) — added photo upload, mirroring the client-side
// portal/raise-call-out.tsx pattern. Site leads typically have the
// issue right in front of them, so attaching pictures matters more
// here than on the client portal where it was already supported.
import { useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { ArrowLeft, AlertCircle, Camera, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useRaiseCallout, useTenantProperty } from '@/lib/site-portal/hooks'
import { createBulkNotifications } from '@/lib/notifications'
import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/storage'
import { compressImage } from '@/lib/image-compress'
import { NOTIFICATION_TYPES } from '@/lib/constants'

// Same constraints as the client portal flow so users have a
// consistent experience across both portals.
const MAX_PHOTOS = 4
const MAX_PHOTO_BYTES = 8 * 1024 * 1024 // 8 MB

const calloutSchema = z.object({
  title: z.string().min(3, 'Give it a short title'),
  description: z.string().min(10, 'Tell us what is happening'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  contact_phone: z.string().optional(),
  access_notes: z.string().optional(),
})

type CalloutFormData = z.infer<typeof calloutSchema>

const labelClass =
  'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

export default function SiteRaiseCalloutPage() {
  const navigate = useNavigate()
  const { profile, currentPropertyId } = useAuth()
  const { data: property } = useTenantProperty()
  const raise = useRaiseCallout()
  const [submitting, setSubmitting] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)

  const form = useForm<CalloutFormData>({
    resolver: zodResolver(calloutSchema),
    defaultValues: { priority: 'medium' },
  })

  // Stage photos client-side until submit. We don't upload on selection
  // because the bucket path needs the freshly-created job.id, which we
  // don't have until raise.mutateAsync resolves. Validate count + size
  // here so the user sees errors immediately rather than after submit.
  const handlePhotoSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPhotoError(null)
      const incoming = Array.from(e.target.files ?? [])
      if (incoming.length === 0) return
      const next = [...photos]
      for (const file of incoming) {
        if (next.length >= MAX_PHOTOS) {
          setPhotoError(`You can attach up to ${MAX_PHOTOS} photos`)
          break
        }
        if (file.size > MAX_PHOTO_BYTES) {
          setPhotoError(`${file.name} is over 8 MB`)
          continue
        }
        next.push(file)
      }
      setPhotos(next)
      // Reset the input so re-picking the same file works.
      e.target.value = ''
    },
    [photos],
  )

  const removePhoto = (idx: number) => {
    setPhotos((p) => p.filter((_, i) => i !== idx))
  }

  const onSubmit = async (data: CalloutFormData) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const job = await raise.mutateAsync(data)

      // Upload each staged photo + write the URLs back into
      // jobs.callout_metadata.photo_urls so the FM team sees them
      // alongside the call-out detail. Mirrors the client portal flow.
      if (photos.length > 0 && profile?.organisation_id) {
        const photoUrls: string[] = []
        const clientId = property?.client_id ?? profile.organisation_id
        for (const file of photos) {
          try {
            // Sprint 1.5 / H2 — compress before upload. Phone JPEGs land
            // around 6-8 MB; after compression they're typically 200-500 KB
            // and still plenty for triage. Falls back to the original on
            // any failure (HEIC on Chrome, decode error, etc.) so we never
            // block the user on the optimisation step.
            const compressed = await compressImage(file)
            const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_')
            const path = `${clientId}/${job.id}/${Date.now()}-${safeName}`
            const url = await uploadFile('callout-uploads', path, compressed)
            photoUrls.push(url)
          } catch (err) {
            console.error('[site/raise-callout] photo upload failed', err)
          }
        }
        if (photoUrls.length > 0) {
          // Merge into existing callout_metadata so we don't blow away
          // anything useRaiseCallout already populated.
          const { data: current } = await supabase
            .from('jobs')
            .select('callout_metadata')
            .eq('id', job.id)
            .single()
          const merged = {
            ...(current?.callout_metadata ?? {}),
            photo_urls: photoUrls,
          }
          await supabase
            .from('jobs')
            .update({ callout_metadata: merged })
            .eq('id', job.id)
        }
      }

      // Notify FM ops + the parent client. We fan out to everyone in the
      // FM org with org_admin/scheduler roles + everyone in the parent
      // client's portal users (client_admin role on the same org).
      try {
        if (profile?.organisation_id) {
          const { data: staff } = await supabase
            .from('profiles')
            .select('id')
            .eq('organisation_id', profile.organisation_id)
            .in('role', ['org_admin', 'scheduler', 'client_admin'])
          const recipients = (staff ?? []).map((s) => s.id)
          if (recipients.length > 0) {
            await createBulkNotifications(
              recipients.map((userId) => ({
                userId,
                orgId: profile.organisation_id,
                // Use the call-out type (matches the client-portal raise-call-out
                // flow) so the icon + any per-type Slack/notification routing keyed
                // on 'callout_raised' fires — not the generic 'visit_booked'.
                type: NOTIFICATION_TYPES.CALLOUT_RAISED,
                title: `Call-out raised at ${property?.name ?? 'a site'}`,
                message: `${data.title} (priority: ${data.priority})`,
                linkUrl: `/dashboard/jobs/${job.id}`,
                slackSeverity:
                  data.priority === 'urgent' || data.priority === 'high'
                    ? 'warning'
                    : 'info',
                slackContext: {
                  property: property?.name,
                  client: property?.clients?.name,
                },
              }))
            )
          }
        }
      } catch (notifyErr) {
        // Don't block the user-facing flow on a notification glitch.
        console.error('[site/raise-callout] notify failed:', notifyErr)
      }

      toast.success('Call-out raised — our team has been notified')
      navigate('/site')
    } catch (err) {
      toast.error((err as Error).message || 'Could not raise call-out')
    } finally {
      setSubmitting(false)
    }
  }

  if (!currentPropertyId) {
    return (
      <div className="text-label text-status-overdue">
        No property context — please sign out and back in.
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        to="/site"
        className="inline-flex items-center gap-1.5 text-caption font-medium text-text-muted hover:text-text-secondary transition-colors"
      >
        <ArrowLeft size={14} />
        Back to overview
      </Link>

      <div>
        <PageHeader title="Raise a call-out" />
        <p className="text-label text-text-muted mt-1">
          For {property?.name ?? 'this site'}. We aim to triage urgent issues within 1 hour.
        </p>
      </div>

      <AppCard padding="md">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <TextField isInvalid={!!form.formState.errors.title}>
          <Label>What's happening?</Label>
          <Input placeholder="e.g. Boiler not firing in main kitchen" autoFocus {...form.register('title')} />
          {form.formState.errors.title && <FieldError>{form.formState.errors.title.message}</FieldError>}
        </TextField>

        <TextField isInvalid={!!form.formState.errors.description}>
          <Label>Description</Label>
          <TextArea rows={4} placeholder="Add as much detail as you can — when it started, what you've tried, anyone affected." {...form.register('description')} />
          {form.formState.errors.description && <FieldError>{form.formState.errors.description.message}</FieldError>}
        </TextField>

        <div>
          <label className={labelClass}>Priority</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['low', 'medium', 'high', 'urgent'] as const).map((p) => (
              <label
                key={p}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-caption font-medium ${
                  form.watch('priority') === p
                    ? 'bg-brand-50 border-brand-500 text-brand-700'
                    : 'border-border-default text-text-secondary hover:bg-surface-page'
                }`}
              >
                <input
                  type="radio"
                  value={p}
                  {...form.register('priority')}
                  className="sr-only"
                />
                <span className="capitalize">{p}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField>
            <Label>Contact phone (optional)</Label>
            <Input placeholder="Best number on the day" {...form.register('contact_phone')} />
          </TextField>
          <TextField>
            <Label>Access notes (optional)</Label>
            <Input placeholder="e.g. open after 10am, key in cellar" {...form.register('access_notes')} />
          </TextField>
        </div>

        {/* Photos — up to 4, 8 MB each. Uploaded to the callout-uploads
            bucket after the job is created so the path can include
            job.id. Mirrors the client portal's photo flow. */}
        <div>
          <label className={labelClass}>Photos (optional, up to {MAX_PHOTOS})</label>
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-default bg-surface-page text-caption text-text-secondary"
              >
                <Camera size={13} className="text-text-muted" />
                <span className="max-w-[160px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  aria-label={`Remove ${file.name}`}
                  className="text-text-muted hover:text-status-overdue transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border-default bg-surface-card text-caption text-text-secondary hover:bg-surface-page cursor-pointer transition-colors">
                <Camera size={14} />
                Add photo
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={handlePhotoSelect}
                  className="sr-only"
                />
              </label>
            )}
          </div>
          {photoError && (
            <p className="mt-2 text-caption text-status-overdue">{photoError}</p>
          )}
          <p className="mt-1.5 text-micro text-text-muted">
            Pictures help us triage faster — especially for floods, leaks, or damage.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
          <Button
            type="submit"
            variant="primary"
            isDisabled={submitting || raise.isPending}
          >
            <AlertCircle size={14} className="mr-1.5" />
            {submitting ? 'Submitting…' : 'Raise call-out'}
          </Button>
          <Button type="button" variant="outline" onPress={() => navigate('/site')}>
            Cancel
          </Button>
        </div>
      </form>
      </AppCard>
    </div>
  )
}
