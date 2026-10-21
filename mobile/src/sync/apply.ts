/**
 * The phone's copy of the day moves the moment the engineer does something;
 * the engine catches up behind it. applyLocal() is what each change does to
 * the local copy, worked out the same way the engine works it out. settle()
 * folds the engine's answer back in once a change has gone.
 */
import { totals } from '@/kit/format';
import { buildReport, partLines, withTicks } from '@/kit/report';
import { checkLabel } from '@/kit/states';
import type { ComplianceCheck, Day, GasAppliance, GasSafetyRecord, Invoice, Job, JobReport, LineItem, Note, Operator, OperatorState, Photo, Signature, Standby, TimeEntry, VanFix } from '@/data/types';

import type { CallOp, Op } from './ops';

const DAY_MS = 86_400_000;

function patchJob(day: Day, id: string, fn: (j: Job) => Job): Day {
  return { ...day, jobs: day.jobs.map((j) => (j.id === id ? fn(j) : j)) };
}
function patchInvoice(day: Day, id: string, fn: (i: Invoice) => Invoice): Day {
  return { ...day, invoices: day.invoices.map((i) => (i.id === id ? fn(i) : i)) };
}
function patchRecord(day: Day, id: string, fn: (r: GasSafetyRecord) => GasSafetyRecord): Day {
  return { ...day, gasRecords: day.gasRecords.map((r) => (r.id === id && r.status === 'draft' ? fn(r) : r)) };
}
/** Parts off (or back onto) the engineer's van, never below zero, as the engine counts them. */
function moveStock(day: Day, operatorId: string, itemId: string, by: number): Day {
  if (operatorId !== day.operator.id) return day;
  const row = day.stock.find((x) => x.itemId === itemId) ?? { operatorId, itemId, quantity: 0, min: 0 };
  const next = { ...row, quantity: Math.max(0, row.quantity + by) };
  return { ...day, stock: [...day.stock.filter((x) => x.itemId !== itemId), next] };
}
const pendingChecks = (): GasAppliance['checks'] => ({ flue: 'pending', ventilation: 'pending', safetyDevice: 'pending', spillage: 'pending' });
/** Same day next year; 29 February rolls back to the 28th. */
const yearOn = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y + 1, m - 1, d));
  if (next.getUTCMonth() !== m - 1) next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
};
/** The appliance ids a new record starts with, before the engine gives its own. */
const copiedId = (recordId: string, i: number) => `${recordId}_a${i}`;

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
    case 'jobs.addLine': {
      const line = a[1] as Omit<LineItem, 'id'>;
      const next = patchJob(day, a[0], (j) => ({ ...j, lines: [...j.lines, { ...line, id: op.localId! }] }));
      return line.fromVan && line.itemId ? moveStock(next, line.fromVan, line.itemId, -line.quantity) : next;
    }
    case 'jobs.removeLine': {
      const line = day.jobs.find((j) => j.id === a[0])?.lines.find((l) => l.id === a[1]);
      const next = patchJob(day, a[0], (j) => ({ ...j, lines: j.lines.filter((l) => l.id !== a[1]) }));
      return line?.fromVan && line.itemId ? moveStock(next, line.fromVan, line.itemId, line.quantity) : next;
    }
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
    case 'operators.setStandby': {
      const standby = a[1] as Standby | null;
      if (standby) return { ...day, operator: { ...day.operator, standby: { ...day.operator.standby, ...standby }, state: day.operator.state === 'off_shift' ? 'on_call' : day.operator.state } };
      const { standby: _s, ...operator } = day.operator;
      return { ...day, operator: operator.role === 'freelance' && operator.state === 'on_call' ? { ...operator, state: 'off_shift', location: undefined } : operator };
    }
    case 'operators.setLocation':
      return day.operator.state === 'off_shift' ? day : { ...day, operator: { ...day.operator, location: a[1] as VanFix } };
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
    case 'gasRecords.create': {
      const [jobId, operatorId] = a as unknown as [string, string];
      const job = day.jobs.find((j) => j.id === jobId);
      if (!job || day.gasRecords.some((r) => r.jobId === jobId && r.status === 'draft')) return day;
      const last = day.gasRecords.filter((r) => r.siteId === job.siteId && r.status === 'issued').sort((x, y) => (y.issuedAt ?? '').localeCompare(x.issuedAt ?? ''))[0];
      const rec: GasSafetyRecord = {
        id: op.localId!,
        ref: '',
        jobId,
        siteId: job.siteId,
        customerId: job.customerId,
        operatorId,
        appliances: (last?.appliances ?? []).map((x, i) => ({ id: copiedId(op.localId!, i), location: x.location, type: x.type, make: x.make, model: x.model, flue: x.flue, landlords: x.landlords, checks: pendingChecks() })),
        installation: { tightness: 'pending', ecv: 'pending', bonding: 'pending', pipework: 'pending', coAlarm: 'pending' },
        status: 'draft',
      };
      return { ...day, gasRecords: [...day.gasRecords, rec] };
    }
    case 'gasRecords.saveAppliance': {
      const input = a[1] as GasAppliance;
      const next: GasAppliance = { ...input, id: input.id ?? op.localId!, checks: { ...pendingChecks(), ...input.checks } };
      if (next.safe) delete next.unsafe;
      return patchRecord(day, a[0], (r) => ({ ...r, appliances: r.appliances.some((x) => x.id === next.id) ? r.appliances.map((x) => (x.id === next.id ? next : x)) : [...r.appliances, next] }));
    }
    case 'gasRecords.removeAppliance':
      return patchRecord(day, a[0], (r) => ({ ...r, appliances: r.appliances.filter((x) => x.id !== a[1]) }));
    case 'gasRecords.setInstallation':
      return patchRecord(day, a[0], (r) => ({ ...r, installation: { ...r.installation, [a[1]]: a[2] } }));
    case 'gasRecords.issue': {
      const rec = day.gasRecords.find((r) => r.id === a[0]);
      if (!rec || rec.status !== 'draft') return day;
      const issued = patchRecord(day, rec.id, (r) => ({ ...r, status: 'issued', issuedAt: op.at, expires: yearOn(op.at.slice(0, 10)) }));
      const tightness = rec.installation.tightness;
      return patchJob(issued, rec.jobId, (j) => ({
        ...j,
        checks: [...j.checks.filter((c) => c.key !== 'gas_tightness'), { key: 'gas_tightness', label: j.checks.find((c) => c.key === 'gas_tightness')?.label ?? checkLabel.gas_tightness, state: tightness === 'pending' ? 'pending' : tightness, detail: `${rec.ref || 'Gas safety record'} issued` }],
      }));
    }
    case 'reports.save': {
      const [jobId, input] = a as unknown as [string, { operatorId: string; segments: JobReport['segments']; parts?: JobReport['parts']; ticked?: JobReport['ticked'] }];
      const job = day.jobs.find((j) => j.id === jobId);
      if (!job) return day;
      const was = day.reports.find((r) => r.jobId === jobId && r.operatorId === input.operatorId && r.status === 'draft');
      const built = buildReport({ segments: input.segments, trade: job.trade, priceList: day.priceList, van: day.stock });
      const report: JobReport = { ...withTicks(built, input.parts ?? built.parts, input.ticked ?? was?.ticked), id: was?.id ?? op.localId!, jobId, operatorId: input.operatorId, segments: input.segments, status: 'draft', createdAt: was?.createdAt ?? op.at, updatedAt: op.at };
      return { ...day, reports: [...day.reports.filter((r) => r !== was), report] };
    }
    case 'reports.sign': {
      const rep = day.reports.find((r) => r.id === a[0]);
      if (!rep || rep.status !== 'draft') return day;
      const lines = partLines(rep.parts, day.priceList, rep.operatorId);
      let next: Day = { ...day, reports: day.reports.map((r) => (r.id === rep.id ? { ...r, status: 'signed', signedAt: op.at, signedBy: day.operator.name } : r)) };
      next = patchJob(next, rep.jobId, (j) => ({ ...j, lines: [...j.lines, ...lines.map((l, i) => ({ ...l, id: `${op.id}_l${i}` }))] }));
      for (const l of lines) if (l.fromVan && l.itemId) next = moveStock(next, l.fromVan, l.itemId, -l.quantity);
      return next;
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
    case 'reports':
      day = { ...day, reports: upsert(day.reports, r as JobReport, op.localId ?? r.id) };
      break;
    case 'gasRecords': {
      const rec = r as GasSafetyRecord;
      if (op.method === 'gasRecords.create' && op.localId) {
        // The engine copies last year's appliances in the same order, so the phone's stand-in ids line up.
        rec.appliances.forEach((x, i) => (ids[copiedId(op.localId!, i)] = x.id));
        day = { ...day, gasRecords: upsert(day.gasRecords, rec, op.localId) };
        break;
      }
      if (op.method === 'gasRecords.saveAppliance' && op.localId) {
        const before = new Set(base.gasRecords.find((x) => x.id === rec.id)?.appliances.map((x) => x.id));
        const added = rec.appliances.filter((x) => !before.has(x.id)).at(-1);
        delete ids[op.localId];
        if (added) ids[op.localId] = added.id;
      }
      day = { ...day, gasRecords: upsert(day.gasRecords, rec) };
      break;
    }
  }
  return { day, ids };
}
