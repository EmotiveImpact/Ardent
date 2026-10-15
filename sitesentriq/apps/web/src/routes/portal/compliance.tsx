import { useMemo } from 'react'
import {  } from '@haumea/ui'
import { FormSelect, PageHeader } from '@haumea/ui'
import { ShieldCheck } from 'lucide-react'
import { useComplianceItems, useComplianceStats } from '@/hooks/use-compliance'
import { useProperties } from '@/hooks/use-properties'
import { useAuth } from '@/hooks/use-auth'
import { usePortalProperty } from '@/components/layout/portal-layout'
import { formatDate } from '@haumea/utils'
import type { Property, ComplianceItemWithRelations } from '@haumea/types'
import { KpiGridSkeleton, TableSkeleton } from '@/components/shared/skeletons'

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  compliant: { label: 'Compliant', color: 'text-metric-green', dot: 'bg-status-compliant' },
  due_soon: { label: 'Due Soon', color: 'text-metric-amber', dot: 'bg-status-due-soon' },
  overdue: { label: 'Overdue', color: 'text-metric-rose', dot: 'bg-status-overdue' },
  non_compliant: { label: 'Non-Compliant', color: 'text-metric-rose', dot: 'bg-status-non-compliant' },
}

export default function PortalCompliancePage() {
  // Drive the in-page property filter from the GLOBAL header site switcher so
  // this page honours the selected site like every other portal page (it used
  // to keep an independent local dropdown that ignored the switcher entirely).
  const { profile } = useAuth()
  const { selectedPropertyId, setSelectedPropertyId } = usePortalProperty()
  const propertyFilter = selectedPropertyId ?? ''
  // Scope to the client_admin's client (RLS 00096 backs this; NULL for staff).
  const { data: properties } = useProperties(profile?.client_id ?? undefined)
  const { data: stats, isLoading: statsLoading } = useComplianceStats()
  const { data: items, isLoading: itemsLoading } = useComplianceItems(
    propertyFilter ? { property_id: propertyFilter } : undefined
  )

  // When a property is selected the summary cards must reflect THAT property, not
  // the org-wide stats (which made the cards disagree with the filtered table).
  // Derive the counts from the visible items in that case.
  const cardStats = useMemo(() => {
    if (!propertyFilter) return stats
    const counts: Record<string, number> = { compliant: 0, due_soon: 0, overdue: 0, non_compliant: 0 }
    for (const it of items ?? []) {
      const s = (it as { status?: string }).status
      if (s && s in counts) counts[s] += 1
    }
    return counts
  }, [propertyFilter, stats, items])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <PageHeader title="Compliance Status" />
        <div className="w-56">
          <FormSelect
            value={propertyFilter}
            onChange={(v) => setSelectedPropertyId(v || null)}
            ariaLabel="Filter by property"
            placeholder="All Properties"
            clearable
            options={(properties ?? []).map((p: Property) => ({ value: p.id, label: p.name }))}
          />
        </div>
      </div>

      {/* Summary stat cards */}
      {statsLoading ? (
        <KpiGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} className="bg-surface-card border border-border-default rounded-xl px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">{cfg.label}</span>
              </div>
              <p className={`text-headline font-bold ${cfg.color} leading-tight`}>
                {(cardStats as Record<string, number> | undefined)?.[key] ?? 0}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {itemsLoading ? (
          <TableSkeleton rows={6} cols={5} showHeader={false} showSearch={false} />
        ) : !items?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <ShieldCheck size={28} strokeWidth={1.5} className="mb-2" />
            <p className="text-label text-text-muted">No compliance items found</p>
            <p className="text-micro text-text-muted mt-1">Compliance items for your properties will appear here</p>
          </div>
        ) : (
          <table aria-label="Compliance Items" className="overflow-hidden">
              <thead><tr>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Type</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                <th id="nextDue" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Next Due</th>
              </tr></thead>
              <tbody>
                {items.map((item: ComplianceItemWithRelations) => {
                  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.compliant
                  return (
                    <tr key={item.id} id={item.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                      <td className="py-3 px-4 text-label font-medium text-text-secondary">{item.name}</td>
                      <td className="py-3 px-4 text-label text-text-secondary capitalize">{item.compliance_type?.replace('_', ' ')}</td>
                      <td className="py-3 px-4 text-label text-text-secondary">{item.properties?.name ?? '-'}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          <span className="text-caption font-medium text-text-secondary">{cfg.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">{item.next_due ? formatDate(item.next_due) : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
