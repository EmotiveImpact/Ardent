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
import type { ArdentClient } from '../../core/src/data/client.ts'
import type { ComplianceCheck, Customer, DriveTime, Exception, GasAppliance, GasInstallation, GasSafetyRecord, Invoice, Job, JobStatus, LineItem, Operator, OptionKey, PriceItem, Quote, StockLevel, VanFix, Verdict } from '../../core/src/data/model.ts'
import type { Platform } from './platform.ts'
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

export const newId = (prefix: string) => `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`

function checkPassword(password: string) {
  if (password.length < 10) return 'use at least 10 characters'
  return undefined
}

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
const CUSTOMER_KINDS: Customer['kind'][] = ['homeowner', 'landlord', 'letting_agent', 'business']
const OWING: Invoice['status'][] = ['sent', 'part_paid', 'overdue']
/** Certificates due within this many days show as due soon. */
const DUE_SOON_DAYS = 30

const PRICE_KINDS: PriceItem['kind'][] = ['labour', 'material', 'callout', 'other']
const PRICE_UNITS: PriceItem['unit'][] = ['each', 'hour', 'metre', 'job']
const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C']
const FLUES: GasAppliance['flue'][] = ['room_sealed', 'open_flue', 'flueless']
const VERDICTS: Verdict[] = ['pass', 'fail', 'n/a', 'pending']
const INSTALLATION: (keyof GasInstallation)[] = ['tightness', 'ecv', 'bonding', 'pipework', 'coAlarm']
const APPLIANCE_CHECKS: (keyof GasAppliance['checks'])[] = ['flue', 'ventilation', 'safetyDevice', 'spillage']
const pendingChecks = (): GasAppliance['checks'] => ({ flue: 'pending', ventilation: 'pending', safetyDevice: 'pending', spillage: 'pending' })

/** A reading is a finite number of zero or more, or left blank. */
const reading = (v: unknown, what: string) => {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw invalid(`${what} must be a number of zero or more`)
  return v
}

/** Same day next year: a CP12 lasts twelve months. */
const yearOn = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  const next = new Date(Date.UTC(y + 1, m - 1, d))
  // 29 February rolls back to the 28th rather than on to March.
  if (next.getUTCMonth() !== m - 1) next.setUTCDate(0)
  return next.toISOString().slice(0, 10)
}

/** A van reading older than this says where the van was, not where it is. */
const FIX_FRESH_MS = 30 * 60 * 1000
/** Only the nearest few vans are timed by road, to keep road lookups down. */
const ROAD_TIMED = 5
/** Road times are kept this long before asking again. */
const ROAD_KEEP_MS = 3 * 60 * 1000

/** Miles between two points as the crow flies. */
export function milesApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}

/** Worked out from the dates when read, so it never goes stale. */
export function certificateState(c: { issued?: string; expires: string }, today = new Date().toISOString().slice(0, 10)) {
  if (!c.issued) return 'draft' as const
  if (c.expires < today) return 'overdue' as const
  const soon = new Date(Date.parse(today) + DUE_SOON_DAYS * DAY).toISOString().slice(0, 10)
  return c.expires <= soon ? ('due_soon' as const) : ('valid' as const)
}

/** What still needs doing before a gas safety record can be issued, in words. */
export function gasGaps(rec: Pick<GasSafetyRecord, 'appliances' | 'installation'>) {
  const gaps: string[] = []
  if (!rec.appliances.length) gaps.push('add the appliances')
  for (const a of rec.appliances) {
    const name = `${a.type} in the ${a.location.toLowerCase()}`
    if (a.safe === undefined) gaps.push(`say if the ${name} is safe to use`)
    if (APPLIANCE_CHECKS.some((k) => a.checks[k] === 'pending')) gaps.push(`finish the checks on the ${name}`)
    if (a.safe === false && !a.defects) gaps.push(`say what's wrong with the ${name}`)
  }
  if (INSTALLATION.some((k) => rec.installation[k] === 'pending')) gaps.push('finish the installation checks')
  return gaps
}

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

export function createEngine(store: Store, platform: Platform) {
  const { hashPassword, verifyPassword, newToken, hashToken } = platform
  const db: Data = store.data
  /** Road minutes already looked up, by rounded start, site and time. */
  const roadTimes = new Map<string, { minutes?: number; until: number }>()

  /** Next human number for a firm: J-1001, INV-1001. New firms start at 1001. */
  function nextNumber(orgId: string, kind: string) {
    const key = `${orgId}:${kind}`
    db.counters[key] = (db.counters[key] ?? 1000) + 1
    return db.counters[key]
  }

  const publicUser = ({ passwordHash: _p, ...u }: User) => ({ ...u })

  function addUser(input: { email: string; name: string; password?: string; id?: string }) {
    const email = input.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw invalid('a valid email is needed')
    if (!input.name?.trim()) throw invalid('a name is needed')
    if (db.users.some((u) => u.email === email)) throw invalid('that email is already in use')
    if (input.password !== undefined) {
      const weak = checkPassword(input.password)
      if (weak) throw invalid(weak)
    }
    const user: User = {
      id: input.id ?? newId('usr'),
      email,
      name: input.name.trim(),
      passwordHash: input.password === undefined ? undefined : hashPassword(input.password),
    }
    db.users.push(user)
    store.commit()
    return publicUser(user)
  }

  // ---------- sign-in ----------

  const SESSION_DAYS = 30
  const failures = new Map<string, number[]>()

  /** Email and password in, session token out. Ten wrong passwords in 15 minutes locks the email for a while. */
  function login(emailIn: string, password: string) {
    const email = String(emailIn ?? '').trim().toLowerCase()
    const now = Date.now()
    const recent = (failures.get(email) ?? []).filter((t) => now - t < 15 * 60 * 1000)
    if (recent.length >= 10) throw new EngineError('unauthenticated', 'too many attempts, try again in 15 minutes')
    const user = db.users.find((u) => u.email === email)
    if (!verifyPassword(String(password ?? ''), user?.passwordHash) || !user) {
      failures.set(email, [...recent, now])
      throw new EngineError('unauthenticated', 'email or password is wrong')
    }
    failures.delete(email)
    const token = newToken()
    db.sessions = db.sessions.filter((x) => x.expiresAt > new Date(now).toISOString())
    db.sessions.push({
      tokenHash: hashToken(token),
      userId: user.id,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_DAYS * DAY).toISOString(),
    })
    store.commit()
    return { token, user: publicUser(user), organisations: organisationsFor(user.id) }
  }

  function logout(token: string) {
    const h = hashToken(token)
    db.sessions = db.sessions.filter((x) => x.tokenHash !== h)
    store.commit()
  }

  /** Who a session token belongs to, if it is still valid. */
  function userForToken(token: string | undefined) {
    if (!token) return undefined
    const h = hashToken(token)
    const session = db.sessions.find((x) => x.tokenHash === h && x.expiresAt > new Date().toISOString())
    const user = session && db.users.find((u) => u.id === session.userId)
    return user ? publicUser(user) : undefined
  }

  /** A new person setting up their firm on Ardent. */
  function signUp(input: { email: string; password: string; name: string; firm: string; slug: string }) {
    if (input.password === undefined) throw invalid('a password is needed')
    const user = addUser({ email: input.email, name: input.name, password: input.password })
    createOrganisation(user.id, { name: input.firm, slug: input.slug })
    return login(user.email, input.password)
  }

  // ---------- signed photo links ----------

  db.secret ??= platform.randomSecret()
  const sign = (text: string) => platform.sign(db.secret!, text)
  /** The photo a signed link points at, if the link is genuine and in date. */
  function photoForLink(photoId: string, exp: string, sig: string) {
    if (!(Number(exp) > Date.now())) return undefined
    if (!platform.same(sign(`${photoId}:${exp}`), String(sig))) return undefined
    const p = db.photos.find((x) => x.id === photoId)
    return p?.uri.startsWith('ardent:') ? { orgId: p.orgId, id: p.id } : undefined
  }

  // ---------- retries ----------

  const REQUEST_MEMORY = 5000
  /** The answer already given for this request, if the app is retrying one the engine applied. */
  function recall(key: string) {
    return db.requests.find((r) => r.key === key)
  }
  function remember(key: string, result: unknown) {
    db.requests.push({ key, at: new Date().toISOString(), result })
    if (db.requests.length > REQUEST_MEMORY) db.requests.splice(0, db.requests.length - REQUEST_MEMORY)
    store.commit()
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
        update: (id, patch) =>
          run(() => {
            requireOffice('change bookings')
            const job = findJob(id)
            const allowed = ['title', 'trade', 'priority', 'start', 'end', 'notes', 'operatorIds'] as const
            for (const key of Object.keys(patch)) if (!(allowed as readonly string[]).includes(key)) throw invalid(`can't change ${key}`)
            for (const opId of patch.operatorIds ?? []) if (!db.operators.some((o) => o.id === opId && o.orgId === orgId)) throw notFound('operator')
            const next = { ...job, ...structuredClone(patch) }
            if (next.end < next.start) throw invalid('job ends before it starts')
            Object.assign(job, next)
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
            if (line.itemId && !db.priceList.some((i) => i.id === line.itemId && i.orgId === orgId)) throw notFound('price list item')
            if (line.fromVan) {
              if (!line.itemId) throw invalid('van stock needs a price list item')
              actingAs(line.fromVan, job)
              moveStock(line.fromVan, line.itemId, -line.quantity)
            }
            job.lines.push({ ...structuredClone(line), id: newId('li') })
            return job
          }).then((job) => done(out(job))),
        removeLine: (jobId, lineId) =>
          run(() => {
            const job = editableJob(jobId)
            const line = job.lines.find((l) => l.id === lineId)
            if (line?.fromVan && line.itemId) moveStock(line.fromVan, line.itemId, line.quantity)
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
              .map(withBalance),
          ),
        get: (id) =>
          run(() => {
            const c = db.customers.find((x) => x.id === id && x.orgId === orgId)
            return c && (isOffice() || fieldSees((j) => j.customerId === c.id)) ? withBalance(c) : undefined
          }),
        create: (input) =>
          run(() => {
            requireOffice('add customers')
            if (!input.name?.trim()) throw invalid('the customer needs a name')
            if (!CUSTOMER_KINDS.includes(input.kind)) throw invalid(`unknown customer kind ${input.kind}`)
            const c: Owned<Customer> = { ...structuredClone(input), name: input.name.trim(), id: newId('cus'), balance: 0, orgId }
            db.customers.push(c)
            return c
          }).then((c) => done(withBalance(c))),
        update: (id, patch) =>
          run(() => {
            requireOffice('change customers')
            const c = db.customers.find((x) => x.id === id && x.orgId === orgId)
            if (!c) throw notFound('customer')
            const { id: _i, balance: _b, orgId: _o, ...rest } = structuredClone(patch) as Partial<Owned<Customer>>
            if (rest.name !== undefined && !rest.name.trim()) throw invalid('the customer needs a name')
            if (rest.kind !== undefined && !CUSTOMER_KINDS.includes(rest.kind)) throw invalid(`unknown customer kind ${rest.kind}`)
            Object.assign(c, rest)
            return c
          }).then((c) => done(withBalance(c))),
      },

      sites: {
        list: (f = {}) =>
          run(() =>
            db.sites
              .filter((s) => s.orgId === orgId && (!f.customerId || s.customerId === f.customerId) && (isOffice() || fieldSees((j) => j.siteId === s.id)))
              .map((s) => out(s)),
          ),
        get: (id) =>
          run(() => {
            const s = db.sites.find((x) => x.id === id && x.orgId === orgId)
            return s && (isOffice() || fieldSees((j) => j.siteId === s.id)) ? out(s) : undefined
          }),
        create: (input) =>
          run(() => {
            requireOffice('add sites')
            if (!db.customers.some((c) => c.id === input.customerId && c.orgId === orgId)) throw notFound('customer')
            if (!input.line1?.trim() || !input.postcode?.trim()) throw invalid('a site needs an address and postcode')
            const site = { ...structuredClone(input), postcode: input.postcode.trim().toUpperCase(), id: newId('sit'), orgId }
            db.sites.push(site)
            return site
          }).then((s) => done(out(s))),
      },

      attention: {
        list: () =>
          run(() => {
            requireOffice('see the attention list')
            const now = new Date()
            const iso = now.toISOString()
            const today = iso.slice(0, 10)
            const soon = new Date(now.getTime() + DUE_SOON_DAYS * DAY).toISOString().slice(0, 10)
            const items: Exception[] = []
            const siteName = (id: string) => db.sites.find((s) => s.id === id)?.line1 ?? 'site'
            for (const op of db.operators.filter((o) => o.orgId === orgId)) {
              for (const r of op.registrations) {
                if (r.expires < today) items.push({ id: `att_reg_${op.id}_${r.number}`, at: `${r.expires}T00:00:00Z`, who: op.name, rule: 'Registration expired', detail: `${r.body} ${r.number} lapsed ${r.expires}`, outcome: 'blocked' })
                else if (r.expires <= soon) items.push({ id: `att_reg_${op.id}_${r.number}`, at: iso, who: op.name, rule: 'Registration expiring', detail: `${r.body} ${r.number} lapses ${r.expires}`, outcome: 'chasing' })
              }
              if (op.state === 'delayed') items.push({ id: `att_late_${op.id}`, at: iso, who: op.name, rule: 'Running late', detail: `${db.jobs.find((j) => j.id === op.currentJobId)?.ref ?? 'Next job'}${op.etaMinutes ? `, ETA +${op.etaMinutes} min` : ''}`, outcome: 'chasing' })
            }
            for (const op of db.operators.filter((o) => o.orgId === orgId)) {
              const low = db.stock.filter((x) => x.orgId === orgId && x.operatorId === op.id && x.quantity <= x.min && db.priceList.some((i) => i.id === x.itemId && !i.archived))
              if (!low.length) continue
              const names = low.map((x) => `${db.priceList.find((i) => i.id === x.itemId)!.name} (${x.quantity} left)`)
              items.push({ id: `att_stock_${op.id}`, at: iso, who: op.name, rule: 'Van stock low', detail: `${op.van}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`, outcome: 'chasing' })
            }
            for (const r of db.gasRecords.filter((x) => x.orgId === orgId && x.status === 'issued')) {
              for (const a of r.appliances.filter((x) => x.safe === false)) {
                items.push({ id: `att_gas_${r.id}_${a.id}`, at: r.issuedAt!, who: db.customers.find((c) => c.id === r.customerId)?.name ?? 'Customer', rule: a.unsafe === 'immediately_dangerous' ? 'Immediately dangerous' : 'Appliance unsafe', detail: `${a.type}, ${a.location}, on ${r.ref}${a.defects ? `: ${a.defects}` : ''}`, outcome: 'blocked' })
              }
            }
            for (const c of db.certificates.filter((x) => x.orgId === orgId && certificateState(x, today) === 'overdue')) {
              items.push({ id: `att_cert_${c.id}`, at: `${c.expires}T00:00:00Z`, who: db.customers.find((x) => x.id === db.sites.find((s) => s.id === c.siteId)?.customerId)?.name ?? 'Customer', rule: `${c.kind} overdue`, detail: `${siteName(c.siteId)}, expired ${c.expires}`, outcome: 'blocked' })
            }
            for (const inv of db.invoices.filter((i) => i.orgId === orgId && OWING.includes(i.status) && i.dueAt && i.dueAt < iso)) {
              items.push({ id: `att_inv_${inv.id}`, at: inv.dueAt!, who: db.customers.find((x) => x.id === inv.customerId)?.name ?? 'Customer', rule: 'Invoice overdue', detail: `${inv.ref}, due ${inv.dueAt!.slice(0, 10)}`, outcome: 'chasing' })
            }
            for (const j of db.jobs.filter((x) => x.orgId === orgId && x.status === 'booked' && x.start < iso && x.end > iso)) {
              items.push({ id: `att_job_${j.id}`, at: j.start, who: j.ref, rule: 'Not started', detail: `${j.title}, booked for ${j.start.slice(11, 16)}`, outcome: 'chasing' })
            }
            for (const j of db.jobs.filter((x) => x.orgId === orgId && x.status === 'paused')) {
              const note = db.notes.filter((n) => n.jobId === j.id).sort((a, b) => b.at.localeCompare(a.at))[0]
              const who = db.operators.find((o) => o.id === (note?.operatorId ?? j.operatorIds[0]))?.name ?? j.ref
              items.push({ id: `att_pause_${j.id}`, at: note?.at ?? j.start, who, rule: `${j.ref} paused`, detail: note?.body ?? `${j.title}, waiting`, outcome: 'chasing' })
            }
            return items.sort((a, b) => b.at.localeCompare(a.at))
          }),
      },

      certificates: {
        list: (f = {}) =>
          run(() =>
            db.certificates
              .filter((c) => c.orgId === orgId && (!f.siteId || c.siteId === f.siteId) && (isOffice() || fieldSees((j) => j.siteId === c.siteId)))
              .map((c) => ({ ...out(c), state: certificateState(c) })),
          ),
      },

      priceList: {
        list: (opts = {}) =>
          run(() => {
            const office = isOffice()
            return db.priceList
              .filter((i) => i.orgId === orgId && (!i.archived || (office && opts.archived)))
              .map((i) => {
                const item = out(i) as PriceItem
                if (!office) delete item.cost
                return item
              })
              .sort((a, b) => a.name.localeCompare(b.name))
          }),
        create: (input) =>
          run(() => {
            requireOffice('keep the price list')
            const item: Owned<PriceItem> = { ...checkItem(structuredClone(input)), id: newId('itm'), orgId }
            db.priceList.push(item)
            return item
          }).then((i) => done(out(i) as PriceItem)),
        update: (id, patch) =>
          run(() => {
            requireOffice('keep the price list')
            const item = db.priceList.find((i) => i.id === id && i.orgId === orgId)
            if (!item) throw notFound('price list item')
            const { id: _i, orgId: _o, ...rest } = structuredClone(patch) as Partial<Owned<PriceItem>>
            const next = checkItem({ ...out(item), ...rest } as PriceItem)
            Object.assign(item, next)
            if (rest.cost === undefined && 'cost' in rest) delete item.cost
            return item
          }).then((i) => done(out(i) as PriceItem)),
      },

      stock: {
        list: (f = {}) =>
          run(() => {
            const me = myOperator()?.id
            if (!isOffice() && f.operatorId && f.operatorId !== me) throw forbidden("can't see another engineer's van")
            const who = isOffice() ? f.operatorId : me
            return db.stock.filter((x) => x.orgId === orgId && (!who || x.operatorId === who) && (isOffice() || who)).map((x) => out(x) as StockLevel)
          }),
        set: (operatorId, itemId, quantity, min) =>
          run(() => {
            requireOffice('restock vans')
            if (!db.operators.some((o) => o.id === operatorId && o.orgId === orgId)) throw notFound('operator')
            const item = db.priceList.find((i) => i.id === itemId && i.orgId === orgId)
            if (!item) throw notFound('price list item')
            if (!item.stocked) throw invalid(`${item.name} isn't carried on the vans`)
            if (!Number.isInteger(quantity) || quantity < 0) throw invalid('stock is a whole number of zero or more')
            if (min !== undefined && (!Number.isInteger(min) || min < 0)) throw invalid('the low mark is a whole number of zero or more')
            const row = stockRow(operatorId, itemId)
            row.quantity = quantity
            if (min !== undefined) row.min = min
            return row
          }).then((x) => done(out(x) as StockLevel)),
      },

      gasRecords: {
        list: (f = {}) =>
          run(() =>
            db.gasRecords
              .filter((r) => r.orgId === orgId && (!f.siteId || r.siteId === f.siteId) && (isOffice() || fieldSees((j) => j.siteId === r.siteId)))
              .map((r) => out(r) as GasSafetyRecord)
              .sort((a, b) => (b.issuedAt ?? '9').localeCompare(a.issuedAt ?? '9')),
          ),
        forJob: (jobId) => run(() => (findJob(jobId), db.gasRecords.filter((r) => r.orgId === orgId && r.jobId === jobId).map((r) => out(r) as GasSafetyRecord))),
        create: (jobId, operatorId) =>
          run(() => {
            const job = editableJob(jobId)
            actingAs(operatorId, job)
            const open = db.gasRecords.find((r) => r.orgId === orgId && r.jobId === jobId && r.status === 'draft')
            if (open) return open
            // Start from what was there last time: same appliances, fresh readings.
            const last = db.gasRecords.filter((r) => r.orgId === orgId && r.siteId === job.siteId && r.status === 'issued').sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? ''))[0]
            const rec: Owned<GasSafetyRecord> = {
              id: newId('gsr'),
              ref: `CP-${nextNumber(orgId, 'cp12')}`,
              jobId,
              siteId: job.siteId,
              customerId: job.customerId,
              operatorId,
              appliances: (last?.appliances ?? []).map((a) => ({ id: newId('app'), location: a.location, type: a.type, make: a.make, model: a.model, flue: a.flue, landlords: a.landlords, checks: pendingChecks() })),
              installation: { tightness: 'pending', ecv: 'pending', bonding: 'pending', pipework: 'pending', coAlarm: 'pending' },
              status: 'draft',
              orgId,
            }
            db.gasRecords.push(rec)
            return rec
          }).then((r) => done(out(r) as GasSafetyRecord)),
        saveAppliance: (id, input) =>
          run(() => {
            const rec = draftRecord(id)
            if (!String(input.location ?? '').trim()) throw invalid('say where the appliance is')
            if (!String(input.type ?? '').trim()) throw invalid('say what the appliance is')
            if (!FLUES.includes(input.flue)) throw invalid(`unknown flue type ${input.flue}`)
            const checks = { ...pendingChecks(), ...(input.checks ?? {}) }
            for (const k of APPLIANCE_CHECKS) if (!VERDICTS.includes(checks[k])) throw invalid(`unknown answer ${checks[k]}`)
            if (input.unsafe && !['at_risk', 'immediately_dangerous'].includes(input.unsafe)) throw invalid(`unknown unsafe category ${input.unsafe}`)
            const a: GasAppliance = {
              id: input.id ?? newId('app'),
              location: input.location.trim(),
              type: input.type.trim(),
              make: input.make?.trim() || undefined,
              model: input.model?.trim() || undefined,
              flue: input.flue,
              landlords: input.landlords !== false,
              pressure: reading(input.pressure, 'operating pressure'),
              heatInput: reading(input.heatInput, 'heat input'),
              co: reading(input.co, 'CO'),
              co2: reading(input.co2, 'CO2'),
              ratio: reading(input.ratio, 'CO/CO2 ratio'),
              checks: { flue: checks.flue, ventilation: checks.ventilation, safetyDevice: checks.safetyDevice, spillage: checks.spillage },
              safe: typeof input.safe === 'boolean' ? input.safe : undefined,
              defects: input.defects?.trim() || undefined,
              unsafe: input.unsafe,
            }
            // A safe appliance can't also be classed unsafe.
            if (a.safe) delete a.unsafe
            const i = rec.appliances.findIndex((x) => x.id === a.id)
            if (input.id && i < 0) throw notFound('appliance')
            if (i >= 0) rec.appliances[i] = a
            else rec.appliances.push(a)
            return rec
          }).then((r) => done(out(r) as GasSafetyRecord)),
        removeAppliance: (id, applianceId) =>
          run(() => {
            const rec = draftRecord(id)
            rec.appliances = rec.appliances.filter((a) => a.id !== applianceId)
            return rec
          }).then((r) => done(out(r) as GasSafetyRecord)),
        setInstallation: (id, key, verdict) =>
          run(() => {
            const rec = draftRecord(id)
            if (!INSTALLATION.includes(key)) throw invalid(`unknown check ${key}`)
            if (!VERDICTS.includes(verdict)) throw invalid(`unknown answer ${verdict}`)
            rec.installation[key] = verdict
            return rec
          }).then((r) => done(out(r) as GasSafetyRecord)),
        issue: (id) =>
          run(() => {
            const rec = draftRecord(id)
            const missing = gasGaps(rec)
            if (missing.length) throw invalid(`not finished: ${missing.join('; ')}`)
            const now = new Date().toISOString()
            const issued = now.slice(0, 10)
            rec.status = 'issued'
            rec.issuedAt = now
            rec.expires = yearOn(issued)
            const cert = { id: newId('cer'), kind: 'CP12' as const, siteId: rec.siteId, jobId: rec.jobId, issued, expires: rec.expires, state: 'valid' as const, orgId }
            db.certificates.push(cert)
            rec.certificateId = cert.id
            // The job's tightness gate follows the record.
            const job = db.jobs.find((j) => j.id === rec.jobId)
            if (job) job.checks = [...job.checks.filter((c) => c.key !== 'gas_tightness'), { key: 'gas_tightness', label: job.checks.find((c) => c.key === 'gas_tightness')?.label ?? CHECK_LABEL.gas_tightness, state: rec.installation.tightness === 'pending' ? 'pending' : rec.installation.tightness, detail: `${rec.ref} issued` }]
            return rec
          }).then((r) => done(out(r) as GasSafetyRecord)),
      },

      operators: {
        list: () =>
          run(() => {
            membership()
            const office = isOffice()
            const me = myOperator()?.id
            return db.operators
              .filter((o) => o.orgId === orgId)
              .map((o) => {
                const row = out(o) as Operator
                // Where a van is stays between that engineer and the office.
                if (!office && o.id !== me) delete row.location
                return row
              })
          }),
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
            // Off shift, the van's whereabouts are nobody's business.
            if (state === 'off_shift') delete op.location
            return op
          }).then((op) => done(out(op) as Operator)),
        setLocation: (id, fix) =>
          run(() => {
            const op = db.operators.find((o) => o.id === id && o.orgId === orgId)
            if (!op || op.id !== myOperator()?.id) throw forbidden('only the engineer shares where their van is')
            const { lat, lng, accuracy, at } = fix ?? ({} as VanFix)
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw invalid('that is not a place on the map')
            if (accuracy !== undefined && !(Number.isFinite(accuracy) && accuracy >= 0)) throw invalid('accuracy is metres of zero or more')
            const when = Date.parse(at)
            if (!Number.isFinite(when) || when > Date.now() + 5 * 60 * 1000) throw invalid('the reading needs the time it was taken')
            // A reading sent late after lost signal, or one from off shift, changes nothing.
            if (op.state === 'off_shift' || (op.location && op.location.at >= at)) return op
            op.location = { lat, lng, ...(accuracy !== undefined ? { accuracy: Math.round(accuracy) } : {}), at: new Date(when).toISOString() }
            return op
          }).then((op) => done(out(op) as Operator)),
      },

      travel: {
        get: () => run(() => (requireOffice('see drive times'), { roadTimes: !!platform.driveMinutes })),
        list: async ({ siteId }) => {
          const rows = await run(() => {
            requireOffice('see where the vans are')
            const site = db.sites.find((x) => x.id === siteId && x.orgId === orgId)
            if (!site) throw notFound('site')
            const now = Date.now()
            const found: (DriveTime & { start: { lat: number; lng: number } })[] = []
            for (const op of db.operators.filter((o) => o.orgId === orgId && o.state !== 'off_shift')) {
              const fix = op.location && now - Date.parse(op.location.at) <= FIX_FRESH_MS ? op.location : undefined
              const job = db.jobs.find((j) => j.id === op.currentJobId && j.orgId === orgId)
              const at = fix ?? db.sites.find((x) => x.id === job?.siteId && x.orgId === orgId)
              if (!at) continue
              const start = { lat: at.lat, lng: at.lng }
              found.push({ operatorId: op.id, miles: Math.round(milesApart(start, site) * 10) / 10, by: 'straight_line', from: fix ? 'van' : 'job', ...(fix ? { seenAt: fix.at } : {}), start })
            }
            return { site, found: found.sort((a, b) => a.miles - b.miles) }
          })
          const { site, found } = rows
          if (platform.driveMinutes && found.length) {
            const near = found.slice(0, ROAD_TIMED)
            const key = (d: (typeof near)[number]) => `${d.start.lat.toFixed(3)},${d.start.lng.toFixed(3)}>${site.id}`
            const now = Date.now()
            const ask = near.filter((d) => !((roadTimes.get(key(d))?.until ?? 0) > now))
            if (ask.length) {
              try {
                const got = await platform.driveMinutes(
                  ask.map((d) => d.start),
                  { lat: site.lat, lng: site.lng },
                )
                ask.forEach((d, i) => roadTimes.set(key(d), { minutes: got[i], until: now + ROAD_KEEP_MS }))
              } catch {
                // No road times this time round: crow-flies distances still rank the vans.
              }
            }
            for (const d of near) {
              const minutes = roadTimes.get(key(d))?.minutes
              if (minutes !== undefined) Object.assign(d, { minutes: Math.round(minutes), by: 'road' })
            }
            near.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity) || a.miles - b.miles)
            found.splice(0, near.length, ...near)
          }
          return found.map(({ start: _s, ...d }) => d)
        },
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
        list: () => run(() => (requireOffice('see every quote'), db.quotes.filter((q) => q.orgId === orgId).map((q) => out(q)))),
        forJob: (jobId) => run(() => (findJob(jobId), db.quotes.filter((q) => q.jobId === jobId).map((q) => out(q)))),
        create: (jobId, opts = {}) =>
          run(() => {
            requireOffice('write quotes')
            const job = findJob(jobId)
            const options = opts.options ? quoteOptions(opts.options) : undefined
            const lines = options ? structuredClone(options[0].lines) : opts.lines ? priced(opts.lines) : structuredClone(job.lines)
            const q: Owned<Quote> = {
              id: newId('quo'),
              ref: `Q-${nextNumber(orgId, 'quote')}`,
              jobId,
              customerId: job.customerId,
              lines,
              ...(options ? { options } : {}),
              status: 'draft',
              validUntil: opts.validUntil ?? new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10),
              orgId,
            }
            db.quotes.push(q)
            return q
          }).then((q) => done(out(q))),
        update: (id, patch) =>
          run(() => {
            requireOffice('change quotes')
            const q = findQuote(id)
            if (q.status !== 'draft') throw invalid(`quote is ${q.status}; only a draft can change`)
            if (patch.options === null) delete q.options
            else if (patch.options) {
              q.options = quoteOptions(patch.options)
              q.lines = structuredClone(q.options[0].lines)
            }
            if (patch.lines && !q.options) q.lines = priced(patch.lines)
            if (patch.validUntil) q.validUntil = patch.validUntil
            return q
          }).then((q) => done(out(q))),
        send: (id) =>
          run(() => {
            requireOffice('send quotes')
            const q = findQuote(id)
            if (q.status !== 'draft' && q.status !== 'sent') throw invalid(`quote is ${q.status}`)
            q.status = 'sent'
            q.sentAt = new Date().toISOString()
            const job = findJob(q.jobId)
            if (job.status === 'enquiry') job.status = 'quoted'
            return q
          }).then((q) => done(out(q))),
        respond: (id, answer, option) =>
          run(() => {
            requireOffice('record a customer’s answer')
            const q = findQuote(id)
            if (q.status !== 'sent') throw invalid(`quote is ${q.status}`)
            if (answer === 'accepted' && q.options) {
              const picked = q.options.find((o) => o.key === option)
              if (!picked) throw invalid(`say which option they chose: ${q.options.map((o) => o.key).join(', ')}`)
              q.chosen = picked.key
              q.lines = structuredClone(picked.lines)
            }
            q.status = answer
            const job = findJob(q.jobId)
            if (answer === 'accepted' && (job.status === 'enquiry' || job.status === 'quoted')) {
              job.status = 'booked'
              job.lines = structuredClone(q.lines)
            }
            return q
          }).then((q) => done(out(q))),
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
        list: () => run(() => (requireOffice('see every invoice'), db.invoices.filter((i) => i.orgId === orgId).map((i) => out(i)))),
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

    /** A van's row for an item, made at zero the first time it's needed. */
    function stockRow(operatorId: string, itemId: string) {
      let row = db.stock.find((x) => x.orgId === orgId && x.operatorId === operatorId && x.itemId === itemId)
      if (!row) {
        row = { operatorId, itemId, quantity: 0, min: 0, orgId }
        db.stock.push(row)
      }
      return row
    }
    /** Parts out of (or back onto) a van. A count that's already off never goes below zero. */
    function moveStock(operatorId: string, itemId: string, by: number) {
      const row = stockRow(operatorId, itemId)
      row.quantity = Math.max(0, row.quantity + by)
    }

    function checkItem<T extends Omit<PriceItem, 'id'>>(i: T): T {
      if (!i.name?.trim()) throw invalid('the item needs a name')
      if (!PRICE_KINDS.includes(i.kind)) throw invalid(`unknown kind ${i.kind}`)
      if (!PRICE_UNITS.includes(i.unit)) throw invalid(`unknown unit ${i.unit}`)
      if (!Number.isInteger(i.price) || i.price < 0) throw invalid('price is whole pence of zero or more')
      if (i.cost !== undefined && (!Number.isInteger(i.cost) || i.cost < 0)) throw invalid('cost is whole pence of zero or more')
      return { ...i, name: i.name.trim(), code: i.code?.trim() || undefined, stocked: !!i.stocked }
    }

    /** Lines in, with ids, checked the way addLine checks them. */
    function priced(lines: Omit<LineItem, 'id'>[]): LineItem[] {
      return lines.map((l) => {
        if (!String(l.description ?? '').trim()) throw invalid('every line needs a description')
        if (!(l.quantity > 0)) throw invalid('quantity must be more than zero')
        if (!Number.isInteger(l.unitPrice)) throw invalid('unit price is whole pence')
        const { fromVan: _v, ...rest } = structuredClone(l)
        return { ...rest, id: newId('li') }
      })
    }

    function quoteOptions(input: { key: OptionKey; label: string; lines: Omit<LineItem, 'id'>[] }[]) {
      if (input.length < 2 || input.length > 3) throw invalid('offer two or three options')
      return input.map((o, i) => {
        if (o.key !== OPTION_KEYS[i]) throw invalid('options go A, B, C in order')
        if (!o.label?.trim()) throw invalid(`option ${o.key} needs a name`)
        if (!o.lines?.length) throw invalid(`option ${o.key} has no lines`)
        return { key: o.key, label: o.label.trim(), lines: priced(o.lines) }
      })
    }

    /** A record the caller may still fill in: a draft, on a job they can add to. */
    function draftRecord(id: string) {
      const rec = db.gasRecords.find((r) => r.id === id && r.orgId === orgId)
      if (!rec) throw notFound('gas safety record')
      editableJob(rec.jobId)
      if (rec.status !== 'draft') throw invalid(`${rec.ref} is already issued`)
      return rec
    }

    function findQuote(id: string) {
      const q = db.quotes.find((x) => x.id === id && x.orgId === orgId)
      if (!q) throw notFound('quote')
      findJob(q.jobId)
      return q
    }

    /** What a customer owes: everything sent and not yet paid. */
    function withBalance(c: Owned<Customer>): Customer {
      const balance = db.invoices
        .filter((i) => i.orgId === orgId && i.customerId === c.id && OWING.includes(i.status))
        .reduce((sum, i) => sum + invoiceTotals(i).total - i.paidAmount, 0)
      return { ...out(c), balance }
    }

    function findInvoice(id: string) {
      const inv = db.invoices.find((i) => i.id === id && i.orgId === orgId)
      if (!inv) throw notFound('invoice')
      findJob(inv.jobId)
      return inv
    }

    /** Firm admin, beyond what the shared client covers. */
    const admin = {
      /** Everyone in the firm with their role and name. */
      members: () =>
        run(() => {
          membership()
          return db.memberships
            .filter((m) => m.orgId === orgId)
            .map((m) => {
              const u = db.users.find((x) => x.id === m.userId)
              return { ...m, name: u?.name ?? '', email: u?.email ?? '', operatorId: db.operators.find((o) => o.orgId === orgId && o.userId === m.userId)?.id }
            })
        }),
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
      /**
       * Give someone a sign-in for this firm. Owners only. A new person gets
       * the temporary password given here; someone who already has an Ardent
       * sign-in (another firm) keeps their own.
       */
      invite: (input: { email: string; name: string; role: Role; password: string; operatorId?: string }) =>
        run(() => {
          if (!isOwner()) throw forbidden('only the owner adds people')
          if (!['owner', 'office', 'field'].includes(input.role)) throw invalid(`unknown role ${input.role}`)
          const email = String(input.email ?? '').trim().toLowerCase()
          const existing = db.users.find((u) => u.email === email)
          const user = existing ? publicUser(existing) : addUser({ email, name: input.name, password: input.password })
          if (db.memberships.some((m) => m.orgId === orgId && m.userId === user.id)) throw invalid('already in the firm')
          db.memberships.push({ orgId, userId: user.id, role: input.role })
          if (input.operatorId) {
            const op = db.operators.find((o) => o.id === input.operatorId && o.orgId === orgId)
            if (!op) throw notFound('operator')
            op.userId = user.id
          }
          store.commit()
          return user
        }),
      /** Add someone to the crew list (they can be given a sign-in later). */
      addOperator: (input: Omit<Operator, 'id' | 'state' | 'currentJobId' | 'etaMinutes'>) =>
        run(() => {
          requireOffice('add crew')
          if (!input.name?.trim()) throw invalid('a name is needed')
          const op = { ...structuredClone(input), id: newId('opr'), state: 'off_shift' as const, orgId }
          db.operators.push(op)
          store.commit()
          return out(op) as Operator
        }),
      /** Record that a photo's image has landed; returns where the file belongs. */
      photoUploaded: (photoId: string, ext: string) =>
        run(() => {
          const p = db.photos.find((x) => x.id === photoId && x.orgId === orgId)
          if (!p) throw notFound('photo')
          const job = findJob(p.jobId)
          if (!isOffice() && (p.operatorId !== myOperator()?.id || !assigned(job))) throw forbidden("can't change someone else's photo")
          p.uri = `ardent:photo/${p.id}`
          store.commit()
          return { file: `${orgId}/${p.id}.${ext}`, uri: p.uri }
        }),
      /** A link to a photo's image that works for an hour, for showing it on screen. */
      photoLink: (photoId: string) =>
        run(() => {
          const p = db.photos.find((x) => x.id === photoId && x.orgId === orgId)
          if (!p) throw notFound('photo')
          findJob(p.jobId)
          const exp = Date.now() + 60 * 60 * 1000
          return `/files/photos/${p.id}?exp=${exp}&sig=${sign(`${p.id}:${exp}`)}`
        }),
    }

    return { client, admin }
  }

  return { addUser, createOrganisation, organisationsFor, signUp, login, logout, userForToken, recall, remember, photoForLink, as, data: db }
}

export type Engine = ReturnType<typeof createEngine>
// Re-exported so callers needn't reach into the model for line shapes.
export type { LineItem }
