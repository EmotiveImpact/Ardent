import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface ReportFilters {
  engineer_id?: string
  client_id?: string
  compliance_type?: string
  date_from?: string
  date_to?: string
}

// ── Per-engineer report ───────────────────────────────────────
export function useEngineerReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ['advanced-reports', 'engineer', filters],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('*, properties(name, client_id, clients(name))')
        .eq('status', 'completed')
        .order('completed_date', { ascending: false })

      if (filters.engineer_id) {
        query = query.eq('engineer_record_id', filters.engineer_id)
      }
      // Filter on completed_date — the report is of COMPLETED jobs keyed/ordered
      // by completion. Filtering scheduled_date would drop work completed in the
      // period but scheduled earlier, and include work scheduled in the period
      // but completed later, so the stats wouldn't match the selected window.
      if (filters.date_from) {
        query = query.gte('completed_date', filters.date_from)
      }
      if (filters.date_to) {
        // completed_date is timestamptz; date_to is a date-only string — extend
        // to end-of-day so jobs completed later on the end day aren't dropped.
        query = query.lte('completed_date', `${filters.date_to}T23:59:59.999`)
      }

      const { data, error } = await query
      if (error) throw error

      const jobs = data || []
      const totalVisits = jobs.length
      const passCount = jobs.filter(j => j.outcome === 'pass').length
      const failCount = jobs.filter(j => j.outcome === 'fail').length
      const calloutCount = jobs.filter(j => j.is_callout).length
      const passRate = totalVisits > 0 ? Math.round((passCount / totalVisits) * 100) : 0
      const failRate = totalVisits > 0 ? Math.round((failCount / totalVisits) * 100) : 0

      return { jobs, totalVisits, passCount, failCount, calloutCount, passRate, failRate }
    },
    enabled: !!filters.engineer_id,
  })
}

// ── Per-client report ─────────────────────────────────────────
export function useClientReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ['advanced-reports', 'client', filters],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('*, properties!inner(name, client_id, clients!inner(id, name))')
        .eq('status', 'completed')
        .order('completed_date', { ascending: false })

      if (filters.client_id) {
        query = query.eq('properties.client_id', filters.client_id)
      }
      // Filter on completed_date (the completion dimension the report is keyed
      // and ordered on), not scheduled_date — see useEngineerReport above.
      if (filters.date_from) {
        query = query.gte('completed_date', filters.date_from)
      }
      if (filters.date_to) {
        query = query.lte('completed_date', `${filters.date_to}T23:59:59.999`)
      }

      // Also fetch engineer names
      const { data, error } = await query
      if (error) throw error

      // Fetch engineer names for the jobs
      const engineerIds = [...new Set((data || []).map(j => j.engineer_record_id).filter(Boolean))]
      let engineerMap: Record<string, string> = {}
      if (engineerIds.length > 0) {
        const { data: engineers } = await supabase
          .from('engineers')
          .select('id, name')
          .in('id', engineerIds)
        if (engineers) {
          engineerMap = Object.fromEntries(engineers.map(e => [e.id, e.name]))
        }
      }

      const jobs = (data || []).map(j => ({
        ...j,
        engineer_name: j.engineer_record_id ? engineerMap[j.engineer_record_id] || '-' : '-',
      }))

      const totalVisits = jobs.length
      const passCount = jobs.filter(j => j.outcome === 'pass').length
      const failCount = jobs.filter(j => j.outcome === 'fail').length
      const calloutCount = jobs.filter(j => j.is_callout).length
      const complianceRate = totalVisits > 0 ? Math.round((passCount / totalVisits) * 100) : 0

      return { jobs, totalVisits, complianceRate, calloutCount, failCount }
    },
    enabled: !!filters.client_id,
  })
}

// ── Per-compliance-type report ────────────────────────────────
export function useComplianceTypeReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ['advanced-reports', 'compliance-type', filters],
    queryFn: async () => {
      let query = supabase
        .from('compliance_items')
        .select('*, properties(name)')
        .order('next_due', { ascending: true, nullsFirst: false })

      if (filters.compliance_type) {
        query = query.eq('compliance_type', filters.compliance_type)
      }

      const { data, error } = await query
      if (error) throw error

      const items = data || []
      const totalItems = items.length
      const compliantCount = items.filter(i => i.status === 'compliant').length
      const overdueCount = items.filter(i => i.status === 'overdue').length
      const passRate = totalItems > 0 ? Math.round((compliantCount / totalItems) * 100) : 0

      // Compute average frequency in months from the frequency field
      const freqMonths: Record<string, number> = {
        daily: 0.03,
        weekly: 0.25,
        monthly: 1,
        quarterly: 3,
        six_monthly: 6,
        annual: 12,
      }
      const freqValues = items
        .map(i => freqMonths[i.frequency] ?? null)
        .filter((v): v is number => v !== null)
      const avgFrequency = freqValues.length > 0
        ? Math.round((freqValues.reduce((a, b) => a + b, 0) / freqValues.length) * 10) / 10
        : 0

      return { items, totalItems, passRate, overdueCount, avgFrequency }
    },
    enabled: !!filters.compliance_type,
  })
}
