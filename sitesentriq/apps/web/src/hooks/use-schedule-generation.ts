import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useComplianceItems } from './use-compliance'
import { useMaintenancePlans } from './use-maintenance'
import { generateDatesForFrequency } from '@/lib/schedule-utils'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import type { ScheduledVisit, Job } from '@haumea/types'

/**
 * Fetch all jobs for a given year (optionally scoped to a property).
 */
function useJobsForYear(year: number, propertyId?: string) {
  return useQuery({
    queryKey: ['jobs', 'year', year, propertyId],
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('id, scheduled_date, completed_date, status, maintenance_plan_id, compliance_item_id, title, property_id, organisation_id')
        .gte('scheduled_date', `${year}-01-01`)
        // scheduled_date is timestamptz: `.lte('YYYY-12-31')` resolves to
        // 31 Dec 00:00 and drops every timed job on the last day of the year
        // (which then re-generates as a duplicate visit). Use a half-open range.
        .lt('scheduled_date', `${year + 1}-01-01`)
      if (propertyId) {
        query = query.eq('property_id', propertyId)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Pick<
        Job,
        'id' | 'scheduled_date' | 'completed_date' | 'status' | 'maintenance_plan_id' | 'compliance_item_id' | 'title' | 'property_id' | 'organisation_id'
      >[]
    },
  })
}

/**
 * Generate a full schedule of visits for a year by combining compliance items
 * and maintenance plans, projecting visit dates from each item's frequency,
 * and cross-referencing against completed jobs to determine status.
 */
export function useGeneratedSchedule(propertyId?: string, year?: number) {
  const targetYear = year ?? new Date().getFullYear()
  // Local calendar day, not UTC — a UTC slice flips to tomorrow for sub-UTC users
  // in the evening, marking today's visits 'overdue' (which then excludes them
  // from generation). Compare visit dates against the local day.
  const today = toLocalYmd(new Date())

  const complianceFilters = propertyId ? { property_id: propertyId } : undefined
  const maintenanceFilters = propertyId ? { property_id: propertyId } : undefined

  const {
    data: complianceItems,
    isLoading: loadingCompliance,
  } = useComplianceItems(complianceFilters)

  const {
    data: maintenancePlans,
    isLoading: loadingMaintenance,
  } = useMaintenancePlans(maintenanceFilters)

  const {
    data: jobs,
    isLoading: loadingJobs,
  } = useJobsForYear(targetYear, propertyId)

  const isLoading = loadingCompliance || loadingMaintenance || loadingJobs

  const schedule = useMemo<ScheduledVisit[]>(() => {
    if (isLoading) return []

    const visits: ScheduledVisit[] = []

    // Build a set of completed-job dates keyed by (source_id + date) for quick lookup
    const completedJobMap = new Map<string, string>() // key -> job_id
    const allJobMap = new Map<string, string>()
    for (const job of jobs ?? []) {
      if (!job.scheduled_date) continue
      const dateKey = job.scheduled_date.slice(0, 10)
      // Key by maintenance_plan_id, then compliance_item_id, then title. The
      // compliance_item_id key MUST match the compliance loop below — keying on
      // title broke because generated compliance jobs use a different title
      // (`<name> - Scheduled Visit`), so the dedup never matched and every
      // regeneration duplicated the jobs.
      const sourceKey = job.maintenance_plan_id ?? job.compliance_item_id ?? job.title
      const mapKey = `${sourceKey}::${dateKey}`
      allJobMap.set(mapKey, job.id)
      if (job.status === 'completed') {
        completedJobMap.set(mapKey, job.id)
      }
    }

    // --- Compliance items ---
    for (const item of complianceItems ?? []) {
      const seedDate = (item as Record<string, unknown>).last_completed as string | undefined
        ?? (item as Record<string, unknown>).next_due as string | undefined
      const frequency = (item as Record<string, unknown>).frequency as string | undefined
      if (!seedDate || !frequency) continue

      const dates = generateDatesForFrequency(seedDate, frequency, targetYear)
      const itemName = (item as Record<string, unknown>).name as string
      const itemId = (item as Record<string, unknown>).id as string
      const complianceType = (item as Record<string, unknown>).compliance_type as string | undefined

      for (const date of dates) {
        const mapKey = `${itemId}::${date}`
        const completedJobId = completedJobMap.get(mapKey)
        const existingJobId = allJobMap.get(mapKey)
        let status: ScheduledVisit['status'] = 'upcoming'
        if (completedJobId) {
          status = 'completed'
        } else if (date < today) {
          status = 'overdue'
        }

        visits.push({
          date,
          compliance_item_id: itemId,
          label: itemName,
          compliance_type: complianceType,
          frequency,
          status,
          job_id: existingJobId ?? completedJobId,
        })
      }
    }

    // --- Maintenance plans ---
    for (const plan of maintenancePlans ?? []) {
      if (!plan.is_active) continue
      const seedDate = plan.last_completed ?? plan.next_due
      if (!seedDate || !plan.frequency) continue

      const dates = generateDatesForFrequency(seedDate, plan.frequency, targetYear)

      for (const date of dates) {
        const mapKey = `${plan.id}::${date}`
        const completedJobId = completedJobMap.get(mapKey)
        const existingJobId = allJobMap.get(mapKey)
        let status: ScheduledVisit['status'] = 'upcoming'
        if (completedJobId) {
          status = 'completed'
        } else if (date < today) {
          status = 'overdue'
        }

        visits.push({
          date,
          maintenance_plan_id: plan.id,
          label: plan.name,
          frequency: plan.frequency,
          status,
          job_id: existingJobId ?? completedJobId,
        })
      }
    }

    // Sort by date ascending
    visits.sort((a, b) => a.date.localeCompare(b.date))
    return visits
  }, [complianceItems, maintenancePlans, jobs, isLoading, targetYear, today])

  return { data: schedule, isLoading }
}

/**
 * Mutation to bulk-create jobs for all upcoming visits that don't already have a job.
 */
export function useGenerateJobsFromSchedule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (visits: ScheduledVisit[]) => {
      // Filter to upcoming visits without an existing job
      const toCreate = visits.filter((v) => v.status === 'upcoming' && !v.job_id)
      if (toCreate.length === 0) {
        throw new Error('No upcoming visits without jobs to generate')
      }

      // We need org and property info — fetch from compliance/maintenance items
      const complianceIds = toCreate.filter((v) => v.compliance_item_id).map((v) => v.compliance_item_id!)
      const maintenanceIds = toCreate.filter((v) => v.maintenance_plan_id).map((v) => v.maintenance_plan_id!)

      const sourceMap = new Map<string, { property_id: string; organisation_id: string; maintenance_type?: string | null }>()

      if (complianceIds.length > 0) {
        const { data } = await supabase
          .from('compliance_items')
          .select('id, property_id, organisation_id')
          .in('id', complianceIds)
        for (const row of data ?? []) {
          sourceMap.set(row.id, { property_id: row.property_id, organisation_id: row.organisation_id })
        }
      }

      if (maintenanceIds.length > 0) {
        const { data } = await supabase
          .from('maintenance_plans')
          .select('id, property_id, organisation_id, maintenance_type')
          .in('id', maintenanceIds)
        for (const row of data ?? []) {
          sourceMap.set(row.id, {
            property_id: row.property_id,
            organisation_id: row.organisation_id,
            maintenance_type: (row as { maintenance_type?: string | null }).maintenance_type ?? null,
          })
        }
      }

      const jobRows: Partial<Job>[] = []
      for (const visit of toCreate) {
        const sourceId = visit.compliance_item_id ?? visit.maintenance_plan_id
        if (!sourceId) continue
        const source = sourceMap.get(sourceId)
        if (!source) continue

        const isMaintenance = !!visit.maintenance_plan_id
        jobRows.push({
          property_id: source.property_id,
          organisation_id: source.organisation_id,
          maintenance_plan_id: visit.maintenance_plan_id ?? undefined,
          // Stamp the source compliance item so the next regeneration's dedup
          // recognises this job and doesn't create a duplicate.
          compliance_item_id: visit.compliance_item_id ?? undefined,
          title: `${visit.label} - Scheduled Visit`,
          status: 'scheduled',
          priority: 'medium',
          scheduled_date: visit.date,
          // Match the single-plan RPC: PPM visits carry job_type 'ppm' +
          // routine_check_type, so PPM-vs-reactive analytics + auto-assign
          // skill-gating treat the same visit identically regardless of origin.
          ...(isMaintenance
            ? { job_type: 'ppm', routine_check_type: source.maintenance_type ?? undefined }
            : {}),
        })
      }

      if (jobRows.length === 0) {
        throw new Error('Could not resolve source details for any visits')
      }

      // Idempotency guard for the partial unique index on
      // jobs(maintenance_plan_id, scheduled_date) WHERE status<>'cancelled' (00110):
      // re-query existing non-cancelled PPM jobs and drop any (plan, date) already
      // present, so a race / re-run can't abort the whole batch on a unique
      // violation. Compliance-only rows (no maintenance_plan_id) aren't indexed.
      const planIds = [...new Set(jobRows.map((r) => r.maintenance_plan_id).filter(Boolean) as string[])]
      let rowsToInsert = jobRows
      if (planIds.length > 0) {
        const { data: existing } = await supabase
          .from('jobs')
          .select('maintenance_plan_id, scheduled_date')
          .in('maintenance_plan_id', planIds)
          .neq('status', 'cancelled')
        const existingKeys = new Set(
          (existing ?? []).map((e) => `${(e as { maintenance_plan_id: string }).maintenance_plan_id}::${(e as { scheduled_date: string }).scheduled_date}`),
        )
        rowsToInsert = jobRows.filter(
          (r) => !r.maintenance_plan_id || !existingKeys.has(`${r.maintenance_plan_id}::${r.scheduled_date}`),
        )
      }
      if (rowsToInsert.length === 0) return 0

      const { error } = await supabase.from('jobs').insert(rowsToInsert)
      if (error) throw error

      return rowsToInsert.length
    },
    onSuccess: (count) => {
      toast.success(`${count} job${count === 1 ? '' : 's'} generated successfully`)
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate jobs')
    },
  })
}
