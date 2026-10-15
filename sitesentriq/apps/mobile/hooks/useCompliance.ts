import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Compliance item the engineer can see. RLS scopes rows to the engineer's
// organisation, so a plain select returns only their org's items (mirrors
// the web use-compliance hook).
export interface ComplianceItem {
  id: string
  organisation_id: string
  property_id: string | null
  asset_id: string | null
  name: string
  compliance_type: string
  frequency: string
  last_completed: string | null
  next_due: string | null
  status: string
  created_at: string
  // Joined
  properties?: { name: string } | null
}

export function useCompliance() {
  const [items, setItems] = useState<ComplianceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Not authenticated')

      const { data, error: fetchError } = await supabase
        .from('compliance_items')
        .select('*, properties(name)')
        .order('next_due', { ascending: true, nullsFirst: false })

      if (fetchError) throw fetchError
      setItems((data as ComplianceItem[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load compliance')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  return { items, loading, error, refetch: fetchItems }
}
