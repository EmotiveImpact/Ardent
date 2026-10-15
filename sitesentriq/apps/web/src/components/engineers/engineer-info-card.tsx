import { useState, type ReactNode } from 'react'
import { type UseFormReturn } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button, Chip, FieldError, Input, Label, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, Heading, Text } from '@haumea/ui'
import { Mail, PenLine, Phone, ShieldCheck, StickyNote, UserCircle, Wrench, X } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useUpdateEngineer } from '@/hooks/use-engineers'
import { FileUpload } from '@/components/shared/file-upload'
import type { EngineerWithRelations } from '@haumea/types'

const ENGINEER_DOCUMENTS_BUCKET = 'engineer-documents'
const SIGNED_URL_TTL = 60 * 60 // 1 hour

/**
 * Extract the storage object path from a stored file_url. Signatures persist a
 * legacy public URL (`.../object/public/engineer-documents/{path}`); the bucket
 * is now private (migration 00059) so we re-sign for display.
 */
function storagePathFromFileUrl(fileUrl: string): string | null {
  const parts = fileUrl.split(`/${ENGINEER_DOCUMENTS_BUCKET}/`)
  return parts.length > 1 ? parts[1] : null
}

export const engineerEditSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone: z.string().optional(),
  trade: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  notes: z.string().optional(),
})

export type EngineerEditFormData = z.infer<typeof engineerEditSchema>

export function EngineerInfoCard({ engineer }: { engineer: EngineerWithRelations }) {
  return (
    <AppCard>
      <Heading level={2} scale="body" className="mb-4">
        Engineer Details
      </Heading>
      <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <DetailRow icon={<Mail size={15} />} label="Email" value={engineer.email} />
        <DetailRow icon={<Phone size={15} />} label="Phone" value={engineer.phone} />
        <DetailRow icon={<Wrench size={15} />} label="Trade" value={engineer.trade} />
        <DetailRow
          icon={<UserCircle size={15} />}
          label="Status"
          value={
            <Chip variant={engineer.status === 'active' ? 'primary' : 'soft'} color={engineer.status === 'active' ? 'success' : 'default'} size="sm">
              {engineer.status}
            </Chip>
          }
        />
        <div className="sm:col-span-2">
          <DetailRow icon={<StickyNote size={15} />} label="Notes" value={engineer.notes} />
        </div>
      </dl>
    </AppCard>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-text-muted">{icon}</span>
      <div>
        <dt className="text-caption font-medium uppercase tracking-[0.04em] text-text-muted">{label}</dt>
        <dd className="mt-0.5 text-label text-text-secondary">
          {typeof value === 'string' ? value || '-' : value ?? '-'}
        </dd>
      </div>
    </div>
  )
}

export function EngineerStatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string | number
  icon: ReactNode
}) {
  return (
    <AppCard>
      <div className="flex items-center gap-4">
        <div className="rounded-lg bg-brand-500/10 p-2.5">{icon}</div>
        <div>
          <Text as="p" scale="caption" weight="medium" tone="muted" className="uppercase tracking-[0.04em]">
            {label}
          </Text>
          <Text as="p" scale="title" weight="semibold" className="mt-0.5">
            {value}
          </Text>
        </div>
      </div>
    </AppCard>
  )
}

export function EngineerEditForm({
  form,
  onSubmit,
  isPending,
  onCancel,
}: {
  form: UseFormReturn<EngineerEditFormData>
  onSubmit: (data: EngineerEditFormData) => void
  isPending: boolean
  onCancel: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = form

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <AppCard>
        <div className="space-y-4">
        <Heading level={2} scale="body">
          Edit Engineer
        </Heading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField isRequired isInvalid={!!errors.name}>
            <Label>Name</Label>
            <Input {...register('name')} />
            {errors.name ? <FieldError>{errors.name.message}</FieldError> : null}
          </TextField>
          <TextField isInvalid={!!errors.email}>
            <Label>Email</Label>
            <Input type="email" {...register('email')} />
            {errors.email ? <FieldError>{errors.email.message}</FieldError> : null}
          </TextField>
          <TextField>
            <Label>Phone</Label>
            <Input {...register('phone')} />
          </TextField>
          <TextField>
            <Label>Trade</Label>
            <Input {...register('trade')} />
          </TextField>
          <div>
            <label className="mb-1 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Status</label>
            <FormSelectController
              control={control}
              name="status"
              ariaLabel="Status"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </div>
          <TextField className="sm:col-span-2">
            <Label>Notes</Label>
            <TextArea rows={3} {...register('notes')} />
          </TextField>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onPress={onCancel}>
            Cancel
          </Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
        </div>
      </AppCard>
    </form>
  )
}

export function EngineerSignatureSection({
  engineerId,
  currentUrl,
}: {
  engineerId: string
  currentUrl?: string | null
}) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const { organisation } = useAuth()
  const updateEngineer = useUpdateEngineer()

  // engineer-documents is a private bucket (00059), so the stored public URL
  // 403s. Re-sign the stored path for display.
  const { data: signedUrl } = useQuery({
    queryKey: ['engineer-signature-signed', currentUrl],
    queryFn: async () => {
      const path = currentUrl ? storagePathFromFileUrl(currentUrl) : null
      if (!path) return null
      const { data } = await supabase.storage
        .from(ENGINEER_DOCUMENTS_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL)
      return data?.signedUrl ?? null
    },
    enabled: !!currentUrl,
  })

  const handleSave = async () => {
    if (!file) return
    const orgId = organisation?.id
    if (!orgId) throw new Error('missing organisation')
    setUploading(true)
    try {
      // First path segment MUST be the org id — the engineer-documents bucket
      // RLS (00059) requires foldername[1] = caller's organisation_id, else the
      // upload is rejected.
      const path = `${orgId}/engineer-signatures/${engineerId}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from(ENGINEER_DOCUMENTS_BUCKET).upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data: urlData } = supabase.storage.from(ENGINEER_DOCUMENTS_BUCKET).getPublicUrl(path)
      await updateEngineer.mutateAsync({
        id: engineerId,
        signature_image_url: urlData.publicUrl,
      })
      setFile(null)
    } finally {
      setUploading(false)
    }
  }

  const handleClear = async () => {
    await updateEngineer.mutateAsync({
      id: engineerId,
      signature_image_url: null,
    })
  }

  return (
    <AppCard>
      <div className="mb-3 flex items-center gap-2">
        <PenLine size={16} className="text-brand-500" />
        <Heading level={2} scale="body">
          Signature
        </Heading>
      </div>
      <Text scale="caption" tone="muted" className="mb-4">
        Upload a PNG of your hand-written signature - it is stamped onto compliance certificates generated for jobs you complete.
      </Text>
      {currentUrl ? (
        <div className="mb-4 flex items-center gap-4">
          <div className="inline-flex rounded-lg border border-border-default bg-surface-card p-3">
            <img src={signedUrl ?? currentUrl} alt="Engineer signature" className="max-h-16 max-w-[220px] object-contain" />
          </div>
          <Button variant="ghost" size="sm" onPress={handleClear}>
            <X size={14} />
            Remove
          </Button>
        </div>
      ) : null}
      <FileUpload
        accept="image/png,image/jpeg"
        value={file}
        onChange={setFile}
        description="Drop a transparent PNG (or JPEG) of your signature here."
      />
      {file ? (
        <div className="mt-3 flex justify-end">
          <Button variant="primary" size="sm" isDisabled={uploading} onPress={handleSave}>
            {uploading ? 'Saving...' : 'Save signature'}
          </Button>
        </div>
      ) : null}
    </AppCard>
  )
}

export function EngineerRenewalIcon({ needsRenewal }: { needsRenewal: boolean }) {
  return <ShieldCheck size={18} className={needsRenewal ? 'text-status-due' : 'text-brand-500'} />
}
