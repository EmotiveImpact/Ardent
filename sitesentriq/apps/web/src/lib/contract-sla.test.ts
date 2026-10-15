import { describe, expect, it } from 'vitest'
import { slaState, formatCountdown } from './contract-sla'

const NOW = new Date('2026-06-10T12:00:00Z')
const iso = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString()

describe('slaState', () => {
  it('no targets → no_sla', () => {
    expect(slaState({ created_at: iso(-60) }, NOW)).toBe('no_sla')
  })

  it('open job with plenty of window → on_track', () => {
    expect(
      slaState({ created_at: iso(-60), target_response_at: iso(30), target_fix_at: iso(180) }, NOW),
    ).toBe('on_track')
  })

  it('open job inside the last 25% of the fix window → at_risk', () => {
    // window 100min, 20min left (20% remaining)
    expect(
      slaState(
        {
          created_at: iso(-80),
          target_response_at: iso(-10),
          sla_response_met_at: iso(-50),
          target_fix_at: iso(20),
        },
        NOW,
      ),
    ).toBe('at_risk')
  })

  it('response target passed unmet → response_breached', () => {
    expect(
      slaState({ created_at: iso(-120), target_response_at: iso(-5), target_fix_at: iso(120) }, NOW),
    ).toBe('response_breached')
  })

  it('response met LATE → response_breached even after the fact', () => {
    expect(
      slaState(
        {
          created_at: iso(-120),
          target_response_at: iso(-60),
          sla_response_met_at: iso(-30), // 30min late
          target_fix_at: iso(120),
        },
        NOW,
      ),
    ).toBe('response_breached')
  })

  it('fix target passed unmet → fix_breached (dominates response state)', () => {
    expect(
      slaState(
        { created_at: iso(-300), target_response_at: iso(-200), target_fix_at: iso(-10) },
        NOW,
      ),
    ).toBe('fix_breached')
  })

  it('both met on time → met', () => {
    expect(
      slaState(
        {
          created_at: iso(-300),
          target_response_at: iso(-200),
          sla_response_met_at: iso(-250),
          target_fix_at: iso(-10),
          sla_fix_met_at: iso(-60),
        },
        NOW,
      ),
    ).toBe('met')
  })
})

describe('formatCountdown', () => {
  it('formats remaining time', () => {
    expect(formatCountdown(iso(45), NOW)).toBe('45m')
    expect(formatCountdown(iso(125), NOW)).toBe('2h 5m')
    expect(formatCountdown(iso(60 * 26), NOW)).toBe('1d 2h')
  })

  it('marks overdue', () => {
    expect(formatCountdown(iso(-30), NOW)).toBe('30m over')
  })
})
