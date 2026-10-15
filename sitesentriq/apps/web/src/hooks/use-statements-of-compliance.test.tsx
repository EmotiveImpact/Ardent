import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/test-utils'

// Mock the supabase client behind a queueable mock builder, mirroring
// use-compliance-score.test.tsx (the sibling hook for the same Strategic 1 feature).
vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  const sb = createSupabaseMock()
  // Augment with the bits the hook uses beyond the chainable query builder:
  // supabase.functions.invoke for the generate mutation + supabase.storage
  // for the signed-URL helper.
  const functions = { invoke: vi.fn() }
  const storageFrom = {
    createSignedUrl: vi.fn(),
  }
  const storage = { from: vi.fn(() => storageFrom) }
  ;(globalThis as Record<string, unknown>).__sb_statements__ = sb
  ;(globalThis as Record<string, unknown>).__sb_statements_functions__ = functions
  ;(globalThis as Record<string, unknown>).__sb_statements_storage_from__ = storageFrom
  return {
    supabase: Object.assign(sb, { functions, storage }),
  }
})

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    organisation: { id: 'org-abc', name: 'Test Org', slug: 'test-org', created_at: '2026-01-01' },
    profile: { id: 'u1', role: 'org_admin' },
    user: null,
    session: null,
    loading: false,
    signOut: vi.fn(),
    currentPropertyId: null,
  }),
}))

import {
  useStatementsOfCompliance,
  useGenerateStatementNow,
  derivePeriodRange,
} from './use-statements-of-compliance'
import type { SupabaseMockBuilder } from '@/test/supabase-mock'

const sb = (globalThis as Record<string, unknown>).__sb_statements__ as SupabaseMockBuilder
const fns = (globalThis as Record<string, unknown>).__sb_statements_functions__ as {
  invoke: ReturnType<typeof vi.fn>
}

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  sb.reset()
  fns.invoke.mockReset()
})

describe('derivePeriodRange', () => {
  it('returns the previous full month when offset = -1', () => {
    // 9 May 2026 → previous month is April 2026 (30 days).
    const range = derivePeriodRange(new Date(Date.UTC(2026, 4, 9)), -1)
    expect(range).toEqual({ period_start: '2026-04-01', period_end: '2026-04-30' })
  })

  it('handles year wrap-around (Jan offset -1 → previous December)', () => {
    // 5 Jan 2026 → previous month is Dec 2025 (31 days).
    const range = derivePeriodRange(new Date(Date.UTC(2026, 0, 5)), -1)
    expect(range).toEqual({ period_start: '2025-12-01', period_end: '2025-12-31' })
  })

  it('uses the local month when UTC is still on the previous day', () => {
    const previousTz = process.env.TZ
    process.env.TZ = 'Europe/London'
    try {
      const range = derivePeriodRange(new Date('2026-07-31T23:30:00Z'), 0)
      expect(range).toEqual({ period_start: '2026-08-01', period_end: '2026-08-31' })
    } finally {
      process.env.TZ = previousTz
    }
  })
})

describe('useStatementsOfCompliance', () => {
  it('returns the recent statements sorted by period descending', async () => {
    sb.setResult({
      data: [
        {
          id: 's1',
          organisation_id: 'org-abc',
          period_start: '2026-04-01',
          period_end: '2026-04-30',
          score_avg: 87,
          score_min: 80,
          score_max: 92,
          breakdown_avg: { compliance: 90, ppm_on_time: 80, pass_rate: 92, action_health: 100 },
          pdf_url: 'org-abc/2026-04-01.pdf',
          email_sent_at: '2026-05-01T06:00:00Z',
          created_at: '2026-05-01T06:00:00Z',
        },
        {
          id: 's2',
          organisation_id: 'org-abc',
          period_start: '2026-03-01',
          period_end: '2026-03-31',
          score_avg: 82,
          score_min: 75,
          score_max: 88,
          breakdown_avg: { compliance: 85, ppm_on_time: 78, pass_rate: 90, action_health: 90 },
          pdf_url: 'org-abc/2026-03-01.pdf',
          email_sent_at: '2026-04-01T06:00:00Z',
          created_at: '2026-04-01T06:00:00Z',
        },
      ],
      error: null,
    })

    const { result } = renderHook(() => useStatementsOfCompliance(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].period_start).toBe('2026-04-01')
    expect(result.current.data?.[0].score_avg).toBe(87)
    expect(sb.from).toHaveBeenCalledWith('statement_of_compliance')
    expect(sb.eq).toHaveBeenCalledWith('organisation_id', 'org-abc')
    expect(sb.order).toHaveBeenCalledWith('period_start', { ascending: false })
  })

  it('returns an empty array when no statements exist yet', async () => {
    sb.setResult({ data: [], error: null })
    const { result } = renderHook(() => useStatementsOfCompliance(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useGenerateStatementNow', () => {
  it('invokes the edge function with the current org id and surfaces results', async () => {
    fns.invoke.mockResolvedValue({
      data: {
        period_start: '2026-04-01',
        period_end: '2026-04-30',
        organisations_processed: 1,
        pdf_render_mode: 'browserless',
        results: [{ organisation_id: 'org-abc', status: 'generated', message: 'generated with PDF' }],
      },
      error: null,
    })

    const { result } = renderHook(() => useGenerateStatementNow(), { wrapper: wrapper() })

    const out = await result.current.mutateAsync()

    expect(fns.invoke).toHaveBeenCalledWith('generate-statement-of-compliance', {
      body: { organisation_id: 'org-abc' },
    })
    expect(out.results[0].status).toBe('generated')
    expect(out.organisations_processed).toBe(1)
  })
})
