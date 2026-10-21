/**
 * Ardent HQ: the app Ardent's own team uses to look after every firm on
 * Ardent. It reads across firms, so only Ardent staff can sign in to it, and
 * opening a firm's account is written in that firm's own log.
 *
 * These are the shapes HQ gets from the engine (engine/src/hq.ts).
 */
import type { ActionEntry, Automation, Certificate, Customer, FirmFollowUp, FollowUp, FollowUpSet, Invoice, Job, JobReport, JobStatus, Operator, OperatorState, Priority, Quote, Site, Trade, Usage } from './model'

/** admin changes the playbook; support can look at everything. */
export type StaffRole = 'admin' | 'support'

export interface StaffMe {
  id: string
  name: string
  email: string
  role: StaffRole
}

export type FirmStage = 'live' | 'setting_up'

/** How a firm is doing, in a word and a line. */
export interface FirmHealth {
  tone: 'ok' | 'warn' | 'bad' | 'quiet'
  label: string
  note: string
}

/** What a firm pays Ardent a month, in pence. */
export interface FirmBill {
  base: number
  extraEngineers: number
  perEngineer: number
  /** Ardent Voice, when the firm has it, with any minutes past those included. */
  voice?: number
  total: number
}

export interface FirmSummary {
  id: string
  name: string
  slug: string
  /** Where the firm is based. */
  town: string
  trades: Trade[]
  createdAt: string
  stage: FirmStage
  engineers: number
  officeUsers: number
  /** Engineers on shift now (anything but off shift). */
  engineersActive: number
  jobsToday: number
  /** On the road to a job or on site now. */
  liveNow: number
  emergencies: number
  /** Job reports signed in the last 7 days. */
  reportsWeek: number
  /** What the firm's customers owe it, in pence. */
  owing: number
  overdue: number
  bill: FirmBill
  /** This month against the plan. */
  usage: Usage
  aiCap: number
  health: FirmHealth
  /** The last thing anyone or Ardent did in the firm. */
  lastActive?: string
  /** Middle of the firm's patch, for the map. */
  centre: { lat: number; lng: number }
}

/** One job anywhere on Ardent, for the master map. */
export interface LiveJob {
  id: string
  ref: string
  title: string
  trade: Trade
  status: JobStatus
  priority: Priority
  start: string
  end: string
  firmId: string
  firmName: string
  operators: { id: string; name: string; initials: string }[]
  customer: string
  address: string
  /** Town and postcode district, e.g. "Didsbury, M20". */
  area: string
  lat: number
  lng: number
  report?: 'draft' | 'signed'
  /** Something about the job needs a look: running late, emergency not yet reached. */
  flag?: string
}

/** One van anywhere on Ardent. */
export interface LiveVan {
  id: string
  name: string
  initials: string
  firmId: string
  firmName: string
  state: OperatorState
  lat: number
  lng: number
  /** van: the phone's last reading; job: placed at the job it's on; base: on standby from home or the yard. */
  from: 'van' | 'job' | 'base'
  jobId?: string
  etaMinutes?: number
  seenAt?: string
}

export interface LiveBoard {
  /** YYYY-MM-DD, UK time. */
  day: string
  jobs: LiveJob[]
  vans: LiveVan[]
}

export interface HqNeed {
  id: string
  firmId?: string
  firmName?: string
  tone: 'bad' | 'warn' | 'info'
  title: string
  note: string
  /** Where to go to deal with it. */
  go: 'firm' | 'live' | 'shared' | 'playbook' | 'usage'
  jobId?: string
}

export interface HqTotals {
  firms: number
  live: number
  settingUp: number
  engineers: number
  engineersActive: number
  jobsToday: number
  liveNow: number
  emergencies: number
  reportsWeek: number
  /** AI used this month across firms, and the sum of their caps, in pence. */
  aiPence: number
  aiCapPence: number
  /** What live firms pay a month, in pence. */
  monthly: number
}

export interface HqOverview {
  totals: HqTotals
  firms: FirmSummary[]
  needs: HqNeed[]
}

export interface FirmMember {
  name: string
  email: string
  role: 'owner' | 'office' | 'field'
}

/** Everything in one firm's account, as HQ sees it. */
export interface FirmAccount {
  firm: FirmSummary
  members: FirmMember[]
  operators: Operator[]
  jobs: Job[]
  customers: Customer[]
  sites: Site[]
  invoices: Invoice[]
  quotes: Quote[]
  reports: JobReport[]
  certificates: Certificate[]
  followUps: FollowUpSet
  automation: Automation
  /** Month by month, newest last. */
  usageHistory: Usage[]
  /** Newest first. */
  log: ActionEntry[]
}

/** One of Ardent's playbook questions, with how it's doing across firms. */
export interface PlaybookRule extends FollowUp {
  /** published: as firms have it. changed/new/off: waiting in the draft. */
  state: 'published' | 'changed' | 'new' | 'off'
  /** Switched off for everyone in the published playbook. */
  off: boolean
  stats: {
    /** Times asked and answered in signed reports, last 30 days. */
    asked: number
    answered: number
    /** Firms that switched it off for themselves. */
    switchedOff: number
  }
  /** Came from a firm's own question. */
  from?: { firmId: string; firmName: string }
}

export interface PlaybookVersion {
  version: number
  publishedAt: string
  by: string
  note: string
}

export interface HqPlaybook {
  version: number
  publishedAt?: string
  by?: string
  rules: PlaybookRule[]
  /** Changes not yet sent to firms. */
  draft: { changes: string[]; by: string; updatedAt: string } | null
  history: PlaybookVersion[]
  /** Firms on Ardent: everyone a publish reaches. */
  firms: number
}

/** A question a firm wrote and offered to Ardent. */
export interface SharedRule {
  firmId: string
  firmName: string
  rule: FirmFollowUp
  /** Times it asked in the firm's signed reports, last 30 days. */
  fired: number
  answered: number
  review?: { state: 'adopted' | 'declined'; note?: string; at: string; by: string }
}

export interface HqLogEntry extends ActionEntry {
  firmId: string
  firmName: string
}

export interface HqClient {
  me(): Promise<StaffMe>
  overview(): Promise<HqOverview>
  firms(): Promise<FirmSummary[]>
  /** Opening a firm's account is written in that firm's log. */
  firm(id: string): Promise<FirmAccount>
  /** Every job today and every van now; one firm's when firmId is given. */
  live(firmId?: string): Promise<LiveBoard>
  /** Across firms, newest first. */
  log(firmId?: string): Promise<HqLogEntry[]>
  playbook: {
    get(): Promise<HqPlaybook>
    /** Add or change a rule in the draft. */
    save(rule: FollowUp): Promise<HqPlaybook>
    /** Switch a rule off (or back on) for every firm, in the draft. */
    switch(id: string, on: boolean): Promise<HqPlaybook>
    discard(): Promise<HqPlaybook>
    /** Send the draft to every firm. Phones pick it up next time they have signal. */
    publish(note: string): Promise<HqPlaybook>
  }
  shared: {
    list(): Promise<SharedRule[]>
    /** Put a firm's question in the playbook draft. */
    adopt(firmId: string, ruleId: string): Promise<HqPlaybook>
    decline(firmId: string, ruleId: string, note: string): Promise<SharedRule[]>
  }
}
