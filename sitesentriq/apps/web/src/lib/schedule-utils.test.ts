import { describe, expect, it } from 'vitest'
import { generateDatesForFrequency, monthFromISO } from './schedule-utils'

describe('generateDatesForFrequency', () => {
  it('returns empty array for invalid seed date', () => {
    expect(generateDatesForFrequency('not-a-date', 'monthly', 2026)).toEqual([])
  })

  it('generates 12 monthly dates within a year', () => {
    const dates = generateDatesForFrequency('2026-01-15', 'monthly', 2026)
    expect(dates).toHaveLength(12)
    expect(dates[0]).toBe('2026-01-15')
    expect(dates[11]).toBe('2026-12-15')
  })

  it('generates 4 quarterly dates', () => {
    const dates = generateDatesForFrequency('2026-02-01', 'quarterly', 2026)
    expect(dates).toHaveLength(4)
    expect(dates).toEqual(['2026-02-01', '2026-05-01', '2026-08-01', '2026-11-01'])
  })

  it('treats biannual and six_monthly as synonyms', () => {
    const a = generateDatesForFrequency('2026-03-01', 'biannual', 2026)
    const b = generateDatesForFrequency('2026-03-01', 'six_monthly', 2026)
    expect(a).toEqual(b)
    expect(a).toHaveLength(2)
  })

  it('annual frequency yields exactly one date in the target year', () => {
    const dates = generateDatesForFrequency('2026-06-15', 'annual', 2026)
    expect(dates).toEqual(['2026-06-15'])
  })

  it('weekly frequency walks forward from seed within the year', () => {
    const dates = generateDatesForFrequency('2026-01-05', 'weekly', 2026)
    // ~52 weeks
    expect(dates.length).toBeGreaterThanOrEqual(50)
    expect(dates.length).toBeLessThanOrEqual(53)
    expect(dates[0]).toBe('2026-01-05')
  })

  it('uses monthly default when frequency is unknown', () => {
    const dates = generateDatesForFrequency('2026-01-15', 'never-heard-of-it', 2026)
    expect(dates.length).toBeGreaterThan(0)
  })

  it('walks backwards from a future seed date into the target year', () => {
    const dates = generateDatesForFrequency('2027-04-15', 'quarterly', 2026)
    expect(dates).toContain('2026-04-15')
    expect(dates.length).toBe(4)
  })

  it('keeps a month-end seed on each month true last day (regression)', () => {
    // A Jan-31 monthly seed must walk Feb 28, Mar 31, Apr 30, May 31… — NOT get
    // pinned at the 28th after February.
    const dates = generateDatesForFrequency('2026-01-31', 'monthly', 2026)
    expect(dates).toContain('2026-01-31')
    expect(dates).toContain('2026-02-28')
    expect(dates).toContain('2026-03-31')
    expect(dates).toContain('2026-04-30')
    expect(dates).toContain('2026-05-31')
    expect(dates).toContain('2026-12-31')
  })

  it('produces the same dates regardless of the seed string shape / timezone', () => {
    // Date-only and full-timestamp seeds for the same calendar day must agree,
    // and must be the literal seed day (no UTC-parse off-by-one).
    const a = generateDatesForFrequency('2026-03-15', 'monthly', 2026)
    const b = generateDatesForFrequency('2026-03-15T09:30:00+00:00', 'monthly', 2026)
    expect(a).toEqual(b)
    expect(a).toContain('2026-03-15')
  })
})

describe('monthFromISO', () => {
  it('returns 0-indexed month', () => {
    expect(monthFromISO('2026-01-15')).toBe(0)
    expect(monthFromISO('2026-12-31')).toBe(11)
  })

  it('returns the right month for first-of-month dates (TZ-stable)', () => {
    expect(monthFromISO('2026-03-01')).toBe(2)
    expect(monthFromISO('2026-11-01')).toBe(10)
  })
})
