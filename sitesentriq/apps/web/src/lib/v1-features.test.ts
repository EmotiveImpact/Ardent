import { describe, expect, it } from 'vitest'
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  CLOSED_JOB_STATUSES,
  SERVICE_GROUPS,
} from './constants'
import { CERT_FORM_TEMPLATES, CERT_TEMPLATE_BY_KEY } from '@haumea/types'

// V1 backlog feature regressions — lock the data contracts the new features
// depend on so a label/template can't silently go missing.

describe('job statuses (V1 #1)', () => {
  it('every JOB_STATUSES value has a display label', () => {
    for (const status of Object.values(JOB_STATUSES)) {
      expect(JOB_STATUS_LABELS[status], `label for ${status}`).toBeTruthy()
    }
  })

  it('includes the new workflow states', () => {
    const values = Object.values(JOB_STATUSES) as string[]
    for (const s of ['not_ready', 'ready', 'pending_external', 'contractor_review', 'performed', 'rejected']) {
      expect(values).toContain(s)
    }
  })

  it('CLOSED_JOB_STATUSES are all real statuses or known terminal values', () => {
    // completed/cancelled/failed_access exist as values; performed/rejected are new.
    for (const s of CLOSED_JOB_STATUSES) {
      expect(JOB_STATUS_LABELS[s], `closed status ${s} should have a label`).toBeTruthy()
    }
    expect(CLOSED_JOB_STATUSES).toContain('completed')
    expect(CLOSED_JOB_STATUSES).toContain('performed')
    expect(CLOSED_JOB_STATUSES).toContain('rejected')
  })
})

describe('service groups (V1 #4)', () => {
  it('is a non-empty list of unique labels', () => {
    expect(SERVICE_GROUPS.length).toBeGreaterThan(0)
    expect(new Set(SERVICE_GROUPS).size).toBe(SERVICE_GROUPS.length)
  })
})

describe('cert form templates (V1 #9)', () => {
  it('has every named discipline (V1 four + Wave-3 UK statutory seven)', () => {
    const keys = CERT_FORM_TEMPLATES.map((t) => t.key)
    for (const k of [
      'fire_alarm', 'emergency_lighting', 'fire_extinguisher', 'access_control',
      'eicr', 'fire_alarm_weekly', 'fire_alarm_quarterly', 'gas_safety_cp12',
      'loler', 'legionella_monthly', 'legionella_quarterly',
    ]) {
      expect(keys).toContain(k)
    }
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every template has fields with valid types and a faults note', () => {
    for (const t of CERT_FORM_TEMPLATES) {
      expect(t.label).toBeTruthy()
      expect(t.fields.length).toBeGreaterThan(0)
      for (const f of t.fields) {
        expect(['pass_fail', 'text']).toContain(f.type)
        expect(f.key).toBeTruthy()
        expect(f.label).toBeTruthy()
      }
      // every template should let the engineer record observations/faults
      expect(t.fields.some((f) => f.key === 'faults_found' && f.type === 'text')).toBe(true)
    }
  })

  it('CERT_TEMPLATE_BY_KEY resolves each template', () => {
    for (const t of CERT_FORM_TEMPLATES) {
      expect(CERT_TEMPLATE_BY_KEY[t.key]).toBe(t)
    }
  })
})
