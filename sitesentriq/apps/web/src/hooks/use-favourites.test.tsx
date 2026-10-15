import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/test-utils'

vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  const sb = createSupabaseMock()
  ;(globalThis as Record<string, unknown>).__sb_favs__ = sb
  return { supabase: sb }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/contexts/auth-context', () => ({
  useAuthContext: () => ({
    profile: { id: 'user-1', organisation_id: 'org-1' },
    user: null,
    session: null,
    organisation: null,
    loading: false,
    signOut: vi.fn(),
  }),
}))

import { useFavourites, useIsFavourite } from './use-favourites'
import type { SupabaseMockBuilder } from '@/test/supabase-mock'

const sb = (globalThis as Record<string, unknown>).__sb_favs__ as SupabaseMockBuilder

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  sb.reset()
})

describe('useFavourites', () => {
  it('queries favourites for the current user', async () => {
    sb.setResult({
      data: [
        { id: 'f1', entity_type: 'client', entity_id: 'c1' },
        { id: 'f2', entity_type: 'asset', entity_id: 'a1' },
      ],
      error: null,
    })

    const { result } = renderHook(() => useFavourites(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(sb.from).toHaveBeenCalledWith('favourites')
    expect(sb.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})

describe('useIsFavourite', () => {
  it('returns true and the matching id when the entity is favourited', async () => {
    sb.setResult({
      data: [{ id: 'f1', entity_type: 'client', entity_id: 'c1' }],
      error: null,
    })
    const { result } = renderHook(() => useIsFavourite('client', 'c1'), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isFavourite).toBe(true))
    expect(result.current.favouriteId).toBe('f1')
  })

  it('returns false when no match exists', async () => {
    sb.setResult({ data: [], error: null })
    const { result } = renderHook(() => useIsFavourite('asset', 'never'), {
      wrapper: wrapper(),
    })
    // Wait until data settles.
    await waitFor(() => expect(result.current.isFavourite).toBe(false))
    expect(result.current.favouriteId).toBeUndefined()
  })
})
