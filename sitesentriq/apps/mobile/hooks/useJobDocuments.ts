import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cacheIsStale, readOfflineCache, writeOfflineCache } from '@/lib/offline-cache'
import NetInfo from '@react-native-community/netinfo'

// A single document row attached to a job, its property, or its asset.
// Files live in the private `documents` storage bucket — `file_url` is
// typically a storage PATH (signed on open), though it MIGHT already be a
// full https URL; the UI handles both.
export interface JobDocument {
  id: string
  name: string
  file_url: string
  document_type: string | null
  mime_type: string | null
  uploaded_at: string | null
}

export function useJobDocuments(opts: {
  jobId?: string
  propertyId?: string
  assetId?: string | null
}) {
  const { jobId, propertyId, assetId } = opts
  const [documents, setDocuments] = useState<JobDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isStale, setIsStale] = useState(false)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    let servedCache = false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) throw new Error('Not authenticated')

      // Build the `.or` filter from only the ids that were provided. A doc
      // matches if it belongs to this job OR this property OR this asset.
      const clauses: string[] = []
      if (jobId) clauses.push(`job_id.eq.${jobId}`)
      if (propertyId) clauses.push(`property_id.eq.${propertyId}`)
      if (assetId) clauses.push(`asset_id.eq.${assetId}`)

      // Nothing to scope by → no documents (avoid an unscoped table scan).
      if (clauses.length === 0) {
        setDocuments([])
        return
      }

      const resource = `job-documents:${jobId ?? '-'}:${propertyId ?? '-'}:${assetId ?? '-'}`
      const cached = await readOfflineCache<JobDocument[]>(user.id, resource)
      if (cached) {
        servedCache = true
        setDocuments(cached.data)
        setLastUpdated(cached.updatedAt)
        setIsStale(cacheIsStale(cached.updatedAt))
        setLoading(false)
      }

      const { data, error: fetchError } = await supabase
        .from('documents')
        .select('id, name, file_url, document_type, mime_type, uploaded_at')
        .or(clauses.join(','))
        .order('uploaded_at', { ascending: false })

      if (fetchError) throw fetchError
      const nextDocuments = (data as JobDocument[]) ?? []
      setDocuments(nextDocuments)
      const updatedAt = await writeOfflineCache(user.id, resource, nextDocuments)
      setLastUpdated(updatedAt)
      setIsStale(false)
    } catch (err) {
      if (servedCache) setIsStale(true)
      else setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [jobId, propertyId, assetId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  useEffect(() => {
    let wasOnline: boolean | null = null
    return NetInfo.addEventListener(state => {
      const online = Boolean(state.isConnected && state.isInternetReachable)
      if (wasOnline === false && online) void fetchDocuments()
      wasOnline = online
    })
  }, [fetchDocuments])

  return { documents, loading, error, refetch: fetchDocuments, lastUpdated, isStale }
}
