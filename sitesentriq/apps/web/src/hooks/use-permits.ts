// Permit-to-work hooks (00121, W3-T10).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { parsePermitGateError, PERMIT_GATE_MESSAGES } from '@/lib/permits'
import type { Permit, PermitType } from '@haumea/types'

export function useJobPermits(jobId: string | undefined) {
  return useQuery<Permit[]>({
    queryKey: ['permits', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permits')
        .select('*')
        .eq('job_id', jobId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Permit[]
    },
    enabled: !!jobId,
  })
}

function surfacePermitError(err: Error, fallback: string) {
  const code = parsePermitGateError(err.message)
  toast.error(code ? PERMIT_GATE_MESSAGES[code] : err.message || fallback)
}

export function useRequestPermit() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      jobId: string
      propertyId: string
      permitType: PermitType
      ramsId?: string | null
    }) => {
      if (!profile?.organisation_id) throw new Error('No organisation')
      const { error } = await supabase.from('permits').insert({
        organisation_id: profile.organisation_id,
        job_id: input.jobId,
        property_id: input.propertyId,
        permit_type: input.permitType,
        rams_id: input.ramsId ?? null,
        requested_by: profile.id,
      })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['permits', vars.jobId] })
      toast.success('Permit requested')
    },
    onError: (err: Error) => surfacePermitError(err, 'Failed to request permit'),
  })
}

export function useUpdatePermit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      jobId: string
      patch: Partial<Pick<Permit, 'status' | 'conditions' | 'valid_from' | 'valid_to'>>
    }) => {
      const { error } = await supabase.from('permits').update(input.patch).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['permits', vars.jobId] })
      if (vars.patch.status) {
        toast.success(
          vars.patch.status === 'issued'
            ? 'Permit issued'
            : vars.patch.status === 'closed'
              ? 'Permit closed'
              : `Permit ${vars.patch.status}`,
        )
      }
    },
    onError: (err: Error) => surfacePermitError(err, 'Failed to update permit'),
  })
}
