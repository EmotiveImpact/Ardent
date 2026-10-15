// SLA computation — pure functions. No Supabase, no React. Easy to unit-test.
//
// A "policy" is a sla_policies row. A "job" is anything with at least
// `priority`, optionally `category`, optionally response_target_at /
// response_at / completion_target_at / status / completed_date / created_at.

export interface SlaPolicy {
  id: string
  organisation_id: string
  name: string
  applies_to_priority: string | null
  applies_to_category: string | null
  response_minutes: number
  completion_minutes: number
  business_hours_only: boolean
  is_default: boolean
  created_at?: string
  updated_at?: string
}

export interface SlaJobLike {
  priority?: string | null
  category?: string | null
  status?: string | null
  created_at?: string | null
  scheduled_date?: string | null
  completed_date?: string | null
  response_target_at?: string | null
  response_at?: string | null
  completion_target_at?: string | null
  sla_policy_id?: string | null
}

export type SlaState = 'pending' | 'met' | 'breached' | 'at_risk' | 'no_policy'

export interface SlaStatus {
  response: SlaState
  completion: SlaState
  /** Minutes remaining vs response_target_at (negative ⇒ overdue). null when no target. */
  responseRemaining: number | null
  /** Minutes remaining vs completion_target_at (negative ⇒ overdue). null when no target. */
  completionRemaining: number | null
}

// ── findMatchingPolicy ────────────────────────────────────
// Picks the best policy match for a job. Specificity:
//   1. exact priority + exact category
//   2. priority match (no category constraint OR matching category)
//   3. is_default = true
// Returns null when nothing matches at all.

export function findMatchingPolicy(
  policies: SlaPolicy[] | undefined | null,
  job: SlaJobLike,
): SlaPolicy | null {
  if (!policies || policies.length === 0) return null
  const priority = (job.priority ?? '').toLowerCase().trim() || null
  const category = (job.category ?? '').toLowerCase().trim() || null

  // 1. exact priority + exact category
  if (priority && category) {
    const exact = policies.find(
      (p) =>
        p.applies_to_priority === priority &&
        p.applies_to_category === category,
    )
    if (exact) return exact
  }

  // 2. priority match — prefer one with no category over a different category
  if (priority) {
    const priMatches = policies.filter(
      (p) => p.applies_to_priority === priority,
    )
    if (priMatches.length > 0) {
      const noCat = priMatches.find((p) => !p.applies_to_category)
      if (noCat) return noCat
      // otherwise: skip — different category constraint shouldn't apply
    }
  }

  // 3. default fallback
  const def = policies.find((p) => p.is_default)
  if (def) return def

  return null
}

// ── Business hours helpers (simple UK Mon–Fri 09:00–17:00) ─

const BIZ_START_HOUR = 9
const BIZ_END_HOUR = 17

function isBusinessHour(d: Date): boolean {
  const day = d.getUTCDay() // 0=Sun..6=Sat. Treat as UK time roughly via UTC for simplicity.
  if (day === 0 || day === 6) return false
  const h = d.getUTCHours()
  return h >= BIZ_START_HOUR && h < BIZ_END_HOUR
}

/** Add `minutes` of *business hours* time to `from`. Used when a policy
 *  is configured business_hours_only — we tick a minute at a time, skipping
 *  weekends and out-of-hours windows. Capped at 1 year of forward search to
 *  avoid runaway loops if config is daft. */
function addBusinessMinutes(from: Date, minutes: number): Date {
  if (minutes <= 0) return new Date(from.getTime())
  let cursor = new Date(from.getTime())
  let remaining = Math.floor(minutes)
  const maxIterations = 60 * 24 * 365 // 1 year of minutes
  let i = 0
  while (remaining > 0 && i < maxIterations) {
    if (isBusinessHour(cursor)) {
      cursor = new Date(cursor.getTime() + 60_000)
      remaining -= 1
    } else {
      // jump forward to next business hour boundary
      cursor = new Date(cursor.getTime() + 60_000)
    }
    i += 1
  }
  return cursor
}

// ── computeTargets ────────────────────────────────────────
// Adds response_minutes / completion_minutes to fromTime.
// If business_hours_only, skip weekends + non-9-5.

export function computeTargets(args: {
  policy: SlaPolicy
  fromTime?: Date | string
}): { response_target_at: string; completion_target_at: string } {
  const { policy } = args
  const from =
    args.fromTime instanceof Date
      ? args.fromTime
      : args.fromTime
        ? new Date(args.fromTime)
        : new Date()

  let respDate: Date
  let compDate: Date

  if (policy.business_hours_only) {
    respDate = addBusinessMinutes(from, policy.response_minutes)
    compDate = addBusinessMinutes(from, policy.completion_minutes)
  } else {
    respDate = new Date(from.getTime() + policy.response_minutes * 60_000)
    compDate = new Date(from.getTime() + policy.completion_minutes * 60_000)
  }

  return {
    response_target_at: respDate.toISOString(),
    completion_target_at: compDate.toISOString(),
  }
}

// ── getSlaStatus ──────────────────────────────────────────
// Derives current state from a job row. Pure — no DB calls.

const AT_RISK_FRACTION = 0.2 // within 20% of target ⇒ at_risk

export function getSlaStatus(job: SlaJobLike, policy?: SlaPolicy | null): SlaStatus {
  const now = Date.now()

  // ── Response leg ─────────────────────────────────────
  let response: SlaState = 'no_policy'
  let responseRemaining: number | null = null

  if (job.response_target_at) {
    const target = Date.parse(job.response_target_at)
    if (!Number.isNaN(target)) {
      const respondedAt = job.response_at ? Date.parse(job.response_at) : null
      if (respondedAt != null && !Number.isNaN(respondedAt)) {
        // Already responded — met or breached based on whether response was in time
        response = respondedAt <= target ? 'met' : 'breached'
        responseRemaining = Math.round((target - respondedAt) / 60_000)
      } else {
        // Pending — compare to now
        responseRemaining = Math.round((target - now) / 60_000)
        if (now > target) {
          response = 'breached'
        } else if (policy && now > target - policy.response_minutes * 60_000 * AT_RISK_FRACTION) {
          response = 'at_risk'
        } else if (!policy) {
          // No policy known but a target exists — derive at_risk from target itself.
          // Fallback: use 20% of (target - now) as buffer? Simplest: just pending.
          response = 'pending'
        } else {
          response = 'pending'
        }
      }
    }
  }

  // ── Completion leg ───────────────────────────────────
  let completion: SlaState = 'no_policy'
  let completionRemaining: number | null = null

  if (job.completion_target_at) {
    const target = Date.parse(job.completion_target_at)
    if (!Number.isNaN(target)) {
      const completedAt =
        job.status === 'completed' && job.completed_date
          ? Date.parse(job.completed_date)
          : null
      if (completedAt != null && !Number.isNaN(completedAt)) {
        completion = completedAt <= target ? 'met' : 'breached'
        completionRemaining = Math.round((target - completedAt) / 60_000)
      } else {
        completionRemaining = Math.round((target - now) / 60_000)
        if (now > target) {
          completion = 'breached'
        } else if (
          policy &&
          now > target - policy.completion_minutes * 60_000 * AT_RISK_FRACTION
        ) {
          completion = 'at_risk'
        } else {
          completion = 'pending'
        }
      }
    }
  }

  return { response, completion, responseRemaining, completionRemaining }
}

// ── formatRemaining ───────────────────────────────────────
// Human-friendly "2h 15m left" / "breached 47m ago" string.

export function formatRemaining(minutes: number | null): string {
  if (minutes == null) return '—'
  const abs = Math.abs(minutes)
  let label: string
  if (abs < 60) {
    label = `${abs}m`
  } else if (abs < 60 * 24) {
    const h = Math.floor(abs / 60)
    const m = abs % 60
    label = m > 0 ? `${h}h ${m}m` : `${h}h`
  } else {
    const d = Math.floor(abs / (60 * 24))
    const h = Math.floor((abs % (60 * 24)) / 60)
    label = h > 0 ? `${d}d ${h}h` : `${d}d`
  }
  return minutes >= 0 ? `${label} left` : `breached ${label} ago`
}

// ── Aggregate "worst-leg" status helper ─────────────────
// For a single chip, surface the worst of the two legs.
export function worstLegState(s: SlaStatus): SlaState {
  const order: Record<SlaState, number> = {
    breached: 4,
    at_risk: 3,
    pending: 2,
    met: 1,
    no_policy: 0,
  }
  return order[s.response] >= order[s.completion] ? s.response : s.completion
}
