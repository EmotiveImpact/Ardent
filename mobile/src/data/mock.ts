import type { ArdentClient } from './client';
import { byId, customers, engineers, jobs, sites } from './core/mock';
import type { JobCard } from './types';

// Core's mock data covers one working day; the signed-in engineer is Dan Mercer.
const ME = 'eng_01';
const DONE = new Set(['complete', 'invoiced', 'paid']);

const mine = jobs.filter((j) => j.engineerIds.includes(ME));
const myDay = mine.find((j) => j.status === 'on_site')?.start.slice(0, 10) ?? mine[0]?.start.slice(0, 10);
const today = mine.filter((j) => j.start.startsWith(myDay ?? '')).sort((a, b) => a.start.localeCompare(b.start));

const delay = <T,>(value: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(value), ms));

export const mockClient: ArdentClient = {
  getMe: () => delay(byId(engineers, ME)!),
  getDaySummary: () => {
    const mineCustomers = new Set(mine.map((j) => j.customerId));
    return delay({
      jobsToday: today.length,
      jobsDone: today.filter((j) => DONE.has(j.status)).length,
      quotesOpen: jobs.filter((j) => j.status === 'quoted').length,
      owedPence: customers.filter((c) => mineCustomers.has(c.id)).reduce((s, c) => s + c.balance, 0),
    });
  },
  getTodayJobs: () =>
    delay(
      today.map<JobCard>((j) => ({ ...j, customer: byId(customers, j.customerId)!, site: byId(sites, j.siteId)! })),
    ),
};
