/**
 * Continuous Compliance Score — read hook for the dashboard hero tile.
 *
 * Fetches the two most recent compliance_score_snapshots rows for the
 * current user's organisation: today (or the most recent), plus the
 * one immediately before it for delta-vs-yesterday.
 *
 * The snapshots themselves are produced by the
 * compute-compliance-scores edge function (Strategic 1). If no
 * snapshot exists yet (brand-new tenant, first day, before the cron
 * has run), the hook returns `null` and the UI shows an empty state.
 */

import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { ScoreBreakdown } from '@/lib/compliance-score/calculate'

export interface ComplianceScoreData {
  score: number
  breakdown: ScoreBreakdown
  /**
   * Difference vs the previous snapshot. Positive = improved. Zero
   * when there's no previous snapshot OR the score is unchanged.
   */
  deltaVsYesterday: number
  /** snapshot_date (YYYY-MM-DD) of the most recent snapshot. */
  lastUpdated: string
}

interface SnapshotRow {
  snapshot_date: string
  score: number
  // breakdown jsonb may include extra fields (weights, version) that
  // we ignore at read-time. Only the four sub-metrics are read here.
  breakdown: ScoreBreakdown & Record<string, unknown>
}

const STALE_TIME_MS = 5 * 60 * 1000 // 5 minutes — cron runs daily, no need to refetch sooner

const EMPTY_BREAKDOWN: ScoreBreakdown = {
  compliance: 0,
  ppm_on_time: 0,
  pass_rate: 0,
  action_health: 0,
}

/**
 * Defensive read of the breakdown jsonb so a partial / pre-Strategic-1
 * shape (e.g. legacy seed data) doesn't crash the dashboard.
 */
function readBreakdown(input: SnapshotRow['breakdown'] | null | undefined): ScoreBreakdown {
  if (!input) return { ...EMPTY_BREAKDOWN }
  return {
    compliance: typeof input.compliance === 'number' ? input.compliance : 0,
    ppm_on_time: typeof input.ppm_on_time === 'number' ? input.ppm_on_time : 0,
    pass_rate: typeof input.pass_rate === 'number' ? input.pass_rate : 0,
    action_health: typeof input.action_health === 'number' ? input.action_health : 0,
  }
}

export function useComplianceScore() {
  const { organisation } = useAuth()
  const orgId = organisation?.id ?? null

  return useQuery<ComplianceScoreData | null>({
    queryKey: ['compliance-score', orgId],
    enabled: !!orgId,
    staleTime: STALE_TIME_MS,
    queryFn: async (): Promise<ComplianceScoreData | null> => {
      if (!orgId) return null

      // Pull the 2 most recent snapshots in one round-trip. RLS already
      // restricts to this user's org, but we still pass organisation_id
      // explicitly so the query plan can use the (org, date desc) index.
      const { data, error } = await supabase
        .from('compliance_score_snapshots')
        .select('snapshot_date, score, breakdown')
        .eq('organisation_id', orgId)
        .order('snapshot_date', { ascending: false })
        .limit(2)
      if (error) throw error

      const rows = (data as SnapshotRow[] | null) ?? []
      if (rows.length === 0) return null

      const latest = rows[0]
      const previous = rows[1] ?? null

      return {
        score: latest.score,
        breakdown: readBreakdown(latest.breakdown),
        deltaVsYesterday: previous ? latest.score - previous.score : 0,
        lastUpdated: latest.snapshot_date,
      }
    },
  })
}
