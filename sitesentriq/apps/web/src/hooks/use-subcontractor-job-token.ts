// W2-T7 — hooks for per-use subcontractor work links (00119).
// Mirrors use-job-eta-token: client-minted unguessable token, org RLS row,
// public access only via the subcontractor-job edge function.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export interface SubcontractorJobToken {
  id: string
  organisation_id: string
  job_id: string
  subcontractor_id: string
  token: string
  status: 'issued' | 'accepted' | 'completed' | 'revoked'
  expires_at: string
  accepted_at: string | null
  completed_at: string | null
  view_count: number
  last_viewed_at: string | null
  created_by: string | null
  created_at: string
}

function generateToken(): string {
  const buf = new Uint8Array(24)
  crypto.getRandomValues(buf)
  let str = ''
  for (let i = 0; i < buf.length; i++) str += String.fromCharCode(buf[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function buildSubbiePublicUrl(token: string): string {
  if (typeof window === 'undefined') return `/subbie/${token}`
  return `${window.location.origin}/subbie/${token}`
}

export function useSubcontractorJobTokens(jobId: string | undefined) {
  return useQuery<SubcontractorJobToken[]>({
    queryKey: ['subcontractor-job-tokens', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractor_job_tokens')
        .select('*')
        .eq('job_id', jobId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SubcontractorJobToken[]
    },
    enabled: !!jobId,
  })
}

export function useIssueSubcontractorJobToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      jobId: string
      organisationId: string
      subcontractorId: string
      expiresInDays?: number
    }) => {
      const days = params.expiresInDays ?? 14
      const token = generateToken()
      const { data: userResp } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('subcontractor_job_tokens')
        .insert({
          job_id: params.jobId,
          organisation_id: params.organisationId,
          subcontractor_id: params.subcontractorId,
          token,
          expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
          created_by: userResp?.user?.id ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return { ...(data as SubcontractorJobToken), public_url: buildSubbiePublicUrl(token) }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcontractor-job-tokens'] })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create work link'),
  })
}

export function useRevokeSubcontractorJobToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('subcontractor_job_tokens')
        .update({ status: 'revoked' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcontractor-job-tokens'] })
      toast.success('Work link revoked')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to revoke link'),
  })
}
