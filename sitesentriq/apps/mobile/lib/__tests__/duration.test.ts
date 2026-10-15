import { describe, expect, it } from 'vitest'
import { parseDurationMinutes } from '../duration'

describe('parseDurationMinutes', () => {
  it('parses plain minutes', () => {
    expect(parseDurationMinutes('90')).toBe(90)
    expect(parseDurationMinutes('45')).toBe(45)
  })

  it('parses colon form h:mm', () => {
    expect(parseDurationMinutes('1:30')).toBe(90)
    expect(parseDurationMinutes('2:05')).toBe(125)
  })

  it('parses bare-minute "1h30" form advertised in the placeholder (regression)', () => {
    // This is the exact case the old regex rejected, blocking time logging.
    expect(parseDurationMinutes('1h30')).toBe(90)
    expect(parseDurationMinutes('2h15')).toBe(135)
    expect(parseDurationMinutes('1h 30')).toBe(90)
  })

  it('still parses h / m / hm forms', () => {
    expect(parseDurationMinutes('2h')).toBe(120)
    expect(parseDurationMinutes('30m')).toBe(30)
    expect(parseDurationMinutes('1h30m')).toBe(90)
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseDurationMinutes('')).toBeNull()
    expect(parseDurationMinutes('   ')).toBeNull()
    expect(parseDurationMinutes('abc')).toBeNull()
    expect(parseDurationMinutes('0')).toBeNull()
  })
})
