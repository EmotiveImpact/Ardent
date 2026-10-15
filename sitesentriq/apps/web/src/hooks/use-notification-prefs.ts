import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

export type NotificationPrefs = Record<string, { inApp: boolean; email: boolean }>

/** The logged-in user's notification preferences (00112). `{}` when no row. */
export function useNotificationPrefs() {
  const { profile } = useAuth()
  return useQuery<NotificationPrefs>({
    queryKey: ['notification-prefs', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('prefs')
        .eq('user_id', profile!.id)
        .maybeSingle()
      if (error) throw error
      return (data?.prefs ?? {}) as NotificationPrefs
    },
    enabled: !!profile?.id,
  })
}

export function useSaveNotificationPrefs() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (prefs: NotificationPrefs) => {
      if (!profile?.id) throw new Error('Not signed in')
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: profile.id,
            organisation_id: profile.organisation_id ?? null,
            prefs,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs'] })
    },
  })
}
