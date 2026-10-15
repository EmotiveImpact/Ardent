import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface MapJob {
  id: string
  title: string
  status: string
  latitude: number
  longitude: number
  propertyName: string | null
  address: string | null
  scheduledTime: string | null // 'HH:MM' from time_start, else from scheduled_date
}

// Open, day-map-relevant statuses. Completed/cancelled jobs add noise to the
// engineer's route view, so we drop them client-side (the query can return
// any status; we filter after mapping). Mirrors the open set used elsewhere.
const OPEN_STATUSES = new Set(['scheduled', 'due', 'pending', 'in_progress', 'revisit'])

// Shape of a single joined row coming back from Supabase. properties is a
// to-one relation but PostgREST may type it as an array depending on the FK
// metadata, so we normalise both shapes when mapping.
interface MapJobRow {
  id: string
  title: string | null
  status: string | null
  scheduled_date: string | null
  time_start: string | null
  properties:
    | {
        name: string | null
        address: string | null
        latitude: number | null
        longitude: number | null
      }
    | {
        name: string | null
        address: string | null
        latitude: number | null
        longitude: number | null
      }[]
    | null
}

function firstProperty(p: MapJobRow['properties']) {
  if (!p) return null
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export function useMapJobs() {
  const [jobs, setJobs] = useState<MapJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) throw new Error('Not authenticated')

      // Jobs link to engineers via engineer_assignments. Its engineer_id stores
      // EITHER the profile/user id (manual assign) OR the engineers record id
      // (auto-assign) depending on the path — so match BOTH, mirroring useJobs.
      // Without the engineers.id, auto-assigned jobs never appear on the map.
      const { data: engRecord } = await supabase
        .from('engineers')
        .select('id')
        .eq('profile_id', user.id)
        .maybeSingle()
      const assignmentIds = [user.id, (engRecord as { id?: string } | null)?.id].filter(Boolean) as string[]

      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select(
          'id, title, status, scheduled_date, time_start, properties(name, address, latitude, longitude), engineer_assignments!inner(engineer_id)',
        )
        .in('engineer_assignments.engineer_id', assignmentIds)
        .order('scheduled_date', { ascending: true })

      if (fetchError) throw fetchError

      const mapped: MapJob[] = ((data as MapJobRow[]) ?? [])
        .map((row): MapJob | null => {
          const prop = firstProperty(row.properties)
          if (!prop || prop.latitude == null || prop.longitude == null) return null

          const status = row.status ?? ''
          if (!OPEN_STATUSES.has(status)) return null

          let scheduledTime: string | null = null
          if (row.time_start) {
            scheduledTime = row.time_start.slice(0, 5)
          } else if (row.scheduled_date) {
            scheduledTime = new Date(row.scheduled_date).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })
          }

          return {
            id: row.id,
            title: row.title ?? '',
            status,
            latitude: Number(prop.latitude),
            longitude: Number(prop.longitude),
            propertyName: prop.name ?? null,
            address: prop.address ?? null,
            scheduledTime,
          }
        })
        .filter((j): j is MapJob => j !== null)

      setJobs(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load map jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  return { jobs, loading, error, refetch: fetchJobs }
}
