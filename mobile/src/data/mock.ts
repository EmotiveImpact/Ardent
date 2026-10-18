// In-memory implementation of Core's ArdentClient over Core's mock records.
// Stands in until the Supabase client lands; screens never import this.
import type { ArdentClient } from './core/client';
import * as seed from './core/mock';
import type { Job, Note, Operator, Photo, TimeEntry } from './core/model';

/** The operator signed in on this phone. */
const ME = 'opr_01';

const jobs: Job[] = seed.jobs.map((j) => ({ ...j }));
const operators: Operator[] = seed.operators.map((o) => ({ ...o }));
const time: TimeEntry[] = [];
const photos: Photo[] = [];
const notes: Note[] = [];

let seq = 0;
const nextId = (prefix: string) => `${prefix}_m${++seq}`;
const later = <T,>(value: T, ms = 80) => new Promise<T>((r) => setTimeout(() => r(value), ms));
const must = <T,>(value: T | undefined, what: string) => {
  if (value === undefined) throw new Error(`${what} not found`);
  return value;
};

export const mockClient: ArdentClient = {
  jobs: {
    list: (f = {}) =>
      later(
        jobs.filter(
          (j) =>
            (!f.status || f.status.includes(j.status)) &&
            (!f.operatorId || j.operatorIds.includes(f.operatorId)) &&
            (!f.from || j.start >= f.from) &&
            (!f.to || j.start < f.to),
        ),
      ),
    get: (id) => later(seed.byId(jobs, id)),
    create: (input) => {
      const job: Job = { ...input, id: nextId('job'), ref: `J-${2000 + seq}` };
      jobs.push(job);
      return later(job);
    },
    setStatus: (id, status) => {
      const job = must(seed.byId(jobs, id), 'Job');
      job.status = status;
      return later({ ...job });
    },
    addLine: (jobId, line) => {
      const job = must(seed.byId(jobs, jobId), 'Job');
      job.lines = [...job.lines, { ...line, id: nextId('li') }];
      return later({ ...job });
    },
    removeLine: (jobId, lineId) => {
      const job = must(seed.byId(jobs, jobId), 'Job');
      job.lines = job.lines.filter((l) => l.id !== lineId);
      return later({ ...job });
    },
  },
  customers: {
    list: () => later(seed.customers),
    get: (id) => later(seed.byId(seed.customers, id)),
  },
  sites: { get: (id) => later(seed.byId(seed.sites, id)) },
  operators: {
    list: () => later(operators),
    me: () => later({ ...must(seed.byId(operators, ME), 'Operator') }),
    setState: (id, state, jobId) => {
      const op = must(seed.byId(operators, id), 'Operator');
      op.state = state;
      if (jobId !== undefined) op.currentJobId = jobId;
      return later({ ...op });
    },
  },
  time: {
    start: (entry) => {
      const t: TimeEntry = { ...entry, id: nextId('tim') };
      time.push(t);
      return later(t);
    },
    stop: (id, at = new Date().toISOString()) => {
      const t = must(seed.byId(time, id), 'Time entry');
      t.end = at;
      return later({ ...t });
    },
    forJob: (jobId) => later(time.filter((t) => t.jobId === jobId)),
  },
  photos: {
    add: (p) => {
      const photo: Photo = { ...p, id: nextId('pho') };
      photos.push(photo);
      return later(photo);
    },
    forJob: (jobId) => later(photos.filter((p) => p.jobId === jobId)),
  },
  notes: {
    add: (n) => {
      const note: Note = { ...n, id: nextId('not') };
      notes.push(note);
      return later(note);
    },
    forJob: (jobId) => later(notes.filter((n) => n.jobId === jobId)),
  },
  quotes: { forJob: () => later([]) },
  invoices: { forJob: () => later([]) },
};
