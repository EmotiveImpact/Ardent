import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useRealtimeSubscription, type RealtimeEvent } from '@/hooks/use-realtime'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

/**
 * Subscribes to the notifications table for the current user.
 * On INSERT, shows a sonner toast and triggers a bell animation via callback.
 */
export function useRealtimeNotifications(onNewNotification?: () => void) {
  const { user } = useAuth()
  const userId = user?.id

  const handleEvent = useCallback(
    (event: RealtimeEvent, payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (event === 'INSERT' && payload.new) {
        const newNotif = payload.new as { title?: string; message?: string }
        // Show toast
        toast.info(newNotif.title || 'New notification', {
          description: newNotif.message,
          duration: 5000,
        })
        // Trigger bell animation callback
        onNewNotification?.()
      }
    },
    [onNewNotification],
  )

  const { status } = useRealtimeSubscription({
    table: 'notifications',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    queryKeys: [['notifications'], ['notifications', 'unread-count']],
    onEvent: handleEvent,
    enabled: !!userId,
  })

  return { status }
}
