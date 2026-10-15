import { lazy, Suspense, useState, useMemo, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { DataTable } from '@/components/shared/data-table'
import { Button, Chip, Tabs } from '@haumea/ui'
import { Plus, Eye, Building2, Download, Upload, List, Map as MapIcon } from 'lucide-react'
import { SkeletonBox } from '@/components/shared/skeletons'
import { AppCard, SearchInput } from '@haumea/ui'
import { useProperties, useCreateProperty, useBulkDeleteProperties } from '@/hooks/use-properties'
import { useAuth } from '@/hooks/use-auth'
import { usePropertiesWithStatus } from '@/hooks/use-properties-with-status'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { CsvImportModal, type CsvColumnConfig } from '@/components/shared/csv-import-modal'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { exportToCsv } from '@haumea/utils'
import { toast } from 'sonner'
import type { Property } from '@haumea/types'

const PortfolioMap = lazy(() =>
  import('@/components/shared/portfolio-map').then((m) => ({ default: m.PortfolioMap })),
)

type PropertyRow = {
  id: string
  name: string
  address: string
  site_type?: string
  clients?: { name: string } | null
}

const columns: ColumnDef<PropertyRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <span className="text-label font-medium text-text-primary">
        {(row.original as { property_number?: string | null }).property_number && (
          <span className="block text-micro font-mono tracking-tight text-text-muted">
            {(row.original as { property_number?: string | null }).property_number}
          </span>
        )}
        {row.original.name}
      </span>
    ),
  },
  {
    accessorKey: 'clients',
    header: 'Client',
    cell: ({ row }) => (
      <span className="text-label text-text-secondary">{row.original.clients?.name || '-'}</span>
    ),
    sortingFn: (a, b) => {
      const nameA = a.original.clients?.name ?? ''
      const nameB = b.original.clients?.name ?? ''
      return nameA.localeCompare(nameB)
    },
  },
  {
    accessorKey: 'address',
    header: 'Address',
    cell: ({ row }) => (
      <span className="text-label text-text-secondary">{row.original.address}</span>
    ),
  },
  {
    accessorKey: 'site_type',
    header: 'Site Type',
    cell: ({ row }) =>
      row.original.site_type ? (
        <Chip variant="soft" color="default" size="sm">
          {row.original.site_type}
        </Chip>
      ) : (
        <span className="text-label text-text-secondary">-</span>
      ),
  },
  {
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Link
          to={`/dashboard/properties/${row.original.id}`}
          className="p-2 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors inline-flex"
          aria-label={`View ${row.original.name}`}
        >
          <Eye className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>
    ),
  },
]

const importColumns: CsvColumnConfig[] = [
  { field: 'name', label: 'Name', required: true },
  { field: 'address', label: 'Address', required: true },
  { field: 'client_id', label: 'Client ID' },
  { field: 'site_type', label: 'Site Type' },
]

export default function PropertiesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'map' ? 'map' : 'list'
  const filterQuery = searchParams.get('filter') || ''
  const { data: properties, isLoading, error } = useProperties()
  const { data: propertiesWithStatus, isLoading: statusLoading } = usePropertiesWithStatus()
  const createProperty = useCreateProperty()
  const { organisation } = useAuth()
  const bulkDelete = useBulkDeleteProperties()
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([])
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const setView = (next: 'list' | 'map') => {
    const params = new URLSearchParams(searchParams)
    if (next === 'map') params.set('view', 'map')
    else params.delete('view')
    setSearchParams(params, { replace: true })
  }

  const isMissingCoordsFilter = filterQuery === 'missing-coords'

  const filtered = useMemo(() => {
    if (!properties) return []
    let list = properties as (PropertyRow & Property)[]
    if (isMissingCoordsFilter) {
      list = list.filter((p) => !((p as Property).latitude) || !((p as Property).longitude))
    }
    if (!search.trim()) return list as PropertyRow[]
    const q = search.toLowerCase()
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        (p.clients?.name && p.clients.name.toLowerCase().includes(q))
    ) as PropertyRow[]
  }, [properties, search, isMissingCoordsFilter])

  const mapProperties = useMemo(() => {
    const source = propertiesWithStatus ?? []
    let list = source
    if (isMissingCoordsFilter) {
      list = list.filter((p) => !p.latitude || !p.longitude)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          (p.clients?.name && p.clients.name.toLowerCase().includes(q)),
      )
    }
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      status: p.status,
      clientName: p.clients?.name ?? undefined,
      propertyType: p.site_type ?? undefined,
    }))
  }, [propertiesWithStatus, search, isMissingCoordsFilter])

  const handleBulkDelete = useCallback((ids: string[]) => {
    setBulkDeleteIds(ids)
    setConfirmBulkDelete(true)
  }, [])

  const confirmDelete = () => {
    bulkDelete.mutate(bulkDeleteIds)
    setConfirmBulkDelete(false)
    setBulkDeleteIds([])
  }

  const handleImport = async (rows: Record<string, string>[]) => {
    // Inject organisation_id — properties.organisation_id is NOT NULL + RLS
    // WITH CHECK; without it every imported row was rejected (zero rows inserted).
    const orgId = organisation?.id
    const results = await Promise.allSettled(
      rows.map((row) => createProperty.mutateAsync({ ...(row as Partial<Property>), organisation_id: orgId }))
    )
    const success = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    if (success > 0) toast.success(`${success} propert${success !== 1 ? 'ies' : 'y'} imported`)
    if (failed > 0) toast.error(`${failed} failed to import`)
    return { success, failed }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <SectionHeader
        variant="page"
        title="Properties"
        subtitle="Manage your sites and properties"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('properties.csv', (properties ?? []).map((p) => ({
                Name: p.name,
                'Client Name': (p as PropertyRow).clients?.name ?? '',
                Address: p.address,
                Postcode: (p as { postcode?: string }).postcode ?? '',
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
              <Link to="/dashboard/properties/new">
                <Plus className="w-4 h-4" />
                Add Property
              </Link>
            </Button>
          </div>
        }
      />

      {/* View toggle + Search — canonical segmented control */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <Tabs
          selectedKey={view}
          onSelectionChange={(key) => setView(key as 'list' | 'map')}
          aria-label="Properties view"
          className="self-start"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Properties view">
              <Tabs.Tab id="list">
                <span className="inline-flex items-center gap-1.5">
                  <List size={14} />
                  List
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="map">
                <span className="inline-flex items-center gap-1.5">
                  <MapIcon size={14} />
                  Map
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <SearchInput
          value={search}
          onChange={setSearch}
          ariaLabel="Search properties"
          placeholder="Search properties..."
          className="flex-1"
        />
        {isMissingCoordsFilter && (
          <button
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams)
              params.delete('filter')
              setSearchParams(params, { replace: true })
            }}
            className="text-caption font-medium text-brand-500 hover:text-brand-600 self-start md:self-auto"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && view === 'list' && <ListPageSkeleton cols={4} />}

      {/* Error */}
      {error && (
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          Failed to load properties: {(error as Error).message}
        </div>
      )}

      {/* Empty state — list view only */}
      {view === 'list' && !isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={Building2}
          title={search ? 'No matching properties' : 'No properties yet'}
          description={
            search
              ? 'Try adjusting your search terms.'
              : 'Add your first property to start managing sites.'
          }
          action={
            !search ? (
              <Button asChild variant="primary" size="sm">
                <Link to="/dashboard/properties/new">
                  <Plus className="w-4 h-4" />
                  Add Property
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Table */}
      {view === 'list' && !isLoading && !error && filtered.length > 0 && (
        <AppCard padding="none" className="overflow-hidden">
          <DataTable
            data={filtered}
            columns={columns}
            enableSelection
            getRowId={(row) => row.id}
            onBulkDelete={handleBulkDelete}
          />
        </AppCard>
      )}

      {/* Map view */}
      {view === 'map' && (
        <div>
          {statusLoading && (
            <SkeletonBox className="w-full rounded-lg" style={{ height: '600px' }} />
          )}
          {!statusLoading && (
            <Suspense
              fallback={<SkeletonBox className="w-full rounded-lg" style={{ height: '600px' }} />}
            >
              <PortfolioMap
                properties={mapProperties}
                height="600px"
                onPropertyClick={(id) => navigate(`/dashboard/properties/${id}`)}
              />
            </Suspense>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete Properties"
        message={`Delete ${bulkDeleteIds.length} selected propert${bulkDeleteIds.length !== 1 ? 'ies' : 'y'}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Properties"
        columns={importColumns}
        onImport={handleImport}
      />
    </div>
  )
}
