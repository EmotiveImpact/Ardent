import { type ClassValue, clsx } from 'clsx'

export function logError(err: unknown, context?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : String(err)
  const ctxStr = context ? ` ${JSON.stringify(context).slice(0, 200)}` : ''
  console.error(`[logError] ${message}${ctxStr}`, err)
}

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(date: string | Date | null | undefined) {
  // Guard nullable/blank/unparseable input so callers feeding optional date
  // columns (valid_until, paid_date, next_due, completed_at, …) render a safe
  // dash instead of the literal user-visible string "Invalid Date".
  if (date === null || date === undefined || date === '') return '—'
  // Date-only DB columns (date type: invoices.due_date/paid_date, quotes.valid_until,
  // certificates.next_due) arrive as 'YYYY-MM-DD'. `new Date('YYYY-MM-DD')` parses as
  // UTC midnight, so toLocaleDateString shifts it back a day for sub-UTC users. Parse
  // bare date-only strings as a LOCAL date instead; leave full timestamps on the old path.
  let d: Date
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, day] = date.split('-').map(Number)
    d = new Date(y, m - 1, day)
  } else {
    d = new Date(date)
  }
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount)
}

/**
 * Returns a human-readable relative time string, e.g. "just now", "2 min ago",
 * "1 hour ago", "yesterday", "3 days ago", "2 weeks ago", "1 month ago".
 */
export function formatRelativeTime(date: string | Date): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  if (diffHr < 24) return diffHr === 1 ? '1 hour ago' : `${diffHr} hours ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay} days ago`
  if (diffWeek < 5) return diffWeek === 1 ? '1 week ago' : `${diffWeek} weeks ago`
  return diffMonth === 1 ? '1 month ago' : `${diffMonth} months ago`
}

export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  if (
    typeof document === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined'
  ) {
    return
  }
  const keys = Object.keys(rows[0])
  const csv = [
    keys.join(','),
    ...rows.map(row =>
      keys.map(k => {
        const val = row[k] ?? ''
        const str = String(val).replace(/"/g, '""')
        return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str
      }).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
