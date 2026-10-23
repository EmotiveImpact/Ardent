/**
 * How Ardent writes numbers, money and times, the same in both apps. Money is
 * stored in pence; times are stored in UTC and shown in UK time.
 */
const ZONE = 'Europe/London'

/** 132000 -> "£1,320", 740 -> "£7.40". Pass always: true to keep pence on whole pounds. */
export function pounds(pence: number, opts: { always?: boolean } = {}) {
  const whole = pence % 100 === 0 && !opts.always
  const sign = pence < 0 ? '-' : ''
  return `${sign}£${(Math.abs(pence) / 100).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`
}

/** "09:30" in UK time. */
export const clock = (iso: string, seconds = false) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, timeZone: ZONE })

/** "18 Oct" */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: ZONE })

/** "Sat 18 Oct" */
export const dayDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: ZONE })

/** "Saturday 18 October" */
export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONE })

/** The UK calendar day of a moment, "2026-10-18". */
export const ukDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONE })

/** "09:00 to 11:30" */
export const window = (start: string, end: string) => `${clock(start)} to ${clock(end)}`

/** 7380000 ms -> "2h 03m" */
export function duration(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** "in 12 min", "3 days ago" */
export function relative(iso: string, now = Date.now()) {
  const mins = Math.round((Date.parse(iso) - now) / 60000)
  const abs = Math.abs(mins)
  const [n, unit] = abs < 60 ? [abs, 'min'] : abs < 1440 ? [Math.round(abs / 60), 'h'] : [Math.round(abs / 1440), abs < 2880 ? 'day' : 'days']
  if (abs < 1) return 'now'
  return mins > 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`
}

/** Net, VAT and gross in pence. VAT is rounded once on the net, as on a UK invoice. */
export function totals(doc: { lines: { quantity: number; unitPrice: number }[]; vatRate?: number }) {
  const net = Math.round(doc.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0))
  const vat = Math.round((net * (doc.vatRate ?? 2000)) / 10000)
  return { net, vat, total: net + vat }
}

/** "Dan Mercer" -> "DM" */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

/** The UTC moment of a UK wall-clock time: ("2026-10-20", "09:30") -> "2026-10-20T08:30:00.000Z" in summer. */
export function ukToIso(day: string, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const wall = Date.parse(`${day}T00:00:00Z`) + (h * 60 + m) * 60_000
  let at = wall
  for (let i = 0; i < 2; i++) {
    const shown = new Date(at).toLocaleString('sv-SE', { timeZone: ZONE }).replace(' ', 'T') + 'Z'
    at = wall - (Date.parse(shown) - at)
  }
  return new Date(at).toISOString()
}
