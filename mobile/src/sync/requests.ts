/**
 * Job requests on the phone: the office asking who can take a job. A request
 * is a race against the clock and against the rest of the crew, so it never
 * waits in the save queue. The phone looks for new ones every few seconds
 * while Field is open and there's signal, and an answer goes straight to the
 * engine or not at all.
 *
 * With the phone locked, nothing arrives until Field is opened again: that
 * needs push notifications, which come later.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { DeclineReason, JobRequest } from '@/data/types';

import { field } from './field';
import { reason } from './ops';

const EVERY_MS = 4000;

let offers: JobRequest[] = [];
const listeners = new Set<() => void>();
const set = (next: JobRequest[]) => {
  offers = next;
  for (const fn of listeners) fn();
};

/** Look for requests offered to this engineer now. */
export async function checkOffers() {
  if (field.state.phase !== 'signed_in' || !field.state.online) return;
  try {
    set(await field.conn.client.requests.list());
  } catch {
    // Missed this look; the next one will do.
  }
}

/** The live offers, kept current while Field is open. */
export function useOffers() {
  const on = useSyncExternalStore(field.subscribe, () => field.state.phase === 'signed_in' && field.state.online);
  useEffect(() => {
    if (!on) return;
    void checkOffers();
    const h = setInterval(() => {
      if (AppState.currentState === 'active') void checkOffers();
    }, EVERY_MS);
    return () => clearInterval(h);
  }, [on]);
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => void listeners.delete(f);
    },
    () => offers,
  );
}

export const DECLINE_REASONS: { key: DeclineReason; label: string }[] = [
  { key: 'on_a_job', label: 'On a job' },
  { key: 'too_far', label: 'Too far' },
  { key: 'cant_today', label: "Can't today" },
];

/**
 * Say yes or no. Needs signal: someone else may be getting the same offer.
 * A yes puts the job on the engineer's day.
 */
export async function answer(req: JobRequest, to: 'accept' | 'decline', why?: DeclineReason) {
  if (!field.state.online) throw new Error('No signal. A job request needs signal to answer.');
  try {
    const result = await field.conn.client.requests.respond(req.id, to, why);
    set(offers.filter((o) => o.id !== req.id));
    if (to === 'accept') await field.refresh();
    return result;
  } catch (e) {
    set(offers.filter((o) => o.id !== req.id));
    throw new Error(reason(e));
  }
}

/** Seconds left to answer, never below zero. */
export const secondsLeft = (req: JobRequest, now = Date.now()) => Math.max(0, Math.ceil((Date.parse(req.offers[0]?.expiresAt ?? '') - now) / 1000) || 0);

/**
 * Demo only: play the office and send this engineer a job request, so the
 * offer screen can be tried. Says why when it can't reach them.
 */
export async function demoRequest(): Promise<string | undefined> {
  const conn = field.conn;
  const day = field.day;
  if (!conn.demoAs || !day) return 'Only in the demo';
  const office = conn.demoAs('jo@demo.ardent.local');
  const me = day.operator;
  const sites = await office.sites.list();
  const site = sites.find((s) => s.id === 'sit_04') ?? sites[0];
  const trade = me.trades[0] ?? 'general';
  const soon = Date.now() + 40 * 60_000;
  const job = await office.jobs.create({
    title: trade === 'gas' || trade === 'heating' ? 'No heating or hot water, elderly tenant' : 'Callout, customer has no power to the kitchen',
    trade,
    status: 'booked',
    priority: 'emergency',
    customerId: site.customerId,
    siteId: site.id,
    operatorIds: [],
    start: new Date(soon).toISOString(),
    end: new Date(soon + 2 * 3_600_000).toISOString(),
    lines: [],
    checks: [],
  });
  const req = await office.requests.create(job.id, { mode: 'all', wait: 45 });
  await checkOffers();
  if (req.offers.some((o) => o.operatorId === me.id)) return undefined;
  return req.skipped.find((s) => s.operatorId === me.id)?.why ?? 'It went to someone else first';
}
