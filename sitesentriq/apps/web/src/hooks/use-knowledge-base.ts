import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type { KBArticle } from '@haumea/types'

interface KBFilters {
  category?: string
  search?: string
}

export function useKBArticles(filters?: KBFilters) {
  return useQuery({
    queryKey: ['kb-articles', filters],
    queryFn: async () => {
      let query = supabase
        .from('kb_articles')
        .select('*')
        .order('updated_at', { ascending: false })

      if (filters?.category) query = query.eq('category', filters.category)
      if (filters?.search) query = query.ilike('title', `%${filters.search}%`)

      const { data, error } = await query
      if (error) throw error
      return data as KBArticle[]
    },
  })
}

export function useKBArticle(id: string) {
  return useQuery({
    queryKey: ['kb-articles', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as KBArticle
    },
    enabled: !!id,
  })
}

export function useCreateKBArticle() {
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (article: Partial<KBArticle>) => {
      const { data, error } = await supabase
        .from('kb_articles')
        .insert({
          ...article,
          organisation_id: article.organisation_id || profile?.organisation_id,
          author_id: profile?.id,
          author_name: article.author_name || profile?.full_name,
        })
        .select()
        .single()
      if (error) throw error
      return data as KBArticle
    },
    onSuccess: () => {
      toast.success('Article created successfully')
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create article')
    },
  })
}

export function useUpdateKBArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<KBArticle> & { id: string }) => {
      const { data, error } = await supabase
        .from('kb_articles')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as KBArticle
    },
    onSuccess: (data) => {
      toast.success('Article updated successfully')
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
      queryClient.invalidateQueries({ queryKey: ['kb-articles', data.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update article')
    },
  })
}

export function useDeleteKBArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kb_articles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Article deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['kb-articles'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete article')
    },
  })
}
