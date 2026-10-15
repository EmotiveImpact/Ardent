/**
 * Monthly Statement of Compliance — read hook + admin "Generate now"
 * mutation.
 *
 * Strategic 1 follow-up. The statement_of_compliance table is written
 * once per month per org by the generate-statement-of-compliance edge
 * function (pg_cron, 06:00 UTC on the 1st). This hook surfaces the
 * history for the dashboard widget + the dedicated /dashboard/compliance/statements
 * route.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { toLocalYmd } from '@/lib/time-tracking/compute'

export interface StatementBreakdownAvg {
  compliance: number
  ppm_on_time: number
  pass_rate: number
  action_health: number
}

export interface StatementOfComplianceRow {
  id: string
  organisation_id: string
  period_start: string
  period_end: string
  score_avg: number
  score_min: number
  score_max: number
  breakdown_avg: StatementBreakdownAvg
  /** Storage path inside the statements-of-compliance bucket. */
  pdf_url: string | null
  email_sent_at: string | null
  created_at: string
}

const STALE_TIME_MS = 5 * 60 * 1000 // statements are monthly — no point refetching often

interface UseStatementsOptions {
  /** Page size — default 12 (one year of monthly statements). */
  limit?: number
}

/**
 * Pure helper — derives the [period_start, period_end] for the
 * calendar month `offsetMonths` away from `now`. offsetMonths = -1 →
 * previous full month (the cron's default). Mirrors the helper in the
 * edge function so both sides agree on what "April 2026" means.
 *
 * Examples (now = 2026-05-09):
 *   derivePeriodRange(now, -1) → { period_start: '2026-04-01', period_end: '2026-04-30' }
 *   derivePeriodRange(now,  0) → { period_start: '2026-05-01', period_end: '2026-05-31' }
 */
export function derivePeriodRange(
  now: Date,
  offsetMonths: number,
): { period_start: string; period_end: string } {
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0)
  return {
    period_start: toLocalYmd(start),
    period_end: toLocalYmd(end),
  }
}

/**
 * List the most recent statements for the current organisation, sorted
 * by period descending. RLS already restricts to the user's org but we
 * still filter explicitly so the (org, period_start desc) index is
 * used.
 */
export function useStatementsOfCompliance(options: UseStatementsOptions = {}) {
  const limit = options.limit ?? 12
  const { organisation } = useAuth()
  const orgId = organisation?.id ?? null

  return useQuery<StatementOfComplianceRow[]>({
    queryKey: ['statements-of-compliance', orgId, limit],
    enabled: !!orgId,
    staleTime: STALE_TIME_MS,
    queryFn: async () => {
      if (!orgId) return []
      const { data, error } = await supabase
        .from('statement_of_compliance')
        .select(
          'id, organisation_id, period_start, period_end, score_avg, score_min, score_max, breakdown_avg, pdf_url, email_sent_at, created_at',
        )
        .eq('organisation_id', orgId)
        .order('period_start', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as StatementOfComplianceRow[]
    },
  })
}

/**
 * Admin-only mutation — calls the generate-statement-of-compliance
 * edge function for the current org. The edge function defaults to the
 * previous full calendar month; pass `period_start` to target a
 * different month.
 */
export function useGenerateStatementNow() {
  const { organisation } = useAuth()
  const orgId = organisation?.id ?? null
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input?: { period_start?: string }) => {
      if (!orgId) throw new Error('No organisation context')
      const { data, error } = await supabase.functions.invoke('generate-statement-of-compliance', {
        body: {
          organisation_id: orgId,
          ...(input?.period_start ? { period_start: input.period_start } : {}),
        },
      })
      if (error) throw error
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error))
      }
      return data as {
        period_start: string
        period_end: string
        organisations_processed: number
        pdf_render_mode: 'browserless' | 'html_only'
        results: Array<{ organisation_id: string; status: string; message: string }>
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements-of-compliance'] })
    },
  })
}

/**
 * Mint a short-lived signed URL for the PDF (or HTML fallback) stored
 * at `pdf_url`. Returns null when the column is empty. Used by the
 * "Download" buttons on the dashboard widget + history page.
 */
export async function getSignedStatementUrl(
  storagePath: string | null,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string | null> {
  if (!storagePath) return null
  const { data, error } = await supabase.storage
    .from('statements-of-compliance')
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) {
    console.warn('[statements-of-compliance] signed URL failed:', error.message)
    return null
  }
  return data?.signedUrl ?? null
}
