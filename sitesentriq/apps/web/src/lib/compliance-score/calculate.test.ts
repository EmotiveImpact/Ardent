import { describe, it, expect } from 'vitest'
import {
  calculateComplianceScore,
  COMPLIANCE_SCORE_OVERDUE_ACTION_PRIORITY,
  COMPLIANCE_SCORE_WEIGHTS,
  type ScoreInput,
} from './calculate'

const EMPTY_INPUT: ScoreInput = {
  compliance_items: [],
  ppm_jobs: [],
  pass_jobs: [],
  overdue_actions_count: 0,
}

describe('calculateComplianceScore — edge cases', () => {
  it('returns score 0 + zero breakdown when every input is empty', () => {
    const result = calculateComplianceScore(EMPTY_INPUT)
    expect(result.score).toBe(0)
    expect(result.breakdown).toEqual({
      compliance: 0,
      ppm_on_time: 0,
      pass_rate: 0,
      action_health: 0,
    })
  })

  it('does not penalise an org with no PPM jobs / no pass jobs IF action_health absorbs the credit', () => {
    // 100% compliance, 0 PPM jobs, 0 pass jobs, 0 overdue actions.
    // action_health is 100 by definition (no actions means no overdue).
    // Compliance contributes 40 pts, action_health contributes 10.
    const result = calculateComplianceScore({
      compliance_items: [{ status: 'compliant' }, { status: 'compliant' }],
      ppm_jobs: [],
      pass_jobs: [],
      overdue_actions_count: 0,
    })
    expect(result.breakdown.compliance).toBe(100)
    expect(result.breakdown.action_health).toBe(100)
    expect(result.breakdown.ppm_on_time).toBe(0)
    expect(result.breakdown.pass_rate).toBe(0)
    expect(result.score).toBe(50) // 100 * 0.4 + 100 * 0.1
  })

  it('clamps a perfect input at exactly 100', () => {
    const result = calculateComplianceScore({
      compliance_items: Array.from({ length: 10 }, () => ({ status: 'compliant' })),
      ppm_jobs: [{ scheduled_date: '2026-04-01', completed_date: '2026-03-31' }],
      pass_jobs: [{ outcome: 'pass' }, { outcome: 'pass' }],
      overdue_actions_count: 0,
    })
    expect(result.score).toBe(100)
  })

  it('floors action_health at 0 when overdue actions blow past 20', () => {
    const result = calculateComplianceScore({
      ...EMPTY_INPUT,
      overdue_actions_count: 999,
    })
    expect(result.breakdown.action_health).toBe(0)
  })
})

describe('calculateComplianceScore — compliance dimension', () => {
  it('treats due_soon as still in-compliance (counts as positive)', () => {
    const result = calculateComplianceScore({
      ...EMPTY_INPUT,
      compliance_items: [
        { status: 'compliant' },
        { status: 'due_soon' },
        { status: 'overdue' },
        { status: 'overdue' },
      ],
    })
    // 2 of 4 positive → 50%
    expect(result.breakdown.compliance).toBe(50)
  })

  it('treats unknown statuses as non-compliant', () => {
    const result = calculateComplianceScore({
      ...EMPTY_INPUT,
      compliance_items: [{ status: 'compliant' }, { status: 'mystery' }],
    })
    expect(result.breakdown.compliance).toBe(50)
  })
})

describe('calculateComplianceScore — PPM-on-time dimension', () => {
  it('counts a job completed BEFORE its scheduled date as on-time', () => {
    const result = calculateComplianceScore({
      ...EMPTY_INPUT,
      ppm_jobs: [{ scheduled_date: '2026-04-15', completed_date: '2026-04-10' }],
    })
    expect(result.breakdown.ppm_on_time).toBe(100)
  })

  it('counts an incomplete (no completed_date) job as not-on-time', () => {
    const result = calculateComplianceScore({
      ...EMPTY_INPUT,
      ppm_jobs: [
        { scheduled_date: '2026-04-15', completed_date: '2026-04-15' }, // on-time
        { scheduled_date: '2026-04-15', completed_date: null }, // incomplete
      ],
    })
    expect(result.breakdown.ppm_on_time).toBe(50)
  })

  it('skips jobs with no scheduled_date entirely (does not dilute the ratio)', () => {
    const result = calculateComplianceScore({
      ...EMPTY_INPUT,
      ppm_jobs: [
        { scheduled_date: '2026-04-15', completed_date: '2026-04-15' },
        { scheduled_date: null, completed_date: '2026-04-15' }, // ignored
      ],
    })
    expect(result.breakdown.ppm_on_time).toBe(100)
  })
})

describe('calculateComplianceScore — pass-rate dimension', () => {
  it('only counts jobs with a non-null outcome', () => {
    const result = calculateComplianceScore({
      ...EMPTY_INPUT,
      pass_jobs: [
        { outcome: 'pass' },
        { outcome: 'pass' },
        { outcome: 'fail' },
        { outcome: null }, // not a signal — excluded from numerator + denominator
      ],
    })
    expect(result.breakdown.pass_rate).toBe(67) // 2/3 → 66.67 → 67
  })

  it('treats partial as a fail (only outcome === pass counts)', () => {
    const result = calculateComplianceScore({
      ...EMPTY_INPUT,
      pass_jobs: [{ outcome: 'pass' }, { outcome: 'partial' }],
    })
    expect(result.breakdown.pass_rate).toBe(50)
  })
})

describe('calculateComplianceScore — action-health dimension', () => {
  it('documents critical priority as the overdue action signal', () => {
    expect(COMPLIANCE_SCORE_OVERDUE_ACTION_PRIORITY).toBe('critical')
  })

  it('subtracts 5 pts per overdue critical action', () => {
    expect(calculateComplianceScore({ ...EMPTY_INPUT, overdue_actions_count: 1 }).breakdown.action_health).toBe(95)
    expect(calculateComplianceScore({ ...EMPTY_INPUT, overdue_actions_count: 5 }).breakdown.action_health).toBe(75)
    expect(calculateComplianceScore({ ...EMPTY_INPUT, overdue_actions_count: 20 }).breakdown.action_health).toBe(0)
  })
})

describe('calculateComplianceScore — weighted headline score', () => {
  it('applies the documented 40 / 25 / 25 / 10 weights', () => {
    // Hand-pick a mix where each dimension lands on 80 except pass_rate at 60:
    //   compliance=80, ppm_on_time=80, pass_rate=60, action_health=80
    //   = 80*0.4 + 80*0.25 + 60*0.25 + 80*0.1 = 32 + 20 + 15 + 8 = 75
    const result = calculateComplianceScore({
      compliance_items: [
        { status: 'compliant' },
        { status: 'compliant' },
        { status: 'compliant' },
        { status: 'compliant' },
        { status: 'overdue' },
      ], // 4/5 = 80%
      ppm_jobs: [
        { scheduled_date: '2026-04-15', completed_date: '2026-04-15' },
        { scheduled_date: '2026-04-15', completed_date: '2026-04-15' },
        { scheduled_date: '2026-04-15', completed_date: '2026-04-15' },
        { scheduled_date: '2026-04-15', completed_date: '2026-04-15' },
        { scheduled_date: '2026-04-15', completed_date: null },
      ], // 4/5 = 80%
      pass_jobs: [
        { outcome: 'pass' },
        { outcome: 'pass' },
        { outcome: 'pass' },
        { outcome: 'fail' },
        { outcome: 'fail' },
      ], // 3/5 = 60%
      overdue_actions_count: 4, // 100 - 4*5 = 80%
    })
    expect(result.breakdown).toEqual({
      compliance: 80,
      ppm_on_time: 80,
      pass_rate: 60,
      action_health: 80,
    })
    expect(result.score).toBe(75)
  })

  it('exposes weights as a constant for the dashboard disclosure', () => {
    const sum =
      COMPLIANCE_SCORE_WEIGHTS.compliance +
      COMPLIANCE_SCORE_WEIGHTS.ppm_on_time +
      COMPLIANCE_SCORE_WEIGHTS.pass_rate +
      COMPLIANCE_SCORE_WEIGHTS.action_health
    expect(sum).toBeCloseTo(1, 5)
  })
})
