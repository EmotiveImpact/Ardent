import { useQuery, useQueries } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toLocalYmd } from '@/lib/time-tracking/compute'

/**
 * Rule-based insights — no LLM. All queries run in parallel.
 * Defensive: returns sensible defaults when tables/columns are missing.
 */

export type InsightSeverity = 'info' | 'success' | 'warning' | 'danger'

export interface InsightCard {
  id: string
  title: string
  metric: string
  detail: string
  severity: InsightSeverity
  link: string
  linkLabel?: string
}

// ── Compliance Risk Score ─────────────────────────────────
async function fetchComplianceRisk() {
  const { data, error } = await supabase
    .from('compliance_items')
    .select('status, next_due')
  // Throw instead of swallowing — silently returning zero made the
  // Insights Panel display "Compliance score: 100, no overdue items" when
  // the underlying query was actually failing (e.g. RLS regression). Now
  // the consumer sees the query is in error and can render an
  // "Insight unavailable" tile instead of misleading numbers.
  if (error) throw error

  const items = data ?? []
  const total = items.length
  if (total === 0) return { score: 100, overdue: 0, dueSoon: 0, total: 0 }

  let overdue = 0
  let dueSoon = 0
  let nonCompliant = 0
  for (const item of items) {
    if (item.status === 'overdue') overdue++
    else if (item.status === 'due_soon') dueSoon++
    else if (item.status === 'non_compliant') nonCompliant++
  }

  // Weighted: overdue 1.0, non_compliant 1.0, due_soon 0.4
  const weighted = overdue * 1 + nonCompliant * 1 + dueSoon * 0.4
  const score = Math.max(0, Math.round(100 - (weighted / total) * 100))
  return { score, overdue, dueSoon, total }
}

export function useComplianceRisk() {
  return useQuery({
    queryKey: ['insights', 'compliance-risk'],
    queryFn: fetchComplianceRisk,
    staleTime: 60_000,
  })
}

// ── Predicted Overrun (jobs taking longer than peers) ─────
async function fetchPredictedOverrun() {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, title, status, scheduled_date, time_start, time_end, completed_date, job_type')
    .in('status', ['in_progress', 'scheduled'])
    .limit(500)
  if (error) throw error

  const open = data ?? []
  const today = Date.now()
  const overrun = open.filter((j) => {
    if (!j.scheduled_date) return false
    const scheduled = new Date(j.scheduled_date).getTime()
    // Heuristic: in_progress jobs scheduled > 2 days ago, or scheduled jobs > 1 day past due
    const daysOver = (today - scheduled) / (1000 * 60 * 60 * 24)
    if (j.status === 'in_progress' && daysOver > 2) return true
    if (j.status === 'scheduled' && daysOver > 1) return true
    return false
  })
  return {
    count: overrun.length,
    examples: overrun.slice(0, 3).map((j) => ({ id: j.id as string, title: (j.title as string) ?? 'Job' })),
  }
}

export function usePredictedOverrun() {
  return useQuery({
    queryKey: ['insights', 'predicted-overrun'],
    queryFn: fetchPredictedOverrun,
    staleTime: 60_000,
  })
}

// ── Revenue Forecast (linear trend last 6 months) ─────────
async function fetchRevenueForecast() {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const { data, error } = await supabase
    .from('invoices')
    .select('total, created_at, status')
    .gte('created_at', sixMonthsAgo.toISOString())
    .neq('status', 'cancelled')
  if (error) throw error

  const invoices = data ?? []
  if (invoices.length === 0) return { forecast: 0, trend: 0, monthly: [] }

  // Bucket by month
  const monthly: number[] = Array(6).fill(0)
  const now = new Date()
  invoices.forEach((inv) => {
    if (!inv.created_at) return
    const created = new Date(inv.created_at)
    const monthsBack = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth())
    if (monthsBack >= 0 && monthsBack < 6) {
      monthly[5 - monthsBack] += Number(inv.total) || 0
    }
  })

  // Simple linear regression slope on monthly values
  const n = monthly.length
  const sumX = (n * (n - 1)) / 2
  const sumY = monthly.reduce((a, b) => a + b, 0)
  const sumXY = monthly.reduce((acc, y, x) => acc + x * y, 0)
  const sumXX = monthly.reduce((acc, _, x) => acc + x * x, 0)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1)
  const intercept = (sumY - slope * sumX) / n
  const forecast = Math.max(0, slope * n + intercept)
  const lastMonth = monthly[monthly.length - 1] || 0
  const trend = lastMonth > 0 ? ((forecast - lastMonth) / lastMonth) * 100 : 0

  return { forecast, trend, monthly }
}

export function useRevenueForecast() {
  return useQuery({
    queryKey: ['insights', 'revenue-forecast'],
    queryFn: fetchRevenueForecast,
    staleTime: 5 * 60_000,
  })
}

// ── At-Risk Clients ──────────────────────────────────────
async function fetchAtRiskClients() {
  // Get all properties with their client_id, all compliance with status, all invoices with status.
  // Promise.allSettled + per-slice unwrap (mirrors use-dashboard-kpis.ts) so a single
  // RLS-denied / timed-out table degrades only its own slice with a logged warning,
  // instead of either throwing the whole hook or silently returning misleading zeros.
  const settled = await Promise.allSettled([
    supabase.from('properties').select('id, client_id'),
    supabase.from('compliance_items').select('property_id, status'),
    supabase.from('invoices').select('client_id, status, due_date'),
    supabase.from('clients').select('id, name'),
  ])
  const unwrap = <T,>(idx: number): T[] => {
    const res = settled[idx]
    if (res.status !== 'fulfilled') {
      console.warn('[insights] at-risk-clients read rejected:', res.reason)
      return []
    }
    if (res.value.error) {
      console.warn('[insights] at-risk-clients table read failed:', res.value.error.message)
      return []
    }
    return (res.value.data ?? []) as T[]
  }

  const properties = unwrap<{ id: string; client_id: string }>(0)
  const compliance = unwrap<{ property_id: string; status: string | null }>(1)
  const invoices = unwrap<{ client_id: string; status: string | null; due_date: string | null }>(2)
  const clients = unwrap<{ id: string; name: string | null }>(3)

  if (clients.length === 0) return { count: 0, clients: [] as { id: string; name: string; reason: string }[] }

  const propToClient = new Map<string, string>()
  for (const p of properties) propToClient.set(p.id as string, p.client_id as string)

  const clientCompliance = new Map<string, { total: number; overdue: number }>()
  for (const c of compliance) {
    const clientId = propToClient.get(c.property_id as string)
    if (!clientId) continue
    const stats = clientCompliance.get(clientId) ?? { total: 0, overdue: 0 }
    stats.total++
    if (c.status === 'overdue' || c.status === 'non_compliant') stats.overdue++
    clientCompliance.set(clientId, stats)
  }

  // The app never persists status='overdue' — overdue is derived: an invoice
  // is overdue when it's still outstanding (not paid/cancelled/draft) AND its
  // due date has passed. The old `status === 'overdue'` test matched nothing,
  // so at-risk detection silently never flagged any payment risk.
  const todayIso = toLocalYmd(new Date())
  const clientOverdueInvoices = new Map<string, number>()
  for (const inv of invoices) {
    const settled = inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'draft'
    const pastDue = !!inv.due_date && inv.due_date < todayIso
    if (settled || !pastDue) continue
    const cid = inv.client_id as string
    clientOverdueInvoices.set(cid, (clientOverdueInvoices.get(cid) ?? 0) + 1)
  }

  const atRisk: { id: string; name: string; reason: string }[] = []
  for (const c of clients) {
    const comp = clientCompliance.get(c.id as string)
    const overduePct = comp && comp.total > 0 ? (comp.overdue / comp.total) * 100 : 0
    const overdueInv = clientOverdueInvoices.get(c.id as string) ?? 0
    if (overduePct > 20 || overdueInv > 2) {
      const reasons: string[] = []
      if (overduePct > 20) reasons.push(`${Math.round(overduePct)}% overdue compliance`)
      if (overdueInv > 2) reasons.push(`${overdueInv} overdue invoices`)
      atRisk.push({ id: c.id as string, name: (c.name as string) ?? 'Unnamed', reason: reasons.join(', ') })
    }
  }

  return { count: atRisk.length, clients: atRisk.slice(0, 5) }
}

export function useAtRiskClients() {
  return useQuery({
    queryKey: ['insights', 'at-risk-clients'],
    queryFn: fetchAtRiskClients,
    staleTime: 2 * 60_000,
  })
}

// ── Capacity Heatmap (engineer workload next 14 days) ─────
async function fetchCapacityHeatmap() {
  const today = toLocalYmd(new Date())
  const future = new Date()
  future.setDate(future.getDate() + 14)
  const futureStr = toLocalYmd(future)

  // Promise.allSettled + per-slice unwrap (mirrors use-dashboard-kpis.ts) so a single
  // failed read degrades only its own slice with a logged warning rather than throwing
  // the whole hook or silently reporting 0% utilization.
  const settled = await Promise.allSettled([
    supabase
      .from('jobs')
      .select('id, scheduled_date, engineer_assignments(engineer_id)')
      .gte('scheduled_date', today)
      .lte('scheduled_date', futureStr),
    // Need profile_id: engineer_assignments.engineer_id is a profiles.id, but the
    // engineers table keys on its own record id — matching on engineers.id never
    // hit, so every engineer counted 0 jobs (all under-booked, none over-booked).
    supabase.from('engineers').select('id, name, profile_id').eq('status', 'active'),
  ])
  const unwrap = <T,>(idx: number): T[] => {
    const res = settled[idx]
    if (res.status !== 'fulfilled') {
      console.warn('[insights] capacity-heatmap read rejected:', res.reason)
      return []
    }
    if (res.value.error) {
      console.warn('[insights] capacity-heatmap table read failed:', res.value.error.message)
      return []
    }
    return (res.value.data ?? []) as T[]
  }

  const jobs = unwrap<{ id: string; scheduled_date: string; engineer_assignments: { engineer_id: string }[] }>(0)
  const engineers = unwrap<{ id: string; name: string; profile_id: string | null }>(1)

  const totalSlots = engineers.length * 14 // 1 job/engineer/day baseline
  const totalJobs = jobs.length

  const utilization = totalSlots > 0 ? Math.round((totalJobs / totalSlots) * 100) : 0

  // Find over-booked engineers (> 14 jobs in 14 days)
  const perEngineer = new Map<string, number>()
  for (const j of jobs) {
    for (const a of j.engineer_assignments ?? []) {
      perEngineer.set(a.engineer_id, (perEngineer.get(a.engineer_id) ?? 0) + 1)
    }
  }
  let overBooked = 0
  let underBooked = 0
  for (const eng of engineers) {
    // Match on profile_id (assignments key on profiles.id), falling back to id.
    const n = perEngineer.get((eng.profile_id ?? eng.id) as string) ?? 0
    if (n > 14) overBooked++
    else if (n < 3) underBooked++
  }

  return { utilization, overBooked, underBooked, totalEngineers: engineers.length, totalJobs }
}

export function useCapacityHeatmap() {
  return useQuery({
    queryKey: ['insights', 'capacity-heatmap'],
    queryFn: fetchCapacityHeatmap,
    staleTime: 60_000,
  })
}

// ── Combined hook for the panel ───────────────────────────
export function useInsights() {
  const results = useQueries({
    queries: [
      { queryKey: ['insights', 'compliance-risk'], queryFn: fetchComplianceRisk, staleTime: 60_000 },
      { queryKey: ['insights', 'predicted-overrun'], queryFn: fetchPredictedOverrun, staleTime: 60_000 },
      { queryKey: ['insights', 'revenue-forecast'], queryFn: fetchRevenueForecast, staleTime: 5 * 60_000 },
      { queryKey: ['insights', 'at-risk-clients'], queryFn: fetchAtRiskClients, staleTime: 2 * 60_000 },
      { queryKey: ['insights', 'capacity-heatmap'], queryFn: fetchCapacityHeatmap, staleTime: 60_000 },
    ],
  })
  const [risk, overrun, revenue, atRisk, capacity] = results
  const isLoading = results.some((r) => r.isLoading)
  return {
    isLoading,
    risk: risk.data,
    overrun: overrun.data,
    revenue: revenue.data,
    atRisk: atRisk.data,
    capacity: capacity.data,
  }
}
