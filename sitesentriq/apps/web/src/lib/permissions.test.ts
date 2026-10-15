import { describe, expect, it } from 'vitest'
import { hasPermission, hasAnyPermission, getPermissions } from './permissions'

describe('hasPermission', () => {
  it('returns false when role is undefined', () => {
    expect(hasPermission(undefined, 'clients:read')).toBe(false)
  })

  it('returns false for unknown role', () => {
    expect(hasPermission('mystery_guest', 'clients:read')).toBe(false)
  })

  it('grants org_admin every defined permission', () => {
    expect(hasPermission('org_admin', 'clients:write')).toBe(true)
    expect(hasPermission('org_admin', 'invoices:write')).toBe(true)
    expect(hasPermission('org_admin', 'settings:write')).toBe(true)
  })

  it('engineer cannot write clients', () => {
    expect(hasPermission('engineer', 'clients:write')).toBe(false)
  })

  it('engineer can read assets', () => {
    expect(hasPermission('engineer', 'assets:read')).toBe(true)
  })

  it('finance can write invoices but not properties', () => {
    expect(hasPermission('finance', 'invoices:write')).toBe(true)
    expect(hasPermission('finance', 'properties:write')).toBe(false)
  })

  it('client_admin is read-only on compliance', () => {
    expect(hasPermission('client_admin', 'compliance:read')).toBe(true)
    expect(hasPermission('client_admin', 'compliance:write')).toBe(false)
  })

  it('auditor cannot write anywhere', () => {
    const writeable: Array<Parameters<typeof hasPermission>[1]> = [
      'clients:write', 'properties:write', 'assets:write', 'compliance:write',
      'jobs:write', 'reports:write', 'documents:write', 'invoices:write',
    ]
    for (const p of writeable) {
      expect(hasPermission('auditor', p)).toBe(false)
    }
  })
})

describe('hasAnyPermission', () => {
  it('returns true if any permission matches', () => {
    expect(hasAnyPermission('engineer', ['clients:write', 'jobs:read'])).toBe(true)
  })

  it('returns false if none match', () => {
    expect(hasAnyPermission('client_admin', ['clients:write', 'settings:write'])).toBe(false)
  })

  it('returns false for undefined role', () => {
    expect(hasAnyPermission(undefined, ['clients:read'])).toBe(false)
  })
})

describe('getPermissions', () => {
  it('returns empty array for unknown / undefined role', () => {
    expect(getPermissions(undefined)).toEqual([])
    expect(getPermissions('nope')).toEqual([])
  })

  it('returns the full permission list for super_admin', () => {
    const perms = getPermissions('super_admin')
    expect(perms.length).toBeGreaterThan(20)
    expect(perms).toContain('settings:write')
  })
})
