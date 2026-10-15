import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Upload, Loader2 } from 'lucide-react'
import { Button, FieldError, Input, Label, TextField } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { useOrganisationDetails, useUpdateOrganisation, useUploadOrgLogo } from '@/hooks/use-organisation'
import { FormSkeleton } from '@/components/shared/skeletons'
import { useAuth } from '@/hooks/use-auth'

const orgSchema = z.object({
  name: z.string().min(1, 'Organisation name is required'),
})

type OrgFormValues = z.infer<typeof orgSchema>

export default function OrganisationPage() {
  const { data: org, isLoading } = useOrganisationDetails()
  const { refreshProfile } = useAuth()
  const updateOrg = useUpdateOrganisation()
  const uploadLogo = useUploadOrgLogo()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: {
      name: '',
    },
  })

  // Populate form when org data loads — keyed on id so a background refetch
  // can't reset() over the user's in-progress edit.
  const hydratedId = useRef<string | null>(null)
  useEffect(() => {
    if (!org) return
    if (hydratedId.current === org.id) return
    hydratedId.current = org.id
    reset({ name: org.name || '' })
  }, [org, reset])

  const onSubmit = (values: OrgFormValues) => {
    // Refresh auth-context org so the topbar name updates without a reload.
    updateOrg.mutate({ name: values.name }, { onSuccess: () => void refreshProfile() })
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Validate file type and size
    const validTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Logo must be a PNG, JPG, SVG, or WebP image')
      e.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2 MB')
      e.target.value = ''
      return
    }
    uploadLogo.mutate(file, { onSuccess: () => void refreshProfile() })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Organisation" />
        <FormSkeleton fields={4} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Organisation" />

      <form onSubmit={handleSubmit(onSubmit)}>
        <AppCard padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <h2 className="text-body font-semibold text-text-primary">Organisation Profile</h2>
            <p className="text-label text-text-muted mt-0.5">
              Update your organisation details visible across the platform.
            </p>
          </div>
          <div className="px-6 py-5">
            <div className="max-w-lg space-y-5">
              {/* Logo upload */}
              <div>
                <label className="text-label font-medium text-text-secondary block mb-2">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl bg-surface-page border border-border-default flex items-center justify-center overflow-hidden">
                    {org?.logo_url ? (
                      <img src={org.logo_url} alt="Org logo" className="w-full h-full object-cover" />
                    ) : (
                      <Building2 size={24} className="text-text-muted" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadLogo.isPending}
                      className="border border-border-default text-text-secondary hover:bg-surface-page px-3.5 py-1.5 rounded-lg text-label font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {uploadLogo.isPending ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload size={14} />
                          Upload Logo
                        </>
                      )}
                    </button>
                    <span className="text-micro text-text-muted">PNG, JPG, SVG or WebP. Max 2MB.</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Organisation name */}
              <TextField isRequired isInvalid={!!errors.name}>
                <Label>Organisation Name</Label>
                <Input type="text" placeholder="Your Company Ltd" {...register('name')} />
                {errors.name && <FieldError>{errors.name.message}</FieldError>}
              </TextField>

              {/* Slug (read-only) */}
              <TextField isReadOnly value={org?.slug || ''}>
                <Label>Slug</Label>
                <Input type="text" />
                <p className="text-micro text-text-muted mt-1">The slug is auto-generated and cannot be changed.</p>
              </TextField>

              {/* Created at (read-only info) */}
              <div>
                <label className="text-label font-medium text-text-secondary block mb-1.5">Created</label>
                <p className="text-label text-text-secondary">
                  {org?.created_at ? new Date(org.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                </p>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={updateOrg.isPending || !isDirty}
                >
                  {updateOrg.isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </AppCard>
      </form>
    </div>
  )
}
