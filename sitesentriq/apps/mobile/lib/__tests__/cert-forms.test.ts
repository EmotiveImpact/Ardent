import { describe, expect, it } from 'vitest'
import { CERT_FORM_TEMPLATES } from '@/constants/cert-forms'

// Guards the mobile copy of the cert templates (mirrors @haumea/types) so the
// engineer-facing capture form can't silently lose a discipline or field.
describe('mobile cert form templates (V1 #9)', () => {
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

  it('every field has a valid type + key, and each template has a faults note', () => {
    for (const t of CERT_FORM_TEMPLATES) {
      expect(t.label).toBeTruthy()
      expect(t.fields.length).toBeGreaterThan(0)
      for (const f of t.fields) {
        expect(['pass_fail', 'text']).toContain(f.type)
        expect(f.key).toBeTruthy()
        expect(f.label).toBeTruthy()
      }
      expect(t.fields.some((f) => f.key === 'faults_found' && f.type === 'text')).toBe(true)
    }
  })
})
