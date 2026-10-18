import type { DaySummary, JobCard, Operator, OperatorMode } from './types';
import { mockClient } from './mock';

/**
 * Everything the mobile app asks of Ardent Core. Screens only talk to this
 * interface, so swapping the mock for Core's real API is a one-line change.
 */
export interface ArdentClient {
  getOperator(): Promise<Operator>;
  setMode(mode: OperatorMode): Promise<Operator>;
  getDaySummary(): Promise<DaySummary>;
  getTodayJobs(): Promise<JobCard[]>;
}

export const ardent: ArdentClient = mockClient;
