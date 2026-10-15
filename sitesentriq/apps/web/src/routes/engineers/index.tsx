import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { TableCheckbox } from '@haumea/ui'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { Plus, Eye, HardHat, Download } from 'lucide-react'
import { useEngineers } from '@/hooks/use-engineers'
import { SearchInput } from '@haumea/ui'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { exportToCsv } from '@haumea/utils'
import type { Engineer } from '@haumea/types'

type EngineerWithAccreditations = Engineer & { engineer_accreditations?: { count: number }[] }

const toRow = (e: EngineerWithAccreditations) => ({
  Name: e.name,
  Email: e.email ?? '',
  Phone: e.phone ?? '',
  Trade: e.trade ?? '',
  Status: e.status,
})

export default function EngineersPage() {
  const { data: engineers, isLoading, error } = useEngineers()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!engineers) return []
    if (!search.trim()) return engineers as EngineerWithAccreditations[]
    const q = search.toLowerCase()
    return (engineers as EngineerWithAccreditations[]).filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.trade && e.trade.toLowerCase().includes(q)) ||
        (e.email && e.email.toLowerCase().includes(q))
    )
  }, [engineers, search])

  const allSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id))
  const someSelected = selectedIds.size > 0

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filtered.map((e) => e.id)))
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
        title="Engineers"
        subtitle="Manage your engineering workforce"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('engineers.csv', (engineers ?? []).map(toRow))}
            >
              <Download size={14} />
              Export
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/engineers/new">
                <Plus className="w-4 h-4 mr-1" />
                Add Engineer
              </Link>
            </Button>
          </div>
        }
      />

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 bg-surface-elevated border border-border-default rounded-lg px-4 py-2.5">
          <span className="text-label font-medium text-text-secondary">
            {selectedIds.size} selected
          </span>
          <span className="text-text-muted">—</span>
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              const rows = filtered.filter((e) => selectedIds.has(e.id)).map(toRow)
              exportToCsv('engineers-selected.csv', rows)
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
        ariaLabel="Search engineers"
        placeholder="Search engineers..."
      />

      {/* Loading */}
      {isLoading && <ListPageSkeleton cols={5} />}

      {/* Error */}
      {error && (
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          Failed to load engineers: {(error as Error).message}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={HardHat}
          title={search ? 'No matching engineers' : 'No engineers yet'}
          description={
            search
              ? 'Try adjusting your search terms.'
              : 'Add your first engineer to manage your workforce.'
          }
          action={
            !search ? (
              <Button asChild variant="primary" size="sm">
                <Link to="/dashboard/engineers/new">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Engineer
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
            <table aria-label="Engineers" className="w-full">
                <thead><tr>
                  <th className="w-10 py-3 px-4">
                    <TableCheckbox
                      isSelected={allSelected}
                      isIndeterminate={someSelected && !allSelected}
                      onChange={handleSelectAll}
                      ariaLabel="Select all engineers"
                    />
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Email</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Trade</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
                </tr></thead>
                <tbody>
                  {filtered.map((engineer) => (
                    <tr key={engineer.id} id={engineer.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                      <td className="py-3 px-4">
                        <TableCheckbox
                          isSelected={selectedIds.has(engineer.id)}
                          onChange={(isSelected) => handleSelectOne(engineer.id, isSelected)}
                          ariaLabel={`Select ${engineer.name}`}
                        />
                      </td>
                      <td className="py-3 px-4 text-label font-medium text-text-primary">
                        <Link to={`/dashboard/engineers/${engineer.id}`} className="hover:text-brand-600 transition-colors">
                          {engineer.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">{engineer.email || '-'}</td>
                      <td className="py-3 px-4 text-label text-text-secondary">{engineer.trade || '-'}</td>
                      <td className="py-3 px-4">
                        <Chip
                          variant={engineer.status === 'active' ? 'primary' : 'soft'}
                          color={engineer.status === 'active' ? 'success' : 'default'}
                          size="sm"
                        >
                          {engineer.status === 'active' ? 'Active' : 'Inactive'}
                        </Chip>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          to={`/dashboard/engineers/${engineer.id}`}
                          className="p-2 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors inline-flex"
                          aria-label={`View ${engineer.name}`}
                        >
                          <Eye className="w-4 h-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
