import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { AppCard, PageHeader, Text } from '@haumea/ui'
import type { ColumnDef } from '@tanstack/react-table'
import { FilterSelect } from '@haumea/ui'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { Plus, Eye, ShieldCheck, AlertTriangle, XCircle, Clock, ClipboardList, Download, FileArchive } from 'lucide-react'
import { toast } from 'sonner'
import { useComplianceItems, useComplianceStats } from '@/hooks/use-compliance'
import { useGenerateTenderPack } from '@/hooks/use-tender-pack'
import { useProperties } from '@/hooks/use-properties'
import { COMPLIANCE_STATUSES, COMPLIANCE_TYPES, COMPLIANCE_TYPE_LABELS, FREQUENCIES } from '@/lib/constants'
import { formatDate, exportToCsv } from '@haumea/utils'
import { SavedViews, type SavedView, type ViewFilter } from '@/components/shared/saved-views'
import { BulkActionBar } from '@/components/shared/bulk-action-bar'
import { DataTable } from '@/components/shared/data-table'


const STATUS_LABELS: Record<string, string> = {
  compliant: 'Compliant',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  non_compliant: 'Non-Compliant',
}

interface ComplianceRow {
  id: string
  name: string
  compliance_type: string
  status: string
  frequency: string
  last_completed?: string
  next_due?: string
  properties?: { name: string } | null
}

function complianceMatchesView(item: ComplianceRow, filters: ViewFilter): boolean {
  if (filters.status) {
    const arr = Array.isArray(filters.status) ? filters.status : [filters.status]
    if (!arr.includes(item.status)) return false
  }
  if (filters.due === 'overdue' && item.status !== 'overdue') return false
  return true
}

export default function CompliancePage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<SavedView | null>(null)

  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (statusFilter) f.status = statusFilter
    if (propertyFilter) f.property_id = propertyFilter
    if (typeFilter) f.compliance_type = typeFilter
    return f
  }, [statusFilter, propertyFilter, typeFilter])

  const { data: items, isLoading, error } = useComplianceItems(filters)
  const { data: stats, isLoading: statsLoading } = useComplianceStats()
  const { data: properties } = useProperties()

  const filteredItems = useMemo(() => {
    const list = (items ?? []) as unknown as ComplianceRow[]
    if (!activeView || activeView.id === 'all') return list
    return list.filter((i) => complianceMatchesView(i, activeView.filters))
  }, [items, activeView])

  const someSelected = selectedIds.size > 0
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds])

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const generateTenderPack = useGenerateTenderPack()

  const handleGenerateTenderPack = useCallback(() => {
    const promise = generateTenderPack.mutateAsync()
    toast.promise(promise, {
      loading: 'Assembling tender pack…',
      success: (result) => {
        // The signed URL carries Content-Disposition: attachment → anchor
        // click downloads a named file (no blank tab / raw markup).
        const a = document.createElement('a')
        a.href = result.url
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        const mode = result.pdf_render_mode === 'browserless' ? 'PDF' : 'document'
        return `Tender pack ready — ${result.summary.certificate_count} certificate${
          result.summary.certificate_count === 1 ? '' : 's'
        } included. Downloading ${mode}…`
      },
      error: (err: unknown) =>
        err instanceof Error ? err.message : 'Could not generate tender pack',
    })
  }, [generateTenderPack])

  const statCards = [
    {
      label: 'Compliant',
      count: stats?.compliant ?? 0,
      valueColor: 'text-metric-green',
      icon: ShieldCheck,
    },
    {
      label: 'Due Soon',
      count: stats?.due_soon ?? 0,
      valueColor: 'text-metric-amber',
      icon: Clock,
    },
    {
      label: 'Overdue',
      count: stats?.overdue ?? 0,
      valueColor: 'text-metric-rose',
      icon: AlertTriangle,
    },
    {
      label: 'Non-Compliant',
      count: stats?.non_compliant ?? 0,
      valueColor: 'text-metric-rose',
      icon: XCircle,
    },
  ]

  const toCsvRow = (item: Record<string, unknown>) => ({
    'Item Name': item.name as string,
    'Property Name': ((item.properties as { name: string } | null)?.name) ?? '',
    Type: COMPLIANCE_TYPE_LABELS[item.compliance_type as string] || (item.compliance_type as string),
    Status: STATUS_LABELS[item.status as string] || (item.status as string),
    'Due Date': item.next_due ? formatDate(item.next_due as string) : '',
  })

  const columns = useMemo<ColumnDef<ComplianceRow>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="text-label font-medium text-text-primary">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'compliance_type',
      header: 'Type',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">
          {COMPLIANCE_TYPE_LABELS[row.original.compliance_type] || row.original.compliance_type}
        </span>
      ),
    },
    {
      id: 'property',
      header: 'Property',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">{row.original.properties?.name || '-'}</span>
      ),
    },
    {
      accessorKey: 'frequency',
      header: 'Frequency',
      cell: ({ row }) => {
        const freq = row.original.frequency
        const freqLabel = Object.entries(FREQUENCIES).find(([, v]) => v === freq)?.[0]?.replace('_', ' ') || freq
        return <span className="text-label text-text-secondary capitalize">{freqLabel?.toLowerCase() || '-'}</span>
      },
    },
    {
      accessorKey: 'last_completed',
      header: 'Last Completed',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">
          {row.original.last_completed ? formatDate(row.original.last_completed) : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'next_due',
      header: 'Next Due',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">
          {row.original.next_due ? formatDate(row.original.next_due) : '-'}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status || 'compliant'
        return (
          <Chip
            variant="soft"
            color={status === 'compliant' ? 'success' : status === 'due_soon' ? 'warning' : 'danger'}
            size="sm"
          >
            {STATUS_LABELS[status] || status}
          </Chip>
        )
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/dashboard/compliance/${row.original.id}`} aria-label={`View ${row.original.name}`}>
              <Eye className="w-4 h-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      ),
    },
  ], [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader title="Compliance Dashboard" />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() => exportToCsv('compliance.csv', filteredItems.map((i) => toCsvRow(i as unknown as Record<string, unknown>)))}
          >
            <Download size={14} />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={handleGenerateTenderPack}
            isDisabled={generateTenderPack.isPending}
          >
            <FileArchive size={14} />
            {generateTenderPack.isPending ? 'Generating…' : 'Generate Tender Pack'}
          </Button>
          <Button asChild variant="primary" size="sm">
            <Link to="/dashboard/compliance/new">
              <Plus className="w-4 h-4" />
              Add Item
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <AppCard key={stat.label} padding="md">
              <div className="flex items-center justify-between mb-3">
                <Text scale="caption" as="span" tone="muted" weight="medium" className="uppercase tracking-[0.04em]">
                  {stat.label}
                </Text>
                <Icon size={16} className="text-text-muted" />
              </div>
              <p className={`text-headline font-bold tracking-[-0.03em] leading-none ${stat.valueColor}`}>
                {statsLoading ? '-' : stat.count}
              </p>
            </AppCard>
          )
        })}
      </div>

      {/* Saved Views */}
      <SavedViews
        entity="compliance"
        activeViewId={activeView?.id ?? 'all'}
        onChange={(v) => setActiveView(v)}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Filter by status"
          options={[
            { value: '', label: 'All Statuses' },
            ...Object.values(COMPLIANCE_STATUSES).map((v) => ({
              value: v,
              label: STATUS_LABELS[v] || v,
            })),
          ]}
        />
        <FilterSelect
          value={propertyFilter}
          onChange={setPropertyFilter}
          ariaLabel="Filter by property"
          options={[
            { value: '', label: 'All Properties' },
            ...(properties || []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          ariaLabel="Filter by compliance type"
          options={[
            { value: '', label: 'All Types' },
            ...Object.values(COMPLIANCE_TYPES).map((t) => ({
              value: t,
              label: COMPLIANCE_TYPE_LABELS[t] || t,
            })),
          ]}
        />
      </div>

      {/* Loading */}
      {isLoading && <ListPageSkeleton cols={5} />}

      {/* Error */}
      {error && (
        <div className="bg-surface-card border border-status-overdue/40 rounded-xl p-5">
          <p className="text-metric-rose text-label">Failed to load compliance items: {(error as Error).message}</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && filteredItems.length === 0 && (
        <AppCard padding="md">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
              <ClipboardList size={24} strokeWidth={1.5} className="text-text-muted" />
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">No compliance items</h2>
            <p className="text-label text-text-muted">
              Track certifications, inspections, and regulatory requirements by adding your first item.
            </p>
          </div>
        </AppCard>
      )}

      {/* Table */}
      {!isLoading && !error && filteredItems.length > 0 && (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <DataTable
            data={filteredItems}
            columns={columns}
            enableSelection
            getRowId={(item) => item.id}
            selectedIds={selectedIdList}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <BulkActionBar
          table="compliance_items"
          selectedIds={selectedIdList}
          selectedRows={filteredItems.filter((i) => selectedIds.has(i.id)) as unknown as Record<string, unknown>[]}
          toCsvRow={toCsvRow}
          exportFilename="compliance-selected.csv"
          actions={['status', 'tag', 'export', 'delete']}
          invalidateKeys={[['compliance_items']]}
          statusOptions={[
            { label: 'Compliant', value: 'compliant' },
            { label: 'Due Soon', value: 'due_soon' },
            { label: 'Overdue', value: 'overdue' },
            { label: 'Non-Compliant', value: 'non_compliant' },
          ]}
          onClearSelection={clearSelection}
        />
      )}
    </div>
  )
}
