import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type { Note } from '@haumea/types'

interface NoteFilters {
  propertyId?: string
  assetId?: string
  jobId?: string
  clientId?: string
}

function buildQueryKey(filters: NoteFilters) {
  return ['notes', filters.propertyId, filters.assetId, filters.jobId, filters.clientId]
}

export function useNotes(filters: NoteFilters) {
  return useQuery({
    queryKey: buildQueryKey(filters),
    queryFn: async () => {
      let query = supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false })

      if (filters.propertyId) query = query.eq('property_id', filters.propertyId)
      if (filters.assetId) query = query.eq('asset_id', filters.assetId)
      if (filters.jobId) query = query.eq('job_id', filters.jobId)
      if (filters.clientId) query = query.eq('client_id', filters.clientId)

      const { data, error } = await query
      if (error) throw error
      return data as Note[]
    },
    enabled: !!(filters.propertyId || filters.assetId || filters.jobId || filters.clientId),
  })
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (note: Partial<Note>) => {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          ...note,
          organisation_id: note.organisation_id || profile?.organisation_id,
          user_id: profile?.id,
          user_name: note.user_name || profile?.full_name,
        })
        .select()
        .single()
      if (error) throw error
      return data as Note
    },
    onSuccess: () => {
      toast.success('Note added')
      // Invalidate by the ['notes'] PREFIX. The per-filter key uses `undefined`
      // for unset segments, but the inserted row returns `null` — and TanStack
      // Query v5 treats null !== undefined, so a fully-specified key never
      // matched the active query and the list didn't refresh. Prefix-match does.
      queryClient.invalidateQueries({ queryKey: ['notes'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add note')
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, filters }: { id: string; filters: NoteFilters }) => {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
      return filters
    },
    onSuccess: (filters) => {
      toast.success('Note deleted')
      queryClient.invalidateQueries({ queryKey: buildQueryKey(filters) })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete note')
    },
  })
}
