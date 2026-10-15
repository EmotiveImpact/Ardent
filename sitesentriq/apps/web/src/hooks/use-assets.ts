import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Asset } from '@haumea/types'

export function useAssets(propertyId?: string) {
  return useQuery({
    queryKey: ['assets', { propertyId }],
    queryFn: async () => {
      let query = supabase
        .from('assets')
        .select('*, properties(name), areas(name)')
        .order('name')
        // Wave 17 perf — cap unbounded fetch.
        .limit(200)
      if (propertyId) query = query.eq('property_id', propertyId)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('*, properties(name, address), areas(name)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (asset: Partial<Asset>) => {
      const { data, error } = await supabase
        .from('assets')
        .insert(asset)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Asset created successfully')
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create asset')
    },
  })
}

export function useUpdateAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Asset> & { id: string }) => {
      const { data, error } = await supabase
        .from('assets')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Asset updated successfully')
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      queryClient.invalidateQueries({ queryKey: ['assets', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update asset')
    },
  })
}

export function useDeleteAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Asset deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete asset')
    },
  })
}

export function useBulkDeleteAssets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('assets').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} asset${ids.length !== 1 ? 's' : ''} deleted`)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete assets')
    },
  })
}
