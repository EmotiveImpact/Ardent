import { useState } from 'react'
import { Link } from 'react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { DataTable } from '@/components/shared/data-table'
import { Plus, FileText, Download } from 'lucide-react'
import { useQuotes } from '@/hooks/use-quotes'
import { formatCurrency, formatDate, exportToCsv } from '@haumea/utils'
import { QUOTE_TYPES } from '@/lib/constants'
import { Button, Chip } from '@haumea/ui'
import { EmptyState } from '@/components/shared/empty-state'
import { QueryError } from '@/components/shared/query-error'
import { SectionHeader } from '@/components/shared/section-header'
import type { QuoteWithRelations } from '@haumea/types'

const STATUS_TABS = ['all', 'draft', 'sent', 'approved', 'rejected'] as const
const STATUS_CHIP_COLOR: Record<string, 'default' | 'accent' | 'success' | 'danger'> = {
  draft: 'default',
  sent: 'accent',
  approved: 'success',
  rejected: 'danger',
  expired: 'default',
}

const columns: ColumnDef<QuoteWithRelations, any>[] = [
  {
    accessorKey: 'quote_number',
    header: 'Quote #',
    cell: ({ row }) => (
      <span className="text-label font-medium text-text-primary">{row.original.quote_number}</span>
    ),
  },
  {
    id: 'client',
    header: 'Client',
    accessorFn: (row) => row.clients?.name ?? '',
    cell: ({ row }) => (
      <span className="text-label text-text-secondary">{row.original.clients?.name || '-'}</span>
    ),
  },
  {
    accessorKey: 'quote_type',
    header: 'Type',
    cell: ({ row }) => {
      const qt = row.original.quote_type || 'reactive'
      const isDefect = qt === 'defect_quote' || qt === 'reactive'
      return (
        <Chip variant="soft" color={isDefect ? 'warning' : 'accent'} size="sm">
          {QUOTE_TYPES[qt] || qt}
        </Chip>
      )
    },
  },
  {
    accessorKey: 'total',
    header: 'Total',
    cell: ({ row }) => (
      <span className="text-label font-medium text-text-primary">
        {formatCurrency(row.original.total || 0)}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Chip variant="soft" color={STATUS_CHIP_COLOR[row.original.status] || 'default'} size="sm">
        {row.original.status}
      </Chip>
    ),
  },
  {
    accessorKey: 'valid_until',
    header: 'Date',
    cell: ({ row }) => (
      <span className="text-label text-text-secondary">
        {row.original.valid_until ? formatDate(row.original.valid_until) : '-'}
      </span>
    ),
  },
  {
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    cell: ({ row }) => (
      <Link to={`/dashboard/quotes/${row.original.id}`} className="text-label font-medium text-navy-950 hover:underline">
        View
      </Link>
    ),
  },
]

export default function QuotesPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const { data: quotes, isLoading, isError, error, refetch, isFetching } = useQuotes(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  )

  return (
    <div className="space-y-6">
      <SectionHeader
        variant="page"
        title="Quotes"
        subtitle="Send pricing and proposals to clients"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('quotes.csv', (quotes ?? []).map((q) => ({
                'Quote Number': q.quote_number,
                'Client Name': q.clients?.name ?? '',
                Total: q.total ?? 0,
                Status: q.status,
                'Created At': q.created_at ? formatDate(q.created_at) : '',
              })))}
            >
              <Download size={14} />
              Export
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/quotes/new">
                <Plus size={16} className="mr-1" /> New Quote
              </Link>
            </Button>
          </div>
        }
      />

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
          <div className="p-5"><ListPageSkeleton cols={5} /></div>
        ) : isError ? (
          <div className="p-5">
            <QueryError
              title="Quotes failed to load"
              error={error}
              fallback="The quotes list did not return from Supabase."
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          </div>
        ) : !quotes?.length ? (
          <EmptyState
            icon={FileText}
            title={statusFilter !== 'all' ? 'No matching quotes' : 'No quotes yet'}
            description={
              statusFilter !== 'all'
                ? 'Try selecting a different status filter.'
                : 'Create your first quote to send pricing to clients.'
            }
            action={
              statusFilter === 'all' ? (
                <Button asChild variant="primary" size="sm">
                  <Link to="/dashboard/quotes/new">
                    <Plus size={16} className="mr-1" /> New Quote
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable data={quotes} columns={columns} />
        )}
      </div>
    </div>
  )
}
