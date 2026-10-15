import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { listRowMotion } from '@/lib/motion'
import { Link } from 'react-router'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { Button } from '@haumea/ui'
import { Plus, Eye, Users, Download, Upload, Trash2 } from 'lucide-react'
import { useClients, useCreateClient, useBulkDeleteClients } from '@/hooks/use-clients'
import { useAuth } from '@/hooks/use-auth'
import { SearchInput, TableCheckbox } from '@haumea/ui'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { CsvImportModal, type CsvColumnConfig } from '@/components/shared/csv-import-modal'
import { EmptyState } from '@/components/shared/empty-state'
import { QueryError } from '@/components/shared/query-error'
import { SectionHeader } from '@/components/shared/section-header'
import { exportToCsv } from '@haumea/utils'
import { toast } from 'sonner'
import type { Client } from '@haumea/types'

type ClientWithProperties = Client & { properties?: { count: number }[] }

const toRow = (c: ClientWithProperties) => ({
  Name: c.name,
  Email: c.contact_email ?? '',
  Phone: c.contact_phone ?? '',
  Address: c.address ?? '',
})

const importColumns: CsvColumnConfig[] = [
  { field: 'name', label: 'Name', required: true },
  { field: 'contact_email', label: 'Contact Email' },
  { field: 'contact_phone', label: 'Contact Phone' },
  { field: 'address', label: 'Address' },
  { field: 'notes', label: 'Notes' },
]

export default function ClientsPage() {
  const { data: clients, isLoading, error, refetch, isFetching } = useClients()
  const { organisation } = useAuth()
  const createClient = useCreateClient()
  const bulkDelete = useBulkDeleteClients()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const filtered = useMemo(() => {
    if (!clients) return []
    if (!search.trim()) return clients as ClientWithProperties[]
    const q = search.toLowerCase()
    return (clients as ClientWithProperties[]).filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact_email && c.contact_email.toLowerCase().includes(q))
    )
  }, [clients, search])

  const allSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))
  const someSelected = selectedIds.size > 0

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filtered.map((c) => c.id)))
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

  const handleBulkDelete = () => {
    // Only delete rows that are BOTH selected AND currently visible — matches
    // "Export Selected" and prevents deleting search/filter-hidden rows the user
    // can't see (selectedIds isn't pruned when the search changes).
    const visibleSelected = filtered.filter((c) => selectedIds.has(c.id)).map((c) => c.id)
    bulkDelete.mutate(visibleSelected, {
      onSuccess: () => setSelectedIds(new Set()),
    })
    setConfirmBulkDelete(false)
  }

  const handleImport = async (rows: Record<string, string>[]) => {
    // Inject organisation_id (the CSV has no such column). clients.organisation_id
    // is NOT NULL + RLS WITH CHECK = organisation_id(); without it EVERY imported
    // row was rejected and the import silently inserted zero rows. Mirrors the
    // single-create form (clients/new.tsx).
    const orgId = organisation?.id
    const results = await Promise.allSettled(
      rows.map((row) => createClient.mutateAsync({ ...(row as Partial<Client>), organisation_id: orgId }))
    )
    const success = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    if (success > 0) toast.success(`${success} client${success !== 1 ? 's' : ''} imported`)
    if (failed > 0) toast.error(`${failed} failed to import`)
    return { success, failed }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <SectionHeader
        variant="page"
        title="Clients"
        subtitle="Manage your client accounts"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('clients.csv', (clients ?? []).map(toRow))}
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
              <Link to="/dashboard/clients/new">
                <Plus className="w-4 h-4" />
                Add Client
              </Link>
            </Button>
          </div>
        }
      />

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        ariaLabel="Search clients"
        placeholder="Search clients..."
      />

      {/* Loading */}
      {isLoading && <ListPageSkeleton cols={4} />}

      {/* Error */}
      {error && (
        <QueryError
          title="Clients failed to load"
          error={error}
          fallback="The clients list did not return from Supabase."
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={Users}
          title={search ? 'No matching clients' : 'No clients yet'}
          description={
            search
              ? 'Try adjusting your search terms.'
              : 'Add your first client to start managing accounts.'
          }
          action={
            !search ? (
              <Button asChild variant="primary" size="sm">
                <Link to="/dashboard/clients/new">
                  <Plus className="w-4 h-4" />
                  Add Client
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Table */}
      {!isLoading && !error && filtered.length > 0 && (
        <table aria-label="Clients" className="w-full bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <thead><tr>
              <th className="w-10 py-3 px-4">
                <TableCheckbox
                  isSelected={allSelected}
                  isIndeterminate={selectedIds.size > 0 && !allSelected}
                  onChange={(isSelected) => handleSelectAll(isSelected)}
                  ariaLabel="Select all clients"
                />
              </th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Contact Email</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Phone</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Properties</th>
              <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
            </tr></thead>
            <tbody>
              <AnimatePresence>
              {filtered.map((client, rowIndex) => (
                <motion.tr key={client.id} id={client.id} {...listRowMotion(rowIndex)} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                  <td className="py-3 px-4">
                    <TableCheckbox
                      isSelected={selectedIds.has(client.id)}
                      onChange={(isSelected) => handleSelectOne(client.id, isSelected)}
                      ariaLabel={`Select ${client.name}`}
                    />
                  </td>
                  <td className="py-3 px-4 text-label font-medium text-text-primary">{client.name}</td>
                  <td className="py-3 px-4 text-label text-text-secondary">{client.contact_email || '-'}</td>
                  <td className="py-3 px-4 text-label text-text-secondary">{client.contact_phone || '-'}</td>
                  <td className="py-3 px-4 text-label text-text-secondary">{client.properties?.[0]?.count ?? 0}</td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      to={`/dashboard/clients/${client.id}`}
                      className="p-2 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors inline-flex"
                      aria-label={`View ${client.name}`}
                    >
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    </Link>
                  </td>
                </motion.tr>
              ))}
              </AnimatePresence>
            </tbody>
        </table>
      )}

      {/* Floating bulk action bar */}
      {someSelected && (
        <div className="animate-rise fixed bottom-4 left-0 right-0 mx-auto w-fit z-40 bg-foreground text-background rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-label font-medium">{selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-background"
            onPress={() => {
              const rows = filtered.filter((c) => selectedIds.has(c.id)).map(toRow)
              exportToCsv('clients-selected.csv', rows)
            }}
          >
            <Download size={13} />
            Export Selected
          </Button>
          <Button
            variant="danger"
            size="sm"
            onPress={() => setConfirmBulkDelete(true)}
          >
            <Trash2 size={13} />
            Delete Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-background/70 hover:text-background"
            onPress={() => setSelectedIds(new Set())}
          >
            Deselect All
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete Clients"
        message={`Delete ${selectedIds.size} selected client${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Clients"
        columns={importColumns}
        onImport={handleImport}
      />
    </div>
  )
}
