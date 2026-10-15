// src/lib/deploy-status/hooks.ts
//
// TanStack Query hooks for the Deploy Status DX Panel. Calls the
// `check-deploy-status` Supabase Edge Function which proxies the
// GitHub deployments API.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DeployStatus } from './types'

async function fetchLatestDeployStatus(): Promise<DeployStatus> {
  const { data, error } = await supabase.functions.invoke('check-deploy-status', {
    method: 'GET',
  })
  if (error) {
    // Don't blow up — the panel is "nice to have" telemetry. Pretend
    // it's unconfigured so the UI hides itself rather than rendering
    // a red error inside a red error banner.
    return { unconfigured: true }
  }
  return (data ?? { unconfigured: true }) as DeployStatus
}

/** Fetches the latest production deploy status. Refetches every 5 min
 *  (was 30s) — that's plenty fresh for "did our last deploy break", and
 *  avoids spamming the console with BOOT_ERROR from the cold-starting
 *  edge function. `retry: false` so a single CORS or boot failure
 *  doesn't double-fire. */
export function useLatestDeployStatus() {
  return useQuery<DeployStatus>({
    queryKey: ['deploy-status', 'latest'],
    queryFn: fetchLatestDeployStatus,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
    retry: false,
  })
}
