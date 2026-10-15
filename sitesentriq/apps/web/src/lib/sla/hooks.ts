// SLA TanStack Query hooks. Co-located with sla compute module.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { SlaPolicy } from './compute'

const SLA_POLICY_KEY = ['sla-policies'] as const

export function useSlaPolicies() {
  return useQuery({
    queryKey: SLA_POLICY_KEY,
    queryFn: async (): Promise<SlaPolicy[]> => {
      const { data, error } = await supabase
        .from('sla_policies')
        .select('*')
        .order('response_minutes', { ascending: true })
      if (error) throw error
      return (data ?? []) as SlaPolicy[]
    },
    staleTime: 60_000,
  })
}

export interface UpsertSlaPolicyInput {
  id?: string
  organisation_id: string
  name: string
  applies_to_priority?: string | null
  applies_to_category?: string | null
  response_minutes: number
  completion_minutes: number
  business_hours_only?: boolean
  is_default?: boolean
}

export function useUpsertSlaPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertSlaPolicyInput) => {
      if (input.id) {
        const { id, ...patch } = input
        const { data, error } = await supabase
          .from('sla_policies')
          .update(patch)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data as SlaPolicy
      }
      const { data, error } = await supabase
        .from('sla_policies')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as SlaPolicy
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.id ? 'SLA policy updated' : 'SLA policy created')
      qc.invalidateQueries({ queryKey: SLA_POLICY_KEY })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save SLA policy'),
  })
}

export function useDeleteSlaPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (policy: Pick<SlaPolicy, 'id' | 'is_default'>) => {
      if (policy.is_default) {
        throw new Error('Cannot delete the default policy')
      }
      const { error } = await supabase
        .from('sla_policies')
        .delete()
        .eq('id', policy.id)
      if (error) throw error
      return policy.id
    },
    onSuccess: () => {
      toast.success('SLA policy deleted')
      qc.invalidateQueries({ queryKey: SLA_POLICY_KEY })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete SLA policy'),
  })
}

export function useSeedDefaultSlaPolicies() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orgId: string) => {
      const { data, error } = await supabase.rpc('seed_default_sla_policies', {
        p_org_id: orgId,
      })
      if (error) throw error
      return (data as number | null) ?? 0
    },
    onSuccess: (inserted) => {
      toast.success(
        inserted > 0
          ? `Seeded ${inserted} default SLA polic${inserted === 1 ? 'y' : 'ies'}`
          : 'No new policies added (already seeded)',
      )
      qc.invalidateQueries({ queryKey: SLA_POLICY_KEY })
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to seed SLA policies'),
  })
}
