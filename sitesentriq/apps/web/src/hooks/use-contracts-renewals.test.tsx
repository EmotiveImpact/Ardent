// Sprint 2 / C5 — Tests for the renewal-window logic.
//
// We can't use vi.useFakeTimers() here — it deadlocks React Query's
// internals (waitFor uses setTimeout). Instead we compute expected
// values relative to "now", and use offsets that are robust against
// the test running across midnight (the small ones use ±2 days of
// slop).

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  const sb = createSupabaseMock()
  ;(globalThis as Record<string, unknown>).__sb_renewals__ = sb
  return { supabase: sb }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { useContractRenewals } from './use-contracts'
import type { SupabaseMockBuilder } from '@/test/supabase-mock'

const sb = (globalThis as Record<string, unknown>)
  .__sb_renewals__ as SupabaseMockBuilder

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  sb.reset()
})

const MS_DAY = 86_400_000

/**
 * Build a LOCAL YYYY-MM-DD string offset from today by N days.
 * We deliberately don't use toISOString().slice(0, 10) — that flips
 * to the UTC date, which on east-of-UTC machines comes back a day
 * earlier than the user's "today". The hook compares to local
 * midnight, so the test must use local-date strings to match.
 */
function dateOffset(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

describe('useContractRenewals', () => {
  it('computes overdue flag and roughly correct days_until_end per row', async () => {
    sb.setResult({
      data: [
        {
          id: 'c-overdue',
          client_id: 'cl-1',
          status: 'active',
          start_date: dateOffset(-365),
          end_date: dateOffset(-30),
          clients: { name: 'Acme Holdings' },
        },
        {
          id: 'c-future',
          client_id: 'cl-2',
          status: 'active',
          start_date: dateOffset(-335),
          end_date: dateOffset(30),
          clients: { name: 'Globex' },
        },
        {
          id: 'c-today',
          client_id: 'cl-3',
          status: 'active',
          start_date: dateOffset(-365),
          end_date: dateOffset(0),
          clients: { name: 'Initech' },
        },
      ],
      error: null,
    })

    const { result } = renderHook(() => useContractRenewals(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const byId = Object.fromEntries(result.current.data!.map((r) => [r.id, r]))

    expect(byId['c-overdue'].overdue).toBe(true)
    // ±1 of slop — Date arithmetic can shift by 1 day at year boundaries
    expect(byId['c-overdue'].days_until_end).toBeGreaterThanOrEqual(-31)
    expect(byId['c-overdue'].days_until_end).toBeLessThanOrEqual(-29)
    expect(byId['c-overdue'].client_name).toBe('Acme Holdings')

    expect(byId['c-future'].overdue).toBe(false)
    expect(byId['c-future'].days_until_end).toBeGreaterThanOrEqual(29)
    expect(byId['c-future'].days_until_end).toBeLessThanOrEqual(31)
    expect(byId['c-future'].client_name).toBe('Globex')

    expect(byId['c-today'].overdue).toBe(false)
    expect(byId['c-today'].days_until_end).toBeGreaterThanOrEqual(-1)
    expect(byId['c-today'].days_until_end).toBeLessThanOrEqual(1)
  })

  it('respects the withinDays parameter when querying', async () => {
    sb.setResult({ data: [], error: null })
    const { result } = renderHook(() => useContractRenewals({ withinDays: 30 }), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(sb.lte).toHaveBeenCalled()
    const lteArgs = sb.lte.mock.calls[0]
    expect(lteArgs[0]).toBe('end_date')
    expect(typeof lteArgs[1]).toBe('string')
    const cutoffMs = new Date(lteArgs[1] as string).getTime()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffDays = Math.round((cutoffMs - today.getTime()) / MS_DAY)
    expect(diffDays).toBeGreaterThanOrEqual(29)
    expect(diffDays).toBeLessThanOrEqual(31)
  })

  it('falls back to null client_name when the join is missing', async () => {
    sb.setResult({
      data: [
        {
          id: 'c-1',
          client_id: 'cl-1',
          status: 'active',
          start_date: dateOffset(-365),
          end_date: dateOffset(60),
          clients: null,
        },
      ],
      error: null,
    })
    const { result } = renderHook(() => useContractRenewals(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data![0].client_name).toBeNull()
  })

  it('returns empty array when there are no in-window contracts', async () => {
    sb.setResult({ data: [], error: null })
    const { result } = renderHook(() => useContractRenewals(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})
