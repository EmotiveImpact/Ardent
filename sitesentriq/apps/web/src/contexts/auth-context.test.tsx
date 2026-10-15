import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuthContext } from './auth-context'

// AuthProvider calls useQueryClient() (it clears the TanStack cache on sign-out
// to prevent the cross-account cache leak), so the provider must sit inside a
// QueryClientProvider in tests too.
function renderAuth() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderHook(() => useAuthContext(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ),
  })
}

// We deliberately do NOT set VITE_SUPABASE_URL — the context falls into
// DEV_MODE and seeds a deterministic user/profile/org. That's the path we
// exercise here.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    from: vi.fn(),
  },
}))

describe('AuthProvider (dev mode)', () => {
  it('seeds a deterministic dev user, profile, and organisation', () => {
    const { result } = renderAuth()

    expect(result.current.user?.email).toBe('admin@haumea.dev')
    expect(result.current.profile?.role).toBe('org_admin')
    expect(result.current.organisation?.slug).toBe('haumea-demo')
    expect(result.current.loading).toBe(false)
  })

  it('exposes a signOut function', () => {
    const { result } = renderAuth()
    expect(typeof result.current.signOut).toBe('function')
  })
})
