// Sprint 1.5b — Integration tests for the quote→invoice conversion
// flow.
//
// useConvertQuoteToInvoice is the most multi-step mutation in the app:
// it fans out across quote_lines fetch → invoices insert → invoice_lines
// insert → quotes update → timeline event. Each of those is a failure
// surface that affects what the user sees, so we lock the whole flow
// down here rather than the unit-test approach the per-call sites get.
//
// We use the queueResults extension on the supabase mock so each
// supabase call resolves with its own tailored response.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  const sb = createSupabaseMock()
  ;(globalThis as Record<string, unknown>).__sb_quotes_convert__ = sb
  return { supabase: sb }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Timeline writes are fire-and-forget in the hook (`.catch(console.error)`)
// — mock so we can assert it was called without actually hitting supabase.
const logTimelineEvent = vi.fn(async () => undefined)
vi.mock('@/lib/timeline', () => ({
  logTimelineEvent: (...args: unknown[]) => logTimelineEvent(...args),
}))

import { useConvertQuoteToInvoice, useConvertQuoteToJob } from './use-quotes'
import { toast } from 'sonner'
import type { SupabaseMockBuilder } from '@/test/supabase-mock'

const sb = (globalThis as Record<string, unknown>)
  .__sb_quotes_convert__ as SupabaseMockBuilder

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const QUOTE = {
  id: 'q-1',
  quote_number: 'Q-2026-0042',
  organisation_id: 'org-1',
  client_id: 'client-1',
  total: 1234.56,
}

const SAMPLE_LINES = [
  { description: 'Boiler service', quantity: 1, unit_price: 800, total: 800, sort_order: 0 },
  { description: 'Replacement valve', quantity: 2, unit_price: 100, total: 200, sort_order: 1 },
]

const NEW_INVOICE = {
  id: 'inv-1',
  organisation_id: 'org-1',
  client_id: 'client-1',
  quote_id: 'q-1',
  invoice_number: 'INV-Q-2026-0042',
  status: 'draft',
  total: 1234.56,
}

beforeEach(() => {
  sb.reset()
  logTimelineEvent.mockClear()
  ;(toast.success as ReturnType<typeof vi.fn>).mockClear()
  ;(toast.error as ReturnType<typeof vi.fn>).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useConvertQuoteToInvoice — happy path', () => {
  it('replicates lines, drafts the invoice, marks the quote converted, and logs a timeline event', async () => {
    // Sequence of supabase calls inside the hook:
    //   0. invoices select (existing-invoice idempotency check) → none
    //   1. quote_lines select+eq+order  → SAMPLE_LINES
    //   2. invoices insert+select+single → NEW_INVOICE
    //   3. invoice_lines insert         → ok
    //   4. quotes update+eq             → ok
    sb.queueResults([
      { data: null, error: null },
      { data: SAMPLE_LINES, error: null },
      { data: NEW_INVOICE, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })
    const invoice = await result.current.mutateAsync(QUOTE)

    expect(invoice).toEqual(NEW_INVOICE)

    // Verify the right tables were touched in the right order (the leading
    // 'invoices' read is the duplicate-guard).
    const fromCalls = sb.from.mock.calls.map((c) => c[0])
    expect(fromCalls).toEqual(['invoices', 'quote_lines', 'invoices', 'invoice_lines', 'quotes'])

    // Invoice insert should reference the source quote and default to draft.
    const invoiceInsert = sb.insert.mock.calls.find((c) => {
      const payload = c[0] as { invoice_number?: string }
      return payload.invoice_number === 'INV-Q-2026-0042'
    })
    expect(invoiceInsert).toBeDefined()
    expect(invoiceInsert![0]).toMatchObject({
      organisation_id: 'org-1',
      client_id: 'client-1',
      quote_id: 'q-1',
      status: 'draft',
      total: 1234.56,
    })
    // due_date is "today + 30d" — we just assert it's an ISO date string.
    const insertedDue = (invoiceInsert![0] as { due_date?: string }).due_date
    expect(insertedDue).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    // Invoice lines should mirror the quote lines 1:1 with the new invoice id.
    const lineInsert = sb.insert.mock.calls.find((c) => Array.isArray(c[0]))
    expect(lineInsert).toBeDefined()
    expect(lineInsert![0]).toEqual([
      { invoice_id: 'inv-1', description: 'Boiler service', quantity: 1, unit_price: 800, total: 800, sort_order: 0 },
      { invoice_id: 'inv-1', description: 'Replacement valve', quantity: 2, unit_price: 100, total: 200, sort_order: 1 },
    ])

    // Quote should be marked as converted.
    const quoteUpdate = sb.update.mock.calls.find((c) => {
      const p = c[0] as { status?: string }
      return p.status === 'converted'
    })
    expect(quoteUpdate).toBeDefined()

    // Timeline event fired.
    expect(logTimelineEvent).toHaveBeenCalledTimes(1)
    expect(logTimelineEvent.mock.calls[0][0]).toMatchObject({
      orgId: 'org-1',
      clientId: 'client-1',
      description: expect.stringContaining('Q-2026-0042'),
    })

    // Success toast.
    expect(toast.success).toHaveBeenCalledWith('Invoice drafted from quote')
  })

  it('handles an empty quote (no lines) without exploding', async () => {
    sb.queueResults([
      { data: null, error: null },        // existing-invoice check → none
      { data: [], error: null },          // no lines
      { data: NEW_INVOICE, error: null },  // invoice still drafted
      // no invoice_lines insert because no lines to insert
      { data: null, error: null },         // quote update
    ])

    const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })
    const invoice = await result.current.mutateAsync(QUOTE)

    expect(invoice).toEqual(NEW_INVOICE)
    // invoice_lines should NOT be touched when there are no lines.
    expect(sb.from.mock.calls.map((c) => c[0])).not.toContain('invoice_lines')
  })

  it('returns the existing invoice without creating a duplicate when one already exists', async () => {
    // The duplicate guard: if invoices already has a row for this quote_id,
    // the mutation returns it immediately and touches nothing else.
    sb.queueResults([
      { data: NEW_INVOICE, error: null }, // existing-invoice check → found
    ])

    const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })
    const invoice = await result.current.mutateAsync(QUOTE)

    expect(invoice).toEqual(NEW_INVOICE)
    // Only the guard read ran — no quote_lines fetch, no insert, no update.
    expect(sb.from.mock.calls.map((c) => c[0])).toEqual(['invoices'])
    expect(sb.insert).not.toHaveBeenCalled()
    expect(sb.update).not.toHaveBeenCalled()
  })

  it('uses the local accounting day for the Net 30 due date near midnight', async () => {
    const previousTz = process.env.TZ
    process.env.TZ = 'Europe/London'
    vi.useFakeTimers()
    // Local time is 00:30 on 6 August while UTC is still 5 August.
    vi.setSystemTime(new Date('2026-08-05T23:30:00Z'))
    sb.queueResults([
      { data: null, error: null },
      { data: [], error: null },
      { data: NEW_INVOICE, error: null },
      { data: null, error: null },
    ])

    try {
      const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })
      await result.current.mutateAsync(QUOTE)
      const invoiceInsert = sb.insert.mock.calls.find((c) => !Array.isArray(c[0]))
      expect(invoiceInsert?.[0]).toMatchObject({ due_date: '2026-09-05' })
    } finally {
      process.env.TZ = previousTz
    }
  })
})

describe('useConvertQuoteToInvoice — failure handling', () => {
  it('fails closed when the existing-invoice guard cannot be read', async () => {
    sb.queueResults([
      { data: null, error: { message: 'invoice guard lookup timed out' } },
    ])
    const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })

    await expect(result.current.mutateAsync(QUOTE)).rejects.toThrow(/timed out/)
    expect(sb.from.mock.calls.map((c) => c[0])).toEqual(['invoices'])
    expect(sb.insert).not.toHaveBeenCalled()
  })

  it('surfaces an error when the quote_lines fetch fails', async () => {
    sb.queueResults([
      { data: null, error: null }, // existing-invoice check → none
      { data: null, error: { message: 'permission denied for quote_lines' } },
    ])
    const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })

    await expect(result.current.mutateAsync(QUOTE)).rejects.toThrow(/permission denied/)
    // No invoice should have been created (only the guard read + the failed lines read).
    expect(sb.from.mock.calls.map((c) => c[0])).toEqual(['invoices', 'quote_lines'])
    expect(toast.error).toHaveBeenCalled()
  })

  it('surfaces an error when the invoice insert fails', async () => {
    sb.queueResults([
      { data: null, error: null }, // existing-invoice check → none
      { data: SAMPLE_LINES, error: null },
      { data: null, error: { message: 'invoice_number must be unique' } },
    ])
    const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })

    await expect(result.current.mutateAsync(QUOTE)).rejects.toThrow(/unique/)
    // Should not have proceeded past the invoice insert.
    expect(sb.from.mock.calls.map((c) => c[0])).toEqual(['invoices', 'quote_lines', 'invoices'])
  })

  it('rolls back the invoice when invoice_lines insert fails', async () => {
    sb.queueResults([
      { data: null, error: null }, // existing-invoice check → none
      { data: SAMPLE_LINES, error: null },
      { data: NEW_INVOICE, error: null },
      { data: null, error: { message: 'invoice_lines.tax_rate cannot be null' } },
      // The rollback delete will read whatever sticky `setResult` is
      // (default { data: null, error: null }) — that's fine.
    ])
    const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })

    await expect(result.current.mutateAsync(QUOTE)).rejects.toThrow(/tax_rate/)

    // We must have called delete on invoices to roll back.
    expect(sb.delete).toHaveBeenCalled()
    // And we must NOT have updated the quote to converted — the
    // mutation throws before reaching that step.
    const quoteUpdate = sb.update.mock.calls.find((c) => {
      const p = c[0] as { status?: string }
      return p.status === 'converted'
    })
    expect(quoteUpdate).toBeUndefined()
  })

  it('still returns the invoice when only the quote update fails (graceful degradation)', async () => {
    // The hook intentionally does NOT roll back the invoice if the
    // quote-status update fails — the invoice is the user-visible
    // artifact and the quote status is recoverable by hand. Lock that
    // behaviour down so a future "make it strict" change has to come
    // with a deliberate test update.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sb.queueResults([
      { data: null, error: null }, // existing-invoice check → none
      { data: SAMPLE_LINES, error: null },
      { data: NEW_INVOICE, error: null },
      { data: null, error: null }, // invoice_lines insert ok
      { data: null, error: { message: 'quotes.status check constraint' } },
    ])

    const { result } = renderHook(() => useConvertQuoteToInvoice(), { wrapper: wrapper() })
    const invoice = await result.current.mutateAsync(QUOTE)

    // Invoice still returned to the caller.
    expect(invoice).toEqual(NEW_INVOICE)
    // Warning logged (not toast.error — it's not a user-facing failure).
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('useConvertQuoteToInvoice'),
      expect.stringContaining('check constraint'),
    )
    // Success toast still fires because the user got their invoice.
    expect(toast.success).toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})

// ── useConvertQuoteToJob ────────────────────────────────────────
//
// Critical Fix #2: the previous implementation dropped client_id
// (orphaning the job from client filters and breaking the
// job-completion-email edge function) and dropped the quote's line
// items (engineer arrives blind). These tests lock in:
//   - client_id lands on the inserted job
//   - quote_lines are replicated as job_tasks rows
//   - the source quote is marked converted
//   - rollback fires if task insertion fails

const QUOTE_FOR_JOB = {
  id: 'q-1',
  quote_number: 'Q-2026-0042',
  property_id: 'prop-1',
  organisation_id: 'org-1',
  client_id: 'client-1',
}

const NEW_JOB = {
  id: 'job-1',
  title: 'Job from Q-2026-0042',
  property_id: 'prop-1',
  client_id: 'client-1',
  organisation_id: 'org-1',
  status: 'scheduled',
  priority: 'medium',
}

describe('useConvertQuoteToJob — Critical Fix #2', () => {
  it('carries client_id onto the new job and replicates quote lines as job_tasks', async () => {
    // Sequence:
    //   1. quote_lines select+eq+order → SAMPLE_LINES
    //   2. jobs insert+select+single   → NEW_JOB
    //   3. job_tasks insert            → ok
    //   4. quotes update+eq            → ok
    sb.queueResults([
      { data: SAMPLE_LINES, error: null },
      { data: NEW_JOB, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])

    const { result } = renderHook(() => useConvertQuoteToJob(), { wrapper: wrapper() })
    const job = await result.current.mutateAsync(QUOTE_FOR_JOB)

    expect(job).toEqual(NEW_JOB)

    // Tables touched in expected order.
    const fromCalls = sb.from.mock.calls.map((c) => c[0])
    expect(fromCalls).toEqual(['quote_lines', 'jobs', 'job_tasks', 'quotes'])

    // The job insert MUST include client_id (the bug fix).
    const jobInsert = sb.insert.mock.calls.find((c) => {
      const p = c[0] as { title?: string }
      return p.title === 'Job from Q-2026-0042'
    })
    expect(jobInsert).toBeDefined()
    expect(jobInsert![0]).toMatchObject({
      title: 'Job from Q-2026-0042',
      property_id: 'prop-1',
      client_id: 'client-1',
      organisation_id: 'org-1',
      status: 'scheduled',
      priority: 'medium',
    })

    // The job_tasks insert MUST mirror the quote lines (description-only,
    // scoped to the new job + org).
    const taskInsert = sb.insert.mock.calls.find((c) => Array.isArray(c[0]))
    expect(taskInsert).toBeDefined()
    expect(taskInsert![0]).toEqual([
      { job_id: 'job-1', organisation_id: 'org-1', description: 'Boiler service' },
      { job_id: 'job-1', organisation_id: 'org-1', description: 'Replacement valve' },
    ])

    // Quote marked converted.
    const quoteUpdate = sb.update.mock.calls.find((c) => {
      const p = c[0] as { status?: string }
      return p.status === 'converted'
    })
    expect(quoteUpdate).toBeDefined()

    expect(toast.success).toHaveBeenCalledWith('Quote converted to job successfully')
  })

  it('handles a quote with no lines without inserting into job_tasks', async () => {
    sb.queueResults([
      { data: [], error: null },        // no lines
      { data: NEW_JOB, error: null },   // job still created
      // no job_tasks insert because no lines to insert
      { data: null, error: null },      // quote update
    ])

    const { result } = renderHook(() => useConvertQuoteToJob(), { wrapper: wrapper() })
    const job = await result.current.mutateAsync(QUOTE_FOR_JOB)

    expect(job).toEqual(NEW_JOB)
    // job_tasks should NOT be touched when there are no lines.
    expect(sb.from.mock.calls.map((c) => c[0])).not.toContain('job_tasks')
  })

  it('rolls back the job when job_tasks insert fails', async () => {
    sb.queueResults([
      { data: SAMPLE_LINES, error: null },
      { data: NEW_JOB, error: null },
      { data: null, error: { message: 'job_tasks.organisation_id violates fk' } },
      // The rollback delete uses the sticky default { data: null, error: null }.
    ])

    const { result } = renderHook(() => useConvertQuoteToJob(), { wrapper: wrapper() })

    await expect(result.current.mutateAsync(QUOTE_FOR_JOB)).rejects.toThrow(/job_tasks/)

    // Rollback delete must have fired against jobs.
    expect(sb.delete).toHaveBeenCalled()
    // The quote update to 'converted' must NOT have run.
    const quoteUpdate = sb.update.mock.calls.find((c) => {
      const p = c[0] as { status?: string }
      return p.status === 'converted'
    })
    expect(quoteUpdate).toBeUndefined()
    expect(toast.error).toHaveBeenCalled()
  })
})
