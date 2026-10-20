import { ardent } from './client';
import type { JobStatus, Operator, TimeEntry } from './types';

type Kind = TimeEntry['kind'];

/**
 * The field flow for one job: each step moves the job and the operator on
 * together and keeps exactly one clock running.
 */
export const STEPS: Partial<Record<JobStatus, { label: string; next: JobStatus; clock?: Kind; hold?: boolean }>> = {
  booked: { label: 'Set off', next: 'en_route', clock: 'travel' },
  en_route: { label: 'Arrived', next: 'on_site', clock: 'labour' },
  paused: { label: 'Resume', next: 'on_site', clock: 'labour' },
  on_site: { label: 'Hold to finish job', next: 'complete', hold: true },
};

export async function advance(jobId: string, me: Operator, running: TimeEntry | undefined) {
  const job = await ardent.jobs.get(jobId);
  const step = job && STEPS[job.status];
  if (!job || !step) return;
  if (running) await ardent.time.stop(running.id);
  await ardent.jobs.setStatus(job.id, step.next);
  if (step.next === 'en_route' || step.next === 'on_site') await ardent.operators.setState(me.id, step.next, job.id);
  if (step.next === 'complete') await ardent.operators.setState(me.id, 'on_call');
  if (step.clock) await ardent.time.start({ jobId: job.id, operatorId: me.id, kind: step.clock, start: new Date().toISOString() });
}

export async function pause(jobId: string, running: TimeEntry | undefined) {
  if (running) await ardent.time.stop(running.id);
  await ardent.jobs.setStatus(jobId, 'paused');
}

export const elapsed = (entries: TimeEntry[], kind: Kind, now: number) =>
  entries
    .filter((t) => t.kind === kind)
    .reduce((ms, t) => ms + ((t.end ? Date.parse(t.end) : now) - Date.parse(t.start)), 0);

export const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
