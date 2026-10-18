// Mobile-only shapes layered on Ardent Core's shared model (./core/model.ts).
// Anything that also belongs in Core is proposed there first.
import type { Customer, Engineer, Job, Site } from './core/model';

export type * from './core/model';

/** The working mode picked on the opening screen. Kept on the device for now. */
export type OperatorMode = 'on_site' | 'en_route' | 'on_call' | 'workshop' | 'off_shift';

/** A job joined with the records the field screens always need beside it. */
export interface JobCard extends Job {
  customer: Customer;
  site: Site;
}

/** Headline numbers for the engineer's day. */
export interface DaySummary {
  jobsToday: number;
  jobsDone: number;
  quotesOpen: number;
  /** Pence owed across the engineer's customers. */
  owedPence: number;
}

export type { Engineer };
