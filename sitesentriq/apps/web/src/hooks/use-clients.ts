import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Client } from '@haumea/types'

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, properties(count)')
        .order('name')
        // Wave 17 perf — cap unbounded fetch. Client lists in the wild
        // tend to be smaller than properties/jobs, but we still don't
        // want a 5k-row response to block dashboard render.
        .limit(200)
      if (error) throw error
      return data as (Client & { properties: { count: number }[] })[]
    },
  })
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, properties(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (client: Partial<Client>) => {
      const { data, error } = await supabase
        .from('clients')
        .insert(client)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Client created successfully')
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create client')
    },
  })
}

export function useUpdateClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase
        .from('clients')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Client updated successfully')
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['clients', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update client')
    },
  })
}

export function useDeleteClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Client deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete client')
    },
  })
}

export function useBulkDeleteClients() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('clients').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} client${ids.length !== 1 ? 's' : ''} deleted`)
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete clients')
    },
  })
}
