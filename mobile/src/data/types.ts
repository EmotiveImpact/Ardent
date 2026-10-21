// Mobile-only shapes layered on Ardent Core's shared model (./core/model.ts).
// Anything that also belongs in Core is proposed there first.
import type { Customer, GasSafetyRecord, Invoice, Job, Note, Operator, OperatorState, Photo, PriceItem, Signature, Site, StockLevel, TimeEntry } from './core/model';

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
  /** When this copy last came from the engine. */
  pulledAt: string;
}

/** A job joined with the records the field screens always need beside it. */
export interface JobCard extends Job {
  customer?: Customer;
  site?: Site;
}
