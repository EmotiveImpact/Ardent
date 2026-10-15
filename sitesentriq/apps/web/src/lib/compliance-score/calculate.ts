/**
 * Continuous Compliance Score — pure scoring function.
 *
 * Strategic bet: a single org-level number that goes up. Vanta proved
 * the category for security; we're doing it for FM. The buyer's
 * question is "is my building compliant?" — every other tool answers
 * with red/amber/green per item; we answer with a number.
 *
 * This module is the canonical scoring source. The edge function
 * (supabase/functions/compute-compliance-scores) computes the SAME
 * result on the server; the dashboard hook reads the persisted
 * snapshot. Keeping the math in ONE TypeScript function lets us:
 *   - unit-test it (12+ tests in calculate.test.ts)
 *   - share it between client preview and the cron writer
 *   - change the formula without redeploying SQL
 *
 * Inputs are the bare aggregates each metric needs — the caller is
 * responsible for fetching the right rows (different scopes for
 * "today's score for org X" vs "preview for property Y" vs the cron's
 * per-org sweep).
 */

export interface ScoreInput {
  /** Every compliance_items row in scope. Only `status` is read. */
  compliance_items: { status: string }[]
  /**
   * PPM jobs scheduled in the last 90 days. Used for the
   * on-time-completion %. Both fields ISO-8601 strings (date or
   * timestamptz — only the day-portion matters for the comparison).
   */
  ppm_jobs: { scheduled_date: string | null; completed_date: string | null }[]
  /**
   * Jobs completed in the last 90 days WITH an outcome recorded.
   * Used for first-time-fix / pass rate. Outcome typically one of:
   *   'pass' | 'fail' | 'partial' | null
   * We only count `pass` as positive — partial/fail count against.
   */
  pass_jobs: { outcome: string | null }[]
  /**
   * Count of OPEN actions where priority is 'critical' AND age > 7
   * days. The caller computes this — keeping it as a count (rather
   * than rows) keeps the input shape stable as we evolve the action
   * model.
   */
  overdue_actions_count: number
}

export interface ScoreBreakdown {
  /** % of compliance_items where status is 'compliant' OR 'due_soon'. */
  compliance: number
  /** % of PPM jobs in last 90d completed on or before their scheduled date. */
  ppm_on_time: number
  /** % of completed jobs (last 90d, with outcome) where outcome === 'pass'. */
  pass_rate: number
  /** 100 - clamp(overdue_actions * 5, 0, 100). */
  action_health: number
}

export interface ScoreResult {
  score: number
  breakdown: ScoreBreakdown
}

/**
 * Weight each sub-metric contributes to the headline score.
 *
 * Why these weights:
 *   - Compliance (40%) is the biggest single factor — the question
 *     buyers ask is literally "are we compliant?". The status of the
 *     compliance_items list IS the closest proxy to that.
 *   - PPM-on-time (25%) and pass-rate (25%) jointly measure "are we
 *     actually executing the maintenance that keeps us compliant?".
 *     Splitting on-time vs pass means an org that completes everything
 *     late but passes can't get away with it, and vice versa.
 *   - Action health (10%) is the leading indicator — open critical
 *     defects degrade the score even before they cause a compliance
 *     item to flip overdue. Lower weight because the action_health
 *     score is already harshly penalised (5 pts per overdue action).
 *
 * Sum to 1.00. Change here + redeploy edge function and old snapshots
 * keep their old score (we never recompute history).
 */
const WEIGHTS = {
  compliance: 0.4,
  ppm_on_time: 0.25,
  pass_rate: 0.25,
  action_health: 0.1,
} as const

export const COMPLIANCE_SCORE_OVERDUE_ACTION_PRIORITY = 'critical' as const

const EMPTY_BREAKDOWN: ScoreBreakdown = {
  compliance: 0,
  ppm_on_time: 0,
  pass_rate: 0,
  action_health: 0,
}

const EMPTY_RESULT: ScoreResult = {
  score: 0,
  breakdown: EMPTY_BREAKDOWN,
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  if (n > max) return max
  return n
}

/**
 * Get the day portion (YYYY-MM-DD) of an ISO date / timestamp string.
 * Returns null when the input is missing — callers should treat the
 * job as "not completed yet".
 */
function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  // We rely on string comparison being correct for ISO date strings,
  // so the whole on-time test is "completed_day <= scheduled_day"
  // without any Date parsing. This avoids timezone surprises in the
  // edge function (Deno) where the runtime tz may differ from the
  // browser.
  return iso.slice(0, 10)
}

/**
 * Compute the continuous compliance score for an org from raw inputs.
 *
 * Edge cases:
 *   - Empty input on every dimension → score 0, all-zero breakdown.
 *     A brand-new org with no data has nothing to show — better to
 *     surface that explicitly than to render a misleading "100".
 *   - Empty input on SOME dimensions → that dimension contributes 0
 *     pts × its weight. e.g. an org with 100% compliance but no PPM
 *     jobs and no completed jobs lands at 40 pts (40% × 100, others 0).
 *     This is intentional — we want orgs to get credit for compliance
 *     work AND maintenance execution.
 *   - Action health floor is 0 (>=20 overdue critical actions = 0).
 *
 * Returns ints in 0–100 for the headline + each breakdown component.
 */
export function calculateComplianceScore(input: ScoreInput): ScoreResult {
  const totalSignals =
    input.compliance_items.length +
    input.ppm_jobs.length +
    input.pass_jobs.length +
    input.overdue_actions_count

  if (totalSignals === 0) {
    return { ...EMPTY_RESULT, breakdown: { ...EMPTY_BREAKDOWN } }
  }

  // ── Compliance % ────────────────────────────────────────────────
  // 'compliant' OR 'due_soon' counts as positive — due_soon items
  // aren't OUT of compliance yet, they're an early-warning signal
  // for the ops team. Only 'overdue' / 'non_compliant' / unknown
  // statuses count against.
  const complianceItems = input.compliance_items
  const compliantCount = complianceItems.filter(
    (i) => i.status === 'compliant' || i.status === 'due_soon',
  ).length
  const compliance = complianceItems.length
    ? Math.round((compliantCount / complianceItems.length) * 100)
    : 0

  // ── PPM on-time % ───────────────────────────────────────────────
  // Numerator: PPM jobs completed on or before their scheduled date.
  // Denominator: ALL PPM jobs in the window (incomplete = late).
  // A scheduled job with no completed_date counts as not-on-time —
  // this is deliberate: the score should drop until the work happens.
  const ppmJobs = input.ppm_jobs
  let ppmOnTimeCount = 0
  for (const j of ppmJobs) {
    const scheduledDay = dayOf(j.scheduled_date)
    const completedDay = dayOf(j.completed_date)
    if (!scheduledDay) continue // can't judge; doesn't count toward either side
    if (completedDay && completedDay <= scheduledDay) ppmOnTimeCount++
  }
  // Re-derive denominator from rows with a scheduled_date — rows with
  // no scheduled_date were skipped above and shouldn't dilute the %.
  const ppmDenom = ppmJobs.filter((j) => !!dayOf(j.scheduled_date)).length
  const ppm_on_time = ppmDenom ? Math.round((ppmOnTimeCount / ppmDenom) * 100) : 0

  // ── Pass rate % ─────────────────────────────────────────────────
  // Numerator: jobs with outcome === 'pass'.
  // Denominator: jobs with any non-null outcome (jobs with no outcome
  // recorded yet are excluded — the engineer hasn't called it either
  // way, so it's not evidence either direction).
  const passJobs = input.pass_jobs.filter((j) => j.outcome != null)
  const passCount = passJobs.filter((j) => j.outcome === 'pass').length
  const pass_rate = passJobs.length
    ? Math.round((passCount / passJobs.length) * 100)
    : 0

  // ── Action health ──────────────────────────────────────────────
  // 100 minus 5 pts per open critical action older than 7 days,
  // floored at 0 / capped at 100. With 0 overdue → 100. With 20+
  // overdue → 0. The 5-pt step is intentionally aggressive: we want
  // ops to feel the score dropping when critical defects pile up.
  const action_health = 100 - clamp(input.overdue_actions_count * 5, 0, 100)

  // ── Weighted average → headline score ──────────────────────────
  const raw =
    compliance * WEIGHTS.compliance +
    ppm_on_time * WEIGHTS.ppm_on_time +
    pass_rate * WEIGHTS.pass_rate +
    action_health * WEIGHTS.action_health
  const score = clamp(Math.round(raw), 0, 100)

  return {
    score,
    breakdown: { compliance, ppm_on_time, pass_rate, action_health },
  }
}

/** Exported so the dashboard "How is this calculated?" disclosure can render the same numbers. */
export const COMPLIANCE_SCORE_WEIGHTS = WEIGHTS
