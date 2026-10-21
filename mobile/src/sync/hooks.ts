import { useEffect, useState, useSyncExternalStore } from 'react';

import type { Day, Invoice, Job, JobCard, OperatorState, Photo, PriceItem, TimeEntry } from '@/data/types';
import { ukDay } from '@/kit/format';
import { jobDone, operatorState } from '@/kit/states';

import { field, type Snapshot } from './field';

/**
 * What Field calls each state. The kit's "On call" is "On shift" here, the
 * word the engineer picks on the start screen.
 */
export const stateLabel = (state: OperatorState) => (state === 'on_call' ? 'On shift' : operatorState[state].label);

/** The engineer's day and the queue's state, kept current. */
export function useField(): Snapshot {
  return useSyncExternalStore(field.subscribe, field.getSnapshot, field.getSnapshot);
}

/** Changes still on the phone, uploads included. */
export const waiting = (s: Snapshot) => s.state.outbox.length;

export function card(day: Day, job: Job): JobCard {
  return { ...job, customer: day.customers.find((c) => c.id === job.customerId), site: day.sites.find((s) => s.id === job.siteId) };
}

const IN_HAND = new Set<Job['status']>(['en_route', 'on_site', 'paused']);

/** Today's run sheet in time order. */
export function today(day: Day, now = Date.now()): JobCard[] {
  const d = ukDay(new Date(now).toISOString());
  return day.jobs
    .filter((j) => ukDay(j.start) === d || IN_HAND.has(j.status))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((j) => card(day, j));
}

/** The job in hand, or else the next one to go to. */
export function nextUp<J extends Job>(jobs: J[]): J | undefined {
  return jobs.find((j) => j.status === 'on_site' || j.status === 'en_route') ?? jobs.find((j) => j.status === 'paused') ?? jobs.find((j) => !jobDone.has(j.status) && j.status !== 'paused');
}

/** Milliseconds on a kind of clock, counting a running one up to now. */
export const elapsed = (entries: TimeEntry[], kind: TimeEntry['kind'] | 'all', now: number) =>
  entries.filter((t) => kind === 'all' || t.kind === kind).reduce((ms, t) => ms + Math.max(0, (t.end ? Date.parse(t.end) : now) - Date.parse(t.start)), 0);

/** "01:24:07", for a clock that's running. */
export const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** A tick each second while something is running. */
export function useNow(running: boolean, every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const h = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(h);
  }, [running, every]);
  return now;
}

/** The invoice for a job: the latest one that isn't void. */
export const jobInvoice = (day: Day, jobId: string): Invoice | undefined => day.invoices.filter((i) => i.jobId === jobId && i.status !== 'void').at(-1);

const links = new Map<string, { url: string; until: number }>();

/** Something an <Image> can show: the copy on the phone, or a short-lived link from the engine. */
export function usePhotoUri(photo: Photo) {
  const remote = photo.uri.startsWith('ardent:');
  const [uri, setUri] = useState(remote ? links.get(photo.id)?.url : photo.uri);
  useEffect(() => {
    if (!remote) return setUri(photo.uri);
    const hit = links.get(photo.id);
    if (hit && hit.until > Date.now()) return setUri(hit.url);
    let live = true;
    field.conn
      .photoUrl(photo)
      .then((url) => {
        links.set(photo.id, { url, until: Date.now() + 50 * 60 * 1000 });
        if (live) setUri(url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [photo, remote]);
  return uri;
}

const DAY_MS = 86_400_000;

/** A registration or calibration's standing from its expiry, worked out the way the engine works out certificates. */
export function standing(expires: string, now = Date.now()) {
  const today = ukDay(new Date(now).toISOString());
  if (expires < today) return 'overdue' as const;
  return expires <= new Date(now + 30 * DAY_MS).toISOString().slice(0, 10) ? ('due_soon' as const) : ('valid' as const);
}

/** Where a job is on the five-stop track: booked, road, on site, done, paid. */
export function stageOf(status: Job['status']) {
  if (status === 'en_route') return 1;
  if (status === 'on_site' || status === 'paused') return 2;
  if (status === 'complete' || status === 'invoiced') return 3;
  if (status === 'paid') return 4;
  return 0;
}

/** What's on the van, by name, and what's at or under its low mark. */
export function vanStock(day: Day) {
  const items = new Map(day.priceList.map((i) => [i.id, i]));
  const rows = day.stock.flatMap((x) => (items.has(x.itemId) ? [{ item: items.get(x.itemId)! as PriceItem, quantity: x.quantity, min: x.min }] : [])).sort((a, b) => a.item.name.localeCompare(b.item.name));
  const low = rows.filter((r) => r.quantity <= r.min);
  const lowWords = low.map((r) => `${r.item.name}, ${r.quantity} left`).slice(0, 3).join('; ') + (low.length > 3 ? ` and ${low.length - 3} more` : '');
  return { rows, low, lowWords };
}
