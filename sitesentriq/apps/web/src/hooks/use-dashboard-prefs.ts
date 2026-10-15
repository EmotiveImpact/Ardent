import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { DashboardLayoutEntry } from '@/lib/dashboard-widgets'

/** The logged-in user's saved dashboard layout (00115). `[]` when no row —
 *  mergeLayout() turns that into the registry default. */
export function useDashboardPrefs() {
  const { profile } = useAuth()
  return useQuery<DashboardLayoutEntry[]>({
    queryKey: ['dashboard-prefs', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_widget_prefs')
        .select('layout')
        .eq('user_id', profile!.id)
        .maybeSingle()
      if (error) throw error
      return (data?.layout ?? []) as DashboardLayoutEntry[]
    },
    enabled: !!profile?.id,
  })
}

export function useSaveDashboardPrefs() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (layout: DashboardLayoutEntry[]) => {
      if (!profile?.id) throw new Error('Not signed in')
      const { error } = await supabase
        .from('dashboard_widget_prefs')
        .upsert(
          {
            user_id: profile.id,
            organisation_id: profile.organisation_id ?? null,
            layout,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-prefs'] })
    },
  })
}

/** Reset = delete the row; the dashboard falls back to the registry default. */
export function useResetDashboardPrefs() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Not signed in')
      const { error } = await supabase
        .from('dashboard_widget_prefs')
        .delete()
        .eq('user_id', profile.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-prefs'] })
    },
  })
}
