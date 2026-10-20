/**
 * What every state means, in words and colour, for both apps. A tone is a
 * meaning, not a colour: each app maps tones to tokens (tone() below), and
 * status colours only ever mean state, never decoration.
 */
import type { Certificate, ComplianceCheck, Invoice, JobStatus, OperatorState, Priority, Quote } from '../data/core/model'
import { color } from './tokens'

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'ember' | 'violet' | 'faint'

export const toneColor: Record<Tone, string> = {
  neutral: color.fgMuted,
  faint: color.fgFaint,
  ok: color.ok,
  warn: color.warn,
  danger: color.danger,
  info: color.info,
  ember: color.ember,
  violet: color.violet,
}

type Meta = { label: string; tone: Tone }

export const jobStatus: Record<JobStatus, Meta> = {
  enquiry: { label: 'Enquiry', tone: 'neutral' },
  quoted: { label: 'Quoted', tone: 'violet' },
  booked: { label: 'Booked', tone: 'neutral' },
  en_route: { label: 'En route', tone: 'info' },
  on_site: { label: 'On site', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  complete: { label: 'Done', tone: 'faint' },
  invoiced: { label: 'Invoiced', tone: 'info' },
  paid: { label: 'Paid', tone: 'ember' },
  cancelled: { label: 'Cancelled', tone: 'faint' },
}

/** The order a job moves through, for progress rails. */
export const jobFlow: JobStatus[] = ['booked', 'en_route', 'on_site', 'complete', 'invoiced', 'paid']

/** Finished from the engineer's point of view. */
export const jobDone: ReadonlySet<JobStatus> = new Set(['complete', 'invoiced', 'paid', 'cancelled'])

export const priority: Record<Priority, Meta> = {
  emergency: { label: 'Emergency', tone: 'danger' },
  high: { label: 'High', tone: 'warn' },
  normal: { label: 'Normal', tone: 'neutral' },
  low: { label: 'Low', tone: 'faint' },
}

export const operatorState: Record<OperatorState, Meta> = {
  on_call: { label: 'On call', tone: 'neutral' },
  en_route: { label: 'En route', tone: 'info' },
  on_site: { label: 'On site', tone: 'ok' },
  workshop: { label: 'Workshop', tone: 'neutral' },
  delayed: { label: 'Delayed', tone: 'warn' },
  off_shift: { label: 'Off shift', tone: 'faint' },
}

export const invoiceStatus: Record<Invoice['status'], Meta> = {
  draft: { label: 'Draft', tone: 'faint' },
  sent: { label: 'Sent', tone: 'info' },
  part_paid: { label: 'Part paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'ok' },
  overdue: { label: 'Overdue', tone: 'danger' },
  void: { label: 'Void', tone: 'faint' },
}

export const quoteStatus: Record<Quote['status'], Meta> = {
  draft: { label: 'Draft', tone: 'faint' },
  sent: { label: 'Sent', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'ok' },
  declined: { label: 'Declined', tone: 'danger' },
  expired: { label: 'Expired', tone: 'faint' },
}

export const certificateState: Record<Certificate['state'], Meta> = {
  valid: { label: 'Valid', tone: 'ok' },
  due_soon: { label: 'Due soon', tone: 'warn' },
  overdue: { label: 'Overdue', tone: 'danger' },
  draft: { label: 'Draft', tone: 'faint' },
}

export const checkState: Record<ComplianceCheck['state'], Meta> = {
  pass: { label: 'Pass', tone: 'ok' },
  fail: { label: 'Fail', tone: 'danger' },
  pending: { label: 'To do', tone: 'neutral' },
  'n/a': { label: 'N/A', tone: 'faint' },
}

export const checkLabel: Record<ComplianceCheck['key'], string> = {
  rams: 'RAMS',
  permit: 'Permit',
  registration: 'Registration',
  gas_tightness: 'Tightness test',
  eicr: 'Electrical cert',
  photos: 'Photos',
  signature: 'Customer sign-off',
}

export const trade: Record<string, string> = {
  gas: 'Gas',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  heating: 'Heating',
  roofing: 'Roofing',
  carpentry: 'Carpentry',
  fire: 'Fire',
  lifts: 'Lifts',
  hvac: 'HVAC',
  general: 'General',
}

export const customerKind: Record<string, string> = {
  homeowner: 'Homeowner',
  landlord: 'Landlord',
  letting_agent: 'Letting agent',
  business: 'Business',
}
