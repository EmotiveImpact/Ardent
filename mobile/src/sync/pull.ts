import type { ArdentClient } from '@/data/core/client';
import type { Day, Job } from '@/data/types';

const DAY_MS = 86_400_000;
/** How far back and ahead the phone keeps jobs. A job still in hand is always kept. */
const BACK_DAYS = 14;
const AHEAD_DAYS = 21;
const IN_HAND = new Set<Job['status']>(['en_route', 'on_site', 'paused']);

/** Read the engineer's slice of the firm from the engine. */
export async function pullDay(client: ArdentClient): Promise<Day> {
  const operator = await client.operators.me();
  const now = Date.now();
  const from = new Date(now - BACK_DAYS * DAY_MS).toISOString();
  const to = new Date(now + AHEAD_DAYS * DAY_MS).toISOString();
  // An owner on the tools can see every job in the firm, so ask for their own.
  const mine = await client.jobs.list({ operatorId: operator.id });
  const jobs = mine.filter((j) => IN_HAND.has(j.status) || (j.start >= from && j.start < to)).sort((a, b) => a.start.localeCompare(b.start));

  const [customers, sites, perJob] = await Promise.all([
    client.customers.list(),
    client.sites.list(),
    Promise.all(
      jobs.map((j) =>
        Promise.all([client.time.forJob(j.id), client.photos.forJob(j.id), client.notes.forJob(j.id), client.signatures.forJob(j.id), client.invoices.forJob(j.id)]),
      ),
    ),
  ]);
  const customerIds = new Set(jobs.map((j) => j.customerId));
  const siteIds = new Set(jobs.map((j) => j.siteId));
  return {
    operator,
    jobs,
    customers: customers.filter((c) => customerIds.has(c.id)),
    sites: sites.filter((s) => siteIds.has(s.id)),
    time: perJob.flatMap(([t]) => t).filter((t) => t.operatorId === operator.id),
    photos: perJob.flatMap(([, p]) => p),
    notes: perJob.flatMap(([, , n]) => n),
    signatures: perJob.flatMap(([, , , s]) => s),
    invoices: perJob.flatMap(([, , , , i]) => i),
    pulledAt: new Date(now).toISOString(),
  };
}
