/**
 * Time-tracking shared types.
 *
 * Wave 12 / Task 107 — Builder 12A.
 */

export type TimeEntryKind = 'travel' | 'on_site' | 'admin' | 'break'

export interface TimeEntry {
  id: string
  organisation_id: string
  job_id: string
  engineer_id: string
  kind: TimeEntryKind
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  billable: boolean
  rate_per_hour: number | null
  notes: string | null
  billed_invoice_id: string | null
  created_at: string
  updated_at: string
}

export interface JobTimeBreakdown {
  travel_minutes: number
  on_site_minutes: number
  admin_minutes: number
  break_minutes: number
  total_minutes: number
  billable_minutes: number
  billable_total: number
  engineer_count: number
  running: TimeEntry | null
}

export const TIME_ENTRY_KIND_LABELS: Record<TimeEntryKind, string> = {
  travel: 'Travel',
  on_site: 'On site',
  admin: 'Admin',
  break: 'Break',
}

export const TIME_ENTRY_KIND_COLOR: Record<
  TimeEntryKind,
  'accent' | 'success' | 'warning' | 'default'
> = {
  travel: 'accent',
  on_site: 'success',
  admin: 'warning',
  break: 'default',
}

export const TIME_ENTRY_DEFAULT_BILLABLE: Record<TimeEntryKind, boolean> = {
  travel: true,
  on_site: true,
  admin: true,
  break: false,
}
