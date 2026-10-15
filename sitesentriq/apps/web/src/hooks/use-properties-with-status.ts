import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Property } from '@haumea/types'
import type { PortfolioStatus } from '@/components/shared/portfolio-map'

export interface PropertyWithStatus extends Property {
  clients?: { name: string } | null
  status: PortfolioStatus
}

interface UsePropertiesWithStatusOptions {
  clientId?: string
}

/**
 * Returns properties + an aggregated compliance status:
 *   - if any item is overdue → 'overdue'
 *   - else if any non_compliant → 'non_compliant'
 *   - else if any due_soon → 'due_soon'
 *   - else if at least one compliant item → 'compliant'
 *   - else → 'unknown'
 *
 * Aggregation runs client-side. For 80 sites this is well under any
 * meaningful payload threshold; can graduate to an RPC later.
 */
export function usePropertiesWithStatus(options: UsePropertiesWithStatusOptions = {}) {
  const { clientId } = options

  return useQuery({
    queryKey: ['properties_with_status', { clientId }],
    queryFn: async () => {
      let propertyQuery = supabase
        .from('properties')
        .select('*, clients(name)')
        .order('name')
      if (clientId) {
        propertyQuery = propertyQuery.eq('client_id', clientId)
      }
      const propertyResult = await propertyQuery
      if (propertyResult.error) throw propertyResult.error
      const properties = (propertyResult.data ?? []) as (Property & { clients: { name: string } | null })[]

      if (properties.length === 0) return [] as PropertyWithStatus[]

      const propertyIds = properties.map((p) => p.id)
      const complianceQuery = supabase
        .from('compliance_items')
        .select('property_id, status')
        .in('property_id', propertyIds)
      const complianceResult = await complianceQuery
      if (complianceResult.error) throw complianceResult.error

      const buckets = new Map<string, Record<PortfolioStatus, number>>()
      for (const row of complianceResult.data ?? []) {
        const id = row.property_id as string
        if (!id) continue
        const existing = buckets.get(id) ?? {
          compliant: 0,
          due_soon: 0,
          overdue: 0,
          non_compliant: 0,
          unknown: 0,
        }
        const status = (row.status as PortfolioStatus) || 'unknown'
        if (status in existing) existing[status] = (existing[status] ?? 0) + 1
        buckets.set(id, existing)
      }

      return properties.map((p) => {
        const counts = buckets.get(p.id)
        let status: PortfolioStatus = 'unknown'
        if (counts) {
          if (counts.overdue > 0) status = 'overdue'
          else if (counts.non_compliant > 0) status = 'non_compliant'
          else if (counts.due_soon > 0) status = 'due_soon'
          else if (counts.compliant > 0) status = 'compliant'
        }
        return { ...p, status }
      }) as PropertyWithStatus[]
    },
  })
}
