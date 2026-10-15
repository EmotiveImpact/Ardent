/**
 * Single source of truth for status → colour mapping.
 *
 * Every status pill / chip / badge in the app should resolve its colours from
 * here so that:
 *   1. The same logical status always renders the same colour everywhere
 *      (no more "overdue is red here, amber there").
 *   2. Colours are expressed ONLY via design tokens (status-*, brand-*,
 *      text-text-*), which adapt across every runtime theme (light, dark,
 *      midnight, glass, luxe). Raw palette tints like `bg-amber-50` render
 *      near-white on dark themes and must never be used for status colour.
 */

/** HeroUI Chip `color` prop union, as used across the app. */
export type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

/** The canonical compliance status union. */
export type ComplianceStatus = 'compliant' | 'due_soon' | 'overdue' | 'non_compliant'

export interface StatusVisual {
  /** Token-only Tailwind classes for a soft pill (bg tint + foreground). */
  className: string
  /** HeroUI Chip `color` variant. */
  chipColor: ChipColor
  /** Human-readable label. */
  label: string
}

/** Compliance status → token-based visual. */
export const COMPLIANCE_STATUS: Record<ComplianceStatus, StatusVisual> = {
  compliant: {
    className: 'bg-status-compliant/10 text-status-compliant',
    chipColor: 'success',
    label: 'Compliant',
  },
  due_soon: {
    className: 'bg-status-due-soon/10 text-status-due-soon',
    chipColor: 'warning',
    label: 'Due Soon',
  },
  overdue: {
    className: 'bg-status-overdue/10 text-status-overdue',
    chipColor: 'danger',
    label: 'Overdue',
  },
  non_compliant: {
    className: 'bg-status-non-compliant/10 text-status-non-compliant',
    chipColor: 'danger',
    label: 'Non-Compliant',
  },
}

/** Resolve a compliance status to its visual, defaulting to `compliant`. */
export function getComplianceStatus(status?: string): StatusVisual {
  return COMPLIANCE_STATUS[(status ?? '') as ComplianceStatus] ?? COMPLIANCE_STATUS.compliant
}

/**
 * Accreditation / certificate lifecycle statuses. These map onto the same
 * underlying compliance tokens so a "Valid" accreditation looks like a
 * "Compliant" item, "Expiring" like "Due Soon", and "Expired" like "Overdue".
 */
export type AccreditationStatus = 'valid' | 'expiring' | 'expired'

const ACCREDITATION_TO_COMPLIANCE: Record<AccreditationStatus, ComplianceStatus> = {
  valid: 'compliant',
  expiring: 'due_soon',
  expired: 'overdue',
}

const ACCREDITATION_LABELS: Record<AccreditationStatus, string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
}

/**
 * Resolve an accreditation status to a token-based visual, re-using the
 * compliance tokens but keeping the accreditation-specific label.
 */
export function getAccreditationStatusVisual(status: AccreditationStatus): StatusVisual {
  const base = COMPLIANCE_STATUS[ACCREDITATION_TO_COMPLIANCE[status]]
  return { ...base, label: ACCREDITATION_LABELS[status] }
}
