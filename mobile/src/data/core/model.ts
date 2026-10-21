/**
 * Ardent shared data model.
 *
 * Ardent Core (this web app) owns these shapes; the Ardent mobile app and any
 * future service read and write the same records. Money is integer pence,
 * times are ISO 8601 strings in UTC, ids are opaque strings with a readable
 * prefix (job_, cus_, opr_ ...). Human-facing numbers (J-1042, Q-311) are
 * separate from ids.
 */

export type Trade = 'gas' | 'electrical' | 'plumbing' | 'heating' | 'roofing' | 'carpentry' | 'fire' | 'lifts' | 'hvac' | 'general'

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
  /** Where the site is (WGS84), for the crew map and routing. */
  lat: number
  lng: number
}

/** What an operator is doing right now. The mobile app sets this; Core reads it. */
export type OperatorState = 'on_call' | 'en_route' | 'on_site' | 'workshop' | 'delayed' | 'off_shift'

/** A tradesperson using Ardent: owner, employee, subbie, or a freelancer the firm calls in. */
export interface Operator {
  id: string
  name: string
  /** Freelancers are only offered work while they are on standby. */
  role: 'owner' | 'operator' | 'subcontractor' | 'freelance'
  initials: string
  trades: Trade[]
  van: string
  state: OperatorState
  /** Job they are travelling to or working on. */
  currentJobId?: string
  etaMinutes?: number
  /** Gas Safe, NICEIC and similar registrations. */
  registrations: { body: string; number: string; expires: string }[]
  /** Where the van was last seen, shared from Ardent Field while on shift. Cleared when the shift ends. */
  location?: VanFix
  /** Free to be sent work until a time, within so many miles. Set from Ardent Field. */
  standby?: Standby
}

export interface Standby {
  until: string
  /** How far they'll travel, in miles. */
  radius: number
  /** Where they're working from, when the phone isn't sharing the van. */
  base?: { lat: number; lng: number }
}

/** One reading of where a van is. */
export interface VanFix {
  lat: number
  lng: number
  /** Metres either way, as the phone reports it. */
  accuracy?: number
  at: string
}

/** How far a van is from a site, for sending someone. */
export interface DriveTime {
  operatorId: string
  /** As the crow flies. */
  miles: number
  /** By road with today's traffic, when the firm has drive times switched on. */
  minutes?: number
  by: 'road' | 'straight_line'
  /** Measured from the van's last reading, or from the site of the job they're on. */
  from: 'van' | 'job'
  seenAt?: string
}

/** Why an engineer said no to a job request. */
export type DeclineReason = 'on_a_job' | 'too_far' | 'cant_today'

/** One engineer's go at a job request. */
export interface JobOffer {
  operatorId: string
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired' | 'closed'
  /** How far they were when the request went out. */
  miles?: number
  minutes?: number
  offeredAt?: string
  /** Hold to accept before this, or it moves on. */
  expiresAt?: string
  answeredAt?: string
  reason?: DeclineReason
}

/**
 * The office asking who can take a job: sent to the nearest engineer who can
 * do it, one at a time or to everyone at once, first to accept gets it.
 */
export interface JobRequest {
  id: string
  jobId: string
  mode: 'one' | 'all'
  /** Seconds each engineer has to answer. */
  wait: number
  status: 'open' | 'filled' | 'unfilled' | 'withdrawn'
  /** What the engineer sees before they say yes: no customer name or door number until then. */
  brief: { ref: string; title: string; trade: Trade; priority: Priority; start: string; end: string; area: string; lat: number; lng: number }
  /** Who it goes to, in order. Field only sees their own. */
  offers: JobOffer[]
  /** Who it couldn't go to, and why. Office only. */
  skipped: { operatorId: string; why: string }[]
  createdAt: string
  filledBy?: string
}

export interface LineItem {
  id: string
  kind: 'labour' | 'material' | 'callout' | 'other'
  description: string
  quantity: number
  /** Unit price in pence, before VAT. */
  unitPrice: number
  /** The price list item it came from, if any. */
  itemId?: string
  /** The operator whose van it came out of; removing the line puts it back. */
  fromVan?: string
}

/** Something the firm fits or charges for, priced once and reused on quotes, jobs and invoices. */
export interface PriceItem {
  id: string
  /** The firm's or the merchant's code. */
  code?: string
  name: string
  kind: LineItem['kind']
  unit: 'each' | 'hour' | 'metre' | 'job'
  /** To the customer, in pence before VAT. */
  price: number
  /** What it costs the firm, in pence. Only the office sees it. */
  cost?: number
  trade?: Trade
  /** Carried on the vans, so it shows in van stock. */
  stocked: boolean
  /** Off the list for new work; old lines keep it. */
  archived?: boolean
}

/** How many of a stocked item one engineer's van holds. */
export interface StockLevel {
  operatorId: string
  itemId: string
  quantity: number
  /** At or below this the van is low on it. */
  min: number
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

export type Verdict = 'pass' | 'fail' | 'n/a' | 'pending'

/** A gas appliance as recorded on a landlord gas safety record (CP12). */
export interface GasAppliance {
  id: string
  /** Kitchen, cellar, flat 2 lounge. */
  location: string
  /** Combi boiler, gas fire, hob, cooker, water heater. */
  type: string
  make?: string
  model?: string
  flue: 'room_sealed' | 'open_flue' | 'flueless'
  /** Owned by the landlord, so it must be on the record. */
  landlords: boolean
  /** Readings from the flue gas analyser and the gauge. */
  pressure?: number // operating pressure, mbar
  heatInput?: number // kW
  co?: number // ppm
  co2?: number // %
  ratio?: number // CO/CO2, e.g. 0.0012
  checks: { flue: Verdict; ventilation: Verdict; safetyDevice: Verdict; spillage: Verdict }
  /** Safe to use. Unset until the engineer says. */
  safe?: boolean
  defects?: string
  /** Gas Industry Unsafe Situations Procedure, if it applies. */
  unsafe?: 'at_risk' | 'immediately_dangerous'
}

/** The checks on the whole installation, beyond each appliance. */
export interface GasInstallation {
  tightness: Verdict
  ecv: Verdict // emergency control valve accessible
  bonding: Verdict // protective equipotential bonding
  pipework: Verdict // visual condition
  coAlarm: Verdict
}

export interface GasSafetyRecord {
  id: string
  ref: string // CP-1001
  jobId: string
  siteId: string
  customerId: string
  operatorId: string
  appliances: GasAppliance[]
  installation: GasInstallation
  status: 'draft' | 'issued'
  issuedAt?: string
  /** Twelve months from issue. */
  expires?: string
  /** The certificate it issued, on the site's list. */
  certificateId?: string
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

export type OptionKey = 'A' | 'B' | 'C'

/** One way of doing the work, priced on its own: good, better, best. */
export interface QuoteOption {
  key: OptionKey
  label: string
  lines: LineItem[]
}

export interface Quote {
  id: string
  ref: string // Q-311
  jobId: string
  customerId: string
  /** The lines being offered; once the customer picks an option, that option's lines. */
  lines: LineItem[]
  /** Two or three ways of doing it. Absent on a plain one-price quote. */
  options?: QuoteOption[]
  /** The option the customer said yes to. */
  chosen?: OptionKey
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
