/**
 * The Manchester demo firm from Ardent Core's mock data, as engine records,
 * so the local engine opens on the same jobs the prototypes show.
 *
 * Sign-ins are for local development only. Dan owns the firm and works on the
 * tools; Jo runs the office; Kofi, Ryan and Tom are in the field.
 */
import * as mock from '../../core/src/data/mock.ts'
import type { Platform } from './platform.ts'
import { type Data, emptyData, type Role } from './store.ts'

/** Local development only. */
export const DEMO_PASSWORD = 'ardent-demo'

export const DEMO_ORG = 'org_demo'

export const demoUsers: { id: string; email: string; name: string; role: Role; operatorId?: string }[] = [
  { id: 'usr_dan', email: 'dan@demo.ardent.local', name: 'Dan Mercer', role: 'owner', operatorId: 'opr_01' },
  { id: 'usr_jo', email: 'jo@demo.ardent.local', name: 'Jo Pickering', role: 'office' },
  { id: 'usr_kofi', email: 'kofi@demo.ardent.local', name: 'Kofi Asante', role: 'field', operatorId: 'opr_02' },
  { id: 'usr_ryan', email: 'ryan@demo.ardent.local', name: 'Ryan Holt', role: 'field', operatorId: 'opr_03' },
  { id: 'usr_tom', email: 'tom@demo.ardent.local', name: 'Tom Byrne', role: 'field', operatorId: 'opr_04' },
]

export function demoData(platform: Pick<Platform, 'hashPassword'>): Data {
  const orgId = DEMO_ORG
  const own = <T extends object>(rows: T[]) => structuredClone(rows).map((r) => ({ ...r, orgId }))
  const maxRef = (refs: string[]) => Math.max(...refs.map((r) => Number(r.replace(/\D/g, ''))))
  return {
    ...emptyData(),
    users: demoUsers.map(({ id, email, name }) => ({ id, email, name, passwordHash: platform.hashPassword(DEMO_PASSWORD) })),
    orgs: [{ id: orgId, name: 'Mercer Heating & Electrical', slug: 'mercer-heating', industry: 'trades', createdAt: '2026-10-01T00:00:00Z' }],
    memberships: demoUsers.map((u) => ({ orgId, userId: u.id, role: u.role })),
    operators: own(mock.operators).map((o) => ({ ...o, userId: demoUsers.find((u) => u.operatorId === o.id)?.id })),
    customers: own(mock.customers),
    sites: own(mock.sites),
    jobs: own(mock.jobs),
    quotes: own(mock.quotes),
    invoices: own(mock.invoices),
    certificates: own(mock.certificates),
    counters: {
      [`${orgId}:job`]: maxRef(mock.jobs.map((j) => j.ref)),
      [`${orgId}:invoice`]: maxRef(mock.invoices.map((i) => i.ref)),
    },
  }
}
