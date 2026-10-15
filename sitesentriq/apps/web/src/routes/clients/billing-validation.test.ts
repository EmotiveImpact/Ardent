// Sprint 1.5 / H3 — Tests for the billing-draft validator.
//
// The validator is exported from clients/[id].tsx so the route file
// stays self-contained, but we test it from a sibling so we don't
// have to render the full client-detail page.

import { describe, expect, it } from 'vitest'
import { validateBillingDraft } from './[id]'

const empty = {
  client_code: '',
  billing_email: '',
  billing_address: '',
  billing_terms: '',
  tax_number: '',
}

describe('validateBillingDraft', () => {
  it('treats all-empty as valid (every field is optional)', () => {
    expect(validateBillingDraft(empty)).toEqual({})
  })

  it('accepts well-formed values from common jurisdictions', () => {
    expect(
      validateBillingDraft({
        ...empty,
        client_code: 'C-1458',
        billing_email: 'accounts@example.com',
        tax_number: 'GB123456789',
      }),
    ).toEqual({})

    expect(
      validateBillingDraft({
        ...empty,
        client_code: 'ACME_001',
        billing_email: 'finance.team+billing@acme.co.uk',
        tax_number: 'IE 1234567X',
      }),
    ).toEqual({})
  })

  it('flags client_code with disallowed punctuation', () => {
    const errs = validateBillingDraft({ ...empty, client_code: 'C/1458' })
    expect(errs.client_code).toBeDefined()
  })

  it('flags client_code that is too short', () => {
    const errs = validateBillingDraft({ ...empty, client_code: 'X' })
    expect(errs.client_code).toBeDefined()
  })

  it('flags malformed email', () => {
    const errs = validateBillingDraft({ ...empty, billing_email: 'not-an-email' })
    expect(errs.billing_email).toBeDefined()
  })

  it('flags email missing TLD', () => {
    const errs = validateBillingDraft({ ...empty, billing_email: 'a@b' })
    expect(errs.billing_email).toBeDefined()
  })

  it('flags tax_number with bad characters', () => {
    const errs = validateBillingDraft({ ...empty, tax_number: 'GB12$45678' })
    expect(errs.tax_number).toBeDefined()
  })

  it('flags tax_number that is too short', () => {
    const errs = validateBillingDraft({ ...empty, tax_number: 'GB1234' })
    expect(errs.tax_number).toBeDefined()
  })

  it('returns multiple errors when multiple fields are wrong', () => {
    const errs = validateBillingDraft({
      ...empty,
      client_code: '!',
      billing_email: 'bogus',
      tax_number: '?',
    })
    expect(Object.keys(errs).sort()).toEqual([
      'billing_email',
      'client_code',
      'tax_number',
    ])
  })

  it('ignores leading/trailing whitespace before validating', () => {
    expect(
      validateBillingDraft({
        ...empty,
        client_code: '  C-1458  ',
        billing_email: '  finance@acme.com  ',
      }),
    ).toEqual({})
  })

  it('does not validate billing_address or billing_terms (free text)', () => {
    expect(
      validateBillingDraft({
        ...empty,
        billing_address: 'whatever the user typed, line 1\nline 2',
        billing_terms: 'Net 30 — pro forma on first invoice',
      }),
    ).toEqual({})
  })
})
