import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { Button, Chip } from '@haumea/ui'
import { TableCheckbox } from '@haumea/ui'
import { Plus, Eye, Truck, Download } from 'lucide-react'
import { useSubcontractors } from '@/hooks/use-subcontractors'
import { SearchInput } from '@haumea/ui'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { SubcontractorExpiryBanner } from '@/components/subcontractors/expiry-banner'
import { exportToCsv } from '@haumea/utils'
import type { Subcontractor } from '@haumea/types'

type SubcontractorRow = Subcontractor & { subcontractor_documents?: { count: number }[] }

const statusConfig: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'default' }> = {
  approved: { label: 'Approved', color: 'success' },
  pending: { label: 'Pending', color: 'warning' },
  suspended: { label: 'Suspended', color: 'danger' },
}

const toRow = (s: SubcontractorRow) => ({
  'Company Name': s.company_name,
  'Contact Person': s.contact_person ?? '',
  Trade: s.trade ?? '',
  Email: s.email ?? '',
  Phone: s.phone ?? '',
  Status: s.status,
})

export default function SubcontractorsPage() {
  const { data: subcontractors, isLoading, error } = useSubcontractors()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!subcontractors) return []
    if (!search.trim()) return subcontractors as SubcontractorRow[]
    const q = search.toLowerCase()
    return (subcontractors as SubcontractorRow[]).filter(
      (s) =>
        s.company_name.toLowerCase().includes(q) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q)) ||
        (s.trade && s.trade.toLowerCase().includes(q))
    )
  }, [subcontractors, search])

  const allSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id))
  const someSelected = selectedIds.size > 0

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filtered.map((s) => s.id)))
    } else {
      setSelectedIds(new Set())
    }
  }, [filtered])

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  return (
    <div className="space-y-5">
      {/* Header */}
      <SectionHeader
        variant="page"
        title="Subcontractors"
        subtitle="Manage external contractors and suppliers"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('subcontractors.csv', (subcontractors ?? []).map(toRow))}
            >
              <Download size={14} />
              Export
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/subcontractors/new">
                <Plus className="w-4 h-4 mr-1" />
                Add Subcontractor
              </Link>
            </Button>
          </div>
        }
      />

      {/* Compliance expiry radar (W2-T5) */}
      <SubcontractorExpiryBanner />

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 bg-surface-elevated border border-border-default rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-text-secondary">
            {selectedIds.size} selected
          </span>
          <span className="text-text-muted">—</span>
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              const rows = filtered.filter((s) => selectedIds.has(s.id)).map(toRow)
              exportToCsv('subcontractors-selected.csv', rows)
            }}
          >
            <Download size={13} />
            Export Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setSelectedIds(new Set())}
          >
            Deselect All
          </Button>
        </div>
      )}

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        ariaLabel="Search subcontractors"
        placeholder="Search by company, contact person, or trade..."
      />

      {/* Loading */}
      {isLoading && <ListPageSkeleton cols={5} />}

      {/* Error */}
      {error && (
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          Failed to load subcontractors: {(error as Error).message}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={Truck}
          title={search ? 'No matching subcontractors' : 'No subcontractors yet'}
          description={
            search
              ? 'Try adjusting your search terms.'
              : 'Add your first subcontractor to start managing external contractors.'
          }
          action={
            !search ? (
              <Button asChild variant="primary" size="sm">
                <Link to="/dashboard/subcontractors/new">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Subcontractor
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Table */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table aria-label="Subcontractors" className="w-full">
                <thead><tr>
                  <th className="w-10 py-3 px-4">
                    <TableCheckbox
                      isSelected={allSelected}
                      isIndeterminate={someSelected && !allSelected}
                      onChange={handleSelectAll}
                      ariaLabel="Select all subcontractors"
                    />
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Company Name</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Contact Person</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Trade</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map((sub) => {
                    const status = statusConfig[sub.status] ?? statusConfig.pending
                    return (
                      <tr key={sub.id} id={sub.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                        <td className="py-3 px-4">
                          <TableCheckbox
                            isSelected={selectedIds.has(sub.id)}
                            onChange={(isSelected) => handleSelectOne(sub.id, isSelected)}
                            ariaLabel={`Select ${sub.company_name}`}
                          />
                        </td>
                        <td className="py-3 px-4 text-label font-medium text-text-primary">
                          <Link to={`/dashboard/subcontractors/${sub.id}`} className="hover:text-navy-950 transition-colors">
                            {sub.company_name}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-label text-text-secondary">{sub.contact_person || '-'}</td>
                        <td className="py-3 px-4 text-label text-text-secondary">{sub.trade || '-'}</td>
                        <td className="py-3 px-4">
                          <Chip variant="soft" color={status.color} size="sm">
                            {status.label}
                          </Chip>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            to={`/dashboard/subcontractors/${sub.id}`}
                            className="p-2 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors inline-flex"
                            aria-label={`View ${sub.company_name}`}
                          >
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
