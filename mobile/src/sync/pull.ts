import type { ArdentClient } from '@/data/core/client';
import type { Day, Job } from '@/data/types';

const DAY_MS = 86_400_000;
/** How far back and ahead the phone keeps jobs. A job still in hand is always kept. */
const BACK_DAYS = 14;
const AHEAD_DAYS = 21;
const IN_HAND = new Set<Job['status']>(['en_route', 'on_site', 'paused']);
/** Jobs that can need a gas safety record. */
export const GAS_TRADES = new Set<Job['trade']>(['gas', 'heating']);

/** Read the engineer's slice of the firm from the engine. */
export async function pullDay(client: ArdentClient): Promise<Day> {
  const operator = await client.operators.me();
  const now = Date.now();
  const from = new Date(now - BACK_DAYS * DAY_MS).toISOString();
  const to = new Date(now + AHEAD_DAYS * DAY_MS).toISOString();
  // An owner on the tools can see every job in the firm, so ask for their own.
  const mine = await client.jobs.list({ operatorId: operator.id });
  const jobs = mine.filter((j) => IN_HAND.has(j.status) || (j.start >= from && j.start < to)).sort((a, b) => a.start.localeCompare(b.start));

  // Last year's gas record is where this year's starts, so keep every record at those sites.
  const gasSites = [...new Set(jobs.filter((j) => GAS_TRADES.has(j.trade)).map((j) => j.siteId))];
  const [customers, sites, priceList, stock, gasRecords, followUps, perJob] = await Promise.all([
    client.customers.list(),
    client.sites.list(),
    client.priceList.list(),
    client.stock.list({ operatorId: operator.id }),
    Promise.all(gasSites.map((siteId) => client.gasRecords.list({ siteId }))).then((r) => r.flat()),
    client.followUps.get(),
    Promise.all(
      jobs.map((j) =>
        Promise.all([client.time.forJob(j.id), client.photos.forJob(j.id), client.notes.forJob(j.id), client.signatures.forJob(j.id), client.invoices.forJob(j.id), client.reports.forJob(j.id)]),
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
    reports: perJob.flatMap(([, , , , , r]) => r).filter((r) => r.operatorId === operator.id),
    priceList,
    stock,
    gasRecords,
    followUps,
    pulledAt: new Date(now).toISOString(),
  };
}
