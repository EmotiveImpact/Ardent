// Sprint 1.5 / Analytics depth — helpers for date-range filtering and
// resolution-time stats. Kept as pure functions so they can be tested
// without rendering recharts.

import type { JobWithRelations, InvoiceWithRelations } from '@haumea/types'

export type DateRangeKey = '7d' | '30d' | '90d' | 'ytd' | 'all'

export interface DateRangeOption {
  key: DateRangeKey
  label: string
  /** Earliest moment included in the range (inclusive). null = no floor. */
  startDate: Date | null
}

/**
 * Build the option list at call time so "today" reflects the user's
 * actual today rather than module-load time.
 */
export function buildDateRangeOptions(now: Date = new Date()): DateRangeOption[] {
  const start7 = new Date(now)
  start7.setDate(start7.getDate() - 7)
  const start30 = new Date(now)
  start30.setDate(start30.getDate() - 30)
  const start90 = new Date(now)
  start90.setDate(start90.getDate() - 90)
  const startYear = new Date(now.getFullYear(), 0, 1)

  return [
    { key: '7d', label: 'Last 7 days', startDate: start7 },
    { key: '30d', label: 'Last 30 days', startDate: start30 },
    { key: '90d', label: 'Last 90 days', startDate: start90 },
    { key: 'ytd', label: 'Year to date', startDate: startYear },
    { key: 'all', label: 'All time', startDate: null },
  ]
}

/**
 * Filter a list of dated rows by `created_at` against a range start.
 * Rows with no created_at are kept (we can't prove they're old).
 */
export function filterByCreatedSince<T extends { created_at?: string }>(
  rows: T[] | undefined,
  since: Date | null,
): T[] {
  if (!rows) return []
  if (!since) return rows
  const sinceMs = since.getTime()
  return rows.filter((r) => {
    if (!r.created_at) return true
    const t = new Date(r.created_at).getTime()
    return Number.isFinite(t) && t >= sinceMs
  })
}

/**
 * Same idea for invoices, where we usually want to filter by
 * issue_date (when the work happened) rather than created_at (when the
 * row landed in the DB).
 */
export function filterInvoicesByIssueSince(
  rows: InvoiceWithRelations[] | undefined,
  since: Date | null,
): InvoiceWithRelations[] {
  if (!rows) return []
  if (!since) return rows
  const sinceMs = since.getTime()
  return rows.filter((r) => {
    const date = (r as { issue_date?: string }).issue_date ?? r.created_at
    if (!date) return true
    const t = new Date(date).getTime()
    return Number.isFinite(t) && t >= sinceMs
  })
}

// ---- Resolution time -------------------------------------------------

export interface ResolutionStats {
  /** How many jobs in the input had both created_at + completed_date. */
  count: number
  /** Mean resolution time in hours, or null when count is 0. */
  meanHours: number | null
  /** Median resolution time in hours, or null when count is 0. */
  medianHours: number | null
  /** 90th-percentile resolution time in hours, or null when count is 0. */
  p90Hours: number | null
}

/**
 * Compute mean/median/p90 hours-to-resolve across jobs that have both a
 * created_at and a completed_date. Negative or absurd durations (>1y)
 * are dropped — they're almost always data-entry errors that would
 * destroy the average.
 */
export function computeResolutionStats(jobs: JobWithRelations[] | undefined): ResolutionStats {
  if (!jobs || jobs.length === 0) {
    return { count: 0, meanHours: null, medianHours: null, p90Hours: null }
  }
  const HOUR = 60 * 60 * 1000
  const YEAR_HOURS = 24 * 365
  const hours: number[] = []
  for (const job of jobs) {
    if (!job.created_at || !job.completed_date) continue
    const start = new Date(job.created_at).getTime()
    const end = new Date(job.completed_date).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const h = (end - start) / HOUR
    if (h < 0 || h > YEAR_HOURS) continue
    hours.push(h)
  }
  if (hours.length === 0) {
    return { count: 0, meanHours: null, medianHours: null, p90Hours: null }
  }
  hours.sort((a, b) => a - b)
  const sum = hours.reduce((acc, h) => acc + h, 0)
  const mean = sum / hours.length
  const median = percentile(hours, 0.5)
  const p90 = percentile(hours, 0.9)
  return {
    count: hours.length,
    meanHours: mean,
    medianHours: median,
    p90Hours: p90,
  }
}

/**
 * Linear-interpolated percentile on a pre-sorted array. Returns the
 * first element when the array has only one entry, NaN-safe.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const frac = idx - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

/**
 * Bucket jobs into resolution-time bands for a histogram.
 * Buckets: 0-4h, 4-24h, 1-3d, 3-7d, 7-14d, 14d+
 */
export interface ResolutionBucket {
  label: string
  count: number
}

export function bucketResolutionTimes(jobs: JobWithRelations[] | undefined): ResolutionBucket[] {
  const buckets: ResolutionBucket[] = [
    { label: '< 4h', count: 0 },
    { label: '4–24h', count: 0 },
    { label: '1–3d', count: 0 },
    { label: '3–7d', count: 0 },
    { label: '7–14d', count: 0 },
    { label: '14d+', count: 0 },
  ]
  if (!jobs) return buckets
  const HOUR = 60 * 60 * 1000
  for (const job of jobs) {
    if (!job.created_at || !job.completed_date) continue
    const start = new Date(job.created_at).getTime()
    const end = new Date(job.completed_date).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const h = (end - start) / HOUR
    if (h < 0 || h > 24 * 365) continue
    if (h < 4) buckets[0].count++
    else if (h < 24) buckets[1].count++
    else if (h < 24 * 3) buckets[2].count++
    else if (h < 24 * 7) buckets[3].count++
    else if (h < 24 * 14) buckets[4].count++
    else buckets[5].count++
  }
  return buckets
}

/**
 * Pretty-print a duration in hours: "3h", "18h", "2d", "12d".
 * Used for stat-card values where the raw float is unreadable.
 */
export function formatDurationHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return '—'
  if (hours < 1) return '< 1h'
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  if (days < 10) return `${days.toFixed(1)}d`
  return `${Math.round(days)}d`
}
