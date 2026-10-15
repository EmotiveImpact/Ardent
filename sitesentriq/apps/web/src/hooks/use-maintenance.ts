import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import type { MaintenancePlan, Job } from '@haumea/types'

interface MaintenanceFilters {
  property_id?: string
  frequency?: string
  /** Slice by 00043's maintenance_category column ('routine' | 'reactive' | 'statutory' | 'other'). */
  maintenance_category?: string
}

/**
 * JS mirror of the DB's fos_frequency_interval() helper. Given an ISO date and
 * a plan frequency, returns the next occurrence as an ISO date string (YYYY-MM-DD).
 * Used only by the useGenerateJob fallback so an offline/uncached RPC still rolls
 * the plan forward instead of regenerating the same visit forever.
 */
/** Add whole months in UTC, CLAMPING to the last day of the target month so a
 *  month-end seed can't overflow (Jan 31 + 1 month → Feb 28/29, not Mar 3). */
function addUTCMonths(d: Date, months: number): Date {
  const day = d.getUTCDate()
  const r = new Date(d)
  r.setUTCMonth(r.getUTCMonth() + months)
  if (r.getUTCDate() !== day) r.setUTCDate(0)
  return r
}

function advanceDueDate(fromIso: string, frequency: string | null | undefined): string | null {
  const base = new Date(fromIso)
  if (Number.isNaN(base.getTime())) return null
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()))
  switch ((frequency || '').toLowerCase()) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1)
      break
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'quarterly':
      return addUTCMonths(d, 3).toISOString().split('T')[0]
    case 'biannual':
    case 'six_monthly':
      return addUTCMonths(d, 6).toISOString().split('T')[0]
    case 'annual':
    case 'yearly':
      return addUTCMonths(d, 12).toISOString().split('T')[0]
    case 'monthly':
    default:
      return addUTCMonths(d, 1).toISOString().split('T')[0]
  }
  return d.toISOString().split('T')[0]
}

export function useMaintenancePlans(filters?: MaintenanceFilters) {
  return useQuery({
    queryKey: ['maintenance_plans', filters],
    queryFn: async () => {
      let query = supabase
        .from('maintenance_plans')
        .select('*, properties(name), assets(name)')
        .order('next_due', { ascending: true, nullsFirst: false })
      if (filters?.property_id) {
        query = query.eq('property_id', filters.property_id)
      }
      if (filters?.frequency) {
        query = query.eq('frequency', filters.frequency)
      }
      if (filters?.maintenance_category) {
        query = query.eq('maintenance_category', filters.maintenance_category)
      }
      const { data, error } = await query
      if (error) throw error
      return data as (MaintenancePlan & {
        properties: { name: string } | null
        assets: { name: string } | null
      })[]
    },
  })
}

export function useMaintenancePlan(id: string) {
  return useQuery({
    queryKey: ['maintenance_plans', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .select('*, properties(name), assets(name)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as MaintenancePlan & {
        properties: { name: string } | null
        assets: { name: string } | null
      }
    },
    enabled: !!id,
  })
}

export function useCreateMaintenancePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (plan: Partial<MaintenancePlan>) => {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .insert(plan)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Maintenance plan created successfully')
      queryClient.invalidateQueries({ queryKey: ['maintenance_plans'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create maintenance plan')
    },
  })
}

export function useUpdateMaintenancePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MaintenancePlan> & { id: string }) => {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      toast.success('Maintenance plan updated successfully')
      queryClient.invalidateQueries({ queryKey: ['maintenance_plans'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance_plans', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update maintenance plan')
    },
  })
}

export function useDeleteMaintenancePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('maintenance_plans').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Maintenance plan deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['maintenance_plans'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete maintenance plan')
    },
  })
}

export function useMaintenancePlansByAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: ['maintenance_plans', 'asset', assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .select('*, properties(name), assets(name)')
        .eq('asset_id', assetId!)
        .order('next_due', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as (MaintenancePlan & {
        properties: { name: string } | null
        assets: { name: string } | null
      })[]
    },
    enabled: !!assetId,
  })
}

export function useGenerateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (plan: MaintenancePlan & { properties?: { name: string } | null }) => {
      const { data: generatedJob, error: rpcError } = await supabase.rpc('create_job_from_maintenance_plan', {
        p_plan_id: plan.id,
        p_target_date: plan.next_due ?? null,
      })

      if (!rpcError) return generatedJob as Job

      if (!/function .*create_job_from_maintenance_plan|schema cache|does not exist/i.test(rpcError.message)) {
        throw rpcError
      }

      const jobTitle = `${plan.name} - Scheduled Visit`
      const newJob: Partial<Job> = {
        property_id: plan.property_id,
        organisation_id: plan.organisation_id,
        maintenance_plan_id: plan.id,
        title: jobTitle,
        description: plan.description || undefined,
        status: 'scheduled',
        priority: 'medium',
        job_type: 'ppm',
        scheduled_date: plan.next_due || plan.starts_at || undefined,
        routine_check_type: plan.maintenance_type || undefined,
      }
      const { data, error } = await supabase
        .from('jobs')
        .insert(newJob)
        .select()
        .single()
      if (error) throw error

      // The RPC normally advances the plan's next_due after generating a job.
      // The JS fallback (RPC missing from schema cache) previously skipped this,
      // so the same visit could be generated forever and the plan never moved
      // forward. Mirror fos_frequency_interval() and roll next_due to the next
      // occurrence after the date we just scheduled.
      // schedule_mode honoured: a ROLLING plan recalculates the next due date
      // from the last actual completion (so a late visit pushes the whole cadence
      // out), whereas a FIXED plan advances from the planned schedule. Previously
      // both behaved as 'fixed' and the rolling option silently did nothing.
      // Only FIXED plans advance next_due on generation; ROLLING advances on
      // COMPLETION (the repaired create_job RPC + the 00110 completion trigger).
      // This fallback now rarely runs (the RPC resolves under search_path='' as of
      // 00110) but stays consistent with it so rolling isn't double-advanced.
      if ((plan.schedule_mode ?? 'fixed') !== 'rolling') {
        const fromDate = plan.next_due || plan.starts_at || toLocalYmd(new Date())
        const nextDue = advanceDueDate(fromDate, plan.frequency)
        if (nextDue) {
          await supabase.from('maintenance_plans').update({ next_due: nextDue }).eq('id', plan.id)
        }
      }
      return data
    },
    onSuccess: () => {
      toast.success('Job generated from maintenance plan')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance_plans'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate job')
    },
  })
}
