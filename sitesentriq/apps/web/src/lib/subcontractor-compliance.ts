// Pure client-side mirror of public.subcontractor_compliance_status (00116) —
// used for instant badge rendering from already-fetched rows, and unit-tested
// here since the SQL evaluator can only be smoke-tested live. Keep the two in
// lockstep: insurance per required type, ONE accreditation among accepted
// schemes, an APPROVED current RAMS.

import type {
  SubcontractorAccreditation,
  SubcontractorComplianceStatus,
  SubcontractorInsurancePolicy,
  SubcontractorRams,
} from '@haumea/types'

export interface ComplianceRequirements {
  insurance: string[]
  accreditation_any_of: string[]
  rams_required: boolean
}

/** Matches the SQL default in 00116 (UK FM norm: PL + SSIP-family + RAMS). */
export const DEFAULT_REQUIREMENTS: ComplianceRequirements = {
  insurance: ['public_liability'],
  accreditation_any_of: ['ssip', 'chas', 'safecontractor'],
  rams_required: true,
}

export const POLICY_TYPE_LABEL: Record<string, string> = {
  public_liability: 'Public liability',
  employers_liability: "Employers' liability",
  professional_indemnity: 'Professional indemnity',
  contractors_all_risk: 'Contractors all-risk',
  other: 'Other insurance',
}

export const SCHEME_LABEL: Record<string, string> = {
  ssip: 'SSIP',
  chas: 'CHAS',
  safecontractor: 'SafeContractor',
  constructionline: 'Constructionline',
  niceic: 'NICEIC',
  gas_safe: 'Gas Safe',
  other: 'Other scheme',
}

/** date-only string compare against today, timezone-safe (no Date parsing of
 *  date-only values — see the timezone bug class memo). */
function isCurrent(expiry: string | null | undefined): boolean {
  if (!expiry) return true // no expiry recorded = does not expire
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
  return expiry >= todayKey
}

export function evaluateCompliance(
  rows: {
    insurance: Pick<SubcontractorInsurancePolicy, 'policy_type' | 'expiry_date'>[]
    accreditations: Pick<SubcontractorAccreditation, 'scheme' | 'expiry_date'>[]
    rams: Pick<SubcontractorRams, 'approval_status' | 'valid_until'>[]
  },
  requirements: ComplianceRequirements = DEFAULT_REQUIREMENTS,
): SubcontractorComplianceStatus {
  const failures: string[] = []

  for (const type of requirements.insurance) {
    const ok = rows.insurance.some((p) => p.policy_type === type && isCurrent(p.expiry_date))
    if (!ok) failures.push(`insurance:${type}`)
  }

  if (requirements.accreditation_any_of.length > 0) {
    const ok = rows.accreditations.some(
      (a) => requirements.accreditation_any_of.includes(a.scheme) && isCurrent(a.expiry_date),
    )
    if (!ok) failures.push(`accreditation:any_of:${requirements.accreditation_any_of.join('|')}`)
  }

  if (requirements.rams_required) {
    const ok = rows.rams.some((r) => r.approval_status === 'approved' && isCurrent(r.valid_until))
    if (!ok) failures.push('rams:approved_required')
  }

  return { compliant: failures.length === 0, failures }
}

/** "insurance:public_liability" → "Public liability insurance missing or expired" */
export function describeFailure(failure: string): string {
  if (failure.startsWith('insurance:')) {
    const type = failure.slice('insurance:'.length)
    return `${POLICY_TYPE_LABEL[type] ?? type} insurance missing or expired`
  }
  if (failure.startsWith('accreditation:any_of:')) {
    const schemes = failure.slice('accreditation:any_of:'.length).split('|')
    return `No current accreditation (needs one of: ${schemes
      .map((s) => SCHEME_LABEL[s] ?? s)
      .join(', ')})`
  }
  if (failure === 'rams:approved_required') {
    return 'No approved, in-date RAMS on file'
  }
  return failure
}
