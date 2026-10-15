// Sprint 2C — calls the integrations-health edge function and returns
// a typed status manifest for the settings/health page.
//
// Defaults to "all unconfigured" when the function is unreachable so
// the UI degrades gracefully on local-dev / preview environments
// where the function isn't deployed.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type HealthStatus = 'configured' | 'misconfigured' | 'unconfigured'

export interface IntegrationSection {
  status: HealthStatus
  missing?: string[]
  provider?: string | null
  integrationsCount?: number
  tokenCount?: number
}

export interface IntegrationsHealth {
  web_push: IntegrationSection
  expo_push: IntegrationSection
  email: IntegrationSection
  stripe: IntegrationSection
  slack: IntegrationSection
  calendar: IntegrationSection
  ai: IntegrationSection
}

const FALLBACK: IntegrationsHealth = {
  web_push: { status: 'unconfigured' },
  expo_push: { status: 'unconfigured' },
  email: { status: 'unconfigured' },
  stripe: { status: 'unconfigured' },
  slack: { status: 'unconfigured' },
  calendar: { status: 'unconfigured' },
  ai: { status: 'unconfigured' },
}

export function useIntegrationsHealth() {
  return useQuery<IntegrationsHealth>({
    queryKey: ['integrations-health'],
    // Five-minute cache — these change rarely (env var rollouts) and
    // refreshing more often is wasted invocations of the edge function.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('integrations-health', {
        body: {},
      })
      if (error) {
        console.warn('[integrations-health] edge call failed', error.message)
        return FALLBACK
      }
      return (data as IntegrationsHealth | null) ?? FALLBACK
    },
  })
}
