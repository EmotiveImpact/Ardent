import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Heading, Text } from './typography'

describe('Heading', () => {
  it('renders h1-h6 for the matching level', () => {
    const levels: Array<1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6]
    for (const level of levels) {
      const { unmount } = render(<Heading level={level}>title-{level}</Heading>)
      const el = screen.getByRole('heading', { level, name: `title-${level}` })
      expect(el.tagName.toLowerCase()).toBe(`h${level}`)
      unmount()
    }
  })

  it('uses the per-level default scale (level=1 → headline, level=2 → title, level=3+ → body)', () => {
    const { container, rerender } = render(<Heading level={1}>x</Heading>)
    expect((container.firstElementChild as HTMLElement).className).toContain('text-headline')

    rerender(<Heading level={2}>x</Heading>)
    expect((container.firstElementChild as HTMLElement).className).toContain('text-title')

    rerender(<Heading level={3}>x</Heading>)
    expect((container.firstElementChild as HTMLElement).className).toContain('text-body')

    rerender(<Heading level={5}>x</Heading>)
    expect((container.firstElementChild as HTMLElement).className).toContain('text-body')
  })

  it('lets `scale` override the level-default size', () => {
    const { container } = render(
      <Heading level={1} scale="micro">
        small h1
      </Heading>,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('text-micro')
    expect(el.className).not.toContain('text-headline')
  })

  it('lets `as` override the rendered tag while keeping level semantics off the DOM', () => {
    const { container } = render(
      <Heading level={1} as="div">
        title
      </Heading>,
    )
    expect(container.firstElementChild?.tagName).toBe('DIV')
  })

  it('applies the requested tone token', () => {
    const { container } = render(
      <Heading level={2} tone="accent">
        x
      </Heading>,
    )
    expect((container.firstElementChild as HTMLElement).className).toContain('text-text-accent')
  })

  it('defaults to font-semibold but lets weight override', () => {
    const { container, rerender } = render(<Heading level={2}>x</Heading>)
    expect((container.firstElementChild as HTMLElement).className).toContain('font-semibold')

    rerender(
      <Heading level={2} weight="normal">
        x
      </Heading>,
    )
    expect((container.firstElementChild as HTMLElement).className).toContain('font-normal')
  })
})

describe('Text', () => {
  it('renders a <p> with body-scale + normal weight by default', () => {
    const { container } = render(<Text>hello</Text>)
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('P')
    expect(el.className).toContain('text-body')
    expect(el.className).toContain('font-normal')
    expect(el.className).toContain('text-text-primary')
  })

  it('switches scale token when `scale` is set', () => {
    const { container } = render(<Text scale="caption">meta</Text>)
    expect((container.firstElementChild as HTMLElement).className).toContain('text-caption')
  })

  it('switches tag via `as`', () => {
    const { container } = render(<Text as="span">inline</Text>)
    expect(container.firstElementChild?.tagName).toBe('SPAN')
  })

  it('maps every tone to the expected text-* token', () => {
    const cases: Array<{ tone: 'primary' | 'muted' | 'subtle' | 'accent'; expected: string }> = [
      { tone: 'primary', expected: 'text-text-primary' },
      { tone: 'muted', expected: 'text-text-muted' },
      { tone: 'subtle', expected: 'text-text-secondary' },
      { tone: 'accent', expected: 'text-text-accent' },
    ]
    for (const { tone, expected } of cases) {
      const { container, unmount } = render(<Text tone={tone}>x</Text>)
      expect((container.firstElementChild as HTMLElement).className, `tone=${tone}`).toContain(
        expected,
      )
      unmount()
    }
  })

  it('appends caller className after built-ins (escape hatch)', () => {
    const { container } = render(<Text className="custom-extra">x</Text>)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('custom-extra')
    expect(el.className).toContain('text-body')
  })
})
