// SLA engine hooks (00117, trust wave W2-T6).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { ContractSlaPolicy, Job, SlaContractPeriodSummary } from '@haumea/types'

const KEY = 'sla'

export function useContractSlaPolicies(contractId: string | undefined) {
  return useQuery<ContractSlaPolicy[]>({
    queryKey: [KEY, 'policies', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_sla_policies')
        .select('*')
        .eq('contract_id', contractId!)
      if (error) throw error
      const order = { urgent: 0, high: 1, medium: 2, low: 3 } as Record<string, number>
      return ((data ?? []) as ContractSlaPolicy[]).sort(
        (a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9),
      )
    },
    enabled: !!contractId,
  })
}

export function useSaveContractSlaPolicy() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      contract_id: string
      priority: ContractSlaPolicy['priority']
      response_minutes: number
      fix_minutes: number
      credit_per_breach: number
    }) => {
      if (!profile?.organisation_id) throw new Error('No organisation')
      const { error } = await supabase.from('contract_sla_policies').upsert(
        { organisation_id: profile.organisation_id, ...input },
        { onConflict: 'contract_id,priority' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('SLA policy saved')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save SLA policy'),
  })
}

export function useDeleteContractSlaPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contract_sla_policies').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (err: Error) => toast.error(err.message || 'Failed to delete SLA policy'),
  })
}

/** Period summary with service-credit maths (SQL fn, caller-RLS-scoped). */
export function useSlaSummary(contractId: string | undefined, from: string, to: string) {
  return useQuery<SlaContractPeriodSummary>({
    queryKey: [KEY, 'summary', contractId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sla_contract_period_summary', {
        p_contract_id: contractId!,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as SlaContractPeriodSummary | undefined
      return row ?? { jobs_total: 0, response_breaches: 0, fix_breaches: 0, credits: 0 }
    },
    enabled: !!contractId,
  })
}

/** Open jobs whose fix target is unmet and due within `hours` (or already
 *  past) — the partial-index query (idx_jobs_sla_open). */
export function useSlaAtRiskJobs(hours = 24) {
  const { profile } = useAuth()
  return useQuery<Job[]>({
    queryKey: [KEY, 'at-risk', hours],
    queryFn: async () => {
      const horizon = new Date(Date.now() + hours * 3600_000).toISOString()
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(name)')
        .not('target_fix_at', 'is', null)
        .is('sla_fix_met_at', null)
        .lte('target_fix_at', horizon)
        .not('status', 'in', '(completed,cancelled)')
        .order('target_fix_at', { ascending: true })
        .limit(25)
      if (error) throw error
      return (data ?? []) as Job[]
    },
    enabled: !!profile?.organisation_id,
  })
}
