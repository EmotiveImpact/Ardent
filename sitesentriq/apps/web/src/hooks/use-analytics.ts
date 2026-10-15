import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toLocalYmd } from '@/lib/time-tracking/compute'

/** Engineer workload: jobs grouped by assigned engineer */
export function useEngineerWorkload() {
  return useQuery({
    queryKey: ['analytics', 'engineer-workload'],
    queryFn: async () => {
      // Count only OPEN jobs — assignment rows persist after a job is completed
      // or cancelled, so counting all of them turns "current workload" into
      // "every job ever assigned". jobs!inner + the status filter scopes it to
      // outstanding work (mirrors useOverdueVisits).
      const { data, error } = await supabase
        .from('engineer_assignments')
        .select('engineer_id, profiles:engineer_id(full_name), jobs!inner(status)')
        .not('jobs.status', 'in', '(completed,cancelled,failed_access,performed,rejected)')
      if (error) throw error

      const counts: Record<string, { name: string; jobs: number }> = {}
      for (const row of data || []) {
        const id = row.engineer_id
        // These rows ALWAYS have a real engineer_id; a null profile join means
        // the name is missing (RLS/orphaned profile), NOT that the work is
        // unassigned. Don't relabel real work as "Unassigned" — that hides the
        // engineer's load under a phantom bar. Fall back to a short id tag.
        const name =
          ((row as Record<string, unknown>).profiles as { full_name: string } | undefined)?.full_name ||
          (id ? `Engineer ${String(id).slice(0, 8)}` : 'Unassigned')
        if (!counts[id]) counts[id] = { name, jobs: 0 }
        counts[id].jobs++
      }
      return Object.values(counts).sort((a, b) => b.jobs - a.jobs)
    },
  })
}

/** Overdue visits: jobs with status != completed and scheduled_date in the past */
export function useOverdueVisits() {
  return useQuery({
    queryKey: ['analytics', 'overdue-visits'],
    queryFn: async () => {
      // Local day, not UTC — scheduled_date is timestamptz; a UTC slice would
      // mark today's not-yet-due jobs as overdue for sub-UTC users in the evening.
      const today = toLocalYmd(new Date())
      const { count, error } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .lt('scheduled_date', today)
        // A visit is only "overdue" if it's still outstanding — exclude
        // completed AND cancelled/no-access, which previously inflated the KPI.
        .not('status', 'in', '(completed,cancelled,failed_access,performed,rejected)')
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Defects raised vs resolved from the actions table */
export function useDefectStats() {
  return useQuery({
    queryKey: ['analytics', 'defect-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('actions')
        .select('status')
      if (error) throw error

      let raised = 0
      let resolved = 0
      for (const row of data || []) {
        raised++
        if (row.status === 'resolved' || row.status === 'closed') resolved++
      }
      return { raised, resolved }
    },
  })
}

/** Invoice ageing: unpaid invoices grouped by days overdue */
export function useInvoiceAgeing() {
  return useQuery({
    queryKey: ['analytics', 'invoice-ageing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('due_date, total, status')
        // Ageing = OUTSTANDING receivables only. Exclude paid/cancelled/draft —
        // previously only `paid` was excluded, so cancelled + not-yet-issued
        // drafts inflated the buckets.
        .not('status', 'in', '(paid,cancelled,draft)')
      if (error) throw error

      const buckets = [
        { label: '0-30 days', min: 0, max: 30, total: 0, count: 0 },
        { label: '31-60 days', min: 31, max: 60, total: 0, count: 0 },
        { label: '61-90 days', min: 61, max: 90, total: 0, count: 0 },
        { label: '90+ days', min: 91, max: Infinity, total: 0, count: 0 },
      ]

      const now = new Date()
      for (const inv of data || []) {
        if (!inv.due_date) continue
        const dueDate = new Date(inv.due_date)
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        // Not yet due → not part of the OVERDUE ageing chart.
        if (daysOverdue < 0) continue
        for (const bucket of buckets) {
          if (daysOverdue >= bucket.min && daysOverdue <= bucket.max) {
            bucket.total += inv.total || 0
            bucket.count++
            break
          }
        }
      }
      return buckets
    },
  })
}

/** Revenue by client from paid invoices */
export function useRevenueByClient() {
  return useQuery({
    queryKey: ['analytics', 'revenue-by-client'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('total, clients(name)')
        .eq('status', 'paid')
      if (error) throw error

      const byClient: Record<string, { name: string; revenue: number }> = {}
      for (const inv of data || []) {
        const clientName = ((inv as Record<string, unknown>).clients as { name: string } | undefined)?.name || 'Unknown'
        if (!byClient[clientName]) byClient[clientName] = { name: clientName, revenue: 0 }
        byClient[clientName].revenue += inv.total || 0
      }
      return Object.values(byClient).sort((a, b) => b.revenue - a.revenue)
    },
  })
}

/** Monthly revenue trend from paid invoices grouped by month */
export function useMonthlyRevenue() {
  return useQuery({
    queryKey: ['analytics', 'monthly-revenue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('total, paid_date, created_at')
        .eq('status', 'paid')
      if (error) throw error

      const byMonth: Record<string, number> = {}
      for (const inv of data || []) {
        const date = inv.paid_date || inv.created_at
        if (!date) continue
        // Bucket on the date STRING's YYYY-MM directly. paid_date is a date-only
        // column; `new Date('2026-01-01')` parses as UTC midnight and the local
        // getters would push a 1st-of-month payment into the previous month (and
        // a Jan 1 into the prior year) for any sub-UTC user.
        const key = String(date).slice(0, 7)
        byMonth[key] = (byMonth[key] || 0) + (inv.total || 0)
      }

      return Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => {
          const [y, m] = month.split('-')
          const label = new Date(Number(y), Number(m) - 1).toLocaleDateString('en-GB', {
            month: 'short',
            year: '2-digit',
          })
          return { month: label, revenue }
        })
    },
  })
}

/** Quote pipeline funnel: draft -> sent -> approved */
export function useQuotePipeline() {
  return useQuery({
    queryKey: ['analytics', 'quote-pipeline'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('status')
      if (error) throw error

      const counts: Record<string, number> = {}
      for (const q of data || []) {
        const s = q.status || 'unknown'
        counts[s] = (counts[s] || 0) + 1
      }

      const total = data?.length || 0
      const draft = counts['draft'] || 0
      const sent = counts['sent'] || 0
      const approved = counts['approved'] || 0
      const rejected = counts['rejected'] || 0
      const expired = counts['expired'] || 0
      // Converting a quote to a job/invoice sets status='converted' (use-quotes.ts),
      // overwriting 'approved'. It is the MOST successful terminal outcome, so it
      // must count toward the conversion numerator and appear in the funnel —
      // otherwise every converted quote silently dropped out of the rate while
      // still inflating the denominator, systematically understating conversion.
      const converted = counts['converted'] || 0

      return {
        stages: [
          { stage: 'Draft', value: draft },
          { stage: 'Sent', value: sent },
          { stage: 'Approved', value: approved },
          { stage: 'Converted', value: converted },
          { stage: 'Rejected', value: rejected },
          { stage: 'Expired', value: expired },
        ],
        total,
        conversionRate: total > 0 ? Math.round(((approved + converted) / total) * 100) : 0,
      }
    },
  })
}
