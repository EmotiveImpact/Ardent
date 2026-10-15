// Pure CONTRACT-SLA state math (trust wave W2-T6). Targets are STAMPED on
// jobs at creation by the 00117 trigger from the client's contract policy
// (immutable evidence); this module only interprets them for display.
//
// Distinct from lib/sla/ (00030): that is the ORG-level operational system
// (org-wide policies, client-side stamping). This is the COMMERCIAL layer —
// per-contract commitments with service-credit maths. Unifying them is a
// known follow-up (see TRUST_COMPLIANCE_WAVE_PLAN.md).

export type SlaState =
  | 'no_sla'
  | 'on_track'
  | 'at_risk'
  | 'response_breached'
  | 'fix_breached'
  | 'met'

export interface SlaJobFields {
  created_at: string
  target_response_at?: string | null
  target_fix_at?: string | null
  sla_response_met_at?: string | null
  sla_fix_met_at?: string | null
}

/** Less than this fraction of the fix window remaining = at risk. */
const AT_RISK_FRACTION = 0.25

export function slaState(job: SlaJobFields, now: Date = new Date()): SlaState {
  if (!job.target_response_at && !job.target_fix_at) return 'no_sla'
  const t = now.getTime()

  const respTarget = job.target_response_at ? new Date(job.target_response_at).getTime() : null
  const respMet = job.sla_response_met_at ? new Date(job.sla_response_met_at).getTime() : null
  const fixTarget = job.target_fix_at ? new Date(job.target_fix_at).getTime() : null
  const fixMet = job.sla_fix_met_at ? new Date(job.sla_fix_met_at).getTime() : null

  // Fix breached dominates (it's the commercial one), then response.
  if (fixTarget != null && (fixMet != null ? fixMet > fixTarget : t > fixTarget)) {
    return 'fix_breached'
  }
  if (respTarget != null && (respMet != null ? respMet > respTarget : t > respTarget)) {
    return 'response_breached'
  }
  // Everything that has a target is met (early or on time).
  if ((fixTarget == null || fixMet != null) && (respTarget == null || respMet != null)) {
    return 'met'
  }
  // Open with time left — at risk when <25% of the fix window remains.
  if (fixTarget != null && fixMet == null) {
    const created = new Date(job.created_at).getTime()
    const window = fixTarget - created
    if (window > 0 && fixTarget - t < window * AT_RISK_FRACTION) return 'at_risk'
  }
  return 'on_track'
}

/** "1h 23m" / "3d 4h" / "12m" — for countdown chips. Negative = overdue. */
export function formatCountdown(targetIso: string, now: Date = new Date()): string {
  const ms = new Date(targetIso).getTime() - now.getTime()
  const abs = Math.abs(ms)
  const mins = Math.floor(abs / 60_000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const remMins = mins % 60
  let label: string
  if (days > 0) label = `${days}d ${hours}h`
  else if (hours > 0) label = `${hours}h ${remMins}m`
  else label = `${remMins}m`
  return ms < 0 ? `${label} over` : label
}

export const SLA_STATE_LABEL: Record<SlaState, string> = {
  no_sla: 'No contract SLA',
  on_track: 'Contract SLA on track',
  at_risk: 'Contract SLA at risk',
  response_breached: 'Response breached',
  fix_breached: 'Fix breached',
  met: 'Contract SLA met',
}

export const SLA_STATE_COLOR: Record<SlaState, 'default' | 'success' | 'warning' | 'danger'> = {
  no_sla: 'default',
  on_track: 'success',
  at_risk: 'warning',
  response_breached: 'danger',
  fix_breached: 'danger',
  met: 'success',
}
