/**
 * The Manchester demo firm from Ardent Core's mock data, as engine records,
 * so the local engine opens on the same jobs the prototypes show.
 *
 * Sign-ins are for local development only. Dan owns the firm and works on the
 * tools; Jo runs the office; Kofi, Ryan and Tom are in the field;
 * Sam is a freelance gas engineer the firm calls in.
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
  { id: 'usr_sam', email: 'sam@demo.ardent.local', name: 'Sam Ellis', role: 'field', operatorId: 'opr_05' },
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
    priceList: own(mock.priceList),
    stock: own(mock.stock),
    gasRecords: own(mock.gasRecords),
    // The day so far: Dan drove over and has been on the tools since eight.
    time: own([
      { id: 'tim_01', operatorId: 'opr_01', jobId: 'job_1042', kind: 'travel' as const, start: '2026-10-18T06:35:00Z', end: '2026-10-18T07:00:00Z' },
      { id: 'tim_02', operatorId: 'opr_01', jobId: 'job_1042', kind: 'labour' as const, start: '2026-10-18T07:00:00Z' },
    ]),
    counters: {
      [`${orgId}:job`]: maxRef(mock.jobs.map((j) => j.ref)),
      [`${orgId}:invoice`]: maxRef(mock.invoices.map((i) => i.ref)),
      [`${orgId}:quote`]: maxRef(mock.quotes.map((q) => q.ref)),
      [`${orgId}:cp12`]: maxRef(mock.gasRecords.map((r) => r.ref)),
    },
  }
}

/** The day the demo firm's records were written around. */
export const DEMO_DAY = '2026-10-18'

const DAY_MS = 86_400_000
const ZONE = 'Europe/London'

/** UK wall-clock parts of an instant. */
function londonParts(ms: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(ms)
      .map((p) => [p.type, Number(p.value)]),
  )
  return parts as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>
}

/** The instant a UK wall-clock time falls on. */
function fromLondon(y: number, mo: number, d: number, h: number, mi: number, s: number) {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s)
  let at = wall
  for (let i = 0; i < 2; i++) {
    const p = londonParts(at)
    at = wall - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at)
  }
  return at
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/

/**
 * Moves every date in the demo records by whole days so the demo's busy day
 * lands on `today`, keeping UK wall-clock times (a 09:30 visit stays 09:30
 * either side of the clocks changing). Used by the in-app demo so the
 * prototypes always open on a live-looking day.
 */
export function shiftDemo<T>(value: T, today: string, from = DEMO_DAY): T {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
  if (!days) return value
  const move = (v: unknown): unknown => {
    if (typeof v === 'string') {
      if (DATE.test(v)) return new Date(Date.parse(`${v}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
      if (STAMP.test(v)) {
        const p = londonParts(Date.parse(v))
        return new Date(fromLondon(p.year, p.month, p.day + days, p.hour, p.minute, p.second)).toISOString().replace('.000Z', 'Z')
      }
      return v
    }
    if (Array.isArray(v)) return v.map(move)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, move(x)]))
    return v
  }
  return move(value) as T
}
