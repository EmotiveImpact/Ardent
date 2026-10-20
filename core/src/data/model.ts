/**
 * Ardent shared data model.
 *
 * Ardent Core (this web app) owns these shapes; the Ardent mobile app and any
 * future service read and write the same records. Money is integer pence,
 * times are ISO 8601 strings in UTC, ids are opaque strings with a readable
 * prefix (job_, cus_, opr_ ...). Human-facing numbers (J-1042, Q-311) are
 * separate from ids.
 */

export type Trade = 'gas' | 'electrical' | 'plumbing' | 'heating' | 'roofing' | 'carpentry' | 'general'

export type JobStatus =
  | 'enquiry' // came in, not yet priced
  | 'quoted' // quote sent, awaiting yes
  | 'booked' // slot agreed, crew assigned
  | 'en_route'
  | 'on_site'
  | 'paused' // waiting on parts, access or a permit
  | 'complete' // work done, not yet invoiced
  | 'invoiced'
  | 'paid'
  | 'cancelled'

export type Priority = 'emergency' | 'high' | 'normal' | 'low'

export interface Customer {
  id: string
  name: string
  kind: 'homeowner' | 'landlord' | 'letting_agent' | 'business'
  phone: string
  email?: string
  /** Running balance owed, in pence. */
  balance: number
}

export interface Site {
  id: string
  customerId: string
  line1: string
  town: string
  postcode: string
  accessNotes?: string
  /** Position on the live board, 0 to 100 on each axis. Replaced by lat/lng once maps land. */
  lat: number
  lng: number
}

/** What an operator is doing right now. The mobile app sets this; Core reads it. */
export type OperatorState = 'on_call' | 'en_route' | 'on_site' | 'workshop' | 'delayed' | 'off_shift'

/** A tradesperson using Ardent, whether owner, employee or subbie. */
export interface Operator {
  id: string
  name: string
  role: 'owner' | 'operator' | 'subcontractor'
  initials: string
  trades: Trade[]
  van: string
  state: OperatorState
  /** Job they are travelling to or working on. */
  currentJobId?: string
  etaMinutes?: number
  /** Gas Safe, NICEIC and similar registrations. */
  registrations: { body: string; number: string; expires: string }[]
}

export interface LineItem {
  id: string
  kind: 'labour' | 'material' | 'callout' | 'other'
  description: string
  quantity: number
  /** Unit price in pence, before VAT. */
  unitPrice: number
}

export interface ComplianceCheck {
  key: 'rams' | 'permit' | 'registration' | 'gas_tightness' | 'eicr' | 'photos' | 'signature'
  label: string
  state: 'pass' | 'fail' | 'pending' | 'n/a'
  detail?: string
}

export interface Job {
  id: string
  ref: string // J-1042
  title: string
  trade: Trade
  status: JobStatus
  priority: Priority
  customerId: string
  siteId: string
  operatorIds: string[]
  /** Booked window. */
  start: string
  end: string
  lines: LineItem[]
  checks: ComplianceCheck[]
  notes?: string
}

export type CertificateKind = 'CP12' | 'EICR' | 'PAT' | 'BS5839' | 'Boiler service' | 'Unvented'

export interface Certificate {
  id: string
  kind: CertificateKind
  siteId: string
  jobId?: string
  issued?: string
  expires: string
  state: 'valid' | 'due_soon' | 'overdue' | 'draft'
}

export interface Exception {
  id: string
  at: string
  who: string // engineer or customer name
  rule: string
  detail: string
  outcome: 'blocked' | 'chasing' | 'overridden' | 'resolved'
}

export interface TimeEntry {
  id: string
  jobId?: string
  operatorId: string
  kind: 'travel' | 'labour' | 'admin'
  start: string
  /** Missing while the clock is running. */
  end?: string
}

export interface Photo {
  id: string
  jobId: string
  operatorId: string
  stage: 'before' | 'during' | 'after'
  /** Storage URI; a local file URI on the phone until uploaded. */
  uri: string
  takenAt: string
  caption?: string
}

export interface Note {
  id: string
  jobId: string
  operatorId: string
  body: string
  at: string
}

export interface Quote {
  id: string
  ref: string // Q-311
  jobId: string
  customerId: string
  lines: LineItem[]
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
  validUntil: string
  sentAt?: string
}

export interface Invoice {
  id: string
  ref: string // INV-2207
  jobId: string
  customerId: string
  lines: LineItem[]
  /** VAT rate in basis points, 2000 = 20%. */
  vatRate: number
  status: 'draft' | 'sent' | 'part_paid' | 'paid' | 'overdue' | 'void'
  issuedAt?: string
  dueAt?: string
  paidAmount: number
}

/** Customer sign-off captured on the phone. */
export interface Signature {
  id: string
  jobId: string
  operatorId: string
  /** Name the customer typed or the operator entered. */
  signedBy: string
  /** SVG path data of the strokes. */
  svg: string
  at: string
}

export type PaymentMethod = 'card' | 'bank_transfer' | 'cash'
