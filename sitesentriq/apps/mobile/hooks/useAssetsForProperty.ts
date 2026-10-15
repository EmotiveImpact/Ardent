import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface PropertyAsset {
  id: string
  name: string
}

/**
 * Fetch the assets belonging to a property so the engineer can optionally pin
 * a raised defect (action) to a specific asset. `actions.asset_id` is nullable
 * (the web never sends it), so an empty list is fine — the defect simply has
 * no asset_id. We guard on propertyId and surface a loading flag so the picker
 * can show a sensible state.
 */
export function useAssetsForProperty(propertyId: string | null | undefined) {
  const [assets, setAssets] = useState<PropertyAsset[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAssets = useCallback(async () => {
    if (!propertyId) {
      setAssets([])
      return
    }
    setLoading(true)
    try {
      const { data } = await supabase
        .from('assets')
        .select('id, name')
        .eq('property_id', propertyId)
        .order('name', { ascending: true })
      setAssets((data as PropertyAsset[]) ?? [])
    } catch {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  return { assets, loading, refetch: fetchAssets }
}
