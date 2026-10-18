import type { ArdentClient } from './client';
import type { Customer, JobCard, Operator, Site } from './types';

const today = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const customers: Customer[] = [
  { id: 'c1', name: 'Mrs Patel', phone: '07700 900123' },
  { id: 'c2', name: 'Harbour Lane Dental', phone: '0161 496 0321' },
  { id: 'c3', name: 'Tom Whitfield', phone: '07700 900456' },
  { id: 'c4', name: 'Greaves & Sons Lettings', phone: '0161 496 0789' },
];

const sites: Site[] = [
  { id: 's1', customerId: 'c1', addressLine: '14 Elm Grove', town: 'Didsbury', postcode: 'M20 6RT', accessNotes: 'Side gate, dog is friendly' },
  { id: 's2', customerId: 'c2', addressLine: 'Unit 3, Harbour Lane', town: 'Salford', postcode: 'M50 2EQ', accessNotes: 'Report to reception' },
  { id: 's3', customerId: 'c3', addressLine: '7 Moss Bank Road', town: 'Stockport', postcode: 'SK4 3LA' },
  { id: 's4', customerId: 'c4', addressLine: 'Flat 2, 88 Wilmslow Road', town: 'Fallowfield', postcode: 'M14 6AL', accessNotes: 'Key safe 4471' },
];

const jobs: Omit<JobCard, 'customer' | 'site'>[] = [
  { id: 'j1', ref: 'ARD-1042', title: 'Consumer unit swap', customerId: 'c1', siteId: 's1', status: 'complete', priority: 'routine', scheduledStart: today(8), scheduledEnd: today(10, 30), quotedPence: 64000 },
  { id: 'j2', ref: 'ARD-1043', title: 'Emergency lighting test', customerId: 'c2', siteId: 's2', status: 'on_site', priority: 'routine', scheduledStart: today(11), scheduledEnd: today(13) },
  { id: 'j3', ref: 'ARD-1044', title: 'EV charger survey', customerId: 'c3', siteId: 's3', status: 'scheduled', priority: 'routine', scheduledStart: today(14), scheduledEnd: today(15) },
  { id: 'j4', ref: 'ARD-1045', title: 'No power to kitchen ring', customerId: 'c4', siteId: 's4', status: 'scheduled', priority: 'urgent', scheduledStart: today(16), scheduledEnd: today(17, 30) },
];

let operator: Operator = {
  id: 'o1',
  name: 'Dan Okafor',
  trade: 'electrician',
  businessName: 'Okafor Electrical',
  mode: 'on_site',
};

const delay = <T,>(value: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(value), ms));

export const mockClient: ArdentClient = {
  getOperator: () => delay(operator),
  setMode: (mode) => {
    operator = { ...operator, mode };
    return delay(operator, 60);
  },
  getDaySummary: () =>
    delay({
      jobsToday: jobs.length,
      jobsDone: jobs.filter((j) => j.status === 'complete' || j.status === 'invoiced').length,
      quotesOpen: 3,
      unpaidPence: 182500,
    }),
  getTodayJobs: () =>
    delay(
      jobs.map((j) => ({
        ...j,
        customer: customers.find((c) => c.id === j.customerId)!,
        site: sites.find((s) => s.id === j.siteId)!,
      })),
    ),
};
