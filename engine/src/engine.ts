/**
 * The Ardent engine: one set of records and rules under Ardent Core and
 * Ardent Field.
 *
 * Everything goes through a session (who is asking, for which firm). The
 * session's client is the same ArdentClient both apps already code against,
 * so a screen can't tell the engine from the mock, except that the engine
 * enforces the rules:
 *
 * - Tenancy: a firm only ever sees its own records. Anything outside the
 *   caller's firm reads as not found, so nothing leaks about other firms.
 * - Office (owner or office role) sees and changes everything in the firm.
 * - Field sees only the jobs they are on, plus those jobs' customers and
 *   sites and the crew list. On site they move the job through the day,
 *   log lines and checks, book their own time, add photos, notes and
 *   signatures, and invoice and take payment on their own jobs. They can't
 *   book, retitle or rebook work, or act in someone else's name.
 * - Removing someone's membership cuts them off straight away; their crew
 *   record and history stay.
 *
 * Adapted from Haumea's tenancy model (an organisation on every record, the
 * rules checked in one place) and its customer, site and job records.
 */
import { randomUUID } from 'node:crypto'
import type { ArdentClient } from '../../core/src/data/client.ts'
import type { ComplianceCheck, Invoice, Job, JobStatus, LineItem, Operator } from '../../core/src/data/model.ts'
import type { Data, Membership, Organisation, Owned, Role, Store, User } from './store.ts'

export type ErrorCode = 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid'

export class EngineError extends Error {
  code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

const forbidden = (why: string) => new EngineError('forbidden', why)
const notFound = (what: string) => new EngineError('not_found', `${what} not found`)
const invalid = (why: string) => new EngineError('invalid', why)

/** Who is asking, and for which firm. */
export interface Session {
  userId: string
  orgId: string
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`

/** Statuses an engineer may move their own job to. */
const FIELD_STATUSES: JobStatus[] = ['booked', 'en_route', 'on_site', 'paused', 'complete']
/** Once a job reaches one of these, Field can't reopen it or add to it. */
const CLOSED: JobStatus[] = ['invoiced', 'paid', 'cancelled']

const CHECK_LABEL: Record<ComplianceCheck['key'], string> = {
  rams: 'RAMS',
  permit: 'Permit',
  registration: 'Registration',
  gas_tightness: 'Tightness test',
  eicr: 'Electrical cert',
  photos: 'Photos',
  signature: 'Customer sign-off',
}

const DAY = 24 * 60 * 60 * 1000

/** Net, VAT and gross in pence. VAT is rounded once on the net, as on a UK invoice. */
export function invoiceTotals(inv: Pick<Invoice, 'lines' | 'vatRate'>) {
  const net = inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const vat = Math.round((net * inv.vatRate) / 10000)
  return { net, vat, total: net + vat }
}

/** Copy a row out of the store without the engine's own fields. */
function out<T extends object>(row: T): Omit<T, 'orgId' | 'userId'> {
  const { orgId: _o, userId: _u, ...rest } = structuredClone(row) as T & { orgId?: string; userId?: string }
  return rest
}

export function createEngine(store: Store) {
  const db: Data = store.data

  /** Next human number for a firm: J-1001, INV-1001. New firms start at 1001. */
  function nextNumber(orgId: string, kind: string) {
    const key = `${orgId}:${kind}`
    db.counters[key] = (db.counters[key] ?? 1000) + 1
    return db.counters[key]
  }

  function addUser(input: { email: string; name: string; id?: string }): User {
    const email = input.email.trim().toLowerCase()
    if (!email.includes('@')) throw invalid('a valid email is needed')
    if (db.users.some((u) => u.email === email)) throw invalid('that email is already in use')
    const user: User = { id: input.id ?? newId('usr'), email, name: input.name }
    db.users.push(user)
    store.commit()
    return { ...user }
  }

  /** Sign-up: a new firm, with the person creating it as its owner. */
  function createOrganisation(userId: string, input: { name: string; slug: string; industry?: string }): Organisation {
    if (!db.users.some((u) => u.id === userId)) throw new EngineError('unauthenticated', 'sign in first')
    if (!input.name.trim()) throw invalid('the firm needs a name')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug)) throw invalid('slug must be lower case words joined by hyphens')
    if (db.orgs.some((o) => o.slug === input.slug)) throw invalid('that slug is taken')
    const org: Organisation = {
      id: newId('org'),
      name: input.name.trim(),
      slug: input.slug,
      industry: input.industry ?? 'trades',
      createdAt: new Date().toISOString(),
    }
    db.orgs.push(org)
    db.memberships.push({ orgId: org.id, userId, role: 'owner' })
    store.commit()
    return { ...org }
  }

  /** Firms a person belongs to, for choosing one after sign-in. */
  function organisationsFor(userId: string): (Organisation & { role: Role })[] {
    return db.memberships
      .filter((m) => m.userId === userId)
      .flatMap((m) => {
        const org = db.orgs.find((o) => o.id === m.orgId)
        return org ? [{ ...org, role: m.role }] : []
      })
  }

  /** The client for one person in one firm. Rules are checked on every call. */
  function as(session: Session) {
    const { orgId, userId } = session

    const membership = (): Membership => {
      const m = db.memberships.find((x) => x.orgId === orgId && x.userId === userId)
      if (!m) throw forbidden('not a member of this firm')
      return m
    }
    const isOffice = () => membership().role !== 'field'
    const isOwner = () => membership().role === 'owner'
    const requireOffice = (what: string) => {
      if (!isOffice()) throw forbidden(`only the office can ${what}`)
    }
    const myOperator = () => {
      membership()
      return db.operators.find((o) => o.orgId === orgId && o.userId === userId)
    }
    const assigned = (job: Job) => {
      const me = myOperator()
      return !!me && job.operatorIds.includes(me.id)
    }
    const canSeeJob = (job: Owned<Job>) => job.orgId === orgId && (isOffice() || assigned(job))

    const findJob = (id: string) => {
      const job = db.jobs.find((j) => j.id === id)
      if (!job || !canSeeJob(job)) throw notFound('job')
      return job
    }
    /** A job the caller may add to: office always, field while it's open. */
    const editableJob = (id: string) => {
      const job = findJob(id)
      if (!isOffice() && CLOSED.includes(job.status)) throw forbidden(`job is ${job.status}`)
      return job
    }
    /** Field may only act as themselves, on their own jobs. */
    const actingAs = (operatorId: string, job?: Owned<Job>) => {
      const op = db.operators.find((o) => o.id === operatorId && o.orgId === orgId)
      if (!op) throw notFound('operator')
      if (isOffice()) return op
      if (op.id !== myOperator()?.id) throw forbidden("can't act for another engineer")
      if (job && !assigned(job)) throw notFound('job')
      return op
    }
    const fieldSees = (pred: (j: Owned<Job>) => boolean) =>
      db.jobs.some((j) => j.orgId === orgId && pred(j) && assigned(j))

    const done = <T,>(value: T) => {
      store.commit()
      return Promise.resolve(value)
    }
    /** Run a rule check and hand back a promise, so errors reject like a network call would. */
    const run = <T,>(fn: () => T): Promise<T> => {
      try {
        return Promise.resolve(fn())
      } catch (e) {
        return Promise.reject(e)
      }
    }

    const client: ArdentClient = {
      jobs: {
        list: (f = {}) =>
          run(() =>
            db.jobs
              .filter(
                (j) =>
                  canSeeJob(j) &&
                  (!f.status || f.status.includes(j.status)) &&
                  (!f.operatorId || j.operatorIds.includes(f.operatorId)) &&
                  (!f.from || j.start >= f.from) &&
                  (!f.to || j.start < f.to),
              )
              .map((j) => out(j)),
          ),
        get: (id) =>
          run(() => {
            const job = db.jobs.find((j) => j.id === id)
            return job && canSeeJob(job) ? out(job) : undefined
          }),
        create: (input) =>
          run(() => {
            requireOffice('book jobs')
            const customer = db.customers.find((c) => c.id === input.customerId && c.orgId === orgId)
            const site = db.sites.find((s) => s.id === input.siteId && s.orgId === orgId)
            if (!customer) throw notFound('customer')
            if (!site || site.customerId !== customer.id) throw invalid("site doesn't belong to that customer")
            for (const id of input.operatorIds) if (!db.operators.some((o) => o.id === id && o.orgId === orgId)) throw notFound('operator')
            if (input.end < input.start) throw invalid('job ends before it starts')
            const job: Owned<Job> = {
              ...structuredClone(input),
              lines: input.lines.map((l) => ({ ...l, id: l.id ?? newId('li') })),
              id: newId('job'),
              ref: `J-${nextNumber(orgId, 'job')}`,
              orgId,
            }
            db.jobs.push(job)
            return job
          }).then((job) => done(out(job))),
        setStatus: (id, status) =>
          run(() => {
            const job = findJob(id)
            if (!isOffice() && job.status !== status && (CLOSED.includes(job.status) || !FIELD_STATUSES.includes(status))) {
              throw forbidden(`field can't move a job from ${job.status} to ${status}`)
            }
            job.status = status
            return job
          }).then((job) => done(out(job))),
        addLine: (jobId, line) =>
          run(() => {
            const job = editableJob(jobId)
            if (!(line.quantity > 0)) throw invalid('quantity must be more than zero')
            if (!Number.isInteger(line.unitPrice)) throw invalid('unit price is whole pence')
            job.lines.push({ ...line, id: newId('li') })
            return job
          }).then((job) => done(out(job))),
        removeLine: (jobId, lineId) =>
          run(() => {
            const job = editableJob(jobId)
            job.lines = job.lines.filter((l) => l.id !== lineId)
            return job
          }).then((job) => done(out(job))),
        setCheck: (jobId, key, state, detail) =>
          run(() => {
            const job = editableJob(jobId)
            const label = job.checks.find((c) => c.key === key)?.label ?? CHECK_LABEL[key]
            if (!label) throw invalid(`unknown check ${key}`)
            job.checks = [...job.checks.filter((c) => c.key !== key), { key, label, state, detail }]
            return job
          }).then((job) => done(out(job))),
      },

      customers: {
        list: () =>
          run(() =>
            db.customers
              .filter((c) => c.orgId === orgId && (isOffice() || fieldSees((j) => j.customerId === c.id)))
              .map((c) => out(c)),
          ),
        get: (id) =>
          run(() => {
            const c = db.customers.find((x) => x.id === id && x.orgId === orgId)
            return c && (isOffice() || fieldSees((j) => j.customerId === c.id)) ? out(c) : undefined
          }),
      },

      sites: {
        get: (id) =>
          run(() => {
            const s = db.sites.find((x) => x.id === id && x.orgId === orgId)
            return s && (isOffice() || fieldSees((j) => j.siteId === s.id)) ? out(s) : undefined
          }),
      },

      operators: {
        list: () => run(() => (membership(), db.operators.filter((o) => o.orgId === orgId).map((o) => out(o)))),
        me: () =>
          run(() => {
            const me = myOperator()
            if (!me) throw notFound('crew record for this sign-in')
            return out(me)
          }),
        setState: (id, state, jobId) =>
          run(() => {
            const op = actingAs(id)
            if (jobId !== undefined) findJob(jobId)
            op.state = state
            if (jobId !== undefined) op.currentJobId = jobId
            return op
          }).then((op) => done(out(op) as Operator)),
      },

      time: {
        start: (entry) =>
          run(() => {
            const job = entry.jobId ? findJob(entry.jobId) : undefined
            actingAs(entry.operatorId, job)
            const t = { ...entry, id: newId('tim'), orgId }
            db.time.push(t)
            return t
          }).then((t) => done(out(t))),
        stop: (id, at = new Date().toISOString()) =>
          run(() => {
            const t = db.time.find((x) => x.id === id && x.orgId === orgId)
            if (!t || (!isOffice() && t.operatorId !== myOperator()?.id)) throw notFound('time entry')
            if (at < t.start) throw invalid('clock stops before it started')
            t.end = at
            return t
          }).then((t) => done(out(t))),
        forJob: (jobId) =>
          run(() => {
            findJob(jobId)
            const me = myOperator()?.id
            return db.time.filter((t) => t.jobId === jobId && (isOffice() || t.operatorId === me)).map((t) => out(t))
          }),
      },

      photos: {
        add: (p) =>
          run(() => {
            actingAs(p.operatorId, findJob(p.jobId))
            const photo = { ...p, id: newId('pho'), orgId }
            db.photos.push(photo)
            return photo
          }).then((p) => done(out(p))),
        forJob: (jobId) => run(() => (findJob(jobId), db.photos.filter((p) => p.jobId === jobId).map((p) => out(p)))),
      },

      notes: {
        add: (n) =>
          run(() => {
            if (!n.body.trim()) throw invalid('note is empty')
            actingAs(n.operatorId, findJob(n.jobId))
            const note = { ...n, id: newId('not'), orgId }
            db.notes.push(note)
            return note
          }).then((n) => done(out(n))),
        forJob: (jobId) => run(() => (findJob(jobId), db.notes.filter((n) => n.jobId === jobId).map((n) => out(n)))),
      },

      quotes: {
        forJob: (jobId) => run(() => (findJob(jobId), db.quotes.filter((q) => q.jobId === jobId).map((q) => out(q)))),
      },

      signatures: {
        add: (sig) =>
          run(() => {
            actingAs(sig.operatorId, findJob(sig.jobId))
            const s = { ...sig, id: newId('sig'), orgId }
            db.signatures.push(s)
            return s
          }).then((s) => done(out(s))),
        forJob: (jobId) => run(() => (findJob(jobId), db.signatures.filter((s) => s.jobId === jobId).map((s) => out(s)))),
      },

      // Engineers invoice and take payment on the doorstep, so Field can do
      // these on their own jobs. The job's status follows the invoice.
      invoices: {
        forJob: (jobId) => run(() => (findJob(jobId), db.invoices.filter((i) => i.jobId === jobId).map((i) => out(i)))),
        create: (jobId, opts = {}) =>
          run(() => {
            const job = findJob(jobId)
            if (job.status === 'cancelled') throw invalid('job is cancelled')
            const inv: Owned<Invoice> = {
              id: newId('inv'),
              ref: `INV-${nextNumber(orgId, 'invoice')}`,
              jobId,
              customerId: job.customerId,
              lines: structuredClone(job.lines),
              vatRate: opts.vatRate ?? 2000,
              status: 'draft',
              paidAmount: 0,
              orgId,
            }
            db.invoices.push(inv)
            return inv
          }).then((i) => done(out(i))),
        send: (id) =>
          run(() => {
            const inv = findInvoice(id)
            if (inv.status === 'void' || inv.status === 'paid') throw invalid(`invoice is ${inv.status}`)
            const now = Date.now()
            inv.status = 'sent'
            inv.issuedAt = new Date(now).toISOString()
            inv.dueAt = new Date(now + 14 * DAY).toISOString()
            findJob(inv.jobId).status = 'invoiced'
            return inv
          }).then((i) => done(out(i))),
        recordPayment: (id, amount) =>
          run(() => {
            const inv = findInvoice(id)
            if (!Number.isInteger(amount) || amount <= 0) throw invalid('payment is whole pence above zero')
            if (inv.status === 'void') throw invalid('invoice is void')
            const total = invoiceTotals(inv).total
            inv.paidAmount = Math.min(total, inv.paidAmount + amount)
            inv.status = inv.paidAmount >= total ? 'paid' : 'part_paid'
            inv.issuedAt ??= new Date().toISOString()
            findJob(inv.jobId).status = inv.status === 'paid' ? 'paid' : 'invoiced'
            return inv
          }).then((i) => done(out(i))),
      },
    }

    function findInvoice(id: string) {
      const inv = db.invoices.find((i) => i.id === id && i.orgId === orgId)
      if (!inv) throw notFound('invoice')
      findJob(inv.jobId)
      return inv
    }

    /** Firm admin, beyond what the shared client covers. */
    const admin = {
      members: () => run(() => (membership(), db.memberships.filter((m) => m.orgId === orgId).map((m) => ({ ...m })))),
      /** Owners add people, change roles and remove members, but never themselves. */
      setRole: (memberUserId: string, role: Role | null) =>
        run(() => {
          if (!isOwner()) throw forbidden('only the owner manages members')
          if (memberUserId === userId) throw forbidden("owners can't change their own role")
          if (!db.users.some((u) => u.id === memberUserId)) throw notFound('user')
          const i = db.memberships.findIndex((m) => m.orgId === orgId && m.userId === memberUserId)
          if (role === null) {
            if (i >= 0) db.memberships.splice(i, 1)
          } else if (i >= 0) db.memberships[i].role = role
          else db.memberships.push({ orgId, userId: memberUserId, role })
          store.commit()
        }),
      /** Link a crew record to someone's sign-in, so Field knows who they are. */
      linkOperator: (operatorId: string, operatorUserId: string | null) =>
        run(() => {
          requireOffice('link crew to sign-ins')
          const op = db.operators.find((o) => o.id === operatorId && o.orgId === orgId)
          if (!op) throw notFound('operator')
          op.userId = operatorUserId ?? undefined
          store.commit()
        }),
      role: () => run(() => membership().role),
    }

    return { client, admin }
  }

  return { addUser, createOrganisation, organisationsFor, as, data: db }
}

export type Engine = ReturnType<typeof createEngine>
// Re-exported so callers needn't reach into the model for line shapes.
export type { LineItem }
