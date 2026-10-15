import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type { TravelRecord, TravelRecordWithRelations } from '@haumea/types'

export function useTravelRecords(engineerId: string | undefined) {
  return useQuery({
    queryKey: ['travel-records', engineerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('travel_records')
        .select('*, jobs(title)')
        .eq('engineer_id', engineerId!)
        .order('travel_date', { ascending: false })
      if (error) throw error
      return data as TravelRecordWithRelations[]
    },
    enabled: !!engineerId,
  })
}

export function useCreateTravelRecord() {
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (record: Partial<TravelRecord>) => {
      const { data, error } = await supabase
        .from('travel_records')
        .insert({ ...record, organisation_id: record.organisation_id || profile?.organisation_id })
        .select()
        .single()
      if (error) throw error
      return data as TravelRecord
    },
    onSuccess: (data) => {
      toast.success('Travel record added')
      queryClient.invalidateQueries({ queryKey: ['travel-records', data.engineer_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add travel record')
    },
  })
}

export function useDeleteTravelRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, engineerId }: { id: string; engineerId: string }) => {
      const { error } = await supabase.from('travel_records').delete().eq('id', id)
      if (error) throw error
      return engineerId
    },
    onSuccess: (engineerId) => {
      toast.success('Travel record deleted')
      queryClient.invalidateQueries({ queryKey: ['travel-records', engineerId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete travel record')
    },
  })
}
