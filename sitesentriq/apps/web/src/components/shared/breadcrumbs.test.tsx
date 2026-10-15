import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Breadcrumbs } from './breadcrumbs'
import { renderWithProviders } from '@/test/test-utils'

describe('<Breadcrumbs />', () => {
  it('renders all items in order', () => {
    renderWithProviders(
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Clients', path: '/dashboard/clients' },
        { label: 'Acme Corp' },
      ]} />,
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Clients')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('renders items with a path as links and pathless items as text', () => {
    renderWithProviders(
      <Breadcrumbs items={[
        { label: 'Home', path: '/' },
        { label: 'Current Page' },
      ]} />,
    )
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/')
    // The current/last item has no link wrapper.
    expect(screen.getByText('Current Page').closest('a')).toBeNull()
  })

  it('shows a separator chevron for every item except the first', () => {
    const { container } = renderWithProviders(
      <Breadcrumbs items={[
        { label: 'A', path: '/a' },
        { label: 'B', path: '/b' },
        { label: 'C' },
      ]} />,
    )
    // lucide-react renders SVG icons. Three items → two chevrons.
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBe(2)
  })
})
