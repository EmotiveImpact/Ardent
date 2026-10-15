import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { Plus, FileText, Download } from 'lucide-react'
import { useInvoices } from '@/hooks/use-invoices'
import { formatCurrency, formatDate, exportToCsv } from '@haumea/utils'
import { Button, Chip } from '@haumea/ui'
import { TableCheckbox } from '@haumea/ui'
import { SavedViews, type SavedView, type ViewFilter } from '@/components/shared/saved-views'
import { BulkActionBar } from '@/components/shared/bulk-action-bar'
import { EmptyState } from '@/components/shared/empty-state'
import { QueryError } from '@/components/shared/query-error'
import { SectionHeader } from '@/components/shared/section-header'
import { AccountingStatusChip } from '@/components/shared/accounting-status-chip'
import type { AccountingProvider, AccountingStatus } from '@/lib/integrations/accounting/types'
import type { InvoiceWithRelations } from '@haumea/types'

const STATUS_TABS = ['all', 'draft', 'sent', 'paid', 'overdue'] as const
const STATUS_CHIP_COLOR: Record<string, 'default' | 'accent' | 'success' | 'danger'> = {
  draft: 'default',
  sent: 'accent',
  paid: 'success',
  overdue: 'danger',
}

function invoiceMatchesView(inv: InvoiceWithRelations, filters: ViewFilter): boolean {
  if (filters.status) {
    const arr = Array.isArray(filters.status) ? filters.status : [filters.status]
    if (!arr.includes(inv.status)) return false
  }
  return true
}

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activeView, setActiveView] = useState<SavedView | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: invoices, isLoading, isError, error, refetch, isFetching } = useInvoices(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  )

  const filteredInvoices = useMemo(() => {
    let list = (invoices ?? []) as InvoiceWithRelations[]
    if (activeView && activeView.id !== 'all') {
      list = list.filter((i) => invoiceMatchesView(i, activeView.filters))
    }
    return list
  }, [invoices, activeView])

  const someSelected = selectedIds.size > 0
  const allSelected = filteredInvoices.length > 0 && filteredInvoices.every((i) => selectedIds.has(i.id))

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) setSelectedIds(new Set(filteredInvoices.map((i) => i.id)))
      else setSelectedIds(new Set())
    },
    [filteredInvoices]
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

  const toCsvRow = (inv: Record<string, unknown>) => ({
    'Invoice Number': inv.invoice_number as string,
    'Client Name': ((inv.clients as { name: string } | null)?.name) ?? '',
    Total: (inv.total as number) ?? 0,
    Status: inv.status as string,
    'Due Date': inv.due_date ? formatDate(inv.due_date as string) : '',
  })

  return (
    <div className="space-y-6">
      <SectionHeader
        variant="page"
        title="Invoices"
        subtitle="Bill clients and track outstanding balances"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() =>
                exportToCsv('invoices.csv', (invoices ?? []).map((inv) => toCsvRow(inv as unknown as Record<string, unknown>)))
              }
            >
              <Download size={14} />
              Export
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/invoices/new">
                <Plus size={16} className="mr-1" /> New Invoice
              </Link>
            </Button>
          </div>
        }
      />

      {/* Saved Views */}
      <SavedViews
        entity="invoices"
        activeViewId={activeView?.id ?? 'all'}
        onChange={(v) => setActiveView(v)}
      />

      {/* Status filter chips. Active state uses --accent (theme-aware,
          navy in light, brand in dark) so it matches every other
          primary-emphasis surface in the app. */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 rounded-lg text-label font-medium capitalize transition-colors ${
              statusFilter === tab
                ? 'bg-accent text-accent-foreground'
                : 'border border-border-default text-text-secondary hover:bg-surface-page'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-5">
            <ListPageSkeleton cols={6} />
          </div>
        ) : isError ? (
          <div className="p-5">
            <QueryError
              title="Invoices failed to load"
              error={error}
              fallback="The invoices list did not return from Supabase."
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          </div>
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={statusFilter !== 'all' || activeView ? 'No matching invoices' : 'No invoices yet'}
            description={
              statusFilter !== 'all' || activeView
                ? 'Try selecting a different filter.'
                : 'Create your first invoice to start billing clients.'
            }
            action={
              statusFilter === 'all' && !activeView ? (
                <Button asChild variant="primary" size="sm">
                  <Link to="/dashboard/invoices/new">
                    <Plus size={16} className="mr-1" /> New Invoice
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Invoices" className="w-full">
                <thead><tr>
                  <th className="w-10 py-3 px-4">
                    <TableCheckbox
                      isSelected={allSelected}
                      isIndeterminate={someSelected && !allSelected}
                      onChange={handleSelectAll}
                      ariaLabel="Select all invoices"
                    />
                  </th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Invoice #</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Client</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Total</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Sync</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Due Date</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
                </tr></thead>
                <tbody>
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} id={inv.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                      <td className="py-3 px-4">
                        <TableCheckbox
                          isSelected={selectedIds.has(inv.id)}
                          onChange={(isSelected) => handleSelectOne(inv.id, isSelected)}
                          ariaLabel={`Select invoice ${inv.invoice_number}`}
                        />
                      </td>
                      <td className="py-3 px-4 text-label font-medium text-text-primary">{inv.invoice_number}</td>
                      <td className="py-3 px-4 text-label text-text-secondary">{inv.clients?.name || '-'}</td>
                      <td className="py-3 px-4 text-label font-medium text-text-primary">{formatCurrency(inv.total || 0)}</td>
                      <td className="py-3 px-4">
                        <Chip variant="soft" color={STATUS_CHIP_COLOR[inv.status] || 'default'} size="sm">
                          {inv.status}
                        </Chip>
                      </td>
                      <td className="py-3 px-4">
                        <AccountingStatusChip
                          status={(inv as { accounting_status?: AccountingStatus }).accounting_status}
                          provider={(inv as { accounting_provider?: AccountingProvider }).accounting_provider}
                        />
                      </td>
                      <td className="py-3 px-4 text-label text-text-secondary">
                        {inv.due_date ? formatDate(inv.due_date) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <Link to={`/dashboard/invoices/${inv.id}`} className="text-label font-medium text-brand-500 hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <BulkActionBar
          table="invoices"
          selectedIds={Array.from(selectedIds)}
          selectedRows={filteredInvoices.filter((i) => selectedIds.has(i.id)) as unknown as Record<string, unknown>[]}
          toCsvRow={toCsvRow}
          exportFilename="invoices-selected.csv"
          actions={['status', 'export', 'delete']}
          invalidateKeys={[['invoices']]}
          // NOTE: 'Paid' is intentionally NOT offered here. The bulk bar only
          // patches `status`, but marking an invoice paid must also write a
          // payments row + paid_date (useMarkInvoicePaid) or reconciliation
          // breaks (Total Paid £0, full balance outstanding). Paid is only
          // reachable via the single-invoice Mark-Paid button, which reconciles.
          statusOptions={[
            { label: 'Draft', value: 'draft' },
            { label: 'Sent', value: 'sent' },
            { label: 'Overdue', value: 'overdue' },
            { label: 'Cancelled', value: 'cancelled' },
          ]}
          onClearSelection={clearSelection}
        />
      )}
    </div>
  )
}
