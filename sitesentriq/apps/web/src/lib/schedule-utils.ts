/**
 * Schedule generation utilities.
 * Pure functions — no side-effects, no network calls.
 */

/**
 * Number of days between visits for each frequency.
 * "biannual" and "six_monthly" are treated as synonyms.
 */
const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  biannual: 182,
  six_monthly: 182,
  annual: 365,
}

/**
 * Add a fixed number of days to a Date and return a new Date.
 */
function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Add whole months to a date (keeps the same day-of-month, clamped).
 */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // Clamp to the last day of the target month when original day overflows
  if (d.getDate() !== day) {
    d.setDate(0)
  }
  return d
}

/**
 * Generate all visit dates for a given year based on frequency and a seed date.
 *
 * @param seedDate  ISO date string — the last completed date or baseline date
 * @param frequency 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'six_monthly' | 'annual'
 * @param year      The calendar year to generate dates for
 * @returns         Array of ISO date strings (YYYY-MM-DD) sorted ascending
 */
export function generateDatesForFrequency(
  seedDate: string,
  frequency: string,
  year: number,
): string[] {
  // Parse the seed from its LOCAL calendar date so it lines up with yearStart/
  // yearEnd (built with `new Date(year, …)`, local) and toISODate (local
  // getters). `new Date('YYYY-MM-DD')` would parse as UTC midnight and, in
  // timezones behind UTC, shift every generated date back a day.
  const ymd = seedDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const seed = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(seedDate)
  if (isNaN(seed.getTime())) return []

  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31)

  const dates: string[] = []

  // Decide whether to use month-based or day-based stepping
  const monthStep = getMonthStep(frequency)

  if (monthStep !== null) {
    // Month-based: monthly (1), quarterly (3), biannual/six_monthly (6), annual (12).
    // Each occurrence is computed as seed + n*step from the ORIGINAL seed (not a
    // cumulative cursor), so the day-of-month is re-derived from the seed each
    // step. This keeps a month-end seed (e.g. the 31st) landing on each month's
    // true last day — a cumulative cursor would clamp to 28 in February and then
    // stay pinned at 28 forever.
    let n = 0
    while (addMonths(seed, n * monthStep) > yearStart) n -= 1
    for (; ; n += 1) {
      const occ = addMonths(seed, n * monthStep)
      if (occ > yearEnd) break
      if (occ >= yearStart) dates.push(toISODate(occ))
    }
  } else {
    // Day-based: weekly (7 days)
    const dayStep = FREQUENCY_DAYS[frequency] ?? 30
    let cursor = new Date(seed)
    // Walk backwards
    while (cursor > yearStart) {
      cursor = addDays(cursor, -dayStep)
    }
    while (cursor <= yearEnd) {
      if (cursor >= yearStart && cursor <= yearEnd) {
        dates.push(toISODate(cursor))
      }
      cursor = addDays(cursor, dayStep)
    }
  }

  return dates
}

function getMonthStep(frequency: string): number | null {
  switch (frequency) {
    case 'monthly':
      return 1
    case 'quarterly':
      return 3
    case 'biannual':
    case 'six_monthly':
      return 6
    case 'annual':
      return 12
    default:
      return null
  }
}

function toISODate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Return the 0-indexed month (0 = Jan) for an ISO date string.
 */
export function monthFromISO(isoDate: string): number {
  // Parse the month from the string directly — `new Date(iso).getMonth()` would
  // read the UTC-parsed instant in local time and roll first-of-month dates back
  // a month in timezones behind UTC.
  return Number(isoDate.slice(5, 7)) - 1
}
