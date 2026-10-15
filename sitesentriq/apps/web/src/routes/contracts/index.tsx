import { Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { Plus, FileText, Download } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { DataTable } from '@/components/shared/data-table'
import { useContracts } from '@/hooks/use-contracts'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { formatDate, exportToCsv } from '@haumea/utils'
import type { ContractWithRelations } from '@haumea/types'


const columns: ColumnDef<ContractWithRelations, any>[] = [
  {
    id: 'client',
    header: 'Client',
    accessorFn: (row) => row.clients?.name ?? '',
    cell: ({ row }) => (
      <span className="text-label font-medium text-text-secondary">
        {row.original.clients?.name || 'Unknown'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Chip
        variant="soft"
        color={row.original.status === 'active' ? 'success' : row.original.status === 'expired' ? 'danger' : row.original.status === 'renewal_due' ? 'warning' : 'default'}
        size="sm"
      >
        {(row.original.status || 'draft').replace('_', ' ')}
      </Chip>
    ),
  },
  {
    accessorKey: 'start_date',
    header: 'Start',
    cell: ({ row }) => (
      <span className="text-label text-text-secondary">
        {row.original.start_date ? formatDate(row.original.start_date) : '-'}
      </span>
    ),
  },
  {
    accessorKey: 'end_date',
    header: 'End',
    cell: ({ row }) => (
      <span className="text-label text-text-secondary">
        {row.original.end_date ? formatDate(row.original.end_date) : '-'}
      </span>
    ),
  },
  {
    accessorKey: 'services_included',
    header: 'Services',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-label text-text-secondary max-w-[200px] truncate block">
        {row.original.services_included || '-'}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => (
      <div className="text-right">
        <Link
          to={`/dashboard/contracts/${row.original.id}`}
          className="text-caption font-medium text-navy-600 hover:underline"
        >
          View
        </Link>
      </div>
    ),
  },
]

export default function ContractsPage() {
  const { data: contracts, isLoading } = useContracts()

  return (
    <div className="space-y-6">
      <SectionHeader
        variant="page"
        title="Contracts"
        subtitle="Service agreements and ongoing client commitments"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => exportToCsv('contracts.csv', (contracts ?? []).map((c) => ({
                Title: c.clients?.name ?? '',
                'Client Name': c.clients?.name ?? '',
                Status: c.status,
                'Start Date': c.start_date ? formatDate(c.start_date) : '',
                'End Date': c.end_date ? formatDate(c.end_date) : '',
              })))}
            >
              <Download size={14} />
              Export
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/contracts/new">
                <Plus size={15} />
                New Contract
              </Link>
            </Button>
          </div>
        }
      />

      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-5"><ListPageSkeleton cols={5} /></div>
        ) : (contracts?.length ?? 0) === 0 ? (
          <EmptyState
            icon={FileText}
            title="No contracts yet"
            description="Create service agreements and contracts to manage client relationships."
            action={
              <Button asChild variant="primary" size="sm">
                <Link to="/dashboard/contracts/new">
                  <Plus size={15} />
                  New Contract
                </Link>
              </Button>
            }
          />
        ) : (
          <DataTable data={contracts || []} columns={columns} />
        )}
      </div>
    </div>
  )
}
