import { describe, expect, it } from 'vitest'
import { getInvoiceTotalPaid, getOutstandingInvoiceBalance } from './balance'

describe('invoice balance helpers', () => {
  it('sums existing payment rows', () => {
    expect(getInvoiceTotalPaid([{ amount: 25 }, { amount: 50.5 }])).toBe(75.5)
  })

  it('returns only the outstanding balance for partially paid invoices', () => {
    expect(getOutstandingInvoiceBalance(120, [{ amount: 40 }, { amount: 25 }])).toBe(55)
  })

  it('never returns a negative outstanding balance', () => {
    expect(getOutstandingInvoiceBalance(100, [{ amount: 120 }])).toBe(0)
  })
})
