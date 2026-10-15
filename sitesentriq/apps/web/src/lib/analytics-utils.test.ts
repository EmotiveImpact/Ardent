// Sprint 1.5 / Analytics depth — tests for the date-range + resolution
// helpers. All inputs are minimally typed JobWithRelations / Invoice
// shells — we only care about the timing fields the helpers read.

import { describe, expect, it } from 'vitest'
import {
  buildDateRangeOptions,
  filterByCreatedSince,
  filterInvoicesByIssueSince,
  computeResolutionStats,
  bucketResolutionTimes,
  formatDurationHours,
} from './analytics-utils'

const NOW = new Date('2026-05-09T12:00:00Z')

describe('buildDateRangeOptions', () => {
  it('returns 5 options in ascending breadth', () => {
    const opts = buildDateRangeOptions(NOW)
    expect(opts.map((o) => o.key)).toEqual(['7d', '30d', '90d', 'ytd', 'all'])
  })

  it('7d start is 7 days before now', () => {
    const [seven] = buildDateRangeOptions(NOW)
    const diff = NOW.getTime() - (seven.startDate as Date).getTime()
    expect(Math.round(diff / (24 * 60 * 60 * 1000))).toBe(7)
  })

  it('ytd start is January 1st of the current year', () => {
    const ytd = buildDateRangeOptions(NOW).find((o) => o.key === 'ytd')!
    expect(ytd.startDate?.getMonth()).toBe(0)
    expect(ytd.startDate?.getDate()).toBe(1)
    expect(ytd.startDate?.getFullYear()).toBe(NOW.getFullYear())
  })

  it('all returns null start (no floor)', () => {
    const all = buildDateRangeOptions(NOW).find((o) => o.key === 'all')!
    expect(all.startDate).toBeNull()
  })
})

describe('filterByCreatedSince', () => {
  const rows = [
    { created_at: '2026-05-01T00:00:00Z', id: 'a' },
    { created_at: '2026-04-01T00:00:00Z', id: 'b' },
    { created_at: '2025-01-01T00:00:00Z', id: 'c' },
  ]

  it('returns all rows when since is null (all-time)', () => {
    expect(filterByCreatedSince(rows, null)).toHaveLength(3)
  })

  it('returns rows on or after the since date', () => {
    const out = filterByCreatedSince(rows, new Date('2026-04-15T00:00:00Z'))
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('keeps rows with no created_at (cant prove theyre old)', () => {
    const withMissing = [
      ...rows,
      { id: 'd' } as { id: string; created_at?: string },
    ]
    const out = filterByCreatedSince(withMissing, new Date('2026-04-15T00:00:00Z'))
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'd'])
  })

  it('handles undefined input gracefully', () => {
    expect(filterByCreatedSince(undefined, null)).toEqual([])
  })
})

describe('filterInvoicesByIssueSince', () => {
  const invoices = [
    {
      id: 'i1',
      created_at: '2025-01-01T00:00:00Z',
      issue_date: '2026-05-01T00:00:00Z',
    },
    {
      id: 'i2',
      created_at: '2026-04-01T00:00:00Z',
      issue_date: '2026-04-01T00:00:00Z',
    },
    {
      id: 'i3',
      created_at: '2026-03-01T00:00:00Z',
      // no issue_date — fall back to created_at
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[]

  it('uses issue_date when present', () => {
    const out = filterInvoicesByIssueSince(invoices, new Date('2026-04-15T00:00:00Z'))
    expect(out.map((r) => r.id)).toEqual(['i1'])
  })

  it('falls back to created_at when issue_date missing', () => {
    const out = filterInvoicesByIssueSince(invoices, new Date('2026-02-01T00:00:00Z'))
    expect(out.map((r) => r.id).sort()).toEqual(['i1', 'i2', 'i3'])
  })
})

// ---- Resolution stats -------------------------------------------------

function job(created: string | null, completed: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { created_at: created, completed_date: completed } as any
}

describe('computeResolutionStats', () => {
  it('returns zeroed stats for empty input', () => {
    const stats = computeResolutionStats([])
    expect(stats).toEqual({ count: 0, meanHours: null, medianHours: null, p90Hours: null })
  })

  it('skips jobs missing created_at or completed_date', () => {
    const stats = computeResolutionStats([
      job('2026-05-01T00:00:00Z', null),
      job(null, '2026-05-02T00:00:00Z'),
      job('2026-05-01T00:00:00Z', '2026-05-01T05:00:00Z'),
    ])
    expect(stats.count).toBe(1)
    expect(stats.meanHours).toBe(5)
  })

  it('drops absurd durations (> 1 year)', () => {
    const stats = computeResolutionStats([
      job('2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      job('2026-05-01T00:00:00Z', '2026-05-01T08:00:00Z'),
    ])
    expect(stats.count).toBe(1)
    expect(stats.meanHours).toBe(8)
  })

  it('drops negative durations (data-entry errors)', () => {
    const stats = computeResolutionStats([
      job('2026-05-02T00:00:00Z', '2026-05-01T00:00:00Z'),
      job('2026-05-01T00:00:00Z', '2026-05-01T10:00:00Z'),
    ])
    expect(stats.count).toBe(1)
    expect(stats.meanHours).toBe(10)
  })

  it('computes mean / median / p90 over a multi-job set', () => {
    // Hours: [1, 2, 4, 8, 100]
    const stats = computeResolutionStats([
      job('2026-05-01T00:00:00Z', '2026-05-01T01:00:00Z'),
      job('2026-05-01T00:00:00Z', '2026-05-01T02:00:00Z'),
      job('2026-05-01T00:00:00Z', '2026-05-01T04:00:00Z'),
      job('2026-05-01T00:00:00Z', '2026-05-01T08:00:00Z'),
      job('2026-05-01T00:00:00Z', '2026-05-05T04:00:00Z'),
    ])
    expect(stats.count).toBe(5)
    expect(stats.meanHours).toBeCloseTo(23, 0)
    expect(stats.medianHours).toBe(4)
    // 90th percentile of [1,2,4,8,100] linearly-interpolated: between
    // index 3 (8) and 4 (100) at fraction 0.6 → 8 + 0.6*(100-8) = 63.2
    expect(stats.p90Hours).toBeCloseTo(63.2, 1)
  })
})

describe('bucketResolutionTimes', () => {
  it('always returns 6 buckets in fixed order', () => {
    const labels = bucketResolutionTimes([]).map((b) => b.label)
    expect(labels).toEqual(['< 4h', '4–24h', '1–3d', '3–7d', '7–14d', '14d+'])
  })

  it('places jobs in the correct bucket', () => {
    const out = bucketResolutionTimes([
      job('2026-05-01T00:00:00Z', '2026-05-01T03:00:00Z'), // 3h → < 4h
      job('2026-05-01T00:00:00Z', '2026-05-01T18:00:00Z'), // 18h → 4–24h
      job('2026-05-01T00:00:00Z', '2026-05-03T00:00:00Z'), // 48h → 1–3d
      job('2026-05-01T00:00:00Z', '2026-05-06T00:00:00Z'), // 5d → 3–7d
      job('2026-05-01T00:00:00Z', '2026-05-12T00:00:00Z'), // 11d → 7–14d
      job('2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z'), // 31d → 14d+
    ])
    expect(out.map((b) => b.count)).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('ignores jobs without both timestamps', () => {
    const out = bucketResolutionTimes([
      job('2026-05-01T00:00:00Z', null),
      job(null, '2026-05-01T00:00:00Z'),
    ])
    expect(out.every((b) => b.count === 0)).toBe(true)
  })
})

describe('formatDurationHours', () => {
  it('handles null', () => {
    expect(formatDurationHours(null)).toBe('—')
  })
  it('formats sub-hour as "< 1h"', () => {
    expect(formatDurationHours(0.4)).toBe('< 1h')
  })
  it('formats hours < 24 as integer hours', () => {
    expect(formatDurationHours(3.4)).toBe('3h')
    expect(formatDurationHours(23.6)).toBe('24h')
  })
  it('formats < 10 days with one decimal', () => {
    expect(formatDurationHours(48)).toBe('2.0d')
    expect(formatDurationHours(60)).toBe('2.5d')
  })
  it('formats > 10 days as integer days', () => {
    expect(formatDurationHours(24 * 21)).toBe('21d')
  })
})
