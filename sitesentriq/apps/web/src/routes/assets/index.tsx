import { useState, useMemo, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { DataTable } from '@/components/shared/data-table'
import { Button, Chip } from '@haumea/ui'
import { Plus, Eye, Trash2, Package, Download, Upload } from 'lucide-react'
import { SearchInput } from '@haumea/ui'
import { FilterSelect } from '@haumea/ui'
import { useAssets, useDeleteAsset, useCreateAsset, useBulkDeleteAssets } from '@/hooks/use-assets'
import { useAuth } from '@/hooks/use-auth'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { CsvImportModal, type CsvColumnConfig } from '@/components/shared/csv-import-modal'
import { EmptyState } from '@/components/shared/empty-state'
import { QueryError } from '@/components/shared/query-error'
import { SectionHeader } from '@/components/shared/section-header'
import { exportToCsv } from '@haumea/utils'
import { toast } from 'sonner'
import type { Asset } from '@haumea/types'

type AssetRow = {
  id: string
  name: string
  category: string
  make?: string | null
  model?: string | null
  status: string
  install_date?: string | null
  area_id?: string | null
  properties?: { name: string } | null
  areas?: { name: string } | null
}

const STATUS_CHIP_COLOR: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  inactive: 'warning',
  decommissioned: 'danger',
}

function makeColumns(
  onDelete: (id: string, name: string) => void,
  isDeleting: boolean
): ColumnDef<AssetRow, unknown>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="text-label font-medium text-text-secondary">{row.original.name}</span>
      ),
    },
    {
      id: 'property',
      header: 'Property',
      enableSorting: true,
      accessorFn: (row) => row.properties?.name ?? '',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">{row.original.properties?.name || '-'}</span>
      ),
    },
    {
      id: 'area',
      header: 'Area',
      enableSorting: true,
      accessorFn: (row) => row.areas?.name ?? '',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">{row.original.areas?.name || '-'}</span>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Type',
      cell: ({ row }) => (
        <span className="text-label text-text-secondary">{row.original.category}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status || 'active'
        return (
          <Chip size="sm" variant="soft" color={STATUS_CHIP_COLOR[status] || 'default'}>
            {status}
          </Chip>
        )
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Link
            to={`/dashboard/assets/${row.original.id}`}
            aria-label={`View ${row.original.name}`}
            className="inline-flex p-2 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors"
          >
            <Eye className="w-4 h-4" aria-hidden="true" />
          </Link>
          <button
            disabled={isDeleting}
            onClick={() => onDelete(row.original.id, row.original.name)}
            className="p-2 rounded-lg hover:bg-status-overdue/10 text-text-muted hover:text-status-overdue transition-colors disabled:opacity-50"
            aria-label={`Delete ${row.original.name}`}
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ]
}

const importColumns: CsvColumnConfig[] = [
  { field: 'name', label: 'Name', required: true },
  { field: 'category', label: 'Category', required: true },
  { field: 'property_id', label: 'Property ID' },
  { field: 'make', label: 'Make' },
  { field: 'model', label: 'Model' },
  { field: 'serial_number', label: 'Serial Number' },
]

export default function AssetsPage() {
  // Honour ?property_id= (the property detail page's "Assets" tile links here to
  // show just that property's assets). Previously the param was ignored and the
  // tile showed the whole portfolio unscoped.
  const [searchParams] = useSearchParams()
  const propertyIdFilter = searchParams.get('property_id') || undefined
  const { data: assets, isLoading, error, refetch, isFetching } = useAssets(propertyIdFilter)
  const deleteAsset = useDeleteAsset()
  const createAsset = useCreateAsset()
  const { organisation } = useAuth()
  const bulkDelete = useBulkDeleteAssets()
  const [search, setSearch] = useState('')
  const [areaFilter, setAreaFilter] = useState('')
  const [confirmState, setConfirmState] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' })
  const [importOpen, setImportOpen] = useState(false)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([])
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  // Build unique area options from the assets data
  const areaOptions = useMemo(() => {
    if (!assets) return []
    const rows = assets as unknown as AssetRow[]
    const seen = new Map<string, string>()
    for (const a of rows) {
      if (a.area_id && a.areas?.name && !seen.has(a.area_id)) {
        seen.set(a.area_id, a.areas.name)
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [assets])

  const filtered = useMemo(() => {
    if (!assets) return []
    let rows = assets as unknown as AssetRow[]

    // Area filter
    if (areaFilter) {
      rows = rows.filter((a) => a.area_id === areaFilter)
    }


    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          (a.make || '').toLowerCase().includes(q) ||
          (a.model || '').toLowerCase().includes(q)
      )
    }

    return rows
  }, [assets, search, areaFilter])

  const handleDelete = (id: string, name: string) => {
    setConfirmState({ open: true, id, name })
  }

  const handleConfirmDelete = () => {
    deleteAsset.mutate(confirmState.id)
    setConfirmState({ open: false, id: '', name: '' })
  }

  const handleBulkDelete = useCallback((ids: string[]) => {
    setBulkDeleteIds(ids)
    setConfirmBulkDelete(true)
  }, [])

  const confirmBulkDeleteAction = () => {
    bulkDelete.mutate(bulkDeleteIds)
    setConfirmBulkDelete(false)
    setBulkDeleteIds([])
  }

  const columns = useMemo(
    () => makeColumns(handleDelete, deleteAsset.isPending),
     
    [deleteAsset.isPending]
  )

  const handleImport = async (rows: Record<string, string>[]) => {
    // Inject organisation_id — assets.organisation_id is NOT NULL + RLS WITH
    // CHECK; without it every imported row was rejected (zero rows inserted).
    const orgId = organisation?.id
    const results = await Promise.allSettled(
      rows.map((row) => createAsset.mutateAsync({ ...(row as Partial<Asset>), organisation_id: orgId }))
    )
    const success = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    if (success > 0) toast.success(`${success} asset${success !== 1 ? 's' : ''} imported`)
    if (failed > 0) toast.error(`${failed} failed to import`)
    return { success, failed }
  }

  if (isLoading) return <ListPageSkeleton cols={5} />

  if (error) {
    return (
      <div className="space-y-6">
        <SectionHeader variant="page" title="Asset Register" />
        <QueryError
          title="Asset register failed to load"
          error={error}
          fallback="The asset register did not return from Supabase."
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        variant="page"
        title="Asset Register"
        subtitle="Equipment and assets across your portfolio"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('assets.csv', (assets ? (assets as unknown as AssetRow[]) : []).map((a) => ({
                Name: a.name,
                'Property Name': a.properties?.name ?? '',
                Area: (a as AssetRow).areas?.name ?? '',
                'Asset Type': a.category,
                Status: a.status,
              })))}
            >
              <Download size={14} />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onPress={() => setImportOpen(true)}
            >
              <Upload size={14} />
              Import CSV
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/assets/new">
                <Plus className="w-4 h-4" />
                Add Asset
              </Link>
            </Button>
          </div>
        }
      />

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          ariaLabel="Search assets"
          placeholder="Search assets by name, category, make, or model..."
          className="flex-1"
        />
        {areaOptions.length > 0 && (
          <FilterSelect
            value={areaFilter}
            onChange={setAreaFilter}
            ariaLabel="Filter by area"
            options={[
              { value: '', label: 'All Areas' },
              ...areaOptions.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <EmptyState
            icon={Package}
            title={assets && (assets as unknown as AssetRow[]).length > 0 ? 'No matching assets' : 'No assets yet'}
            description={
              assets && (assets as unknown as AssetRow[]).length > 0
                ? 'Try adjusting your search terms or filters.'
                : 'Register your first asset to start tracking equipment.'
            }
            action={
              !(assets && (assets as unknown as AssetRow[]).length > 0) ? (
                <Button asChild variant="primary" size="sm">
                  <Link to="/dashboard/assets/new">
                    <Plus className="w-4 h-4" />
                    Add Asset
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <DataTable
            data={filtered}
            columns={columns}
            enableSelection
            getRowId={(row) => row.id}
            onBulkDelete={handleBulkDelete}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title="Delete Asset"
        message={`Delete asset "${confirmState.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmState({ open: false, id: '', name: '' })}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete Assets"
        message={`Delete ${bulkDeleteIds.length} selected asset${bulkDeleteIds.length !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmBulkDeleteAction}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Assets"
        columns={importColumns}
        onImport={handleImport}
      />
    </div>
  )
}
