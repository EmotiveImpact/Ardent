import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router'
import { Button, Chip, Tabs } from '@haumea/ui'
import { TableCheckbox } from '@haumea/ui'
import { Plus, AlertTriangle, Download } from 'lucide-react'
import { SearchInput } from '@haumea/ui'
import { useActions } from '@/hooks/use-actions'
import { ACTION_STATUSES } from '@/lib/constants'
import { formatDate, exportToCsv } from '@haumea/utils'
import { SavedViews, type SavedView, type ViewFilter } from '@/components/shared/saved-views'
import { BulkActionBar } from '@/components/shared/bulk-action-bar'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import type { ActionWithRelations } from '@haumea/types'
import { TableSkeleton } from '@/components/shared/skeletons'

const ALL_STATUSES = [
  { label: 'All', value: '' },
  { label: 'Open', value: ACTION_STATUSES.OPEN },
  { label: 'In Progress', value: ACTION_STATUSES.IN_PROGRESS },
  { label: 'Resolved', value: ACTION_STATUSES.RESOLVED },
  { label: 'Closed', value: ACTION_STATUSES.CLOSED },
]

function actionMatchesView(a: ActionWithRelations, filters: ViewFilter): boolean {
  if (filters.status) {
    const arr = Array.isArray(filters.status) ? filters.status : [filters.status]
    if (!arr.includes(a.status)) return false
  }
  if (filters.priority) {
    const arr = Array.isArray(filters.priority) ? filters.priority : [filters.priority]
    if (!arr.includes(a.priority)) return false
  }
  if (filters.due === 'overdue') {
    if (!a.due_date) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Parse the date-only due_date as a LOCAL date — `new Date('YYYY-MM-DD')` is
    // UTC midnight, which for sub-UTC users reads as the PREVIOUS day, flagging
    // actions overdue a day early.
    const [dy, dm, dd] = a.due_date.slice(0, 10).split('-').map(Number)
    const due = new Date(dy, dm - 1, dd)
    if (due >= today) return false
  }
  return true
}

export default function ActionsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<SavedView | null>(null)

  const filters: { status?: string } = {}
  if (statusFilter) filters.status = statusFilter

  const { data: actions, isLoading } = useActions(Object.keys(filters).length > 0 ? filters : undefined)

  const filteredActions = useMemo(() => {
    let list = (actions ?? []) as ActionWithRelations[]
    if (search) {
      const term = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.title?.toLowerCase().includes(term) ||
          a.description?.toLowerCase().includes(term) ||
          a.properties?.name?.toLowerCase().includes(term)
      )
    }
    if (activeView && activeView.id !== 'all') {
      list = list.filter((a) => actionMatchesView(a, activeView.filters))
    }
    return list
  }, [actions, search, activeView])

  const someSelected = selectedIds.size > 0
  const allSelected = filteredActions.length > 0 && filteredActions.every((a) => selectedIds.has(a.id))

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) setSelectedIds(new Set(filteredActions.map((a) => a.id)))
      else setSelectedIds(new Set())
    },
    [filteredActions]
  )

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const toCsvRow = (a: Record<string, unknown>) => ({
    Title: a.title as string,
    'Property Name': ((a.properties as { name: string } | null)?.name) ?? '',
    Status: a.status as string,
    Priority: a.priority as string,
    'Due Date': a.due_date ? formatDate(a.due_date as string) : '',
  })

  return (
    <div className="space-y-6 max-w-[1200px]">
      <SectionHeader
        variant="page"
        title="Actions & Defects"
        subtitle="Track and manage actions, defects, and follow-ups"
        action={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <SearchInput
              value={search}
              onChange={setSearch}
              ariaLabel="Search actions"
              placeholder="Search actions..."
              className="w-full sm:w-64"
            />
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('actions.csv', (actions ?? []).map((a) => toCsvRow(a as unknown as Record<string, unknown>)))}
            >
              <Download size={14} />
              Export
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/actions/new">
                <Plus size={14} />
                New Action
              </Link>
            </Button>
          </div>
        }
      />

      {/* Saved Views */}
      <SavedViews
        entity="actions"
        activeViewId={activeView?.id ?? 'all'}
        onChange={(v) => setActiveView(v)}
      />

      {/* Status filter tabs */}
      <Tabs
        selectedKey={statusFilter || 'all'}
        onSelectionChange={(key) => setStatusFilter(key === 'all' ? '' : String(key))}
        aria-label="Filter actions by status"
        className="w-fit"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Filter actions by status">
            {ALL_STATUSES.map((s) => (
              <Tabs.Tab key={s.value || 'all'} id={s.value || 'all'}>
                {s.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {isLoading ? (
        <TableSkeleton rows={6} cols={5} showHeader={false} showSearch={false} />
      ) : filteredActions.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <EmptyState
            icon={AlertTriangle}
            title={search || statusFilter ? 'No matching actions' : 'No actions yet'}
            description={
              search || statusFilter
                ? 'Try adjusting your search or filters.'
                : 'Track defects, follow-ups, and corrective actions here.'
            }
            action={
              !search && !statusFilter ? (
                <Button asChild variant="primary" size="sm">
                  <Link to="/dashboard/actions/new">
                    <Plus size={14} />
                    New Action
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table aria-label="Actions" className="w-full">
                <thead><tr>
                  <th className="w-10 py-3 px-4">
                    <TableCheckbox
                      isSelected={allSelected}
                      isIndeterminate={someSelected && !allSelected}
                      onChange={handleSelectAll}
                      ariaLabel="Select all actions"
                    />
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Title</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Priority</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Due Date</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
                </tr></thead>
                <tbody>
                  {filteredActions.map((action) => (
                    <tr key={action.id} id={action.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                      <td className="py-3 px-4">
                        <TableCheckbox
                          isSelected={selectedIds.has(action.id)}
                          onChange={(isSelected) => handleSelectOne(action.id, isSelected)}
                          ariaLabel={`Select ${action.title}`}
                        />
                      </td>
                      <td className="py-3 px-4 text-label font-medium text-text-primary">{action.title}</td>
                      <td className="py-3 px-4 text-label text-text-secondary">{action.properties?.name || '-'}</td>
                      <td className="py-3 px-4">
                        <Chip
                          variant="soft"
                          color={
                            action.status === 'resolved'
                              ? 'success'
                              : action.status === 'open'
                              ? 'accent'
                              : action.status === 'in_progress'
                              ? 'warning'
                              : 'default'
                          }
                          size="sm"
                        >
                          {action.status.replace(/_/g, ' ')}
                        </Chip>
                      </td>
                      <td className="py-3 px-4">
                        <Chip
                          variant="soft"
                          color={
                            action.priority === 'high' || action.priority === 'critical'
                              ? 'danger'
                              : action.priority === 'medium'
                              ? 'warning'
                              : 'default'
                          }
                          size="sm"
                        >
                          {action.priority}
                        </Chip>
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">
                        {action.due_date ? formatDate(action.due_date) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/dashboard/actions/${action.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <BulkActionBar
          table="actions"
          selectedIds={Array.from(selectedIds)}
          selectedRows={filteredActions.filter((a) => selectedIds.has(a.id)) as unknown as Record<string, unknown>[]}
          toCsvRow={toCsvRow}
          exportFilename="actions-selected.csv"
          actions={['status', 'tag', 'export', 'delete']}
          invalidateKeys={[['actions']]}
          statusOptions={[
            { label: 'Open', value: 'open' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Resolved', value: 'resolved' },
            { label: 'Closed', value: 'closed' },
          ]}
          onClearSelection={clearSelection}
        />
      )}
    </div>
  )
}
