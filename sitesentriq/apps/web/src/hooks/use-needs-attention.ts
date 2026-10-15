import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toLocalYmd } from '@/lib/time-tracking/compute'

export type AttentionKind = 'compliance' | 'action' | 'invoice' | 'contract'

export interface AttentionItem {
  id: string
  kind: AttentionKind
  title: string
  subtitle: string
  /** Higher number = more urgent — used for sort order */
  severity: number
  /** Where to navigate when the row is clicked */
  href: string
  /** Optional formatted age e.g. "12 days overdue" */
  ageLabel?: string
}

function daysBetween(later: string, earlier: string): number {
  const a = new Date(later).getTime()
  const b = new Date(earlier).getTime()
  return Math.max(0, Math.floor((a - b) / 86_400_000))
}

/**
 * Mixed feed of "things that need attention":
 *  - overdue compliance items (severity 100 + days overdue)
 *  - high/critical priority open actions (severity 80 + days open)
 *  - ageing unpaid invoices past due date (severity 60 + days overdue)
 *
 * Returns the top 5 by severity descending.
 */
export function useNeedsAttention(limit = 5) {
  return useQuery<AttentionItem[]>({
    queryKey: ['dashboard', 'needs-attention', limit],
    queryFn: async () => {
      // Local calendar day — these compare against DATE columns (next_due,
      // due_date, end_date). A UTC slice would flip a day early for sub-UTC
      // users late in the day and mis-flag overdue thresholds.
      const today = toLocalYmd(new Date())

      // Sprint 2 / C5 — contracts coming up for renewal in next 90d
      // (or already overdue) join the feed alongside compliance / actions
      // / invoices. 90d is the standard FM "renewal conversation" window.
      const renewalCutoff = new Date()
      renewalCutoff.setDate(renewalCutoff.getDate() + 90)
      const renewalCutoffIso = toLocalYmd(renewalCutoff)

      // allSettled so a single failing source doesn't blank the entire feed.
      // Each section degrades to empty if its query failed, but the others
      // still render. Previously one RLS-denied table → "Nothing flagged"
      // empty state → operator assumes everything's fine.
      const settled = await Promise.allSettled([
        // Each query is ORDERED by its urgency column before .limit(20) so the
        // 20 rows kept are the *most* urgent (an unordered limit returns an
        // arbitrary 20 — genuinely-urgent items could be dropped before the
        // client-side severity sort + slice(5) ever runs).
        supabase
          .from('compliance_items')
          .select('id, name, compliance_type, status, next_due, properties(name)')
          .eq('status', 'overdue')
          .order('next_due', { ascending: true, nullsFirst: false })
          .limit(20),
        supabase
          .from('actions')
          .select('id, title, priority, status, due_date, created_at, properties(name)')
          .in('priority', ['high', 'critical'])
          .in('status', ['open', 'in_progress'])
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(20),
        supabase
          .from('invoices')
          .select('id, invoice_number, status, total, due_date, clients(name)')
          .neq('status', 'paid')
          .neq('status', 'cancelled')
          .not('due_date', 'is', null)
          .lt('due_date', today)
          .order('due_date', { ascending: true })
          .limit(20),
        supabase
          .from('contracts')
          .select('id, end_date, status, clients(name)')
          .lte('end_date', renewalCutoffIso)
          .not('status', 'in', '(renewed,terminated,cancelled)')
          .order('end_date', { ascending: true, nullsFirst: false })
          .limit(20),
      ])
      const safe = <T,>(idx: number, label: string): T[] => {
        const r = settled[idx]
        if (r.status !== 'fulfilled') {
          console.warn(`[needs-attention] ${label} promise rejected:`, r.reason)
          return []
        }
        if (r.value.error) {
          if (/does not exist|schema cache/i.test(r.value.error.message)) return []
          console.warn(`[needs-attention] ${label} query failed (continuing):`, r.value.error.message)
          return []
        }
        return (r.value.data ?? []) as T[]
      }
      const compliance = safe<{ id: string; name: string | null; compliance_type: string | null; status: string | null; next_due: string | null; properties: { name: string | null } | { name: string | null }[] | null }>(0, 'compliance_items')
      const actions = safe<{ id: string; title: string | null; priority: string | null; status: string | null; due_date: string | null; created_at: string; properties: { name: string | null } | { name: string | null }[] | null }>(1, 'actions')
      const invoices = safe<{ id: string; invoice_number: string | null; status: string | null; total: number | null; due_date: string | null; clients: { name: string | null } | { name: string | null }[] | null }>(2, 'invoices')
      const renewals = safe<{ id: string; end_date: string | null; status: string | null; clients: { name: string | null } | { name: string | null }[] | null }>(3, 'contracts')

      type Joined<T> = T | T[] | null

      const items: AttentionItem[] = []

      type CRow = {
        id: string
        name: string | null
        compliance_type: string | null
        next_due: string | null
        properties: Joined<{ name: string }>
      }
      for (const c of (compliance as CRow[] | null) ?? []) {
        const prop = Array.isArray(c.properties) ? c.properties[0] : c.properties
        const overdueBy = c.next_due ? daysBetween(today, c.next_due) : 0
        items.push({
          id: `compliance-${c.id}`,
          kind: 'compliance',
          title: c.name || c.compliance_type || 'Compliance item',
          subtitle: prop?.name ? `${prop.name}` : 'Overdue compliance',
          severity: 100 + overdueBy,
          href: `/dashboard/compliance/${c.id}`,
          ageLabel: overdueBy > 0 ? `${overdueBy} day${overdueBy === 1 ? '' : 's'} overdue` : 'Overdue',
        })
      }

      type ARow = {
        id: string
        title: string
        priority: string
        status: string
        due_date: string | null
        created_at: string | null
        properties: Joined<{ name: string }>
      }
      for (const a of (actions as ARow[] | null) ?? []) {
        const prop = Array.isArray(a.properties) ? a.properties[0] : a.properties
        const isOverdue = a.due_date ? a.due_date < today : false
        const ageDays = a.due_date && isOverdue
          ? daysBetween(today, a.due_date)
          : a.created_at
            ? daysBetween(today, a.created_at.slice(0, 10))
            : 0
        items.push({
          id: `action-${a.id}`,
          kind: 'action',
          title: a.title,
          subtitle: `${a.priority === 'critical' ? 'Critical' : 'High'} priority${prop?.name ? ` · ${prop.name}` : ''}`,
          severity: (a.priority === 'critical' ? 95 : 80) + (isOverdue ? ageDays : 0),
          href: `/dashboard/actions/${a.id}`,
          ageLabel: isOverdue ? `${ageDays} day${ageDays === 1 ? '' : 's'} overdue` : `Open ${ageDays}d`,
        })
      }

      type IRow = {
        id: string
        invoice_number: string
        total: number | null
        due_date: string | null
        clients: Joined<{ name: string }>
      }
      for (const inv of (invoices as IRow[] | null) ?? []) {
        const client = Array.isArray(inv.clients) ? inv.clients[0] : inv.clients
        const overdueBy = inv.due_date ? daysBetween(today, inv.due_date) : 0
        items.push({
          id: `invoice-${inv.id}`,
          kind: 'invoice',
          title: `Invoice ${inv.invoice_number}`,
          subtitle: `${client?.name ?? 'Client'} · ${formatGbp(inv.total ?? 0)}`,
          severity: 60 + overdueBy,
          href: `/dashboard/invoices/${inv.id}`,
          ageLabel: `${overdueBy} day${overdueBy === 1 ? '' : 's'} overdue`,
        })
      }

      type RRow = {
        id: string
        end_date: string | null
        status: string | null
        clients: Joined<{ name: string }>
      }
      for (const r of (renewals as RRow[] | null) ?? []) {
        const client = Array.isArray(r.clients) ? r.clients[0] : r.clients
        const end = r.end_date ?? today
        // Negative when overdue, positive when upcoming. We need both
        // shapes — the urgency framing flips ("expires in" vs "expired").
        const daysUntilEnd = Math.round(
          (new Date(end).getTime() - new Date(today).getTime()) / 86_400_000,
        )
        const overdue = daysUntilEnd < 0
        const absDays = Math.abs(daysUntilEnd)
        // Upcoming renewals start at severity 50 (below ageing invoices
        // which start at 60, since money on the table is more urgent
        // than a renewal conversation). Overdue renewals jump to 70+
        // because "we missed the renewal date and we're delivering
        // out-of-contract" is genuinely an emergency.
        const severity = overdue ? 70 + absDays : 50 + Math.max(0, 90 - absDays) / 3
        items.push({
          id: `contract-${r.id}`,
          kind: 'contract',
          title: client?.name ? `${client.name} contract` : 'Contract renewal',
          subtitle: overdue
            ? 'Out of contract — renew or terminate'
            : `Renews ${formatRenewalDate(end)}`,
          severity,
          href: `/dashboard/contracts/${r.id}`,
          ageLabel: overdue
            ? `${absDays} day${absDays === 1 ? '' : 's'} overdue`
            : `${absDays} day${absDays === 1 ? '' : 's'} to go`,
        })
      }

      items.sort((a, b) => b.severity - a.severity)
      return items.slice(0, limit)
    },
  })
}

function formatRenewalDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatGbp(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n)
}
