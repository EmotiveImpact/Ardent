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
  /** Each payment as it came in. */
  payments?: { amount: number; method: PaymentMethod; at: string }[]
  /** Reminders sent about it, newest last. */
  reminders?: string[]
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

/** What a prompt in the engineer's job report asks about. */
export type ReportTopic = 'work' | 'parts' | 'tests' | 'left' | 'next'

/** What the engineer ticks before talking. Each one ticked has to be in the report before it can be signed off. */
export type ReportTick = 'service' | 'repair' | 'fitted' | 'parts' | 'tests' | 'left' | 'next'

/** One stretch of what the engineer said, as the phone heard it (or as they corrected it). */
export interface ReportSegment {
  text: string
  /** When it was said. */
  at: string
  /** The question it answered, when they were asked one thing at a time. */
  topic?: ReportTopic
  /** Sentences a follow-up moved to another topic: "You said the light has no earth. Add that as a fault?" */
  moved?: { start: number; end: number; topic: ReportTopic }[]
  /** The follow-up rule that asked for these words, when one did. */
  followUp?: string
}

/** Where something in the report came from: a segment, and the characters within it. */
export interface ReportSource {
  segment: number
  start: number
  end: number
}

export interface ReportLine {
  text: string
  from: ReportSource
}

/** A part the engineer mentioned, matched to the firm's price list where the words fit one item. */
export interface ReportPart {
  itemId?: string
  description: string
  quantity: number
  unit: PriceItem['unit']
  /** False when they never said how many; the quantity is then 1 until they do. */
  quantitySaid: boolean
  fromVan: boolean
  /** False when they never said where it came from; fromVan then follows what their van carries. */
  sourceSaid: boolean
  /** The words it was matched from. */
  heard: string
  from: ReportSource
  /** Price list items it could be, when the words fit more than one. */
  choices?: string[]
  /** Picked from the van list or typed rather than heard. `from` then points at no words (segment -1). */
  picked?: boolean
}

/** A reading or result the engineer said out loud. Never filled in by Ardent. */
export interface ReportReading {
  label: string
  value: string
  from: ReportSource
}

// Follow-up questions in the voice report: plain rules, see engine/kit/questions.ts.

/**
 * What has to be true for a follow-up to ask. Every check in a rule must hold.
 * Words and phrases match whole words, any case; "test*" also matches
 * "tested" and "testing".
 */
export type FollowUpCheck =
  /** One sentence of the answer uses one of these. Two `says` must both be in that same sentence. */
  | { says: string[] }
  /** ...and that sentence uses none of these. */
  | { unless: string[] }
  /** Nothing anywhere in the report uses any of these. */
  | { nowhere: string[] }
  | { ticked: ReportTick }
  | { notTicked: ReportTick }
  /** The report has no readings with units yet. */
  | { noReadings: true }
  /** The report has no parts yet. */
  | { noParts: true }

/** A button on the follow-up, and what it does. */
export type FollowUpReply =
  /** Hold the button and answer; the words go under this topic. */
  | { label: string; does: 'talk'; topic: ReportTopic }
  /** Writes this line under the topic, as if they'd said it. */
  | { label: string; does: 'note'; topic: ReportTopic; note: string }
  /** Ticks it, and with `move` puts the sentence that set the rule off under it too. */
  | { label: string; does: 'tick'; tick: ReportTick; move?: boolean }
  /** Nothing to add. */
  | { label: string; does: 'skip' }

export interface FollowUp {
  /** Short and fixed: the report keeps it on any words it adds, so the office can see what asked. */
  id: string
  /** What the rule is, for the rule book. */
  name: string
  /** Why Ardent asks, in a sentence the firm can check. */
  why: string
  /** Trades it's for; every trade when left out. */
  trades?: Trade[]
  /** The questions whose answers it listens to, or 'any'. */
  after: ReportTopic[] | 'any'
  when: FollowUpCheck[]
  /** The question. "{said}" is the sentence that set it off. */
  ask: string
  hint?: string
  replies: FollowUpReply[]
}

/** One of a firm's own follow-ups, added in Core. */
export interface FirmFollowUp extends FollowUp {
  /** Offered to Ardent for the playbook every firm gets. */
  shared?: boolean
  /** Who last changed it, and when. */
  by: string
  updatedAt: string
}

/**
 * The follow-ups a firm's phones ask: Ardent's playbook, which every firm
 * starts with, then the firm's own. The office switches any of them off.
 */
export interface FollowUpSet {
  playbook: FollowUp[]
  own: FirmFollowUp[]
  /** Playbook and own rules switched off for this firm. */
  off: string[]
}

/**
 * The engineer's job report, spoken on site and written on the phone with no
 * signal: every line, part and reading points back at the words it came from.
 */
export interface JobReport {
  id: string
  jobId: string
  operatorId: string
  segments: ReportSegment[]
  sections: { topic: ReportTopic; lines: ReportLine[] }[]
  parts: ReportPart[]
  readings: ReportReading[]
  /** Prompts nothing was said about, or, once ticks are made, ticked things the report still lacks. */
  missing: ReportTopic[]
  /** What the engineer ticked before talking. Older reports have none. */
  ticked?: ReportTick[]
  status: 'draft' | 'signed'
  createdAt: string
  updatedAt: string
  signedAt?: string
  /** The engineer who signed it off. */
  signedBy?: string
}

export type PaymentMethod = 'card' | 'bank_transfer' | 'cash'

/**
 * How far Ardent goes on its own with an action. read: looks and tells you.
 * draft: prepares it for a person. approve: ready, waits for one tap. auto:
 * runs alone inside the firm's rules. never: only a person does it.
 */
export type Autonomy = 'read' | 'draft' | 'approve' | 'auto' | 'never'

/** One thing that happened in the firm, done by a person or by Ardent. */
export interface ActionEntry {
  id: string
  at: string
  /** A person by name, or Ardent itself. */
  by: { kind: 'person'; name: string; userId: string } | { kind: 'ardent' }
  /** The engine call, e.g. invoices.send. */
  action: string
  /** In words: "Sent INV-2207". */
  summary: string
  /** For Ardent's own actions: the level it ran at. */
  level?: Autonomy
  jobId?: string
  /** The approval it carried out, when a person said yes to Ardent's draft. */
  approvalId?: string
}

/** Something Ardent has ready that waits for a person's yes. */
export interface Approval {
  id: string
  kind: 'send_invoice' | 'chase_invoice' | 'send_quote'
  status: 'waiting' | 'approved' | 'rejected' | 'stale'
  /** "Send INV-2207 to Harlow Lettings" */
  title: string
  /** What it's based on: "J-1042 finished yesterday, 4 lines, £1,240 with VAT." */
  why: string
  /** What goes out, word for word, for checking. */
  preview: string
  /** Changes when what it's based on changes; a yes on an old version is turned down. */
  version: string
  jobId?: string
  invoiceId?: string
  quoteId?: string
  createdAt: string
  decidedAt?: string
  decidedBy?: string
  /** Why it was turned down or went stale. */
  note?: string
}

/** The owner's start to the day: yesterday's numbers, what needs a look, what waits for a yes. */
export interface MorningBrief {
  /** The UK day it's for. */
  day: string
  /** Two or three sentences, written by the engine from the numbers. */
  headline: string
  numbers: { key: 'done' | 'invoiced' | 'cash' | 'overdue' | 'today'; label: string; value: number; money?: boolean; note?: string }[]
  /** What needs a look, worst first. */
  items: { tone: 'danger' | 'warn' | 'info'; text: string; jobId?: string; invoiceId?: string }[]
  /** Approvals waiting. */
  waiting: number
}

/* ---------- How Ardent works for a firm ---------- */

/**
 * How far Ardent goes on its own with one back office job.
 * 0 read: looks, adds up, tells you
 * 1 draft: prepares it for a person to check
 * 2 approve: ready to go, waits for one tap
 * 3 auto: runs alone inside the firm's rules
 * 4 never: off limits to the AI
 */
export type Level = 0 | 1 | 2 | 3 | 4

export type AutomationArea = 'calls' | 'dispatch' | 'paperwork' | 'money' | 'compliance' | 'brief'

/** One back office job Ardent can take on, with the level it runs at for this firm. */
export interface AutomationJob {
  key: string
  area: AutomationArea
  name: string
  does: string
  /** Who says yes, in a few words. */
  approves: string
  level: Level
  /** Where Ardent starts it. */
  standard: Level
  /** The levels the firm may pick from; one level means it is fixed. */
  allowed: Level[]
  /** Running now, or what it waits for (an account, a key, the build). */
  live: boolean
  waitsFor?: string
}

/** A firm's rules for Ardent. Owners change them; the office can read them. */
export interface Automation {
  /** An off switch for each area. Off means Ardent does nothing there, not even drafts. */
  areas: Record<AutomationArea, boolean>
  /** The firm's own level for a job, where it differs from the standard one. */
  levels: Record<string, Level>
  /** Days after an invoice is due: first reminder, firmer one, statement; and the least gap between reminders. */
  chase: { first: number; firmer: number; statement: number; gap: number }
  tone: 'friendly' | 'plain' | 'formal'
  /** How messages end. The firm's name when not set. */
  signOff?: string
  /** UK time. Calls outside these hours are after hours. Days are 1 (Monday) to 7. */
  officeHours: { from: string; to: string; days: number[] }
  limits: {
    /** Monthly AI spend cap in pence. When it's reached, Ardent carries on without AI and tells the owner. */
    aiPence: number
    /** Most reminders and notices one customer gets in a week. */
    messagesPerCustomerWeek: number
  }
  /** The Ardent Voice add-on: all-day answering. */
  voice: boolean
}

/** One kind of use this month against what the plan includes. */
export interface UsageLine {
  key: 'ai' | 'after_hours' | 'voice' | 'texts'
  label: string
  used: number
  unit: 'pence' | 'minutes' | 'texts'
  /** In the plan at no extra cost. */
  included?: number
  /** A hard stop: past it, that thing stops. */
  cap?: number
  /** Past what's included. */
  over: number
  /** What the part past included costs the firm, in pence. */
  overCost: number
  note: string
}

export interface Usage {
  /** YYYY-MM, UK time. */
  month: string
  lines: UsageLine[]
  /** Everything over included this month, in pence. */
  extraCost: number
  /** The AI cap is reached: Ardent is working without AI until the month ends or the cap goes up. */
  aiPaused: boolean
}
