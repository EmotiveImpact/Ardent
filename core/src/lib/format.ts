import type { JobStatus, Priority } from '@/data/model'

export const time = (iso: string, seconds = false) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
    timeZone: 'UTC',
  })

/** 7380000 ms to "2h 03m". */
export const duration = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'ember' | 'violet'

export const statusMeta: Record<JobStatus, { label: string; tone: Tone }> = {
  enquiry: { label: 'Enquiry', tone: 'neutral' },
  quoted: { label: 'Quoted', tone: 'violet' },
  booked: { label: 'Booked', tone: 'info' },
  en_route: { label: 'En route', tone: 'ember' },
  on_site: { label: 'On site', tone: 'ok' },
  paused: { label: 'Paused', tone: 'warn' },
  complete: { label: 'Complete', tone: 'ok' },
  invoiced: { label: 'Invoiced', tone: 'info' },
  paid: { label: 'Paid', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const priorityMeta: Record<Priority, { label: string; tone: Tone }> = {
  emergency: { label: 'Emergency', tone: 'danger' },
  high: { label: 'High', tone: 'warn' },
  normal: { label: 'Normal', tone: 'neutral' },
  low: { label: 'Low', tone: 'neutral' },
}
