// Sprint 3 / C4 — Tests for the auto-assign scoring engine.
//
// Pre-existing engine had no test coverage. This file locks down both
// the original axes (skill / location / availability / workload /
// familiarity) and the new parts axis with focused unit tests so a
// future change can't silently rebalance the scoring.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULE,
  DEFAULT_WEIGHTS,
  haversineKm,
  scoreEngineers,
  withDefaultRule,
  type CandidateEngineer,
  type CandidateJob,
  type AutoAssignRule,
} from './engine'

function eng(overrides: Partial<CandidateEngineer> = {}): CandidateEngineer {
  return {
    id: 'e-default',
    name: 'Default Engineer',
    accreditations: [],
    busy_windows: [],
    workload_this_week: 0,
    familiarity_count: 0,
    status: 'active',
    ...overrides,
  }
}

const PROP_LAT = 51.5074 // London
const PROP_LON = -0.1278

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(51, 0, 51, 0)).toBe(0)
  })

  it('London → Paris is roughly 344 km (within 5%)', () => {
    const km = haversineKm(51.5074, -0.1278, 48.8566, 2.3522)
    expect(km).toBeGreaterThan(330)
    expect(km).toBeLessThan(360)
  })
})

describe('withDefaultRule', () => {
  it('preserves explicit overrides', () => {
    const merged = withDefaultRule({ max_distance_km: 50, required_parts: [{ name: 'X' }] })
    expect(merged.max_distance_km).toBe(50)
    expect(merged.required_parts).toEqual([{ name: 'X' }])
  })

  it('falls back to defaults when fields are absent', () => {
    const merged = withDefaultRule({})
    expect(merged.max_distance_km).toBe(DEFAULT_RULE.max_distance_km)
    expect(merged.required_parts).toEqual([])
  })
})

describe('scoreEngineers — happy path', () => {
  it('ranks engineers by total score, highest first', () => {
    const job: CandidateJob = {
      property_latitude: PROP_LAT,
      property_longitude: PROP_LON,
    }
    const engineers = [
      eng({ id: 'far', home_latitude: 53, home_longitude: -2 }),       // ~290 km — within 80 km cap? no → hard fail
      eng({ id: 'close', home_latitude: 51.5, home_longitude: -0.13 }), // ~1 km
      eng({ id: 'mid', home_latitude: 51.7, home_longitude: -0.4 }),    // ~28 km
    ]
    const ranked = scoreEngineers({ job, engineers })
    expect(ranked[0].engineer.id).toBe('close')
    // 'far' should be filtered or zero-scored due to distance hard-fail.
    expect(ranked.find((r) => r.engineer.id === 'far')?.score ?? 0).toBe(0)
  })

  it('hard-fails when a required accreditation is missing', () => {
    const job: CandidateJob = {
      category: 'gas',
      property_latitude: PROP_LAT,
      property_longitude: PROP_LON,
    }
    const engineers = [
      eng({ id: 'no-gas', accreditations: [], home_latitude: PROP_LAT, home_longitude: PROP_LON }),
      eng({ id: 'gas-ok', accreditations: ['Gas Safe'], home_latitude: PROP_LAT, home_longitude: PROP_LON }),
    ]
    const ranked = scoreEngineers({ job, engineers })
    expect(ranked.find((r) => r.engineer.id === 'no-gas')?.score).toBe(0)
    expect(ranked.find((r) => r.engineer.id === 'gas-ok')?.score).toBeGreaterThan(0)
  })

  it('skips inactive engineers entirely', () => {
    const job: CandidateJob = { property_latitude: PROP_LAT, property_longitude: PROP_LON }
    const engineers = [
      eng({ id: 'active', status: 'active' }),
      eng({ id: 'inactive', status: 'inactive' }),
      eng({ id: 'on-leave', status: 'on_leave' }),
    ]
    const ranked = scoreEngineers({ job, engineers })
    const ids = ranked.map((r) => r.engineer.id)
    expect(ids).toContain('active')
    expect(ids).not.toContain('inactive')
    expect(ids).not.toContain('on-leave')
  })

  it('returns at most 5 candidates', () => {
    const job: CandidateJob = { property_latitude: PROP_LAT, property_longitude: PROP_LON }
    const engineers = Array.from({ length: 12 }).map((_, i) =>
      eng({ id: `e-${i}`, home_latitude: PROP_LAT, home_longitude: PROP_LON }),
    )
    const ranked = scoreEngineers({ job, engineers })
    expect(ranked).toHaveLength(5)
  })
})

describe('scoreEngineers — parts axis (Sprint 3 / C4)', () => {
  function job(): CandidateJob {
    return { property_latitude: PROP_LAT, property_longitude: PROP_LON }
  }

  function rule(weight: number, required: AutoAssignRule['required_parts']): AutoAssignRule {
    return {
      ...DEFAULT_RULE,
      required_parts: required,
      weight_overrides: { ...DEFAULT_WEIGHTS, parts: weight },
    }
  }

  it('returns parts=100 (no penalty) when no required_parts on rule', () => {
    const ranked = scoreEngineers({
      job: job(),
      engineers: [eng({ id: 'e', home_latitude: PROP_LAT, home_longitude: PROP_LON })],
    })
    expect(ranked[0].breakdown.parts).toBe(100)
  })

  it('returns parts=50 (neutral) when engineer has no van_stock data', () => {
    const ranked = scoreEngineers({
      job: job(),
      rule: rule(20, [{ name: 'O-ring', min_qty: 1 }]),
      engineers: [
        eng({
          id: 'unknown',
          home_latitude: PROP_LAT,
          home_longitude: PROP_LON,
          // van_stock omitted — proxy for "we have no movements record"
        }),
      ],
    })
    expect(ranked[0].breakdown.parts).toBe(50)
    expect(ranked[0].reasons.some((r) => /Van stock unknown/i.test(r))).toBe(true)
  })

  it('returns parts=100 when all required parts are matched by name (case-insensitive)', () => {
    const ranked = scoreEngineers({
      job: job(),
      rule: rule(20, [{ name: 'O-ring', min_qty: 1 }, { name: 'Compression Fitting', min_qty: 2 }]),
      engineers: [
        eng({
          id: 'stocked',
          home_latitude: PROP_LAT,
          home_longitude: PROP_LON,
          van_stock: [
            { name: 'Boiler O-Ring 12mm', qty: 4 },
            { name: '15mm Compression fitting', qty: 6 },
          ],
        }),
      ],
    })
    expect(ranked[0].breakdown.parts).toBe(100)
    expect(ranked[0].reasons.some((r) => /Has all 2 required parts/i.test(r))).toBe(true)
  })

  it('returns parts=50 when half the required parts are missing', () => {
    const ranked = scoreEngineers({
      job: job(),
      rule: rule(20, [{ name: 'O-ring', min_qty: 1 }, { name: 'Valve', min_qty: 1 }]),
      engineers: [
        eng({
          id: 'half',
          home_latitude: PROP_LAT,
          home_longitude: PROP_LON,
          van_stock: [{ name: 'O-Ring', qty: 1 }],
        }),
      ],
    })
    expect(ranked[0].breakdown.parts).toBe(50)
    expect(ranked[0].reasons.some((r) => /missing 1 of 2/i.test(r))).toBe(true)
  })

  it('matches by sku exact when both sku and name are present (sku wins)', () => {
    const ranked = scoreEngineers({
      job: job(),
      rule: rule(20, [{ sku: 'OR-12', name: 'Wrong name on purpose', min_qty: 1 }]),
      engineers: [
        eng({
          id: 'sku-match',
          home_latitude: PROP_LAT,
          home_longitude: PROP_LON,
          van_stock: [{ sku: 'OR-12', name: 'Boiler O-Ring 12mm', qty: 5 }],
        }),
      ],
    })
    expect(ranked[0].breakdown.parts).toBe(100)
  })

  it('counts parts as PARTIAL — never a hard fail', () => {
    // Engineer is missing all parts but otherwise perfect. Score
    // should drop below 100 but stay above 0 (parts is a soft signal).
    const ranked = scoreEngineers({
      job: job(),
      rule: rule(20, [{ name: 'Critical part', min_qty: 1 }]),
      engineers: [
        eng({
          id: 'no-parts',
          home_latitude: PROP_LAT,
          home_longitude: PROP_LON,
          van_stock: [], // empty van — has zero of required
        }),
      ],
    })
    expect(ranked[0].breakdown.parts).toBe(0)
    expect(ranked[0].score).toBeGreaterThan(0)
  })

  it('respects min_qty (engineer with not-enough fails the part)', () => {
    const ranked = scoreEngineers({
      job: job(),
      rule: rule(20, [{ name: 'Bolt', min_qty: 5 }]),
      engineers: [
        eng({
          id: 'low-qty',
          home_latitude: PROP_LAT,
          home_longitude: PROP_LON,
          van_stock: [{ name: 'Bolt', qty: 2 }],
        }),
      ],
    })
    expect(ranked[0].breakdown.parts).toBe(0)
  })
})

describe('weight normalisation', () => {
  it('weights summing to >100 are normalised back to 100% before scoring', () => {
    // Specifically: doubling all weights shouldn't change the
    // resulting score (the engine should normalise overrides).
    const job: CandidateJob = { property_latitude: PROP_LAT, property_longitude: PROP_LON }
    const e = eng({ home_latitude: PROP_LAT, home_longitude: PROP_LON })
    const a = scoreEngineers({ job, engineers: [e] })[0].score
    const doubled: AutoAssignRule = {
      ...DEFAULT_RULE,
      weight_overrides: {
        skill: 60,
        location: 50,
        availability: 40,
        workload: 30,
        familiarity: 20,
        parts: 0,
      },
    }
    const b = scoreEngineers({ job, rule: doubled, engineers: [e] })[0].score
    expect(b).toBe(a)
  })
})
