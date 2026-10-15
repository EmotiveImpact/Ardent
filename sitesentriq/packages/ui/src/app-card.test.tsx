import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AppCard } from './app-card'

describe('AppCard', () => {
  it('renders children with default chrome (md padding, default tone, no slots)', () => {
    const { container } = render(
      <AppCard>
        <span data-testid="kid">hello</span>
      </AppCard>,
    )

    // The outer wrapper carries the locked visual-contract classes.
    const outer = container.firstElementChild as HTMLElement
    expect(outer).toBeInTheDocument()
    expect(outer.className).toContain('rounded-xl')
    expect(outer.className).toContain('border')
    expect(outer.className).toContain('border-border-default')
    expect(outer.className).toContain('bg-surface-card')

    // The body wrapper carries `p-5` (md default).
    const body = outer.firstElementChild as HTMLElement
    expect(body.className).toContain('p-5')

    // No header/footer slots when none are passed.
    expect(outer.querySelectorAll('.border-b').length).toBe(0)
    expect(outer.querySelectorAll('.border-t').length).toBe(0)

    // Children render through.
    expect(screen.getByTestId('kid')).toHaveTextContent('hello')
  })

  it('maps every padding value to its expected utility class', () => {
    const cases: Array<{ padding: 'sm' | 'md' | 'lg' | 'none'; expected: string }> = [
      { padding: 'sm', expected: 'p-3' },
      { padding: 'md', expected: 'p-5' },
      { padding: 'lg', expected: 'p-6' },
      { padding: 'none', expected: 'p-0' },
    ]
    for (const { padding, expected } of cases) {
      const { container, unmount } = render(
        <AppCard padding={padding}>x</AppCard>,
      )
      const body = container.firstElementChild!.firstElementChild as HTMLElement
      expect(body.className, `padding=${padding}`).toContain(expected)
      unmount()
    }
  })

  it('maps every tone value to its expected surface token', () => {
    const cases: Array<{ tone: 'default' | 'elevated' | 'subtle'; expected: string }> = [
      { tone: 'default', expected: 'bg-surface-card' },
      { tone: 'elevated', expected: 'bg-surface-elevated' },
      { tone: 'subtle', expected: 'bg-surface-page' },
    ]
    for (const { tone, expected } of cases) {
      const { container, unmount } = render(
        <AppCard tone={tone}>x</AppCard>,
      )
      const outer = container.firstElementChild as HTMLElement
      expect(outer.className, `tone=${tone}`).toContain(expected)
      unmount()
    }
  })

  it('renders header and footer slots with divider borders', () => {
    const { container } = render(
      <AppCard
        header={<div data-testid="hdr">Header</div>}
        footer={<div data-testid="ftr">Footer</div>}
      >
        <span data-testid="body">Body</span>
      </AppCard>,
    )

    expect(screen.getByTestId('hdr')).toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
    expect(screen.getByTestId('ftr')).toBeInTheDocument()

    const outer = container.firstElementChild as HTMLElement
    const headerWrap = outer.firstElementChild as HTMLElement
    const footerWrap = outer.lastElementChild as HTMLElement

    // Header slot must carry the bottom-divider class.
    expect(headerWrap.className).toContain('border-b')
    expect(headerWrap.className).toContain('border-border-default')
    // Footer slot must carry the top-divider class.
    expect(footerWrap.className).toContain('border-t')
    expect(footerWrap.className).toContain('border-border-default')
  })

  it('appends the caller `className` after built-in classes (escape hatch)', () => {
    const { container } = render(
      <AppCard className="my-custom-extra">x</AppCard>,
    )
    const outer = container.firstElementChild as HTMLElement
    expect(outer.className).toContain('my-custom-extra')
    // Built-in classes are still there — caller class only appends.
    expect(outer.className).toContain('rounded-xl')
    expect(outer.className).toContain('border-border-default')
  })
})
