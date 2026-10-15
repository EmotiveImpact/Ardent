import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/contexts/auth-context'
import type { PlanId } from '@/lib/billing/plans'

export interface SubscriptionRow {
  id: string
  organisation_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: PlanId
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused'
  seats: number
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_ends_at: string | null
  created_at: string
  updated_at: string
}

/** Dev-mode fallback so the UI can be exercised without a real Supabase project. */
const DEV_FALLBACK: SubscriptionRow = {
  id: 'dev-sub-001',
  organisation_id: 'dev-org-001',
  stripe_customer_id: null,
  stripe_subscription_id: null,
  plan: 'starter',
  status: 'trialing',
  seats: 3,
  current_period_start: '2026-04-15T00:00:00Z',
  current_period_end: '2026-04-29T00:00:00Z',
  cancel_at_period_end: false,
  trial_ends_at: '2026-04-29T00:00:00Z',
  created_at: '2026-04-15T00:00:00Z',
  updated_at: '2026-04-15T00:00:00Z',
}

const DEV_MODE = !import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

export function useSubscription() {
  const { organisation } = useAuthContext()

  return useQuery<SubscriptionRow | null>({
    queryKey: ['subscription', organisation?.id],
    enabled: !!organisation?.id,
    queryFn: async () => {
      if (DEV_MODE) return DEV_FALLBACK

      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('organisation_id', organisation!.id)
        .maybeSingle()

      if (error) {
        // Don't throw — billing is non-critical for app function.
        // Settle as "no row" so the UI can show a "Set up billing" CTA.
        console.warn('[use-subscription] read error:', error.message)
        return null
      }
      return (data as SubscriptionRow | null) ?? null
    },
    staleTime: 60_000,
  })
}

/** Number of whole days remaining until a date string, or null. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return null
  const diffMs = target - Date.now()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}
