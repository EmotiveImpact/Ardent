import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Row shape for the `notifications` table (verified columns only).
export interface MobileNotification {
  id: string
  user_id: string
  organisation_id: string
  title: string
  message: string | null
  read: boolean
  notification_type: string | null
  link: string | null
  created_at: string
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<MobileNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async (opts?: { silent?: boolean }) => {
    // `silent` = background refresh on re-focus; keep the current list painted.
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) throw new Error('Not authenticated')

      const { data, error: fetchError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (fetchError) throw fetchError
      setNotifications((data as MobileNotification[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications')
    } finally {
      // Silent (focus) refetch must not flip the visible loading state — see useJobs.
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const unreadCount = notifications.reduce((n, item) => (item.read ? n : n + 1), 0)

  const markRead = useCallback(async (id: string) => {
    // Optimistic local update — flip the row immediately, then persist.
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
    )
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
    if (updateError) setError(updateError.message)
  }, [])

  const markAllRead = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    if (updateError) setError(updateError.message)
  }, [])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchNotifications,
    markRead,
    markAllRead,
  }
}
