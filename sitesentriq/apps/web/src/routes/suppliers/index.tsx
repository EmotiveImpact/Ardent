// Sprint 3 / B3 — Standalone Suppliers list page.
//
// Suppliers were previously only manageable from inside the Purchase
// Orders page (a small "Supplier List" sidebar widget). That made
// the canonical use case — "let me see all my suppliers, mark this
// one inactive, edit their VAT rate" — a deep-click away from the
// Finance area. This route promotes them to a first-class entity.
//
// CRUD coverage:
//   - List + filter by status
//   - Quick-toggle active / inactive (existing useUpdateSupplierStatus)
//   - Link to detail page for full edit
//   - Link to /new for create
//   - Delete is on the detail page (with FK-aware error messaging)

import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { Plus, Store, Mail, Phone, ExternalLink } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { SearchInput } from '@haumea/ui'
import {
  useSuppliers,
  useUpdateSupplierStatus,
} from '@/hooks/use-purchase-orders'
import type { Supplier } from '@haumea/types'
import { TableSkeleton } from '@/components/shared/skeletons'

const STATUS_TABS = ['all', 'active', 'inactive'] as const

export default function SuppliersPage() {
  const { data: suppliers, isLoading, error } = useSuppliers()
  const updateStatus = useUpdateSupplierStatus()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = suppliers ?? []
    if (statusFilter !== 'all') {
      list = list.filter((s) => s.status === statusFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.account_number ?? '').toLowerCase().includes(q) ||
          (s.contact_email ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [suppliers, statusFilter, search])

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Suppliers' }]}
      />

      <SectionHeader
        variant="page"
        title="Suppliers"
        subtitle="Manage your supplier list, contact details and tax defaults"
        action={
          <Button asChild variant="primary" size="sm">
            <Link to="/dashboard/suppliers/new">
              <Plus size={14} />
              New supplier
            </Link>
          </Button>
        }
      />

      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="p-5 border-b border-border-subtle flex flex-wrap items-center gap-3">
          <div className="flex gap-2 flex-wrap">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-label font-medium capitalize transition-colors ${
                  statusFilter === tab
                    ? 'bg-foreground text-background'
                    : 'border border-border-default text-text-secondary hover:bg-surface-page'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="ml-auto w-full sm:w-72">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, account, or email"
              ariaLabel="Search suppliers"
            />
          </div>
        </div>

        {error ? (
          <div className="p-5 text-label text-status-overdue">
            Failed to load suppliers: {(error as Error).message}
          </div>
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={5} showHeader={false} showSearch={false} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Store}
            title={search || statusFilter !== 'all' ? 'No suppliers match those filters' : 'No suppliers yet'}
            description={
              search || statusFilter !== 'all'
                ? 'Try clearing the search or switching to All.'
                : 'Add a supplier to start raising purchase orders against them.'
            }
            action={
              <Button asChild variant="primary" size="sm">
                <Link to="/dashboard/suppliers/new">
                  <Plus size={14} />
                  New supplier
                </Link>
              </Button>
            }
          />
        ) : (
          <SuppliersTable
            suppliers={filtered}
            onToggleStatus={(s) =>
              updateStatus.mutate({
                id: s.id,
                status: s.status === 'active' ? 'inactive' : 'active',
              })
            }
            toggling={updateStatus.isPending}
          />
        )}
      </div>
    </div>
  )
}

function SuppliersTable({
  suppliers,
  onToggleStatus,
  toggling,
}: {
  suppliers: Supplier[]
  onToggleStatus: (s: Supplier) => void
  toggling: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table aria-label="Suppliers" className="w-full">
          <thead><tr>
            <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
              Name
            </th>
            <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
              Contact
            </th>
            <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
              Terms / VAT
            </th>
            <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
              Status
            </th>
            <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
              Actions
            </th>
          </tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr
                key={s.id}
                id={s.id}
                className="border-b border-border-subtle hover:bg-surface-page"
              >
                <td className="px-4 py-3 text-label font-medium text-text-primary">
                  <Link to={`/dashboard/suppliers/${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                  {s.account_number && (
                    <span className="ml-2 text-micro text-text-muted">#{s.account_number}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-caption text-text-secondary">
                  <div className="flex flex-col gap-0.5">
                    {s.contact_email && (
                      <a
                        href={`mailto:${s.contact_email}`}
                        className="inline-flex items-center gap-1 hover:text-brand-600"
                      >
                        <Mail size={11} /> {s.contact_email}
                      </a>
                    )}
                    {s.contact_phone && (
                      <a
                        href={`tel:${s.contact_phone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1 hover:text-brand-600"
                      >
                        <Phone size={11} /> {s.contact_phone}
                      </a>
                    )}
                    {s.website && (
                      <a
                        href={s.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-brand-600"
                      >
                        <ExternalLink size={11} /> Website
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-caption text-text-secondary">
                  <div className="flex flex-col">
                    <span>{s.payment_terms || '—'}</span>
                    <span className="text-text-muted">VAT {s.default_tax_rate ?? 20}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Chip
                    variant="soft"
                    color={s.status === 'active' ? 'success' : 'default'}
                    size="sm"
                  >
                    {s.status}
                  </Chip>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      isDisabled={toggling}
                      onPress={() => onToggleStatus(s)}
                    >
                      {s.status === 'active' ? 'Mark inactive' : 'Mark active'}
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/dashboard/suppliers/${s.id}`}>
                        Open
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </div>
  )
}
