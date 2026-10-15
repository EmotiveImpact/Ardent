import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { logTimelineEvent } from '@/lib/timeline'
import { TIMELINE_EVENT_TYPES } from '@/lib/constants'
import type { ComplianceItem } from '@haumea/types'

interface ComplianceFilters {
  property_id?: string
  status?: string
  compliance_type?: string
}

export function useComplianceItems(filters?: ComplianceFilters) {
  return useQuery({
    queryKey: ['compliance_items', filters],
    queryFn: async () => {
      let query = supabase
        .from('compliance_items')
        .select('*, properties(name), assets(name)')
        .order('next_due', { ascending: true, nullsFirst: false })
        // Wave 17 perf — cap unbounded fetch.
        .limit(200)

      if (filters?.property_id) {
        query = query.eq('property_id', filters.property_id)
      }
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.compliance_type) {
        query = query.eq('compliance_type', filters.compliance_type)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useComplianceItem(id: string) {
  return useQuery({
    queryKey: ['compliance_items', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('*, properties(name, address), assets(name)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useCreateComplianceItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Partial<ComplianceItem>) => {
      const { data, error } = await supabase
        .from('compliance_items')
        .insert(item)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Compliance item created successfully')
      queryClient.invalidateQueries({ queryKey: ['compliance_items'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create compliance item')
    },
  })
}

export function useUpdateComplianceItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ComplianceItem> & { id: string }) => {
      const { data, error } = await supabase
        .from('compliance_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data, variables) => {
      toast.success('Compliance item updated successfully')
      queryClient.invalidateQueries({ queryKey: ['compliance_items'] })
      queryClient.invalidateQueries({ queryKey: ['compliance_items', variables.id] })

      // Auto-trigger: log timeline event when compliance item is updated
      if (data) {
        const orgId = data.organisation_id
        if (orgId) {
          logTimelineEvent({
            orgId,
            propertyId: data.property_id,
            eventType: TIMELINE_EVENT_TYPES.COMPLIANCE_UPDATED,
            description: `Compliance item "${data.name || data.compliance_type}" updated to ${data.status}`,
          })
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update compliance item')
    },
  })
}

export function useDeleteComplianceItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Compliance item deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['compliance_items'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete compliance item')
    },
  })
}

export function useComplianceItemsByAsset(assetId: string | undefined) {
  return useQuery({
    queryKey: ['compliance_items', 'asset', assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('*, properties(name)')
        .eq('asset_id', assetId!)
        .order('next_due', { ascending: true, nullsFirst: false })
        // Wave 17 perf — cap unbounded per-asset fetch.
        .limit(200)
      if (error) throw error
      return data
    },
    enabled: !!assetId,
  })
}

/**
 * Certificates linked to a compliance item. Builder 8B (Wave 8).
 * Returns the row with a freshly-signed download URL for the saved
 * HTML so the consumer can render a download link without
 * re-signing.
 */
export function useComplianceCertificates(complianceItemId: string | undefined) {
  return useQuery({
    queryKey: ['certificates', 'compliance', complianceItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('certificates')
        .select('*')
        .eq('compliance_item_id', complianceItemId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Resolve signed URLs lazily so the list renders fast.
      const rows = (data ?? []) as Array<{
        id: string
        certificate_number: string
        type: string
        test_date: string | null
        next_due: string | null
        outcome: string | null
        html_url: string | null
        pdf_url: string | null
        created_at: string
      }>
      // Batch all signing into a single storage round-trip rather than one
      // request per row (was an n+1). createSignedUrls preserves input order
      // and returns one result per path.
      const paths = rows
        .map((row) => row.html_url)
        .filter((path): path is string => !!path)
      const signedByPath = new Map<string, string>()
      if (paths.length > 0) {
        const { data: signedRes } = await supabase.storage
          .from('certificates')
          .createSignedUrls(paths, 60 * 60 * 24 * 7)
        for (const entry of signedRes ?? []) {
          if (entry.path && entry.signedUrl) {
            signedByPath.set(entry.path, entry.signedUrl)
          }
        }
      }
      return rows.map((row) => ({
        ...row,
        signed_url: row.html_url ? (signedByPath.get(row.html_url) ?? null) : null,
      }))
    },
    enabled: !!complianceItemId,
    // Signed URLs live for 7 days; keep them cached just under that so
    // navigating back doesn't re-sign on every mount.
    staleTime: 1000 * 60 * 60 * 24 * 6,
  })
}

export function useComplianceStats() {
  return useQuery({
    queryKey: ['compliance_items', 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('status')
      if (error) throw error

      const stats = {
        compliant: 0,
        due_soon: 0,
        overdue: 0,
        non_compliant: 0,
      }

      for (const item of data || []) {
        const s = item.status as keyof typeof stats
        if (s in stats) {
          stats[s]++
        }
      }

      return stats
    },
  })
}
