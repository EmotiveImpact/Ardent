// Wave 14 / Task 114 — Tenant portal data hooks.
// All hooks here assume the signed-in user is a tenant_user
// (a property_contact with active status). RLS does the rest:
// the same Supabase queries as org staff would run, except
// scoped by the tenant_property_id() function.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type {
  Property,
  Job,
  ComplianceItem,
  ServiceReport,
  Document,
  Quote,
  PropertyContact,
} from '@haumea/types'

const DEV_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

/**
 * Get a short-lived signed download URL for a tenant-visible file. The site
 * buckets are private and tenant_users have no profiles-row storage access, so
 * the `sign-tenant-file` edge function re-checks the record under the caller's
 * tenant RLS and signs it with the service role. Returns null on failure.
 */
export async function signTenantFile(
  kind: 'document' | 'job_photo' | 'service_report',
  id: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('sign-tenant-file', { body: { kind, id } })
    if (error || !data?.url) return null
    return (data.url as string) ?? null
  } catch {
    return null
  }
}

/**
 * The single property this tenant_user is bound to.
 * Returns null in dev mode unless explicitly seeded.
 */
export function useTenantProperty() {
  const { currentPropertyId, profile } = useAuth()
  return useQuery<(Property & { clients?: { name: string } | null }) | null>({
    queryKey: ['site-property', currentPropertyId],
    enabled: !!currentPropertyId && profile?.role === 'tenant_user' && !DEV_MODE,
    queryFn: async () => {
      if (!currentPropertyId) return null
      const { data, error } = await supabase
        .from('properties')
        .select('*, clients(name)')
        .eq('id', currentPropertyId)
        .single()
      if (error) throw error
      return data as Property & { clients: { name: string } | null }
    },
  })
}

/** Recent jobs at the tenant's property. */
export function useTenantJobs(opts: { limit?: number } = {}) {
  const { currentPropertyId } = useAuth()
  const limit = opts.limit ?? 50
  return useQuery<Job[]>({
    queryKey: ['site-jobs', currentPropertyId, { limit }],
    enabled: !!currentPropertyId && !DEV_MODE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('property_id', currentPropertyId!)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as Job[]
    },
  })
}

/** Compliance items for the tenant's property. */
export function useTenantCompliance() {
  const { currentPropertyId } = useAuth()
  return useQuery<ComplianceItem[]>({
    queryKey: ['site-compliance', currentPropertyId],
    enabled: !!currentPropertyId && !DEV_MODE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('*')
        .eq('property_id', currentPropertyId!)
        .order('next_due', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as ComplianceItem[]
    },
  })
}

/** Service reports tied to jobs at the tenant's property. */
export function useTenantServiceReports() {
  const { currentPropertyId } = useAuth()
  return useQuery<(ServiceReport & { jobs?: { id: string; title: string; scheduled_date?: string } | null })[]>({
    queryKey: ['site-service-reports', currentPropertyId],
    enabled: !!currentPropertyId && !DEV_MODE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_reports')
        .select('*, jobs!inner(id, title, scheduled_date, property_id)')
        .eq('jobs.property_id', currentPropertyId!)
        .order('submitted_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as never
    },
  })
}

/** Documents linked to the tenant's property. */
export function useTenantDocuments() {
  const { currentPropertyId } = useAuth()
  return useQuery<Document[]>({
    queryKey: ['site-documents', currentPropertyId],
    enabled: !!currentPropertyId && !DEV_MODE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('property_id', currentPropertyId!)
        .order('uploaded_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Document[]
    },
  })
}

/** Quotes for the tenant's property. */
export function useTenantQuotes() {
  const { currentPropertyId } = useAuth()
  return useQuery<Quote[]>({
    queryKey: ['site-quotes', currentPropertyId],
    enabled: !!currentPropertyId && !DEV_MODE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('property_id', currentPropertyId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Quote[]
    },
  })
}

/** All site contacts for the tenant's property (read-only for site_lead). */
export function useTenantContacts() {
  const { currentPropertyId } = useAuth()
  return useQuery<PropertyContact[]>({
    queryKey: ['site-contacts', currentPropertyId],
    enabled: !!currentPropertyId && !DEV_MODE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_contacts')
        .select('id, organisation_id, client_id, property_id, user_id, email, full_name, role_at_site, status, invited_at, accepted_at, created_at')
        .eq('property_id', currentPropertyId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as PropertyContact[]
    },
  })
}

// ── Mutations ───────────────────────────────────────────────

interface RaiseCalloutInput {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  access_notes?: string
  contact_phone?: string
  photo_urls?: string[]
}

/** Tenant raises a reactive call-out at their property. */
export function useRaiseCallout() {
  const qc = useQueryClient()
  const { currentPropertyId, profile, user } = useAuth()
  return useMutation({
    mutationFn: async (input: RaiseCalloutInput) => {
      if (!currentPropertyId || !profile?.organisation_id) {
        throw new Error('No property context — cannot raise call-out')
      }
      const { data, error } = await supabase
        .from('jobs')
        .insert({
          property_id: currentPropertyId,
          organisation_id: profile.organisation_id,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: 'pending',
          job_type: 'reactive',
          is_callout: true,
          created_via: 'portal',
          created_by_user_id: user?.id,
          callout_metadata: {
            contact_phone: input.contact_phone,
            best_access_time: input.access_notes,
            photo_urls: input.photo_urls ?? [],
          },
        })
        .select()
        .single()
      if (error) throw error

      const job = data as Job
      // Best-effort auto-assign: a portal call-out is created with status
      // 'pending' and would otherwise sit unassigned. Fire-and-forget so a
      // failed assignment (no eligible engineer, RLS, edge timeout) never
      // blocks the call-out from being raised.
      void supabase.functions
        .invoke('auto-assign-job', { body: { job_id: job.id, mode: 'apply' } })
        .catch((err) => {
          console.warn('[site-portal] auto-assign-job failed for call-out (continuing):', err)
        })

      return job
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-jobs'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to raise call-out')
    },
  })
}

interface QuoteDecisionInput {
  quoteId: string
  decision: 'approved' | 'rejected'
}

/** Tenant approves or rejects a quote at their property. */
export function useTenantQuoteDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ quoteId, decision }: QuoteDecisionInput) => {
      // Goes through a SECURITY DEFINER RPC (00074) that only ever sets status
      // to approved/rejected, scoped to the tenant's property — tenants can no
      // longer write arbitrary quote columns via the (now-removed) broad
      // UPDATE policy.
      const { error } = await supabase.rpc('tenant_set_quote_decision', {
        p_quote_id: quoteId,
        p_decision: decision,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-quotes'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit quote decision')
    },
  })
}
