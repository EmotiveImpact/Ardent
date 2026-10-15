import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Property } from '@haumea/types'

export function useProperties(clientId?: string) {
  return useQuery({
    queryKey: ['properties', { clientId }],
    queryFn: async () => {
      let query = supabase
        .from('properties')
        .select('*, clients(name)')
        .order('name')
        // Wave 17 perf — cap unbounded fetch. The properties list page
        // can paginate later; capping prevents the worst case.
        .limit(200)
      if (clientId) {
        query = query.eq('client_id', clientId)
      }
      const { data, error } = await query
      if (error) throw error
      return data as (Property & { clients: { name: string } | null })[]
    },
  })
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: ['properties', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*, clients(id, name, contact_email, contact_phone, billing_email, billing_address, billing_terms, tax_number), areas(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (property: Partial<Property>) => {
      const { data, error } = await supabase
        .from('properties')
        .insert(property)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Property created successfully')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['properties_with_status'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create property')
    },
  })
}

export function useUpdateProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Property> & { id: string }) => {
      const { data, error } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Property updated successfully')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['properties_with_status'] })
      queryClient.invalidateQueries({ queryKey: ['properties', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update property')
    },
  })
}

export function useDeleteProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('properties').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Property deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['properties_with_status'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete property')
    },
  })
}

export function useBulkDeleteProperties() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('properties').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} propert${ids.length !== 1 ? 'ies' : 'y'} deleted`)
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['properties_with_status'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete properties')
    },
  })
}
