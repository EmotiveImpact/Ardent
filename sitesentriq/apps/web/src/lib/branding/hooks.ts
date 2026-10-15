// Branding TanStack Query hooks (Wave 12 / Task 109).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import { uploadFile } from '@/lib/storage'
import { logAuditEvent } from '@/lib/audit/log'
import type { OrgBranding, UpdateBrandingInput } from './types'

const DEV_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

const BRANDING_FIELDS = [
  'logo_url',
  'accent_color',
  'accent_color_dark',
  'support_email',
  'support_phone',
  'portal_welcome_message',
  'portal_terms_url',
  'branding_enabled',
] as const

/** Fetch the branding for an org id. Returns null when the org has none yet. */
export function useOrgBranding(organisationId: string | undefined | null) {
  return useQuery<OrgBranding | null>({
    queryKey: ['org-branding', organisationId],
    enabled: !!organisationId,
    queryFn: async () => {
      if (DEV_MODE) {
        // Dev fallback — no branding so the portal shows defaults.
        return {
          logo_url: null,
          accent_color: null,
          accent_color_dark: null,
          support_email: 'support@haumea.dev',
          support_phone: null,
          portal_welcome_message: null,
          portal_terms_url: null,
          branding_enabled: false,
        }
      }
      const { data, error } = await supabase
        .from('organisations')
        .select(BRANDING_FIELDS.join(','))
        .eq('id', organisationId)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as OrgBranding) ?? null
    },
  })
}

/** Mutation: update the current org's branding fields. */
export function useUpdateBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateBrandingInput) => {
      const { organisation_id, ...rest } = input
      if (DEV_MODE) {
         
        console.log('[DEV_MODE] useUpdateBranding', input)
        return { ...rest } as OrgBranding
      }
      const { data, error } = await supabase
        .from('organisations')
        .update(rest)
        .eq('id', organisation_id)
        .select(BRANDING_FIELDS.join(','))
        .single()
      if (error) throw error

      // Audit log — record what changed (Wave 8C system_audit_events).
      await logAuditEvent({
        organisationId: organisation_id,
        action: 'branding.updated',
        entityType: 'organisation',
        entityId: organisation_id,
        summary: 'White-label branding updated',
        severity: 'info',
        metadata: {
          changed_fields: Object.keys(rest),
        },
      })
      return data as unknown as OrgBranding
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['org-branding', vars.organisation_id] })
      qc.invalidateQueries({ queryKey: ['organisation'] })
    },
  })
}

/** Mutation: upload a logo file to the `org-branding/<orgId>/...` path. */
export function useUploadLogo() {
  const { organisation } = useAuthContext()
  return useMutation<string, Error, File>({
    mutationFn: async (file) => {
      if (!organisation?.id) throw new Error('Not signed in to an organisation')
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${organisation.id}/logo-${Date.now()}.${ext}`
      const url = await uploadFile('org-branding', path, file)
      return url
    },
  })
}
