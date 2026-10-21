// Mobile-only shapes layered on Ardent Core's shared model (./core/model.ts).
// Anything that also belongs in Core is proposed there first.
import type { Customer, FollowUpSet, GasSafetyRecord, Invoice, Job, JobReport, Note, Operator, OperatorState, PaymentAccount, Photo, PriceItem, Signature, Site, StockLevel, TimeEntry } from './core/model';

export type * from './core/model';

/** The states an engineer picks to start the day. The job flow sets en route and on site; the office sets delayed. */
export type DayMode = Extract<OperatorState, 'on_call' | 'workshop' | 'off_shift'>;

/**
 * The engineer's own slice of the firm, kept on the phone so every job opens
 * with no signal: their crew record, their jobs and everything hanging off
 * them.
 */
export interface Day {
  operator: Operator;
  jobs: Job[];
  customers: Customer[];
  sites: Site[];
  /** Only the engineer's own clocks. */
  time: TimeEntry[];
  photos: Photo[];
  notes: Note[];
  signatures: Signature[];
  invoices: Invoice[];
  /** The firm's price list, without what things cost the firm. */
  priceList: PriceItem[];
  /** What's on the engineer's own van. */
  stock: StockLevel[];
  /** Gas safety records at the sites of gas and heating jobs, last year's included. */
  gasRecords: GasSafetyRecord[];
  /** The engineer's spoken job reports, drafts and signed. */
  reports: JobReport[];
  /** The follow-up questions the firm's reports ask: Ardent's playbook and the firm's own. Older saved days have none. */
  followUps?: FollowUpSet;
  /** Whether the firm takes payments through Ardent, kept from the last time there was signal. Older saved days have none. */
  pay?: FieldPay;
  /** When this copy last came from the engine. */
  pulledAt: string;
}

/**
 * What the phone keeps about the firm's payments so the doorstep works with
 * no signal: whether the firm takes payments, Stripe test mode, and the key
 * this engineer signs "Pay on your own phone" codes with.
 */
export interface FieldPay {
  status: PaymentAccount['status'];
  test: boolean;
  offlineKey?: string;
  /** When the phone last heard. */
  at: string;
}

/** A job joined with the records the field screens always need beside it. */
export interface JobCard extends Job {
  customer?: Customer;
  site?: Site;
}
