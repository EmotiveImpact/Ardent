// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cn, formatDate, formatCurrency, formatRelativeTime, exportToCsv } from './index'

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('handles conditional objects (clsx semantics)', () => {
    expect(cn('a', { b: true, c: false })).toBe('a b')
  })

  it('flattens arrays', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })
})

describe('formatDate', () => {
  it('formats ISO date as DD MMM YYYY (en-GB)', () => {
    expect(formatDate('2026-04-25')).toBe('25 Apr 2026')
  })

  it('accepts a Date object', () => {
    expect(formatDate(new Date('2025-01-09T12:00:00Z'))).toBe('09 Jan 2025')
  })

  it('returns a dash for nullish/blank/unparseable input (never "Invalid Date")', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
    expect(formatDate(new Date('nope'))).toBe('—')
  })
})

describe('formatCurrency', () => {
  it('formats whole pounds', () => {
    // \xA3 = £; non-breaking space variant tolerated.
    const out = formatCurrency(1234)
    expect(out).toMatch(/£\s?1,234\.00/)
  })

  it('formats decimals', () => {
    const out = formatCurrency(1234.5)
    expect(out).toMatch(/£\s?1,234\.50/)
  })

  it('handles zero', () => {
    expect(formatCurrency(0)).toMatch(/£\s?0\.00/)
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('"just now" within 60 seconds', () => {
    expect(formatRelativeTime(new Date('2026-04-25T11:59:30Z'))).toBe('just now')
  })

  it('minutes ago', () => {
    expect(formatRelativeTime(new Date('2026-04-25T11:55:00Z'))).toBe('5 min ago')
  })

  it('1 hour ago is singular', () => {
    expect(formatRelativeTime(new Date('2026-04-25T11:00:00Z'))).toBe('1 hour ago')
  })

  it('hours ago is plural', () => {
    expect(formatRelativeTime(new Date('2026-04-25T09:00:00Z'))).toBe('3 hours ago')
  })

  it('yesterday', () => {
    expect(formatRelativeTime(new Date('2026-04-24T11:00:00Z'))).toBe('yesterday')
  })

  it('multiple days ago', () => {
    expect(formatRelativeTime(new Date('2026-04-22T12:00:00Z'))).toBe('3 days ago')
  })
})

describe('exportToCsv', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clickSpy = vi.fn()
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement
      }
      return document.createElement(tag)
    }) as typeof document.createElement)
  })

  afterEach(() => {
    createElementSpy.mockRestore()
  })

  it('does nothing when rows are empty', () => {
    exportToCsv('test.csv', [])
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('triggers an anchor click for non-empty rows', () => {
    exportToCsv('test.csv', [{ name: 'Alice', age: 30 }])
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('escapes values containing commas, quotes, and newlines', () => {
    const blobs: Blob[] = []
    const origBlob = globalThis.Blob
    globalThis.Blob = class extends origBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts)
        blobs.push(new origBlob(parts, opts))
      }
    } as typeof Blob
    try {
      exportToCsv('q.csv', [{ note: 'hello, "world"\nnewline' }])
    } finally {
      globalThis.Blob = origBlob
    }
    expect(blobs).toHaveLength(1)
  })
})
