import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'

// jsdom under vitest 4 ships a non-functional `localStorage` (it's a bare
// object with no Storage methods). Replace it with an in-memory shim so the
// palette's recent-items persistence is observable in tests. Both `window`
// and the global `localStorage` reference need to point at the same store.
beforeAll(() => {
  const store = new Map<string, string>()
  const shim: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(window, 'localStorage', { value: shim, writable: true, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    writable: true,
    configurable: true,
  })

  // jsdom doesn't implement scrollIntoView — palette calls it on the
  // currently-selected row whenever selection changes.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
  }
})

/**
 * Match text that React has split across multiple nodes (the palette wraps
 * the matched substring in a `<mark>`, so `getByText('Clients')` no longer
 * finds the string as a single text node).
 */
const byText = (needle: string) => (_content: string, node: Element | null) => {
  if (!node) return false
  const hasText = (n: Element) => n.textContent === needle
  const childrenDontHaveText = Array.from(node.children).every((c) => !hasText(c as Element))
  return hasText(node) && childrenDontHaveText
}

// Mock the universal search hook so palette tests are deterministic and don't
// touch supabase. Each test can override the returned data by reassigning the
// `mockResult` object.
const mockResult: {
  data: Array<{
    kind: string
    id: string
    title: string
    subtitle?: string
    path: string
  }>
  isFetching: boolean
} = {
  data: [],
  isFetching: false,
}

vi.mock('@/hooks/use-universal-search', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-universal-search')>(
    '@/hooks/use-universal-search',
  )
  return {
    ...actual,
    useUniversalSearch: () => ({ data: mockResult.data, isFetching: mockResult.isFetching }),
  }
})

// Mock observability so logEvent/startSpan don't reach Sentry from jsdom.
// Use importOriginal to preserve the rest of the module surface (other files
// like supabase-instrumentation reach for `isObservabilityInitialised` etc).
vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observability')>()
  return {
    ...actual,
    logEvent: vi.fn(),
    startSpan: <T,>(_name: string, _op: string, fn: () => T): T => fn(),
  }
})

// Mock react-router's useNavigate so we can assert navigation targets without
// rendering whatever sits at the destination route.
const navigateSpy = vi.fn()
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

import { CommandPalette } from './command-palette'

const PLACEHOLDER = /search clients, jobs, assets, articles/i

beforeEach(() => {
  navigateSpy.mockClear()
  mockResult.data = []
  mockResult.isFetching = false
  localStorage.clear()
})

afterEach(() => {
  // Make sure the global keydown listener is torn down between tests.
  fireEvent.keyDown(window, { key: 'Escape' })
})

describe('<CommandPalette />', () => {
  it('is closed by default and renders nothing', () => {
    const { container } = renderWithProviders(<CommandPalette />)
    expect(container.firstChild).toBeNull()
  })

  it('opens on Cmd+K and lists quick actions + navigate items', async () => {
    renderWithProviders(<CommandPalette />)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    await waitFor(() => {
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument()
    })

    // Quick actions show first when query is empty
    expect(screen.getByText('New Job')).toBeInTheDocument()
    expect(screen.getByText('New Client')).toBeInTheDocument()
    // Navigate items also rendered in the empty state
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
    // Group headers visible
    expect(screen.getByText('Quick Actions')).toBeInTheDocument()
    expect(screen.getByText('Navigate')).toBeInTheDocument()
  })

  it('opens on Ctrl+K (non-Mac) too', async () => {
    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await waitFor(() => {
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument()
    })
  })

  it('filters navigate items by substring as the user types', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    const input = await screen.findByPlaceholderText(PLACEHOLDER)
    await user.type(input, 'client')

    // Matching navigate item still visible (text split by Highlight <mark>).
    expect(screen.getByText(byText('Clients'))).toBeInTheDocument()
    // Quick actions no longer rendered when a query is active
    expect(screen.queryByText('New Job')).toBeNull()
    // Non-matching navigate item filtered out
    expect(screen.queryByText('Dashboard')).toBeNull()
  })

  it('renders universal search hits returned by the hook', async () => {
    const user = userEvent.setup()
    mockResult.data = [
      {
        kind: 'client',
        id: 'c1',
        title: 'Acme Holdings',
        subtitle: 'ops@acme.test',
        path: '/dashboard/clients/c1',
      },
      {
        kind: 'job',
        id: 'j1',
        title: 'Acme boiler service',
        subtitle: 'scheduled',
        path: '/dashboard/jobs/j1',
      },
    ]

    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    const input = await screen.findByPlaceholderText(PLACEHOLDER)
    await user.type(input, 'acme')

    // Highlight wraps the matched substring, so use the split-text matcher.
    expect(screen.getByText(byText('Acme Holdings'))).toBeInTheDocument()
    expect(screen.getByText(byText('Acme boiler service'))).toBeInTheDocument()
    // Group headers per entity kind (no highlight on group labels)
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('Jobs')).toBeInTheDocument()
  })

  it('navigates to the selected row on click and stores it in recent', async () => {
    const user = userEvent.setup()
    mockResult.data = [
      {
        kind: 'client',
        id: 'c1',
        title: 'Acme Holdings',
        path: '/dashboard/clients/c1',
      },
    ]

    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = await screen.findByPlaceholderText(PLACEHOLDER)
    await user.type(input, 'acme')

    await user.click(screen.getByText(byText('Acme Holdings')))

    expect(navigateSpy).toHaveBeenCalledWith('/dashboard/clients/c1')
    // Stored to localStorage under the recent key
    const raw = localStorage.getItem('fos:cmdk:recent')
    expect(raw).not.toBeNull()
    const recent = JSON.parse(raw!)
    expect(recent).toHaveLength(1)
    expect(recent[0]).toMatchObject({ kind: 'client', id: 'c1', title: 'Acme Holdings' })
  })

  it('navigates via Enter after ArrowDown keyboard navigation', async () => {
    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    const input = await screen.findByPlaceholderText(PLACEHOLDER)
    // First row is the first quick action (New Job → /dashboard/jobs/new).
    // ArrowDown moves selection to the second row (New Quote).
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(navigateSpy).toHaveBeenCalledWith('/dashboard/quotes/new')
  })

  it('shows recent items from localStorage when opened with no query', async () => {
    localStorage.setItem(
      'fos:cmdk:recent',
      JSON.stringify([
        {
          kind: 'client',
          id: 'c1',
          title: 'Acme Holdings',
          subtitle: 'ops@acme.test',
          path: '/dashboard/clients/c1',
        },
      ]),
    )

    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    await screen.findByPlaceholderText(PLACEHOLDER)
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByText('Acme Holdings')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await screen.findByPlaceholderText(PLACEHOLDER)

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull()
    })
  })

  it('toggles closed when Cmd+K is pressed while open', async () => {
    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await screen.findByPlaceholderText(PLACEHOLDER)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull()
    })
  })

  it('shows "no results" empty state for queries that match nothing', async () => {
    const user = userEvent.setup()
    mockResult.data = []

    renderWithProviders(<CommandPalette />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    const input = await screen.findByPlaceholderText(PLACEHOLDER)
    await user.type(input, 'zxqvbnm')

    expect(screen.getByText(/no results for/i)).toBeInTheDocument()
  })
})
