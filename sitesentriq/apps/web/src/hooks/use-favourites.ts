import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type { Favourite } from '@haumea/types'

export function useFavourites() {
  const { profile } = useAuthContext()
  return useQuery({
    queryKey: ['favourites', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('favourites')
        .select('*')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Favourite[]
    },
    enabled: !!profile?.id,
  })
}

export function useIsFavourite(entityType: string, entityId: string) {
  const { data: favourites } = useFavourites()
  const match = favourites?.find(
    (f) => f.entity_type === entityType && f.entity_id === entityId
  )
  return { isFavourite: !!match, favouriteId: match?.id }
}

export function useToggleFavourite() {
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      favouriteId,
    }: {
      entityType: 'client' | 'property' | 'asset' | 'job'
      entityId: string
      favouriteId?: string
    }) => {
      if (favouriteId) {
        // Already favourited — remove it
        const { error } = await supabase.from('favourites').delete().eq('id', favouriteId)
        if (error) throw error
        return { action: 'removed' as const }
      } else {
        // Not favourited — add it
        const { data, error } = await supabase
          .from('favourites')
          .insert({
            user_id: profile!.id,
            organisation_id: profile!.organisation_id,
            entity_type: entityType,
            entity_id: entityId,
          })
          .select()
          .single()
        if (error) throw error
        return { action: 'added' as const, data: data as Favourite }
      }
    },
    onSuccess: (result) => {
      toast.success(result.action === 'added' ? 'Added to favourites' : 'Removed from favourites')
      queryClient.invalidateQueries({ queryKey: ['favourites'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update favourite')
    },
  })
}
