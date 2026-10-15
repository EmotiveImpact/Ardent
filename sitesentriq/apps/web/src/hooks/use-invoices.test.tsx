// Critical-fix #4 — locks down "Mark Paid writes a payments row".
//
// Previously the Mark Paid button only updated invoices.status / paid_date
// and the payments table stayed empty for those invoices, breaking
// reconciliation. These tests guard the fix at the hook level so a future
// "simplification" can't silently regress it.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  const sb = createSupabaseMock()
  ;(globalThis as Record<string, unknown>).__sb_invoices__ = sb
  return { supabase: sb }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { useMarkInvoicePaid, useCreatePayment } from './use-invoices'
import { toast } from 'sonner'
import type { SupabaseMockBuilder } from '@/test/supabase-mock'

const sb = (globalThis as Record<string, unknown>).__sb_invoices__ as SupabaseMockBuilder

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const INVOICE_ARG = {
  id: 'inv-1',
  organisation_id: 'org-1',
  total: 1234.56,
}

beforeEach(() => {
  sb.reset()
  ;(toast.success as ReturnType<typeof vi.fn>).mockClear()
  ;(toast.error as ReturnType<typeof vi.fn>).mockClear()
})

describe('useMarkInvoicePaid', () => {
  it('writes a payments row AND flips the invoice to paid', async () => {
    // Sequence inside the hook:
    //   1. payments insert+select+single → returned payment row
    //   2. invoices update+eq+select+single → returned invoice row
    sb.queueResults([
      { data: { id: 'pay-1', amount: 1234.56 }, error: null },
      { data: { id: 'inv-1', status: 'paid', paid_date: '2026-05-09' }, error: null },
    ])

    const { result } = renderHook(() => useMarkInvoicePaid(), { wrapper: wrapper() })
    const out = await result.current.mutateAsync(INVOICE_ARG)

    // Both side-effects landed.
    expect(out.payment).toEqual({ id: 'pay-1', amount: 1234.56 })
    expect(out.invoice).toEqual({ id: 'inv-1', status: 'paid', paid_date: '2026-05-09' })

    // Order matters: payments first, then invoices.
    const fromCalls = sb.from.mock.calls.map((c) => c[0])
    expect(fromCalls).toEqual(['payments', 'invoices'])

    // The payment must reflect the full invoice total + tenant id.
    const paymentInsert = sb.insert.mock.calls.find((c) => {
      const p = c[0] as { invoice_id?: string; amount?: number }
      return p.invoice_id === 'inv-1' && p.amount === 1234.56
    })
    expect(paymentInsert).toBeDefined()
    expect(paymentInsert![0]).toMatchObject({
      invoice_id: 'inv-1',
      organisation_id: 'org-1',
      amount: 1234.56,
      payment_method: 'other',
      reference: 'Marked paid manually',
    })
    // paid_at is "now" — just assert it's an ISO timestamp string.
    expect((paymentInsert![0] as { paid_at?: string }).paid_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    )

    // The invoice update is paid + paid_date as YYYY-MM-DD.
    const invoiceUpdate = sb.update.mock.calls.find((c) => {
      const p = c[0] as { status?: string }
      return p.status === 'paid'
    })
    expect(invoiceUpdate).toBeDefined()
    expect((invoiceUpdate![0] as { paid_date?: string }).paid_date).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )

    expect(toast.success).toHaveBeenCalledWith('Invoice marked as paid')
  })

  it('rolls back the payment when the invoice update fails', async () => {
    sb.queueResults([
      { data: { id: 'pay-1', amount: 1234.56 }, error: null },
      { data: null, error: { message: 'invoices.status check constraint' } },
      // The rollback delete will read whatever the next sticky result is.
      { data: null, error: null },
    ])

    const { result } = renderHook(() => useMarkInvoicePaid(), { wrapper: wrapper() })

    await expect(result.current.mutateAsync(INVOICE_ARG)).rejects.toThrow(
      /check constraint/,
    )

    // Rollback delete must have fired against payments by id.
    expect(sb.delete).toHaveBeenCalled()
    const deletedFromPayments = sb.from.mock.calls.some((c) => c[0] === 'payments')
    expect(deletedFromPayments).toBe(true)
  })

  it('does NOT touch invoices when the payment insert fails', async () => {
    sb.queueResults([
      { data: null, error: { message: 'payments.amount must be positive' } },
    ])

    const { result } = renderHook(() => useMarkInvoicePaid(), { wrapper: wrapper() })

    await expect(result.current.mutateAsync(INVOICE_ARG)).rejects.toThrow(/positive/)

    // We must have stopped before touching invoices.
    expect(sb.from.mock.calls.map((c) => c[0])).toEqual(['payments'])
  })
})

describe('useCreatePayment', () => {
  it('inserts a payment row and emits a success toast', async () => {
    sb.queueResults([
      { data: { id: 'pay-2', amount: 500 }, error: null },
    ])

    const { result } = renderHook(() => useCreatePayment(), { wrapper: wrapper() })
    const out = await result.current.mutateAsync({
      invoice_id: 'inv-1',
      organisation_id: 'org-1',
      amount: 500,
      payment_method: 'bank_transfer',
      reference: 'BACS 12345',
    })

    expect(out).toEqual({ id: 'pay-2', amount: 500 })
    expect(sb.from).toHaveBeenCalledWith('payments')
    const paymentInsert = sb.insert.mock.calls.find((c) => {
      const p = c[0] as { amount?: number }
      return p.amount === 500
    })
    expect(paymentInsert).toBeDefined()
    expect(paymentInsert![0]).toMatchObject({
      invoice_id: 'inv-1',
      organisation_id: 'org-1',
      amount: 500,
      payment_method: 'bank_transfer',
      reference: 'BACS 12345',
    })
    // It must NOT update invoices — partial payments leave status alone.
    expect(sb.from.mock.calls.map((c) => c[0])).toEqual(['payments'])
    expect(toast.success).toHaveBeenCalledWith('Payment recorded')
  })

  it('surfaces the error when insert fails', async () => {
    sb.queueResults([
      { data: null, error: { message: 'permission denied for payments' } },
    ])

    const { result } = renderHook(() => useCreatePayment(), { wrapper: wrapper() })

    await expect(
      result.current.mutateAsync({
        invoice_id: 'inv-1',
        organisation_id: 'org-1',
        amount: 100,
      }),
    ).rejects.toThrow(/permission denied/)
    expect(toast.error).toHaveBeenCalled()
  })
})
