// Pure permit-to-work helpers (00121, W3-T10) — chip state + gate-error
// parsing, unit-tested in permits.test.ts.

import type { Permit } from '@haumea/types'

export type PermitChipState =
  | { state: 'none'; label: string; color: 'danger' }
  | { state: 'requested'; label: string; color: 'warning' }
  | { state: 'issued'; label: string; color: 'warning' }
  | { state: 'active'; label: string; color: 'success' }
  | { state: 'closed'; label: string; color: 'default' }

/** The single most-relevant permit state for a flagged job's header chip:
 *  active > issued > requested > closed; nothing usable = "Permit required". */
export function permitChipState(permits: Pick<Permit, 'status'>[]): PermitChipState {
  if (permits.some((p) => p.status === 'active')) {
    return { state: 'active', label: 'Permit active', color: 'success' }
  }
  if (permits.some((p) => p.status === 'issued')) {
    return { state: 'issued', label: 'Permit issued', color: 'warning' }
  }
  if (permits.some((p) => p.status === 'requested')) {
    return { state: 'requested', label: 'Permit requested', color: 'warning' }
  }
  if (permits.some((p) => p.status === 'closed')) {
    return { state: 'closed', label: 'Permit closed', color: 'default' }
  }
  return { state: 'none', label: 'Permit required', color: 'danger' }
}

const GATE_CODES = [
  'permit_required',
  'permit_invalid_transition',
  'permit_issue_forbidden',
  'requires_permit_clear_forbidden',
] as const
export type PermitGateCode = (typeof GATE_CODES)[number]

/** Postgres raises `<code>: detail` (errcode P0001); supabase-js surfaces it
 *  in error.message. Returns the code when the message is one of ours. */
export function parsePermitGateError(message: string | null | undefined): PermitGateCode | null {
  if (!message) return null
  for (const code of GATE_CODES) {
    if (message.includes(code)) return code
  }
  return null
}

export const PERMIT_GATE_MESSAGES: Record<PermitGateCode, string> = {
  permit_required:
    'This job is flagged permit-to-work — issue a permit before starting work.',
  permit_invalid_transition: 'That permit status change is not allowed.',
  permit_issue_forbidden: 'Only an admin or scheduler can issue a permit.',
  requires_permit_clear_forbidden:
    'Only an admin or scheduler can remove the permit-to-work requirement.',
}
