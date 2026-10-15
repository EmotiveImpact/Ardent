import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { PageHeader } from './page-header'

describe('PageHeader', () => {
  it('renders the title as an <h1> with the canonical typography classes', () => {
    render(<PageHeader title="Clients" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Clients' })
    expect(heading).toBeInTheDocument()
    expect(heading.className).toContain('text-[22px]')
    expect(heading.className).toContain('font-semibold')
    expect(heading.className).toContain('text-text-primary')
    expect(heading.className).toContain('tracking-[-0.02em]')
  })

  it('renders the subtitle below the title when provided', () => {
    render(<PageHeader title="Clients" subtitle="Manage your customer accounts" />)
    const subtitle = screen.getByText('Manage your customer accounts')
    expect(subtitle).toBeInTheDocument()
    expect(subtitle.tagName).toBe('P')
    expect(subtitle.className).toContain('text-sm')
    expect(subtitle.className).toContain('text-text-muted')
  })

  it('does not render the subtitle slot when omitted', () => {
    const { container } = render(<PageHeader title="Clients" />)
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders the breadcrumbs slot above the title', () => {
    render(
      <PageHeader
        title="Acme Corp"
        breadcrumbs={<nav data-testid="bc">crumbs</nav>}
      />,
    )
    expect(screen.getByTestId('bc')).toBeInTheDocument()
  })

  it('renders the actions slot when provided', () => {
    render(
      <PageHeader
        title="Acme Corp"
        actions={<button data-testid="act">New</button>}
      />,
    )
    expect(screen.getByTestId('act')).toBeInTheDocument()
  })

  it('omits actions wrapper when no actions slot is given', () => {
    const { container } = render(<PageHeader title="Clients" />)
    // Only the title wrapper should exist inside the inline-flex row.
    const row = container.querySelector('.flex.items-start')
    expect(row?.children.length).toBe(1)
  })
})
