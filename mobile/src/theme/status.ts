import type { JobStatus, Priority } from '@/data/types';

import { color } from './tokens';

export const STATUS: Record<JobStatus, { label: string; tint: string }> = {
  enquiry: { label: 'Enquiry', tint: color.fgMuted },
  quoted: { label: 'Quoted', tint: color.fgMuted },
  booked: { label: 'Booked', tint: color.fgMuted },
  en_route: { label: 'En route', tint: color.info },
  on_site: { label: 'On site', tint: color.ok },
  paused: { label: 'Paused', tint: color.warn },
  complete: { label: 'Done', tint: color.fgFaint },
  invoiced: { label: 'Invoiced', tint: color.fgFaint },
  paid: { label: 'Paid', tint: color.fgFaint },
  cancelled: { label: 'Cancelled', tint: color.fgFaint },
};

export const FLAG: Partial<Record<Priority, string>> = { emergency: color.danger, high: color.ember };
export const DONE = new Set<JobStatus>(['complete', 'invoiced', 'paid', 'cancelled']);
