import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'

export interface OnboardingState {
  completed: boolean
  current_step?: number
  started_at?: string | null
  completed_at?: string | null
  skipped_steps?: number[]
}

const DEFAULT_STATE: OnboardingState = {
  completed: false,
  current_step: 1,
  started_at: null,
  completed_at: null,
  skipped_steps: [],
}

interface OrgRowSlim {
  id: string
  onboarding_state: OnboardingState | null
}

export function useOnboarding() {
  const { organisation } = useAuthContext()

  return useQuery({
    queryKey: ['onboarding', organisation?.id],
    enabled: !!organisation?.id,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<OnboardingState> => {
      if (!organisation?.id) return DEFAULT_STATE
      const { data, error } = await supabase
        .from('organisations')
        .select('id, onboarding_state')
        .eq('id', organisation.id)
        .maybeSingle<OrgRowSlim>()

      // Migration not yet applied → graceful default (treat as completed
      // so we never block existing dev orgs). Only swallow the specific
      // "column / schema cache doesn't know about onboarding_state" errors.
      // Real DB outages (network, timeout, RLS, anything else) must still
      // bubble up — otherwise we silently mark a brand-new tenant as
      // "onboarding done" and they never see the wizard.
      if (error) {
        const message = error.message?.toLowerCase() ?? ''
        const isMissingColumn =
          // Postgres native: undefined_column
          error.code === '42703' ||
          // PostgREST schema-cache miss for the column.
          (message.includes('onboarding_state') &&
            (message.includes('column') || message.includes('schema cache'))) ||
          // Generic "column ... does not exist" wording.
          (message.includes('column') && message.includes('does not exist'))
        if (isMissingColumn) {
          return { ...DEFAULT_STATE, completed: true }
        }
        throw error
      }
      if (!data) return DEFAULT_STATE
      return { ...DEFAULT_STATE, ...(data.onboarding_state ?? {}) }
    },
  })
}

export function useUpdateOnboardingState() {
  const queryClient = useQueryClient()
  const { organisation } = useAuthContext()

  return useMutation({
    mutationFn: async (patch: Partial<OnboardingState>) => {
      if (!organisation?.id) throw new Error('No organisation found')

      // Read current first so we can merge — Postgres jsonb || would also
      // work via RPC, but we keep this client-side for simplicity.
      const { data: current, error: readErr } = await supabase
        .from('organisations')
        .select('onboarding_state')
        .eq('id', organisation.id)
        .maybeSingle<{ onboarding_state: OnboardingState | null }>()
      if (readErr) throw readErr

      const merged: OnboardingState = {
        ...DEFAULT_STATE,
        ...(current?.onboarding_state ?? {}),
        ...patch,
      }

      const { error } = await supabase
        .from('organisations')
        .update({ onboarding_state: merged })
        .eq('id', organisation.id)
      if (error) throw error
      return merged
    },
    onSuccess: (merged) => {
      queryClient.setQueryData(['onboarding', organisation?.id], merged)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update onboarding state')
    },
  })
}

/**
 * Resets onboarding to a brand-new state — useful for the
 * "Run the onboarding tour again" entry in Settings.
 */
export function useResetOnboarding() {
  const update = useUpdateOnboardingState()
  return useMutation({
    mutationFn: async () => {
      return update.mutateAsync({
        completed: false,
        current_step: 1,
        started_at: new Date().toISOString(),
        completed_at: null,
        skipped_steps: [],
      })
    },
  })
}

/**
 * Calls the seed_sample_data RPC. Used by the "fill with sample data"
 * shortcut on step 1.
 */
export function useSeedSampleData() {
  const queryClient = useQueryClient()
  const { organisation } = useAuthContext()

  return useMutation({
    mutationFn: async () => {
      if (!organisation?.id) throw new Error('No organisation found')
      const { data, error } = await supabase.rpc('seed_sample_data', {
        org_id: organisation.id,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      // The compliance list query key is ['compliance_items'] (see use-compliance.ts),
      // not ['compliance'] — the old key matched nothing, so seeded compliance
      // items didn't appear until a manual refetch.
      queryClient.invalidateQueries({ queryKey: ['compliance_items'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance_plans'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}
