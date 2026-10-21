/**
 * Where the engine keeps its records. Today that is memory, optionally saved
 * to a JSON file (store-file.ts) so a local server keeps its data between
 * restarts. A Postgres store (Neon) replaces it later behind the same shape.
 *
 * Every business row carries the firm it belongs to (orgId). The engine
 * strips orgId and userId before anything leaves it, so callers only ever see
 * the shapes in core/src/data/model.ts.
 */
import type { Certificate, Customer, GasSafetyRecord, Invoice, Job, Note, Operator, Photo, PriceItem, Quote, Signature, Site, StockLevel, TimeEntry } from '../../core/src/data/model.ts'

/** A person who can sign in. */
export interface User {
  id: string
  email: string
  name: string
  /** scrypt hash; see auth.ts. Never leaves the engine. */
  passwordHash?: string
}

/** A signed-in device. Only the token's hash is kept. */
export interface SessionRow {
  tokenHash: string
  userId: string
  createdAt: string
  expiresAt: string
}

/**
 * A change the engine has already applied, keyed by the request id the app
 * sent with it. When a phone retries after losing signal, the engine hands
 * back the first answer instead of applying the change twice.
 */
export interface DoneRequest {
  key: string
  at: string
  result: unknown
}

/** A firm on Ardent. The engine is set up per industry; trades is the first. */
export interface Organisation {
  id: string
  name: string
  slug: string
  industry: string
  createdAt: string
}

/**
 * owner  runs the firm: everything office can do, plus members
 * office dispatch, customers, jobs, money (Ardent Core)
 * field  engineers and subbies on the phone (Ardent Field): only their own jobs
 */
export type Role = 'owner' | 'office' | 'field'

export interface Membership {
  orgId: string
  userId: string
  role: Role
}

export type Owned<T> = T & { orgId: string }

/** A crew member, linked to a sign-in once they have the Field app. */
export type OperatorRow = Owned<Operator> & { userId?: string }

export interface Data {
  version: 1
  users: User[]
  orgs: Organisation[]
  memberships: Membership[]
  operators: OperatorRow[]
  customers: Owned<Customer>[]
  sites: Owned<Site>[]
  jobs: Owned<Job>[]
  time: Owned<TimeEntry>[]
  photos: Owned<Photo>[]
  notes: Owned<Note>[]
  signatures: Owned<Signature>[]
  quotes: Owned<Quote>[]
  invoices: Owned<Invoice>[]
  certificates: Owned<Certificate>[]
  priceList: Owned<PriceItem>[]
  stock: Owned<StockLevel>[]
  gasRecords: Owned<GasSafetyRecord>[]
  /** Last number used per firm and kind, e.g. "org_demo:job" -> 1052. */
  counters: Record<string, number>
  sessions: SessionRow[]
  requests: DoneRequest[]
  /** Signs photo links. Made on first start. */
  secret?: string
}

export interface Store {
  data: Data
  /** Called after every change the engine makes. */
  commit(): void
}

export const emptyData = (): Data => ({
  version: 1,
  users: [],
  orgs: [],
  memberships: [],
  operators: [],
  customers: [],
  sites: [],
  jobs: [],
  time: [],
  photos: [],
  notes: [],
  signatures: [],
  quotes: [],
  invoices: [],
  certificates: [],
  priceList: [],
  stock: [],
  gasRecords: [],
  counters: {},
  sessions: [],
  requests: [],
})

export function memoryStore(data: Data = emptyData()): Store {
  return { data, commit() {} }
}
