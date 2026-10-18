// Mobile-only shapes layered on Ardent Core's shared model (./core/model.ts).
// Anything that also belongs in Core is proposed there first.
import type { Customer, Job, OperatorState, Site } from './core/model';

export type * from './core/model';

/** The modes an operator can pick on the opening screen. Dispatch sets 'delayed', not the operator. */
export type OperatorMode = Exclude<OperatorState, 'delayed'>;

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
  /** Pence owed across the operator's customers. */
  owedPence: number;
}
