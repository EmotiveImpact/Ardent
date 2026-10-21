import { shortDate } from '@kit'
import { today } from '@/lib/jobs'

/* Classes and date helpers shared by the Diary, Customers and Crew screens. */

/** The grey button the boards use inside cards: Edit, New job, Add address. */
export const softButton =
  'inline-flex h-[38px] shrink-0 items-center justify-center gap-2 rounded-[10px] bg-raised px-4 text-[13px] text-foreground outline-none transition-colors hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50'

/** The one solid button in a form: white, so it never competes with the screen's ember. */
export const solidButton =
  'inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-foreground text-[14px] font-medium text-background outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40'

/** Whole days from today to a calendar day; negative when it has passed. */
export const daysTo = (day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86_400_000)

/** "2 NOV", or "MAR 27" when it is more than a year off, the way the boards write expiry. */
export function expiryWord(day: string) {
  const iso = `${day}T12:00:00Z`
  if (Math.abs(daysTo(day)) > 330) return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'Europe/London' }).toUpperCase()
  return shortDate(iso).replace('Sept', 'Sep').toUpperCase()
}

/** A day in the diary: "Mon", "19". */
export function dayParts(day: string) {
  const d = new Date(`${day}T12:00:00Z`)
  return { name: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), date: String(d.getUTCDate()) }
}

/** "19 to 24 OCT", or "28 SEP to 3 OCT" across a month end. */
export function rangeWord(from: string, to: string) {
  const a = new Date(`${from}T12:00:00Z`)
  const b = new Date(`${to}T12:00:00Z`)
  const mon = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).replace('Sept', 'Sep').toUpperCase()
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()} to ${b.getUTCDate()} ${mon(b)}` : `${a.getUTCDate()} ${mon(a)} to ${b.getUTCDate()} ${mon(b)}`
}

/** Hours between two moments. */
export const hoursBetween = (start: string, end: string) => Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000)

/** "31h", "7.5h" */
export const hoursWord = (h: number) => `${Math.round(h * 2) / 2}h`
