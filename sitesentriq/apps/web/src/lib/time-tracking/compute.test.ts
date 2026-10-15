import { describe, expect, it } from 'vitest'
import { toLocalYmd, weekStartIso, addDaysIso } from './compute'

describe('time-tracking date helpers (TZ-stable, local calendar)', () => {
  it('toLocalYmd formats the LOCAL calendar day', () => {
    // A fixed local date — formatted from local getters, never UTC-shifted.
    const d = new Date(2026, 5, 7, 23, 30) // 7 Jun 2026, 23:30 local
    expect(toLocalYmd(d)).toBe('2026-06-07')
  })

  it('weekStartIso returns the local Monday of the week', () => {
    // Wednesday 10 Jun 2026 → Monday 8 Jun 2026.
    expect(weekStartIso(new Date(2026, 5, 10, 12, 0))).toBe('2026-06-08')
    // Sunday 7 Jun 2026 → previous Monday 1 Jun 2026.
    expect(weekStartIso(new Date(2026, 5, 7, 12, 0))).toBe('2026-06-01')
  })

  it('addDaysIso advances by whole local days', () => {
    expect(addDaysIso('2026-06-08', 7)).toBe('2026-06-15')
    expect(addDaysIso('2026-06-08', -7)).toBe('2026-06-01')
    // Month boundary
    expect(addDaysIso('2026-06-30', 1)).toBe('2026-07-01')
  })
})
