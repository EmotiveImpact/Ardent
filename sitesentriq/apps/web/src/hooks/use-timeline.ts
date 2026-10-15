import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface TimelineFilters {
  property_id?: string
  client_id?: string
  event_type?: string
}

export function useTimelineEvents(filters?: TimelineFilters) {
  return useQuery({
    queryKey: ['timeline_events', filters],
    queryFn: async () => {
      let query = supabase
        .from('timeline_events')
        .select('*, profiles:user_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (filters?.property_id) {
        query = query.eq('property_id', filters.property_id)
      }
      if (filters?.client_id) {
        query = query.eq('client_id', filters.client_id)
      }
      if (filters?.event_type) {
        query = query.eq('event_type', filters.event_type)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useCreateTimelineEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (event: {
      property_id?: string
      client_id?: string
      event_type: string
      description: string
      user_id?: string
      organisation_id: string
    }) => {
      const { data, error } = await supabase
        .from('timeline_events')
        .insert(event)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline_events'] })
    },
  })
}
