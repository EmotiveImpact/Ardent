import { type ReactElement, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'

/**
 * Build a fresh QueryClient with retries off, so failed mocked queries don't
 * spam the test runner with retry timeouts.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface ProvidersOptions {
  queryClient?: QueryClient
  /** Initial routes for MemoryRouter — defaults to ['/'] */
  initialEntries?: string[]
}

interface AllProvidersProps extends ProvidersOptions {
  children: ReactNode
}

export function AllProviders({
  children,
  queryClient,
  initialEntries = ['/'],
}: AllProvidersProps) {
  const client = queryClient ?? createTestQueryClient()
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

interface RenderWithProvidersOptions
  extends Omit<RenderOptions, 'wrapper'>,
    ProvidersOptions {}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient, initialEntries, ...options }: RenderWithProvidersOptions = {},
) {
  const client = queryClient ?? createTestQueryClient()
  return {
    queryClient: client,
    ...render(ui, {
      wrapper: ({ children }) => (
        <AllProviders queryClient={client} initialEntries={initialEntries}>
          {children}
        </AllProviders>
      ),
      ...options,
    }),
  }
}

// Re-export RTL so tests only need one import.
export * from '@testing-library/react'
