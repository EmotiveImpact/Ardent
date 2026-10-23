import { useSearchParams } from 'react-router'
import type { LiveJob } from '@/data/hq'
import { isDone, isLive } from './parts'

/*
 * What the master map shows, and the filters for it, kept in the address so
 * back, forward and the wall keep them. Shared with the owner's view on
 * Core's Today, which draws one firm on the same map.
 */

export const SHOWS = [
  { key: 'all', label: 'Everything' },
  { key: 'live', label: 'Live now' },
  { key: 'booked', label: 'Booked' },
  { key: 'done', label: 'Done' },
  { key: 'emergency', label: 'Emergencies' },
] as const
export type Show = (typeof SHOWS)[number]['key']

export const emergencyOpen = (j: LiveJob) => j.priority === 'emergency' && !isDone(j.status)

export function fits(j: LiveJob, show: Show) {
  if (show === 'live') return isLive(j.status)
  if (show === 'booked') return j.status === 'booked'
  if (show === 'done') return isDone(j.status)
  if (show === 'emergency') return emergencyOpen(j)
  return true
}

/** Firm and state filters, kept in the address so back, forward and the wall keep them. Other params are left alone. */
export function useLiveFilters() {
  const [params, setParams] = useSearchParams()
  const firmIds = (params.get('firm') ?? '').split(',').filter(Boolean)
  const show = (SHOWS.some((s) => s.key === params.get('show')) ? params.get('show') : 'all') as Show
  const vans = params.get('vans') !== 'off'
  const jobId = params.get('job') ?? undefined
  const vanId = params.get('van') ?? undefined
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }
  return { firmIds, show, vans, jobId, vanId, set, query: params.toString() }
}
