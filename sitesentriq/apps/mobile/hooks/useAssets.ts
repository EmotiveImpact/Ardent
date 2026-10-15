import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Asset row the engineer can see. RLS scopes rows to the engineer's
// organisation, so a plain select returns only their org's assets — we
// don't need an explicit org filter here (mirrors the web use-assets hook).
export interface Asset {
  id: string
  organisation_id: string
  property_id: string | null
  area_id: string | null
  name: string
  category: string
  make: string | null
  model: string | null
  serial_number: string | null
  install_date: string | null
  status: string
  created_at: string
  // Joined
  properties?: { name: string } | null
}

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Not authenticated')

      const { data, error: fetchError } = await supabase
        .from('assets')
        .select('*, properties(name)')
        .order('name', { ascending: true })

      if (fetchError) throw fetchError
      setAssets((data as Asset[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  return { assets, loading, error, refetch: fetchAssets }
}
