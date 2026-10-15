/**
 * Pure compute helpers for time-entries.
 */
import type { JobTimeBreakdown, TimeEntry, TimeEntryKind } from './types'

export function entryMinutes(entry: TimeEntry, now: Date = new Date()): number {
  if (!entry.started_at) return 0
  const start = new Date(entry.started_at).getTime()
  const end = entry.ended_at ? new Date(entry.ended_at).getTime() : now.getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return Math.round((end - start) / 60_000)
}

export function resolveRate(
  entry: TimeEntry,
  engineerDefaults: Record<string, number | null | undefined> = {},
): number {
  if (entry.rate_per_hour != null) return Number(entry.rate_per_hour)
  const def = engineerDefaults[entry.engineer_id]
  return def != null ? Number(def) : 0
}

export function aggregate(
  entries: TimeEntry[] | undefined | null,
  options: {
    engineerDefaults?: Record<string, number | null | undefined>
    now?: Date
  } = {},
): JobTimeBreakdown {
  const now = options.now ?? new Date()
  const out: JobTimeBreakdown = {
    travel_minutes: 0,
    on_site_minutes: 0,
    admin_minutes: 0,
    break_minutes: 0,
    total_minutes: 0,
    billable_minutes: 0,
    billable_total: 0,
    engineer_count: 0,
    running: null,
  }
  if (!entries || entries.length === 0) return out

  const engineers = new Set<string>()
  for (const e of entries) {
    const mins = entryMinutes(e, now)
    out.total_minutes += mins
    if (e.kind === 'travel') out.travel_minutes += mins
    else if (e.kind === 'on_site') out.on_site_minutes += mins
    else if (e.kind === 'admin') out.admin_minutes += mins
    else if (e.kind === 'break') out.break_minutes += mins

    if (e.billable) {
      out.billable_minutes += mins
      const rate = resolveRate(e, options.engineerDefaults ?? {})
      out.billable_total += (mins / 60) * rate
    }
    if (!e.ended_at) out.running = e
    engineers.add(e.engineer_id)
  }
  out.engineer_count = engineers.size
  out.billable_total = Math.round(out.billable_total * 100) / 100
  return out
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatHours(minutes: number, dp = 2): string {
  return (minutes / 60).toFixed(dp)
}

// Format a Date as a LOCAL 'YYYY-MM-DD' day key. The timesheet grid builds its
// columns from local date parts, so buckets and week boundaries must use the
// same local calendar — `toISOString()` would key by the UTC day and shift
// near-midnight entries into the wrong column for non-UTC users.
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function groupByDay(entries: TimeEntry[]): Record<string, TimeEntry[]> {
  const out: Record<string, TimeEntry[]> = {}
  for (const e of entries) {
    const d = toLocalYmd(new Date(e.started_at))
    if (!out[d]) out[d] = []
    out[d].push(e)
  }
  return out
}

export function groupByJob(entries: TimeEntry[]): Record<string, TimeEntry[]> {
  const out: Record<string, TimeEntry[]> = {}
  for (const e of entries) {
    if (!out[e.job_id]) out[e.job_id] = []
    out[e.job_id].push(e)
  }
  return out
}

export function minutesByKind(
  entries: TimeEntry[] | undefined | null,
  now: Date = new Date(),
): Record<TimeEntryKind, number> {
  const out: Record<TimeEntryKind, number> = { travel: 0, on_site: 0, admin: 0, break: 0 }
  if (!entries) return out
  for (const e of entries) out[e.kind] += entryMinutes(e, now)
  return out
}

export function weekStartIso(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  // Return the LOCAL Monday date — toISOString() serializes in UTC and would
  // return the adjacent day (shifting the whole timesheet week) for users whose
  // local midnight falls on a different UTC date.
  return toLocalYmd(copy)
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toLocalYmd(d)
}
