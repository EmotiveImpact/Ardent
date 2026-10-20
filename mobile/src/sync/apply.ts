/**
 * The phone's copy of the day moves the moment the engineer does something;
 * the engine catches up behind it. applyLocal() is what each change does to
 * the local copy, worked out the same way the engine works it out. settle()
 * folds the engine's answer back in once a change has gone.
 */
import { totals } from '@/kit/format';
import { checkLabel } from '@/kit/states';
import type { ComplianceCheck, Day, Invoice, Job, LineItem, Note, Operator, OperatorState, Photo, Signature, TimeEntry } from '@/data/types';

import type { CallOp, Op } from './ops';

const DAY_MS = 86_400_000;

function patchJob(day: Day, id: string, fn: (j: Job) => Job): Day {
  return { ...day, jobs: day.jobs.map((j) => (j.id === id ? fn(j) : j)) };
}
function patchInvoice(day: Day, id: string, fn: (i: Invoice) => Invoice): Day {
  return { ...day, invoices: day.invoices.map((i) => (i.id === id ? fn(i) : i)) };
}
function upsert<T extends { id: string }>(list: T[], item: T, replacing = item.id): T[] {
  return list.some((x) => x.id === replacing) ? list.map((x) => (x.id === replacing ? item : x)) : [...list, item];
}

/** What a change does to the phone's copy, before the engine has seen it. */
export function applyLocal(day: Day, op: Op): Day {
  if (op.kind === 'upload') return day;
  const a = op.args as never[];
  switch (op.method) {
    case 'jobs.setStatus':
      return patchJob(day, a[0], (j) => ({ ...j, status: a[1] }));
    case 'jobs.addLine':
      return patchJob(day, a[0], (j) => ({ ...j, lines: [...j.lines, { ...(a[1] as Omit<LineItem, 'id'>), id: op.localId! }] }));
    case 'jobs.removeLine':
      return patchJob(day, a[0], (j) => ({ ...j, lines: j.lines.filter((l) => l.id !== a[1]) }));
    case 'jobs.setCheck': {
      const [, key, state, detail] = a as unknown as [string, ComplianceCheck['key'], ComplianceCheck['state'], string | undefined];
      return patchJob(day, a[0], (j) => {
        const label = j.checks.find((c) => c.key === key)?.label ?? checkLabel[key];
        return { ...j, checks: [...j.checks.filter((c) => c.key !== key), { key, label, state, detail }] };
      });
    }
    case 'operators.setState': {
      const [, state, jobId] = a as unknown as [string, OperatorState, string | undefined];
      const operator: Operator = { ...day.operator, state, ...(jobId !== undefined ? { currentJobId: jobId } : {}) };
      return { ...day, operator };
    }
    case 'time.start':
      return { ...day, time: [...day.time, { ...(a[0] as Omit<TimeEntry, 'id'>), id: op.localId! }] };
    case 'time.stop':
      return { ...day, time: day.time.map((t) => (t.id === a[0] ? { ...t, end: (a[1] as string | undefined) ?? op.at } : t)) };
    case 'photos.add':
      return { ...day, photos: [...day.photos, { ...(a[0] as Omit<Photo, 'id'>), id: op.localId! }] };
    case 'notes.add':
      return { ...day, notes: [...day.notes, { ...(a[0] as Omit<Note, 'id'>), id: op.localId! }] };
    case 'signatures.add':
      return { ...day, signatures: [...day.signatures, { ...(a[0] as Omit<Signature, 'id'>), id: op.localId! }] };
    case 'invoices.create': {
      const job = day.jobs.find((j) => j.id === a[0]);
      if (!job) return day;
      const opts = (a[1] ?? {}) as { vatRate?: number };
      const draft: Invoice = { id: op.localId!, ref: '', jobId: job.id, customerId: job.customerId, lines: job.lines.map((l) => ({ ...l })), vatRate: opts.vatRate ?? 2000, status: 'draft', paidAmount: 0 };
      return { ...day, invoices: [...day.invoices, draft] };
    }
    case 'invoices.send': {
      const inv = day.invoices.find((i) => i.id === a[0]);
      if (!inv) return day;
      const sent = patchInvoice(day, inv.id, (i) => ({ ...i, status: 'sent', issuedAt: op.at, dueAt: new Date(Date.parse(op.at) + 14 * DAY_MS).toISOString() }));
      return patchJob(sent, inv.jobId, (j) => ({ ...j, status: 'invoiced' }));
    }
    case 'invoices.recordPayment': {
      const inv = day.invoices.find((i) => i.id === a[0]);
      if (!inv) return day;
      const total = totals(inv).total;
      const paidAmount = Math.min(total, inv.paidAmount + (a[1] as number));
      const status: Invoice['status'] = paidAmount >= total ? 'paid' : 'part_paid';
      const paid = patchInvoice(day, inv.id, (i) => ({ ...i, paidAmount, status, issuedAt: i.issuedAt ?? op.at }));
      return patchJob(paid, inv.jobId, (j) => ({ ...j, status: status === 'paid' ? 'paid' : 'invoiced' }));
    }
    default:
      return day;
  }
}

/**
 * Fold the engine's answer into the confirmed copy. Returns any local ids the
 * answer resolved (a new record's id, or a new line's id).
 */
export function settle(base: Day, op: CallOp, result: unknown): { day: Day; ids: Record<string, string> } {
  const ids: Record<string, string> = {};
  // Side effects the answer doesn't carry (an invoice moving its job on) come from the local rule.
  let day = applyLocal(base, op);
  const r = result as { id: string } | undefined;
  if (!r || typeof r !== 'object') return { day, ids };
  const [area] = op.method.split('.');
  if (op.localId && r.id) ids[op.localId] = r.id;
  switch (area) {
    case 'jobs': {
      const job = r as Job;
      if (op.method === 'jobs.addLine' && op.localId) {
        const before = new Set(base.jobs.find((j) => j.id === job.id)?.lines.map((l) => l.id));
        const added = job.lines.filter((l) => !before.has(l.id)).at(-1);
        delete ids[op.localId];
        if (added) ids[op.localId] = added.id;
      }
      day = { ...day, jobs: upsert(day.jobs, job) };
      break;
    }
    case 'operators':
      day = { ...day, operator: r as Operator };
      break;
    case 'time':
      day = { ...day, time: upsert(day.time, r as TimeEntry, op.localId ?? r.id) };
      break;
    case 'photos':
      day = { ...day, photos: upsert(day.photos, r as Photo, op.localId ?? r.id) };
      break;
    case 'notes':
      day = { ...day, notes: upsert(day.notes, r as Note, op.localId ?? r.id) };
      break;
    case 'signatures':
      day = { ...day, signatures: upsert(day.signatures, r as Signature, op.localId ?? r.id) };
      break;
    case 'invoices':
      day = { ...day, invoices: upsert(day.invoices, r as Invoice, op.localId ?? r.id) };
      break;
  }
  return { day, ids };
}
