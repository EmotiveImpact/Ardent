// GDPR data-layer hooks (TanStack Query + Supabase).
//
// Used by both the admin "Data & Privacy" page and the user-facing
// "Privacy" self-service page.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type {
  DeleteFnResult,
  ExportFnResult,
  GdprRequest,
  GdprRequestWithSubject,
} from './types'

// ── List GDPR requests for the org (admin) ──────────────────────
export function useGdprRequests(opts?: { selfOnly?: boolean }) {
  const { profile } = useAuth()
  const orgId = profile?.organisation_id
  const userId = profile?.id
  const selfOnly = opts?.selfOnly ?? false

  return useQuery({
    queryKey: ['gdpr-requests', orgId, selfOnly ? userId : 'all'],
    enabled: !!orgId,
    queryFn: async (): Promise<GdprRequestWithSubject[]> => {
      let q = supabase
        .from('gdpr_requests')
        .select('*')
        .eq('organisation_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(200)
      if (selfOnly && userId) q = q.eq('requested_by_user_id', userId)
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []) as GdprRequest[]

      // Best-effort enrich with subject + requester display info from profiles.
      const ids = Array.from(
        new Set(
          rows
            .flatMap((r) => [r.subject_user_id, r.requested_by_user_id])
            .filter((x): x is string => !!x),
        ),
      )
      let profileMap: Record<string, { full_name: string | null; email: string }> = {}
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', ids)
        profileMap = Object.fromEntries(
          (profs ?? []).map((p) => [
            p.id,
            { full_name: (p as { full_name: string | null }).full_name, email: (p as { email: string }).email },
          ]),
        )
      }

      return rows.map((r) => ({
        ...r,
        subject_full_name: r.subject_user_id ? profileMap[r.subject_user_id]?.full_name ?? null : null,
        requested_by_full_name: profileMap[r.requested_by_user_id]?.full_name ?? null,
        requested_by_email: profileMap[r.requested_by_user_id]?.email ?? null,
      }))
    },
    staleTime: 30_000,
  })
}

// ── List org members (for admin to pick a subject) ──────────────
export function useOrgMembers() {
  const { profile } = useAuth()
  const orgId = profile?.organisation_id
  return useQuery({
    queryKey: ['gdpr-org-members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('organisation_id', orgId!)
        .order('full_name')
      if (error) throw error
      return data as Array<{ id: string; full_name: string | null; email: string; role: string }>
    },
  })
}

// ── Trigger an export ───────────────────────────────────────────
export function useTriggerGdprExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (subject_user_id: string): Promise<ExportFnResult> => {
      const { data, error } = await supabase.functions.invoke<ExportFnResult>('gdpr-export', {
        body: { subject_user_id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data) throw new Error('Export failed: empty response')
      return data
    },
    onSuccess: () => {
      toast.success('Export ready — download link issued.')
      qc.invalidateQueries({ queryKey: ['gdpr-requests'] })
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Export failed')
    },
  })
}

// ── Trigger a delete (anonymise) ────────────────────────────────
export function useTriggerGdprDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      subject_user_id: string
      confirmation_phrase: string
    }): Promise<DeleteFnResult> => {
      const { data, error } = await supabase.functions.invoke<DeleteFnResult>('gdpr-delete', {
        body: input,
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data) throw new Error('Delete failed: empty response')
      return data
    },
    onSuccess: () => {
      toast.success('User data anonymised.')
      qc.invalidateQueries({ queryKey: ['gdpr-requests'] })
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Delete failed')
    },
  })
}
