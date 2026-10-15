import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/test/test-utils'

// `vi.mock` is hoisted to the top of the file, so the mock factory is what
// runs first. We use a hoisted async dynamic import to load the mock builder
// at hoist time, then reference it from the factory.
vi.mock('@/lib/supabase', async () => {
  const { createSupabaseMock } = await import('@/test/supabase-mock')
  // Stash on globalThis so the test body can grab the same instance.
  const sb = createSupabaseMock()
  ;(globalThis as Record<string, unknown>).__sb_clients__ = sb
  return { supabase: sb }
})

// Mock sonner so the mutations don't try to render toasts.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { useClients, useClient, useCreateClient } from './use-clients'
import type { SupabaseMockBuilder } from '@/test/supabase-mock'

const sb = (globalThis as Record<string, unknown>).__sb_clients__ as SupabaseMockBuilder

function wrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  sb.reset()
})

describe('useClients', () => {
  it('returns the rows from supabase', async () => {
    sb.setResult({
      data: [{ id: 'c1', name: 'Acme' }, { id: 'c2', name: 'Globex' }],
      error: null,
    })

    const { result } = renderHook(() => useClients(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(sb.from).toHaveBeenCalledWith('clients')
  })

  it('surfaces query errors', async () => {
    sb.setResult({ data: null, error: { message: 'boom' } })

    const { result } = renderHook(() => useClients(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('boom')
  })
})

describe('useClient', () => {
  it('does not run when id is empty', () => {
    const { result } = renderHook(() => useClient(''), { wrapper: wrapper() })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches a single client by id', async () => {
    sb.setResult({ data: { id: 'c1', name: 'Acme' }, error: null })
    const { result } = renderHook(() => useClient('c1'), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ id: 'c1', name: 'Acme' })
    expect(sb.eq).toHaveBeenCalledWith('id', 'c1')
  })
})

describe('useCreateClient', () => {
  it('inserts and resolves with the new row', async () => {
    sb.setResult({ data: { id: 'new', name: 'Brand New' }, error: null })
    const { result } = renderHook(() => useCreateClient(), { wrapper: wrapper() })

    const created = await result.current.mutateAsync({ name: 'Brand New' })
    expect(created).toEqual({ id: 'new', name: 'Brand New' })
    expect(sb.insert).toHaveBeenCalledWith({ name: 'Brand New' })
  })
})
