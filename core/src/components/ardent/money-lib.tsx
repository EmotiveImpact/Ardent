import type { Customer, Invoice, Quote } from '@/data/model'

/*
 * Plain helpers behind the money screens, Certs and Settings: what a state is
 * called, how late something is, how dates are written in caps.
 */

const DAY = 86_400_000

export const OWING: Invoice['status'][] = ['sent', 'part_paid', 'overdue']

/** Still owed and past its due date. */
export const isLate = (inv: Invoice, now = Date.now()) => OWING.includes(inv.status) && !!inv.dueAt && Date.parse(inv.dueAt) < now

/** Whole days past the due date, 0 when not late. */
export const daysLate = (inv: Invoice, now = Date.now()) => (isLate(inv, now) ? Math.max(1, Math.floor((now - Date.parse(inv.dueAt!)) / DAY)) : 0)

/** Whole days from now to an ISO moment, rounded up. */
export const daysUntil = (iso: string, now = Date.now()) => Math.ceil((Date.parse(iso) - now) / DAY)

const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve']
/** 2 -> "Two", 14 -> "14". */
export const say = (n: number) => words[n] ?? String(n)

/** "Northgate Lettings are", "Grace Okafor is": firms take the plural, people the singular. */
export const isAre = (c?: Customer) => (c && (c.kind === 'business' || c.kind === 'letting_agent') ? 'are' : 'is')

/** "22 SEP" */
export const capDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }).toUpperCase().replace('SEPT', 'SEP')
/** "28 SEP 25", for a calendar day "2025-09-28". */
export const capDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Europe/London' }).toUpperCase().replace('SEPT', 'SEP')

export type Dot = 'grey' | 'info' | 'ok' | 'warn' | 'danger' | 'faint'
export const dotBg: Record<Dot, string> = { grey: 'bg-[#5f5f5f]', info: 'bg-info', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', faint: 'bg-line-strong' }

/** What the screen calls an invoice's state. A sent invoice past its date is late. */
export function invoiceState(inv: Invoice): { label: string; dot: Dot } {
  if (inv.status === 'part_paid') return { label: 'Part paid', dot: 'warn' }
  if (isLate(inv) || inv.status === 'overdue') return { label: 'Late', dot: 'warn' }
  return {
    draft: { label: 'Draft', dot: 'grey' as Dot },
    sent: { label: 'Sent', dot: 'info' as Dot },
    paid: { label: 'Paid', dot: 'ok' as Dot },
    void: { label: 'Void', dot: 'faint' as Dot },
    overdue: { label: 'Late', dot: 'warn' as Dot },
    part_paid: { label: 'Part paid', dot: 'warn' as Dot },
  }[inv.status]
}

export function quoteState(q: Quote, today: string): { label: string; dot: Dot } {
  if (q.status === 'sent' && q.validUntil < today) return { label: 'Past its date', dot: 'warn' }
  return {
    draft: { label: 'Draft', dot: 'grey' as Dot },
    sent: { label: 'Sent', dot: 'info' as Dot },
    accepted: { label: 'Accepted', dot: 'ok' as Dot },
    declined: { label: 'Declined', dot: 'faint' as Dot },
    expired: { label: 'Expired', dot: 'faint' as Dot },
  }[q.status]
}

/** A plain grey button, 40px, for the quieter actions beside the ember one. */
export const greyButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-raised px-4 text-[13px] text-foreground outline-none transition-colors hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-40'

