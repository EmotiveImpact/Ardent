// Shared Ardent domain model, mobile side.
// Proposed to Ardent Core; Core owns the canonical shapes and these will be
// replaced by its exported types once published.

export type ID = string;
export type ISODate = string;

export type OperatorMode = 'on_site' | 'en_route' | 'on_call' | 'workshop' | 'off_shift';

export type Trade =
  | 'electrician'
  | 'plumber'
  | 'gas_engineer'
  | 'carpenter'
  | 'builder'
  | 'roofer'
  | 'decorator'
  | 'general';

export interface Operator {
  id: ID;
  name: string;
  trade: Trade;
  businessName: string;
  mode: OperatorMode;
}

export interface Customer {
  id: ID;
  name: string;
  phone?: string;
  email?: string;
}

export interface Site {
  id: ID;
  customerId: ID;
  addressLine: string;
  town: string;
  postcode: string;
  lat?: number;
  lng?: number;
  accessNotes?: string;
}

export type JobStatus = 'scheduled' | 'en_route' | 'on_site' | 'paused' | 'complete' | 'invoiced';
export type Priority = 'routine' | 'urgent' | 'emergency';

export interface Job {
  id: ID;
  ref: string;
  title: string;
  customerId: ID;
  siteId: ID;
  status: JobStatus;
  priority: Priority;
  scheduledStart: ISODate;
  scheduledEnd: ISODate;
  quotedPence?: number;
  notes?: string;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined';
export interface Quote {
  id: ID;
  ref: string;
  customerId: ID;
  title: string;
  totalPence: number;
  status: QuoteStatus;
  sentAt?: ISODate;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';
export interface Invoice {
  id: ID;
  ref: string;
  jobId: ID;
  totalPence: number;
  status: InvoiceStatus;
  dueAt: ISODate;
}

export type TimeEntryKind = 'travel' | 'labour' | 'admin';
export interface TimeEntry {
  id: ID;
  jobId: ID;
  kind: TimeEntryKind;
  startedAt: ISODate;
  endedAt?: ISODate;
}

export interface Material {
  id: ID;
  jobId: ID;
  description: string;
  qty: number;
  unitCostPence?: number;
}

/** A job joined with the records the field screens always need beside it. */
export interface JobCard extends Job {
  customer: Customer;
  site: Site;
}

/** Headline numbers for the operator's day. */
export interface DaySummary {
  jobsToday: number;
  jobsDone: number;
  quotesOpen: number;
  unpaidPence: number;
}
