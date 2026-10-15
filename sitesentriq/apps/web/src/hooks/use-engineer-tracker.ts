import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toLocalYmd } from '@/lib/time-tracking/compute'

export interface EngineerTrackerRow {
  id: string
  engineerName: string
  trade?: string | null
  status: string
  currentJobId?: string | null
  currentJobTitle?: string | null
  propertyId?: string | null
  propertyName?: string | null
  propertyAddress?: string | null
  latitude?: number | null
  longitude?: number | null
  scheduledDate?: string | null
  timeStart?: string | null
  timeEnd?: string | null
  expectedArrivalAt?: string | null
  movementStatus: 'available' | 'travelling' | 'on_site' | 'offline'
  etaLabel: string
  travelMinutesToday: number
  lastSeenAt?: string | null
}

function formatEta(expectedArrivalAt?: string | null, timeStart?: string | null): string {
  const source = expectedArrivalAt || timeStart
  if (!source) return 'No ETA'
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return timeStart ? timeStart.slice(0, 5) : 'No ETA'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function useEngineerTracker() {
  return useQuery<EngineerTrackerRow[]>({
    queryKey: ['engineer-tracker'],
    refetchInterval: 30_000,
    // Pause the 4-table poll while the tab is hidden — no point hammering
    // engineers/jobs/travel/locations when nobody is watching the live tracker.
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // Local calendar day, not UTC. scheduled_date is timestamptz; a UTC slice
      // shows tomorrow's jobs (and hides today's) for sub-UTC users in the
      // evening. Mirrors useTodaysVisits.
      const now = new Date()
      const today = toLocalYmd(now)
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowKey = toLocalYmd(tomorrow)

      // Engineers + jobs are load-bearing (the page is unrenderable without
      // them). travel_records + engineer_locations are decorative — if either
      // fails, the tracker degrades to "no travel time / no location" but
      // still renders. Previously a travel_records timeout / RLS denial
      // would throw and blank the whole tracker.
      const [engineersRes, jobsRes, travelRes, locationsRes] = await Promise.all([
        supabase
          .from('engineers')
          .select('id, profile_id, name, trade, status')
          .order('name'),
        supabase
          .from('jobs')
          .select('id, title, status, scheduled_date, time_start, time_end, expected_arrival_at, properties(id, name, address, latitude, longitude), engineer_assignments(engineer_id)')
          .gte('scheduled_date', today)
          .lt('scheduled_date', tomorrowKey)
          .in('status', ['scheduled', 'due', 'in_progress', 'revisit']),
        supabase
          .from('travel_records')
          .select('engineer_id, travel_time_mins, travel_date')
          .eq('travel_date', today)
          .then((r) => r, () => ({ data: null, error: null })),
        supabase
          .from('engineer_locations')
          .select('engineer_id, current_job_id, movement_status, eta_at, recorded_at')
          .order('recorded_at', { ascending: false })
          .limit(200)
          .then((r) => r, () => ({ data: null, error: null })),
      ])

      if (engineersRes.error) throw engineersRes.error
      if (jobsRes.error) throw jobsRes.error
      if (travelRes.error) {
        // Decorative; don't block the page on a stale row count.
        console.warn('[engineer-tracker] travel_records read failed (continuing):', travelRes.error.message)
      }
      if (locationsRes.error && !/does not exist|schema cache/i.test(locationsRes.error.message)) {
        console.warn('[engineer-tracker] engineer_locations read failed (continuing):', locationsRes.error.message)
      }

      const jobsByEngineer = new Map<string, any>()
      for (const job of jobsRes.data ?? []) {
        const assignments = (job.engineer_assignments ?? []) as Array<{ engineer_id: string }>
        for (const assignment of assignments) {
          const previous = jobsByEngineer.get(assignment.engineer_id)
          if (!previous || job.status === 'in_progress') {
            jobsByEngineer.set(assignment.engineer_id, job)
          }
        }
      }

      const travelByEngineer = new Map<string, number>()
      for (const record of travelRes.data ?? []) {
        travelByEngineer.set(
          record.engineer_id,
          (travelByEngineer.get(record.engineer_id) ?? 0) + (record.travel_time_mins ?? 0),
        )
      }

      const latestLocationByEngineer = new Map<string, any>()
      for (const location of locationsRes.data ?? []) {
        if (!latestLocationByEngineer.has(location.engineer_id)) {
          latestLocationByEngineer.set(location.engineer_id, location)
        }
      }

      return (engineersRes.data ?? []).map((engineer) => {
        const job = jobsByEngineer.get(engineer.id) ?? (engineer.profile_id ? jobsByEngineer.get(engineer.profile_id) : null)
        const location = latestLocationByEngineer.get(engineer.id)
        const property = job?.properties
        const movementStatus =
          location?.movement_status ??
          (job?.status === 'in_progress' ? 'on_site' : job ? 'travelling' : engineer.status === 'active' ? 'available' : 'offline')

        return {
          id: engineer.id,
          engineerName: engineer.name,
          trade: engineer.trade,
          status: engineer.status,
          currentJobId: job?.id ?? null,
          currentJobTitle: job?.title ?? null,
          propertyId: property?.id ?? null,
          propertyName: property?.name ?? null,
          propertyAddress: property?.address ?? null,
          latitude: property?.latitude ?? null,
          longitude: property?.longitude ?? null,
          scheduledDate: job?.scheduled_date ?? null,
          timeStart: job?.time_start ?? null,
          timeEnd: job?.time_end ?? null,
          expectedArrivalAt: location?.eta_at ?? job?.expected_arrival_at ?? null,
          movementStatus,
          etaLabel: formatEta(location?.eta_at ?? job?.expected_arrival_at, job?.time_start),
          travelMinutesToday: travelByEngineer.get(engineer.id) ?? 0,
          lastSeenAt: location?.recorded_at ?? null,
        } satisfies EngineerTrackerRow
      })
    },
  })
}
