// Sprint 3 / D2 — Hooks for the public ETA token flow.
//
//   useIssueJobEtaToken: mutation that creates a fresh token on a
//                        job. Returns the public URL for the engineer/
//                        admin to copy + send to the customer (via SMS,
//                        email, paste-into-WhatsApp, whatever).
//   useJobEtaTokens:     read-only list of active tokens for a job.
//                        Used by the share UI to "see existing link"
//                        rather than minting a new one every time.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export interface JobEtaToken {
  id: string
  job_id: string
  organisation_id: string
  token: string
  expires_at: string
  view_count: number
  last_viewed_at: string | null
  created_by: string | null
  created_at: string
}

/**
 * Build a 32-char URL-safe random string. Browser-side only —
 * relies on `crypto.getRandomValues`. URL-safe base64 → no need to
 * encode in URLs.
 */
function generateToken(): string {
  const buf = new Uint8Array(24) // 24 bytes → 32 chars after base64url
  crypto.getRandomValues(buf)
  // Manual base64url so we don't depend on browser btoa quirks.
  let str = ''
  for (let i = 0; i < buf.length; i++) str += String.fromCharCode(buf[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Build the public URL the customer will visit. Uses the current
 * origin so a preview deploy gets preview links and prod gets prod
 * links — no env var required.
 */
export function buildEtaPublicUrl(token: string): string {
  if (typeof window === 'undefined') return `/track/${token}`
  return `${window.location.origin}/track/${token}`
}

export function useIssueJobEtaToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      jobId: string
      organisationId: string
      expiresInDays?: number
    }) => {
      const days = params.expiresInDays ?? 7
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      const token = generateToken()
      const { data: userResp } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('job_eta_tokens')
        .insert({
          job_id: params.jobId,
          organisation_id: params.organisationId,
          token,
          expires_at: expiresAt,
          created_by: userResp?.user?.id ?? null,
        })
        .select()
        .single()
      if (error) throw error

      return {
        ...(data as JobEtaToken),
        public_url: buildEtaPublicUrl(token),
      }
    },
    onSuccess: (data) => {
      toast.success('Tracking link created')
      queryClient.invalidateQueries({ queryKey: ['job-eta-tokens', data.job_id] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not create tracking link')
    },
  })
}

export function useJobEtaTokens(jobId: string) {
  return useQuery<JobEtaToken[]>({
    queryKey: ['job-eta-tokens', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_eta_tokens')
        .select('*')
        .eq('job_id', jobId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as JobEtaToken[]
    },
  })
}

export function useRevokeJobEtaToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tokenId: string) => {
      const { error } = await supabase.from('job_eta_tokens').delete().eq('id', tokenId)
      if (error) throw error
      return tokenId
    },
    onSuccess: () => {
      toast.success('Tracking link revoked')
      queryClient.invalidateQueries({ queryKey: ['job-eta-tokens'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Could not revoke link')
    },
  })
}
