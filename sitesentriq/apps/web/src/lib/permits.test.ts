import { describe, expect, it } from 'vitest'
import { permitChipState, parsePermitGateError } from './permits'

describe('permitChipState', () => {
  it('no permits → permit required (danger)', () => {
    expect(permitChipState([])).toMatchObject({ state: 'none', color: 'danger' })
  })

  it('precedence: active > issued > requested > closed', () => {
    expect(
      permitChipState([{ status: 'closed' }, { status: 'requested' }, { status: 'issued' }, { status: 'active' }]),
    ).toMatchObject({ state: 'active', color: 'success' })
    expect(
      permitChipState([{ status: 'requested' }, { status: 'issued' }]),
    ).toMatchObject({ state: 'issued', color: 'warning' })
    expect(permitChipState([{ status: 'requested' }])).toMatchObject({ state: 'requested' })
    expect(permitChipState([{ status: 'closed' }])).toMatchObject({ state: 'closed' })
  })

  it('cancelled/rejected permits do not satisfy anything', () => {
    expect(
      permitChipState([{ status: 'cancelled' }, { status: 'rejected' }]),
    ).toMatchObject({ state: 'none', color: 'danger' })
  })
})

describe('parsePermitGateError', () => {
  it('extracts the gate codes from Postgres messages', () => {
    expect(
      parsePermitGateError('permit_required: job is flagged permit-to-work and has no issued permit'),
    ).toBe('permit_required')
    expect(parsePermitGateError('permit_invalid_transition: active -> requested')).toBe(
      'permit_invalid_transition',
    )
    expect(parsePermitGateError('permit_issue_forbidden: only an admin…')).toBe(
      'permit_issue_forbidden',
    )
    expect(parsePermitGateError('requires_permit_clear_forbidden: only an admin…')).toBe(
      'requires_permit_clear_forbidden',
    )
  })

  it('returns null for unrelated errors', () => {
    expect(parsePermitGateError('subcontractor_not_compliant: rams')).toBeNull()
    expect(parsePermitGateError(undefined)).toBeNull()
  })
})
