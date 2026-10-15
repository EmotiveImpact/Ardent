import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOrganisation } from '@/hooks/use-organisation'
import type { RealtimeChannel } from '@supabase/supabase-js'

const DEV_MODE =
  !import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

interface PresenceMeta {
  user_id: string
  full_name?: string
  online_at: string
}

/**
 * Lightweight Supabase Presence hook scoped to the current organisation.
 * Returns the live count of distinct online users plus an array of names.
 */
export function usePresence() {
  const { organisation } = useOrganisation()
  const { user, profile } = useAuth()
  const profileName = profile?.full_name
  const [count, setCount] = useState(0)
  const [users, setUsers] = useState<PresenceMeta[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (DEV_MODE || !organisation?.id || !user?.id) {
      // In dev mode show a friendly "1" so the pill renders nicely
      setCount(DEV_MODE ? 1 : 0)
      setUsers(
        DEV_MODE && profile
          ? [
              {
                user_id: user?.id ?? 'dev',
                full_name: profileName ?? 'You',
                online_at: new Date().toISOString(),
              },
            ]
          : [],
      )
      return
    }

    const channel = supabase.channel(`presence:org:${organisation.id}`, {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceMeta>()
        const flat: PresenceMeta[] = []
        const seen = new Set<string>()
        Object.values(state).forEach((arr) => {
          arr.forEach((entry) => {
            if (!seen.has(entry.user_id)) {
              seen.add(entry.user_id)
              flat.push(entry)
            }
          })
        })
        setUsers(flat)
        setCount(flat.length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            full_name: profileName ?? user.email?.split('@')[0] ?? 'User',
            online_at: new Date().toISOString(),
          } satisfies PresenceMeta)
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        channelRef.current.untrack().catch(() => {})
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [organisation?.id, user?.id, user?.email, profile, profileName])

  return { count, users }
}
