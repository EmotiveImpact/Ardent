import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/test-utils'

// Mock the supabase client behind a queueable mock builder, like
// use-clients.test.tsx does.
vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  const sb = createSupabaseMock()
  ;(globalThis as Record<string, unknown>).__sb_compliance_score__ = sb
  return { supabase: sb }
})

// Mock useAuth so the hook always sees a stable orgId — no AuthProvider
// boilerplate required in the tests.
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    organisation: { id: 'org-123', name: 'Test Org', slug: 'test-org', created_at: '2026-01-01' },
    profile: { id: 'u1', role: 'org_admin' },
    user: null,
    session: null,
    loading: false,
    signOut: vi.fn(),
    currentPropertyId: null,
  }),
}))

import { useComplianceScore } from './use-compliance-score'
import type { SupabaseMockBuilder } from '@/test/supabase-mock'

const sb = (globalThis as Record<string, unknown>).__sb_compliance_score__ as SupabaseMockBuilder

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  sb.reset()
})

describe('useComplianceScore', () => {
  it('returns the latest snapshot + delta vs the previous snapshot', async () => {
    sb.setResult({
      data: [
        {
          snapshot_date: '2026-05-09',
          score: 87,
          breakdown: {
            compliance: 90,
            ppm_on_time: 80,
            pass_rate: 92,
            action_health: 100,
          },
        },
        {
          snapshot_date: '2026-05-08',
          score: 84,
          breakdown: {
            compliance: 88,
            ppm_on_time: 75,
            pass_rate: 90,
            action_health: 100,
          },
        },
      ],
      error: null,
    })

    const { result } = renderHook(() => useComplianceScore(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({
      score: 87,
      breakdown: { compliance: 90, ppm_on_time: 80, pass_rate: 92, action_health: 100 },
      deltaVsYesterday: 3,
      lastUpdated: '2026-05-09',
    })
    expect(sb.from).toHaveBeenCalledWith('compliance_score_snapshots')
    expect(sb.eq).toHaveBeenCalledWith('organisation_id', 'org-123')
  })

  it('returns delta 0 when there is no previous snapshot', async () => {
    sb.setResult({
      data: [
        {
          snapshot_date: '2026-05-09',
          score: 50,
          breakdown: {
            compliance: 100,
            ppm_on_time: 0,
            pass_rate: 0,
            action_health: 100,
          },
        },
      ],
      error: null,
    })

    const { result } = renderHook(() => useComplianceScore(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).not.toBeNull()
    expect(result.current.data!.deltaVsYesterday).toBe(0)
    expect(result.current.data!.score).toBe(50)
  })

  it('returns null when no snapshots exist yet (brand-new tenant)', async () => {
    sb.setResult({ data: [], error: null })

    const { result } = renderHook(() => useComplianceScore(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})
