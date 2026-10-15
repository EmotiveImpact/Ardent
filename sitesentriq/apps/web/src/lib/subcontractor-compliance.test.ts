// W2-T5 — client mirror of public.subcontractor_compliance_status (00116).
// The SQL evaluator is smoke-tested live; this guards the same semantics in CI.

import { describe, expect, it } from 'vitest'
import { evaluateCompliance, describeFailure, DEFAULT_REQUIREMENTS } from './subcontractor-compliance'

function localDateKey(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA')
}

const FUTURE = localDateKey(90)
const PAST = localDateKey(-1)

describe('evaluateCompliance', () => {
  it('fails an undocumented subcontractor on all three defaults', () => {
    const result = evaluateCompliance({ insurance: [], accreditations: [], rams: [] })
    expect(result.compliant).toBe(false)
    expect(result.failures).toEqual([
      'insurance:public_liability',
      'accreditation:any_of:ssip|chas|safecontractor',
      'rams:approved_required',
    ])
  })

  it('passes with current PL insurance + one accepted accreditation + approved RAMS', () => {
    const result = evaluateCompliance({
      insurance: [{ policy_type: 'public_liability', expiry_date: FUTURE }],
      accreditations: [{ scheme: 'chas', expiry_date: FUTURE }],
      rams: [{ approval_status: 'approved', valid_until: null }],
    })
    expect(result).toEqual({ compliant: true, failures: [] })
  })

  it('expired insurance fails; a different current policy type does not substitute', () => {
    const result = evaluateCompliance({
      insurance: [
        { policy_type: 'public_liability', expiry_date: PAST },
        { policy_type: 'employers_liability', expiry_date: FUTURE },
      ],
      accreditations: [{ scheme: 'ssip', expiry_date: null }],
      rams: [{ approval_status: 'approved', valid_until: FUTURE }],
    })
    expect(result.failures).toEqual(['insurance:public_liability'])
  })

  it('a null accreditation expiry counts as current; non-accepted schemes do not count', () => {
    const ok = evaluateCompliance({
      insurance: [{ policy_type: 'public_liability', expiry_date: FUTURE }],
      accreditations: [{ scheme: 'safecontractor', expiry_date: null }],
      rams: [{ approval_status: 'approved', valid_until: null }],
    })
    expect(ok.compliant).toBe(true)

    const wrongScheme = evaluateCompliance({
      insurance: [{ policy_type: 'public_liability', expiry_date: FUTURE }],
      accreditations: [{ scheme: 'niceic', expiry_date: FUTURE }], // not in any_of
      rams: [{ approval_status: 'approved', valid_until: null }],
    })
    expect(wrongScheme.failures).toEqual(['accreditation:any_of:ssip|chas|safecontractor'])
  })

  it('pending/rejected/expired RAMS do not satisfy the requirement', () => {
    const base = {
      insurance: [{ policy_type: 'public_liability', expiry_date: FUTURE }],
      accreditations: [{ scheme: 'ssip', expiry_date: null }],
    }
    expect(
      evaluateCompliance({ ...base, rams: [{ approval_status: 'pending', valid_until: null }] })
        .failures,
    ).toEqual(['rams:approved_required'])
    expect(
      evaluateCompliance({ ...base, rams: [{ approval_status: 'approved', valid_until: PAST }] })
        .failures,
    ).toEqual(['rams:approved_required'])
  })

  it('respects a custom requirements matrix', () => {
    const result = evaluateCompliance(
      { insurance: [], accreditations: [], rams: [] },
      { insurance: [], accreditation_any_of: [], rams_required: false },
    )
    expect(result.compliant).toBe(true)
  })

  it('today is still current (>= comparison, local date key)', () => {
    const today = localDateKey(0)
    const result = evaluateCompliance({
      insurance: [{ policy_type: 'public_liability', expiry_date: today }],
      accreditations: [{ scheme: 'chas', expiry_date: today }],
      rams: [{ approval_status: 'approved', valid_until: today }],
    })
    expect(result.compliant).toBe(true)
  })
})

describe('describeFailure', () => {
  it('humanises each failure code', () => {
    expect(describeFailure('insurance:public_liability')).toBe(
      'Public liability insurance missing or expired',
    )
    expect(describeFailure('accreditation:any_of:ssip|chas')).toBe(
      'No current accreditation (needs one of: SSIP, CHAS)',
    )
    expect(describeFailure('rams:approved_required')).toBe('No approved, in-date RAMS on file')
  })

  it('matches the SQL default requirements', () => {
    expect(DEFAULT_REQUIREMENTS).toEqual({
      insurance: ['public_liability'],
      accreditation_any_of: ['ssip', 'chas', 'safecontractor'],
      rams_required: true,
    })
  })
})
