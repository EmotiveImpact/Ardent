/**
 * Where the engine keeps its records. Today that is memory, optionally saved
 * to a JSON file so a local server keeps its data between restarts. A
 * Postgres store (Neon) replaces it later behind the same shape.
 *
 * Every business row carries the firm it belongs to (orgId). The engine
 * strips orgId and userId before anything leaves it, so callers only ever see
 * the shapes in core/src/data/model.ts.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Certificate, Customer, Invoice, Job, Note, Operator, Photo, Quote, Signature, Site, TimeEntry } from '../../core/src/data/model.ts'

/** A person who can sign in. */
export interface User {
  id: string
  email: string
  name: string
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
  /** Last number used per firm and kind, e.g. "org_demo:job" -> 1052. */
  counters: Record<string, number>
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
  counters: {},
})

export function memoryStore(data: Data = emptyData()): Store {
  return { data, commit() {} }
}

/** Memory, written through to a JSON file after every change. */
export function fileStore(path: string, fallback: () => Data = emptyData): Store {
  const data: Data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback()
  const store: Store = {
    data,
    commit() {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(`${path}.tmp`, JSON.stringify(data))
      renameSync(`${path}.tmp`, path)
    },
  }
  if (!existsSync(path)) store.commit()
  return store
}
