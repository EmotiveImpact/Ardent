import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
    },
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
      if (error) throw error
      return count ?? 0
    },
  })
}

interface NotificationRow {
  id: string
  read: boolean
  [key: string]: unknown
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
      if (error) throw error
    },
    // Optimistic update: flip `read` immediately + decrement unread count
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const prevList = queryClient.getQueryData<NotificationRow[]>(['notifications'])
      const prevCount = queryClient.getQueryData<number>(['notifications', 'unread-count'])

      if (prevList) {
        queryClient.setQueryData<NotificationRow[]>(
          ['notifications'],
          prevList.map((n) => (n.id === id ? { ...n, read: true } : n)),
        )
      }
      if (typeof prevCount === 'number') {
        queryClient.setQueryData<number>(
          ['notifications', 'unread-count'],
          Math.max(0, prevCount - 1),
        )
      }
      return { prevList, prevCount }
    },
    onError: (error: Error, _id, context) => {
      // Rollback on failure
      if (context?.prevList) {
        queryClient.setQueryData(['notifications'], context.prevList)
      }
      if (typeof context?.prevCount === 'number') {
        queryClient.setQueryData(['notifications', 'unread-count'], context.prevCount)
      }
      toast.error(error.message || 'Failed to mark notification as read')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('read', false)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('All notifications marked as read')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark all notifications as read')
    },
  })
}
