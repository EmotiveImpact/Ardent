import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toLocalYmd } from '@/lib/time-tracking/compute'

export interface TodaysVisit {
  id: string
  title: string
  status: string
  priority: string
  scheduled_date: string | null
  time_start: string | null
  time_end: string | null
  property: { id: string; name: string } | null
  engineers: { id: string; name: string }[]
}

/**
 * Fetches today's scheduled jobs joined with property + assigned engineers.
 * Returns ordered by start time (nulls last).
 */
export function useTodaysVisits() {
  return useQuery<TodaysVisit[]>({
    queryKey: ['dashboard', 'todays-visits'],
    queryFn: async () => {
      const now = new Date()
      const today = toLocalYmd(now)
      const tomorrowDate = new Date(now)
      tomorrowDate.setDate(tomorrowDate.getDate() + 1)
      const tomorrow = toLocalYmd(tomorrowDate)
      const { data, error } = await supabase
        .from('jobs')
        .select(
          'id, title, status, priority, scheduled_date, time_start, time_end, property_id, properties(id, name), engineer_assignments(engineer_id, profiles:engineer_id(full_name))',
        )
        .gte('scheduled_date', today).lt('scheduled_date', tomorrow)
        .order('time_start', { ascending: true, nullsFirst: false })

      if (error) throw error

      type Row = {
        id: string
        title: string
        status: string
        priority: string
        scheduled_date: string | null
        time_start: string | null
        time_end: string | null
        properties: { id: string; name: string } | { id: string; name: string }[] | null
        engineer_assignments: {
          engineer_id: string
          profiles: { full_name: string } | { full_name: string }[] | null
        }[] | null
      }

      return (data as Row[] | null ?? []).map<TodaysVisit>((j) => {
        const propertyRaw = Array.isArray(j.properties) ? j.properties[0] : j.properties
        const engineers = (j.engineer_assignments ?? []).map((ea) => {
          const profile = Array.isArray(ea.profiles) ? ea.profiles[0] : ea.profiles
          return {
            id: ea.engineer_id,
            name: profile?.full_name ?? 'Engineer',
          }
        })
        return {
          id: j.id,
          title: j.title,
          status: j.status,
          priority: j.priority,
          scheduled_date: j.scheduled_date,
          time_start: j.time_start,
          time_end: j.time_end,
          property: propertyRaw ? { id: propertyRaw.id, name: propertyRaw.name } : null,
          engineers,
        }
      })
    },
  })
}
