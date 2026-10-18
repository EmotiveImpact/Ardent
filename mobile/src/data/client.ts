import type { ArdentClient } from './core/client';
import { invoiceTotals, mockClient, mockPending } from './mock';
import type { PendingClient } from './pending';
import type { DaySummary, JobCard, Operator } from './types';

export type { ArdentClient };

/** The one client the app uses. Swap for Core's Supabase client when it lands. */
export const ardent: ArdentClient = mockClient;

/** Calls proposed to Core and not yet in its client (see ./pending.ts). */
export const field: PendingClient = mockPending;

export { invoiceTotals };

const DONE = new Set(['complete', 'invoiced', 'paid', 'cancelled']);

/**
 * The working day to show. Core's mock data covers a single fixed day, so
 * until real data arrives the day is taken from the operator's current job.
 */
async function workingDay(me: Operator) {
  const current = me.currentJobId ? await ardent.jobs.get(me.currentJobId) : undefined;
  return (current?.start ?? new Date().toISOString()).slice(0, 10);
}

export async function todayJobs(me: Operator): Promise<JobCard[]> {
  const day = await workingDay(me);
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const list = await ardent.jobs.list({ operatorId: me.id, from: `${day}T00:00:00Z`, to: next.toISOString() });
  const cards = await Promise.all(
    list.map(async (j) => {
      const [customer, site] = await Promise.all([ardent.customers.get(j.customerId), ardent.sites.get(j.siteId)]);
      return customer && site ? { ...j, customer, site } : undefined;
    }),
  );
  return cards.filter((c): c is JobCard => !!c).sort((a, b) => a.start.localeCompare(b.start));
}

export async function daySummary(me: Operator): Promise<DaySummary> {
  const [today, mine, quoted, customers] = await Promise.all([
    todayJobs(me),
    ardent.jobs.list({ operatorId: me.id }),
    ardent.jobs.list({ status: ['quoted'] }),
    ardent.customers.list(),
  ]);
  const mineCustomers = new Set(mine.map((j) => j.customerId));
  return {
    jobsToday: today.length,
    jobsDone: today.filter((j) => DONE.has(j.status)).length,
    quotesOpen: quoted.length,
    owedPence: customers.filter((c) => mineCustomers.has(c.id)).reduce((s, c) => s + c.balance, 0),
  };
}
