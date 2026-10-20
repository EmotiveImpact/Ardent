/**
 * What an engineer does through the day, as changes on the phone. Each one
 * moves the screen at once and joins the queue for the engine. Times are the
 * moment the engineer acted, never the moment the change reaches the engine.
 */
import type { ComplianceCheck, Day, DayMode, Job, LineItem, PaymentMethod, Photo, TimeEntry } from '@/data/types';
import { totals } from '@/kit/format';
import { checkLabel, jobStatus } from '@/kit/states';

import { field } from './field';
import { callOp, localId, type Op, uploadOp } from './ops';
import { stateLabel } from './hooks';
import { keepPhoto } from './photos';

function current(): Day {
  const day = field.day;
  if (!day) throw new Error("Your day isn't on the phone yet");
  return day;
}

const now = () => new Date().toISOString();

/** The engineer's clock that's running, if any. */
export const runningClock = (day: Day) => day.time.find((t) => !t.end && t.operatorId === day.operator.id);

function stopClocks(day: Day, at: string, ref: string): Op[] {
  return day.time
    .filter((t) => !t.end && t.operatorId === day.operator.id)
    .map((t) => callOp('time.stop', [t.id, at], `Stopped the ${t.kind === 'travel' ? 'travel' : 'tools'} clock on ${ref}`, { at }));
}

function startClock(day: Day, job: Job, kind: TimeEntry['kind'], at: string): Op {
  return callOp('time.start', [{ jobId: job.id, operatorId: day.operator.id, kind, start: at }], `Started the ${kind === 'travel' ? 'travel' : 'tools'} clock on ${job.ref}`, { localId: localId('tim'), at });
}

const status = (job: Job, to: Job['status'], at: string) => callOp('jobs.setStatus', [job.id, to], `${job.ref} set to ${jobStatus[to].label}`, { at });
const state = (day: Day, to: DayMode | 'en_route' | 'on_site', at: string, jobId?: string) =>
  callOp('operators.setState', jobId ? [day.operator.id, to, jobId] : [day.operator.id, to], `Your status: ${stateLabel(to)}`, { at });

/** Start the day, or change what you're doing: on shift, workshop, off shift. */
export function setMode(mode: DayMode) {
  const day = current();
  return field.enqueue(state(day, mode, now()));
}

export function setOff(job: Job) {
  const day = current();
  const at = now();
  return field.enqueue(...stopClocks(day, at, job.ref), status(job, 'en_route', at), state(day, 'en_route', at, job.id), startClock(day, job, 'travel', at));
}

export function arrived(job: Job) {
  const day = current();
  const at = now();
  return field.enqueue(...stopClocks(day, at, job.ref), status(job, 'on_site', at), state(day, 'on_site', at, job.id), startClock(day, job, 'labour', at));
}

/** Waiting on parts or a permit: the clock stops and the office sees it paused. */
export function pause(job: Job) {
  const day = current();
  const at = now();
  return field.enqueue(...stopClocks(day, at, job.ref), status(job, 'paused', at), state(day, 'on_call', at));
}

export function backOnIt(job: Job) {
  const day = current();
  const at = now();
  return field.enqueue(...stopClocks(day, at, job.ref), status(job, 'on_site', at), state(day, 'on_site', at, job.id), startClock(day, job, 'labour', at));
}

export function finish(job: Job) {
  const day = current();
  const at = now();
  return field.enqueue(...stopClocks(day, at, job.ref), status(job, 'complete', at), state(day, 'on_call', at));
}

export function addMaterial(job: Job, line: Omit<LineItem, 'id'>) {
  return field.enqueue(callOp('jobs.addLine', [job.id, line], `Logged ${line.quantity} × ${line.description} on ${job.ref}`, { localId: localId('li') }));
}

export function removeLine(job: Job, line: LineItem) {
  return field.enqueue(callOp('jobs.removeLine', [job.id, line.id], `Took ${line.description} off ${job.ref}`));
}

export function setCheck(job: Job, key: ComplianceCheck['key'], to: ComplianceCheck['state'], detail?: string) {
  const label = job.checks.find((c) => c.key === key)?.label ?? checkLabel[key];
  return field.enqueue(callOp('jobs.setCheck', detail === undefined ? [job.id, key, to] : [job.id, key, to, detail], `${label} on ${job.ref}: ${to === 'pass' ? 'pass' : to === 'fail' ? 'fail' : 'to do'}`));
}

export function addNote(job: Job, body: string) {
  const day = current();
  const at = now();
  return field.enqueue(callOp('notes.add', [{ jobId: job.id, operatorId: day.operator.id, body, at }], `Note on ${job.ref}`, { localId: localId('not'), at }));
}

/** A photo: shrunk and kept on the phone, recorded on the job, and its image sent when there's signal. */
async function photoOps(job: Job, picked: { uri: string; width?: number; height?: number }, stage: Photo['stage'], caption?: string): Promise<Op[]> {
  const day = current();
  const at = now();
  const file = await keepPhoto(picked);
  const id = localId('pho');
  const photo: Omit<Photo, 'id'> = { jobId: job.id, operatorId: day.operator.id, stage, uri: file, takenAt: at, ...(caption ? { caption } : {}) };
  return [callOp('photos.add', [photo], `${stage[0].toUpperCase()}${stage.slice(1)} photo on ${job.ref}`, { localId: id, at }), uploadOp(id, file, `Photo image for ${job.ref}`)];
}

export async function addPhoto(job: Job, picked: { uri: string; width?: number; height?: number }, stage: Photo['stage']) {
  return field.enqueue(...(await photoOps(job, picked, stage)));
}

export const NO_ACCESS_REASONS = ['No one in', 'Keys or code not there', 'Not safe to work', 'Customer turned us away', 'Something else'] as const;

/**
 * Couldn't get in: the reason as a note, the photo that shows it, and the job
 * paused so the office picks it up.
 */
export async function couldntGetIn(job: Job, why: string, detail: string, picked: { uri: string; width?: number; height?: number }) {
  const day = current();
  const at = now();
  const body = `Couldn't get in: ${why}.${detail.trim() ? ` ${detail.trim()}` : ''}`;
  const photo = await photoOps(job, picked, 'before', `Couldn't get in: ${why}`);
  return field.enqueue(
    ...stopClocks(day, at, job.ref),
    ...photo,
    callOp('notes.add', [{ jobId: job.id, operatorId: day.operator.id, body, at }], `Couldn't get in note on ${job.ref}`, { localId: localId('not'), at }),
    status(job, 'paused', at),
    state(day, 'on_call', at),
  );
}

/** The customer's signature, and the checks it settles. */
export function signOff(job: Job, signedBy: string, svg: string) {
  const day = current();
  const at = now();
  const photos = day.photos.filter((p) => p.jobId === job.id).length;
  const ops: Op[] = [
    callOp('signatures.add', [{ jobId: job.id, operatorId: day.operator.id, signedBy, svg, at }], `Sign-off from ${signedBy} on ${job.ref}`, { localId: localId('sig'), at }),
    callOp('jobs.setCheck', [job.id, 'signature', 'pass', signedBy], `Customer sign-off on ${job.ref}: pass`, { at }),
  ];
  if (photos > 0) ops.push(callOp('jobs.setCheck', [job.id, 'photos', 'pass', `${photos} taken`], `Photos on ${job.ref}: pass`, { at }));
  return field.enqueue(...ops);
}

/** A draft invoice from the job's lines, VAT at 20%. Returns its id (local until the engine numbers it). */
export async function raiseInvoice(job: Job) {
  const id = localId('inv');
  await field.enqueue(callOp('invoices.create', [job.id, { vatRate: 2000 }], `Invoice for ${job.ref}`, { localId: id }));
  return id;
}

/** They'll pay later: the invoice is issued and due in 14 days. */
export function payLater(invoiceId: string, ref: string) {
  return field.enqueue(callOp('invoices.send', [invoiceId, 'email'], `Invoice issued for ${ref}`));
}

/** Paid on the doorstep: what's still owed, by how they paid. */
export function takePayment(invoiceId: string, ref: string, method: PaymentMethod) {
  const inv = current().invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error('Invoice not found');
  const owed = totals(inv).total - inv.paidAmount;
  return field.enqueue(callOp('invoices.recordPayment', [invoiceId, owed, method], `Payment for ${ref}`));
}
