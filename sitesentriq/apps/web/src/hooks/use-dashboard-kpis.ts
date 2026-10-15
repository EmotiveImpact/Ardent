import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface DashboardKpis {
  /** Compliance — % of items in 'compliant' status */
  compliancePct: number
  compliancePctDelta: number
  complianceSparkline: number[]

  /** Open jobs — anything not completed/cancelled */
  openJobs: number
  openJobsDelta: number
  openJobsSparkline: number[]

  /** Overdue items — overdue compliance + overdue actions */
  overdueItems: number
  overdueItemsDelta: number
  overdueItemsSparkline: number[]

  /** Active engineers — engineers with status = 'active' */
  activeEngineers: number
  activeEngineersDelta: number
  activeEngineersSparkline: number[]

  /** Revenue MTD — sum of paid invoices this calendar month */
  revenueMtd: number
  revenueMtdDelta: number
  revenueMtdSparkline: number[]

  /** Outstanding invoices — sum of total on unpaid/unsent invoices */
  outstandingInvoices: number
  outstandingInvoicesDelta: number
  outstandingInvoicesSparkline: number[]
}

const EMPTY_KPIS: DashboardKpis = {
  compliancePct: 0,
  compliancePctDelta: 0,
  complianceSparkline: [],
  openJobs: 0,
  openJobsDelta: 0,
  openJobsSparkline: [],
  overdueItems: 0,
  overdueItemsDelta: 0,
  overdueItemsSparkline: [],
  activeEngineers: 0,
  activeEngineersDelta: 0,
  activeEngineersSparkline: [],
  revenueMtd: 0,
  revenueMtdDelta: 0,
  revenueMtdSparkline: [],
  outstandingInvoices: 0,
  outstandingInvoicesDelta: 0,
  outstandingInvoicesSparkline: [],
}

function lastNDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    out.push(toLocalYmd(d))
  }
  return out
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  return iso.slice(0, 10)
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) {
    if (current === 0) return 0
    return 100
  }
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * Aggregates the six headline KPIs for the dashboard hero.
 *
 * Wave 17 perf — fast path: a single Postgres RPC (`dashboard_kpis()`)
 * returns the 6 numbers + 6 sparklines + 6 deltas in one round-trip,
 * regardless of org size. The previous implementation pulled every row
 * of compliance_items + jobs + actions + engineers + invoices into
 * the browser and aggregated in JS — fine for empty orgs, multi-MB
 * payload for real ones.
 *
 * Slow-path fallback: if the RPC isn't deployed yet (function not
 * found / 404), we fall back to the original client-side aggregation
 * so a code-before-migration rollout still works.
 */
export function useDashboardKpis() {
  return useQuery<DashboardKpis>({
    queryKey: ['dashboard', 'kpis'],
    queryFn: async () => {
      // ── Fast path: server-side aggregation via RPC ────────────────
      const { data: rpcData, error: rpcError } = await supabase.rpc('dashboard_kpis')
      if (!rpcError && rpcData) {
        // The RPC returns jsonb with the same shape as DashboardKpis.
        // Cast through unknown so consumers stay typed without forcing
        // a generated-types regen on every migration.
        return { ...EMPTY_KPIS, ...(rpcData as unknown as DashboardKpis) }
      }
      // PostgREST returns 404 / PGRST202 when the function isn't deployed.
      // Anything else (auth/RLS/syntax) is a real error — but we still
      // fall through to the slow path so the dashboard never sits empty.
       
      if (rpcError) console.warn('[dashboard_kpis] RPC unavailable, falling back to client aggregation:', rpcError.message)
      return computeDashboardKpisClientSide()
    },
  })
}

/**
 * Original client-side aggregation. Kept ONLY as a fallback for the
 * window between deploy and migration apply. Once `dashboard_kpis()`
 * is in every environment we can delete this and the helpers above.
 */
async function computeDashboardKpisClientSide(): Promise<DashboardKpis> {
  const days = lastNDays(7)
  const monthStart = (() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(1)
    return toLocalYmd(d)
  })()
  const previousMonthStart = (() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return toLocalYmd(d)
  })()

  // Promise.allSettled instead of Promise.all so a single RLS-denied or
  // timed-out table doesn't blank the entire dashboard with silent zeros.
  // Each tile degrades to "0" for its slice if its source failed, but the
  // other tiles still render their real numbers.
  const settled = await Promise.allSettled([
    supabase.from('compliance_items').select('status, next_due, created_at'),
    supabase.from('jobs').select('status, scheduled_date, completed_date, created_at'),
    supabase.from('actions').select('status, due_date, created_at'),
    supabase.from('engineers').select('status, created_at'),
    supabase.from('invoices').select('status, total, paid_date, due_date, created_at'),
  ])
  const unwrap = <T,>(idx: number): T[] => {
    const res = settled[idx]
    if (res.status !== 'fulfilled') return []
    if (res.value.error) {
      console.warn('[dashboard-kpis] table read failed:', res.value.error.message)
      return []
    }
    return (res.value.data ?? []) as T[]
  }
  const compliance = unwrap<{ status: string | null; next_due: string | null; created_at: string }>(0)
  const jobs = unwrap<{ status: string | null; scheduled_date: string | null; completed_date: string | null; created_at: string }>(1)
  const actions = unwrap<{ status: string | null; due_date: string | null; created_at: string }>(2)
  const engineers = unwrap<{ status: string | null; created_at: string }>(3)
  const invoices = unwrap<{ status: string | null; total: number | null; paid_date: string | null; due_date: string | null; created_at: string }>(4)

  // ── Compliance % ───────────────────────────────
  const complianceRows = compliance ?? []
  const compliantCount = complianceRows.filter((c) => c.status === 'compliant').length
  const compliancePct = complianceRows.length
    ? Math.round((compliantCount / complianceRows.length) * 100)
    : 0
  const complianceSparkline = days.map((day) => {
    const upToThen = complianceRows.filter((c) => (c.created_at ?? '') <= day + 'T23:59:59')
    if (!upToThen.length) return 0
    const ok = upToThen.filter((c) => c.status === 'compliant').length
    return Math.round((ok / upToThen.length) * 100)
  })
  const compliancePctDelta = compliancePct - (complianceSparkline[0] ?? compliancePct)

  // ── Open jobs ──────────────────────────────────
  const jobsRows = jobs ?? []
  const openJobs = jobsRows.filter(
    (j) => j.status !== 'completed' && j.status !== 'cancelled',
  ).length
  const openJobsSparkline = days.map((day) => {
    return jobsRows.filter((j) => {
      const created = dayKey(j.created_at)
      const closed = dayKey(j.completed_date)
      return (created ?? '') <= day && (!closed || closed > day)
    }).length
  })
  const openJobsDelta = pctChange(openJobs, openJobsSparkline[0] ?? openJobs)

  // ── Overdue items (compliance + actions) ───────
  const today = toLocalYmd(new Date())
  const overdueCompliance = complianceRows.filter((c) => c.status === 'overdue').length
  const overdueActions = (actions ?? []).filter(
    (a) => a.status !== 'resolved' && a.status !== 'closed' && a.due_date && a.due_date < today,
  ).length
  const overdueItems = overdueCompliance + overdueActions
  const overdueItemsSparkline = days.map((day) => {
    const c = complianceRows.filter(
      (c) => c.status === 'overdue' && (dayKey(c.created_at) ?? '') <= day,
    ).length
    const a = (actions ?? []).filter(
      (a) =>
        a.status !== 'resolved' &&
        a.status !== 'closed' &&
        a.due_date &&
        a.due_date < day &&
        (dayKey(a.created_at) ?? '') <= day,
    ).length
    return c + a
  })
  const overdueItemsDelta = pctChange(overdueItems, overdueItemsSparkline[0] ?? overdueItems)

  // ── Active engineers ───────────────────────────
  const engineersRows = engineers ?? []
  const activeEngineers = engineersRows.filter((e) => e.status === 'active').length
  const activeEngineersSparkline = days.map((day) => {
    return engineersRows.filter(
      (e) => e.status === 'active' && (dayKey(e.created_at) ?? '') <= day,
    ).length
  })
  const activeEngineersDelta = pctChange(activeEngineers, activeEngineersSparkline[0] ?? activeEngineers)

  // ── Revenue MTD ────────────────────────────────
  const invoicesRows = invoices ?? []
  const revenueMtd = invoicesRows
    .filter((i) => i.paid_date && i.paid_date >= monthStart)
    .reduce((sum, i) => sum + (i.total || 0), 0)
  const revenuePrevMonth = invoicesRows
    .filter((i) => i.paid_date && i.paid_date >= previousMonthStart && i.paid_date < monthStart)
    .reduce((sum, i) => sum + (i.total || 0), 0)
  const revenueMtdDelta = pctChange(revenueMtd, revenuePrevMonth)
  const revenueMtdSparkline = days.map((day) => {
    return invoicesRows
      .filter((i) => i.paid_date === day)
      .reduce((sum, i) => sum + (i.total || 0), 0)
  })

  // ── Outstanding invoices ───────────────────────
  const unpaid = invoicesRows.filter(
    (i) => i.status !== 'paid' && i.status !== 'cancelled',
  )
  const outstandingInvoices = unpaid.reduce((sum, i) => sum + (i.total || 0), 0)
  const outstandingInvoicesSparkline = days.map((day) => {
    return invoicesRows
      .filter(
        (i) =>
          (dayKey(i.created_at) ?? '') <= day &&
          i.status !== 'cancelled' &&
          (!i.paid_date || i.paid_date > day),
      )
      .reduce((sum, i) => sum + (i.total || 0), 0)
  })
  const outstandingInvoicesDelta = pctChange(
    outstandingInvoices,
    outstandingInvoicesSparkline[0] ?? outstandingInvoices,
  )

  return {
    compliancePct,
    compliancePctDelta,
    complianceSparkline,
    openJobs,
    openJobsDelta,
    openJobsSparkline,
    overdueItems,
    overdueItemsDelta,
    overdueItemsSparkline,
    activeEngineers,
    activeEngineersDelta,
    activeEngineersSparkline,
    revenueMtd,
    revenueMtdDelta,
    revenueMtdSparkline,
    outstandingInvoices,
    outstandingInvoicesDelta,
    outstandingInvoicesSparkline,
  }
}
