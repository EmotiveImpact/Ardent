import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Contract, ContractRoutineTemplate } from '@haumea/types'

/**
 * Parse a "YYYY-MM-DD" string as a Date at LOCAL midnight (not UTC).
 * The default Date constructor would parse it as UTC midnight, which
 * skews day-count math by a fraction of a day in any timezone offset
 * from UTC. Used by the renewals window math.
 */
function localMidnightFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

// Sprint 2 / C5 — types for the renewals view.
export interface RenewalRow {
  id: string
  client_id: string
  status: string
  start_date: string
  end_date: string
  days_until_end: number
  client_name: string | null
  /** True when the contract has end_date in the past (overdue renewal). */
  overdue: boolean
}

interface ContractFilters {
  status?: string
  client_id?: string
}

export function useContracts(filters?: ContractFilters) {
  return useQuery({
    queryKey: ['contracts', filters],
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*, clients(name)')
        .order('end_date', { ascending: true })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.client_id) {
        query = query.eq('client_id', filters.client_id)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useContract(id: string) {
  return useQuery({
    queryKey: ['contracts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*, clients(name)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useContractRoutineTemplates(contractId?: string) {
  return useQuery({
    queryKey: ['contract_routine_templates', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_routine_templates')
        .select('*, properties(name)')
        .eq('contract_id', contractId!)
        .order('created_at', { ascending: false })
      if (error) {
        if (/schema cache|does not exist|contract_routine_templates/i.test(error.message)) return []
        throw error
      }
      return (data ?? []) as (ContractRoutineTemplate & { properties?: { name: string } | null })[]
    },
  })
}

export function useCreateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contract: Partial<Contract>) => {
      const { data, error } = await supabase
        .from('contracts')
        .insert(contract)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Contract created successfully')
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create contract')
    },
  })
}

export function useCreateContractRoutineTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (template: Partial<ContractRoutineTemplate>) => {
      const { data, error } = await supabase
        .from('contract_routine_templates')
        .insert(template)
        .select()
        .single()
      if (error) throw error
      return data as ContractRoutineTemplate
    },
    onSuccess: (template) => {
      toast.success('Routine template added')
      queryClient.invalidateQueries({ queryKey: ['contract_routine_templates', template.contract_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add routine template')
    },
  })
}

export function useGenerateContractRoutines() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await supabase.rpc('create_maintenance_plans_from_contract', {
        p_contract_id: contractId,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: (count, contractId) => {
      toast.success(`${count} routine maintenance plan${count === 1 ? '' : 's'} created`)
      queryClient.invalidateQueries({ queryKey: ['maintenance_plans'] })
      queryClient.invalidateQueries({ queryKey: ['contract_routine_templates', contractId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create routine maintenance plans')
    },
  })
}

export function useUpdateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contract> & { id: string }) => {
      const { data, error } = await supabase
        .from('contracts')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Contract updated successfully')
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['contracts', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update contract')
    },
  })
}

/**
 * Sprint 2 / C5 — contracts coming up for renewal in the next N days
 * (default 90), plus any already-overdue renewals (end_date in the
 * past, status not yet 'renewed' or 'terminated'). Sorted by urgency.
 *
 * Returned rows include `days_until_end` (negative when overdue) so
 * the UI can colour-code without re-doing the math.
 *
 * Used by:
 *   - dashboard renewals widget
 *   - contracts/index "Renewals" filter chip
 *   - notify-renewals scheduled task (server-side; this hook is the
 *     client-side mirror so widgets render the same data)
 */
export function useContractRenewals(opts: { withinDays?: number } = {}) {
  const withinDays = opts.withinDays ?? 90
  return useQuery<RenewalRow[]>({
    queryKey: ['contract-renewals', withinDays],
    // Renewals don't need to refresh on every focus — once a minute is
    // plenty for a "what's expiring soon" widget.
    staleTime: 60 * 1000,
    queryFn: async () => {
      // Cut-off date in YYYY-MM-DD so we can compare against
      // contracts.end_date which is a date column.
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() + withinDays)
      // Build the cutoff from LOCAL calendar fields so the DB bound uses the
      // same calendar as the local-midnight day count below. toISOString() would
      // give a UTC date that is one day ahead in the local evening for sub-UTC
      // admins, pulling in a contract one day past the intended window.
      const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

      const { data, error } = await supabase
        .from('contracts')
        .select('id, client_id, status, start_date, end_date, clients(name)')
        .lte('end_date', cutoffIso)
        // Don't surface contracts the user has already explicitly
        // settled. Treat 'active' / null status as in-scope.
        .not('status', 'in', '(renewed,terminated,cancelled)')
        .order('end_date', { ascending: true })
      if (error) throw error

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayMs = today.getTime()
      const MS_DAY = 24 * 60 * 60 * 1000

      return (data ?? []).map((row: Record<string, unknown>) => {
        const endDate = String(row.end_date ?? '')
        // Parse end_date as a LOCAL midnight, not UTC. The Date string
        // constructor `new Date('2026-05-09')` parses as UTC midnight,
        // which yields off-by-one day counts on borderline contracts
        // for FM admins in UTC±N timezones. Splitting + passing
        // (year, monthIndex, day) builds a local-midnight Date, which
        // matches what we compare against.
        const endMs = endDate
          ? localMidnightFromYmd(endDate).getTime()
          : todayMs
        const days = Math.round((endMs - todayMs) / MS_DAY)
        const clientName = (row.clients as { name?: string } | null)?.name ?? null
        return {
          id: String(row.id),
          client_id: String(row.client_id),
          status: String(row.status ?? ''),
          start_date: String(row.start_date ?? ''),
          end_date: endDate,
          days_until_end: days,
          client_name: clientName,
          overdue: days < 0,
        } satisfies RenewalRow
      })
    },
  })
}

export function useDeleteContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contracts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Contract deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete contract')
    },
  })
}
