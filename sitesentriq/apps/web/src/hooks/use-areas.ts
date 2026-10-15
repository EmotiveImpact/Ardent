import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Area } from '@haumea/types'

export function useAreas(propertyId?: string) {
  return useQuery({
    queryKey: ['areas', { propertyId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .eq('property_id', propertyId!)
        .order('name')
      if (error) throw error
      return data as Area[]
    },
    enabled: !!propertyId,
  })
}

export function useAreasWithAssetCount(propertyId?: string) {
  return useQuery({
    queryKey: ['areas', { propertyId, withAssetCount: true }],
    queryFn: async () => {
      // Fetch areas
      const { data: areas, error: areasError } = await supabase
        .from('areas')
        .select('*')
        .eq('property_id', propertyId!)
        .order('name')
      if (areasError) throw areasError

      // Fetch asset counts per area
      const { data: assets, error: assetsError } = await supabase
        .from('assets')
        .select('area_id')
        .eq('property_id', propertyId!)
        .not('area_id', 'is', null)
      if (assetsError) throw assetsError

      const countMap: Record<string, number> = {}
      for (const asset of assets || []) {
        if (asset.area_id) {
          countMap[asset.area_id] = (countMap[asset.area_id] || 0) + 1
        }
      }

      return (areas || []).map((area) => ({
        ...area,
        asset_count: countMap[area.id] || 0,
      })) as (Area & { asset_count: number })[]
    },
    enabled: !!propertyId,
  })
}

export function useCreateArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (area: { property_id: string; name: string; floor?: string; description?: string }) => {
      const { data, error } = await supabase
        .from('areas')
        .insert(area)
        .select()
        .single()
      if (error) throw error
      return data as Area
    },
    onSuccess: (data) => {
      toast.success('Area created successfully')
      queryClient.invalidateQueries({ queryKey: ['areas'] })
      queryClient.invalidateQueries({ queryKey: ['properties', data.property_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create area')
    },
  })
}

export function useUpdateArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; floor?: string | null; description?: string | null }) => {
      const { data, error } = await supabase
        .from('areas')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Area
    },
    onSuccess: (data) => {
      toast.success('Area updated successfully')
      queryClient.invalidateQueries({ queryKey: ['areas'] })
      queryClient.invalidateQueries({ queryKey: ['properties', data.property_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update area')
    },
  })
}

export function useDeleteArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, propertyId }: { id: string; propertyId: string }) => {
      // Check if any assets are linked to this area
      const { count, error: countError } = await supabase
        .from('assets')
        .select('id', { count: 'exact', head: true })
        .eq('area_id', id)
      if (countError) throw countError
      if (count && count > 0) {
        throw new Error(`Cannot delete this area — ${count} asset${count > 1 ? 's are' : ' is'} still linked to it. Reassign or remove them first.`)
      }

      const { error } = await supabase.from('areas').delete().eq('id', id)
      if (error) throw error
      return { propertyId }
    },
    onSuccess: (data) => {
      toast.success('Area deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['areas'] })
      queryClient.invalidateQueries({ queryKey: ['properties', data.propertyId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete area')
    },
  })
}
