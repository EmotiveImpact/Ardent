import { useCallback, useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from '@/lib/supabase'
import { applyOrEnqueue, enqueue } from '@/lib/offline-queue'
import { shouldQueueOfflineWrite } from '@/lib/write-gate'
import { cacheIsStale, readOfflineCache, writeOfflineCache } from '@/lib/offline-cache'

export interface JobTaskRow {
  id: string
  job_id: string
  organisation_id: string
  description: string | null
  outcome: 'complete' | 'incomplete' | 'revisit' | null
  completed_at: string | null
  created_at: string | null
}

export function useJobTasks(jobId: string) {
  const [tasks, setTasks] = useState<JobTaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isStale, setIsStale] = useState(false)

  const fetchTasks = useCallback(async () => {
    setError(null)
    let servedCache = false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not authenticated')
      const resource = `job-tasks:${jobId}`
      const cached = await readOfflineCache<JobTaskRow[]>(userId, resource)
      if (cached) {
        servedCache = true
        setTasks(cached.data)
        setLastUpdated(cached.updatedAt)
        setIsStale(cacheIsStale(cached.updatedAt))
        setLoading(false)
      }
      const { data, error: fetchError } = await supabase
        .from('job_tasks')
        .select('id, job_id, organisation_id, description, outcome, completed_at, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
      if (fetchError) throw fetchError
      const next = (data as JobTaskRow[]) ?? []
      setTasks(next)
      const updatedAt = await writeOfflineCache(userId, resource, next)
      setLastUpdated(updatedAt)
      setIsStale(false)
    } catch (err) {
      if (servedCache) setIsStale(true)
      else setError(err instanceof Error ? err.message : 'Failed to load checklist')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { void fetchTasks() }, [fetchTasks])
  useEffect(() => {
    let wasOnline: boolean | null = null
    return NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected && state.isInternetReachable)
      if (wasOnline === false && online) void fetchTasks()
      wasOnline = online
    })
  }, [fetchTasks])

  async function toggleTask(task: JobTaskRow) {
    const complete = task.outcome === 'complete'
    const patch = {
      outcome: complete ? null : 'complete',
      completed_at: complete ? null : new Date().toISOString(),
    }
    const action = { kind: 'update' as const, table: 'job_tasks', payload: patch, where: { id: task.id } }
    const result = await shouldQueueOfflineWrite()
      ? (await enqueue(action), { queued: true })
      : await applyOrEnqueue(action)

    const next = tasks.map(item => item.id === task.id ? { ...item, ...patch } as JobTaskRow : item)
    setTasks(next)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id) {
      const updatedAt = await writeOfflineCache(session.user.id, `job-tasks:${jobId}`, next)
      setLastUpdated(updatedAt)
    }
    return result
  }

  return { tasks, loading, error, lastUpdated, isStale, refetch: fetchTasks, toggleTask }
}
