import { describe, expect, it } from 'vitest'
import { SCHEMAS, ENTITY_LIST, type ImportEntity } from './schemas'

describe('import schemas', () => {
  it('every listed entity has a schema, a required field, and a view path', () => {
    for (const entity of ENTITY_LIST) {
      const schema = SCHEMAS[entity]
      expect(schema, entity).toBeTruthy()
      expect(schema.entity).toBe(entity)
      expect(schema.fields.length).toBeGreaterThan(0)
      expect(schema.fields.some((f) => f.required)).toBe(true)
      expect(schema.viewPath).toMatch(/^\/dashboard\//)
    }
  })

  it('includes the migration-critical entities (contracts, subcontractors, maintenance plans)', () => {
    for (const e of ['contracts', 'subcontractors', 'maintenance_plans'] as ImportEntity[]) {
      expect(ENTITY_LIST).toContain(e)
    }
  })

  it('FK lookups only target entities with a `name` column (fetchNameMap selects id, name)', () => {
    // fetchNameMap resolves the FK by `name`, so the target must have one.
    const nameKeyed = ['clients', 'properties', 'assets']
    for (const entity of ENTITY_LIST) {
      for (const fk of SCHEMAS[entity].fkLookups ?? []) {
        expect(nameKeyed).toContain(fk.targetEntity)
      }
    }
  })

  it('maintenance plan frequency validator rejects junk, accepts the CHECK set', () => {
    const freq = SCHEMAS.maintenance_plans.fields.find((f) => f.key === 'frequency')!
    expect(freq.required).toBe(true)
    expect(freq.validate!('monthly', {})).toBeNull()
    expect(freq.validate!('six_monthly', {})).toBeNull()
    expect(freq.validate!('fortnightly', {})).toBeTruthy() // not in the DB CHECK
  })

  it('maintenance plan frequency TRANSFORM normalises spaces to match the DB CHECK', () => {
    // Regression: a space-containing value that passes validation ("Six Monthly")
    // must transform to the CHECK-legal "six_monthly", not "six monthly".
    const freq = SCHEMAS.maintenance_plans.fields.find((f) => f.key === 'frequency')!
    expect(freq.transform!('Six Monthly')).toBe('six_monthly')
    expect(freq.transform!('  MONTHLY ')).toBe('monthly')
    // whatever the validator accepts, the transform must produce the same token
    for (const raw of ['six monthly', 'Six_Monthly', 'quarterly']) {
      if (freq.validate!(raw, {}) === null) {
        expect(['daily', 'weekly', 'monthly', 'quarterly', 'six_monthly', 'annual'])
          .toContain(freq.transform!(raw))
      }
    }
  })

  it('contracts require a title + a client name (FK)', () => {
    const keys = SCHEMAS.contracts.fields.filter((f) => f.required).map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining(['title', 'client_name']))
    expect(SCHEMAS.contracts.fkLookups?.[0].fieldKey).toBe('client_name')
  })

  it('sfg20_aligned transform coerces truthy strings to boolean', () => {
    const f = SCHEMAS.maintenance_plans.fields.find((x) => x.key === 'sfg20_aligned')!
    expect(f.transform!('yes')).toBe(true)
    expect(f.transform!('true')).toBe(true)
    expect(f.transform!('no')).toBe(false)
    expect(f.transform!('')).toBe(false)
  })
})
