import { useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { Archive, Package } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SectionHeader } from '@/components/shared/section-header'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { StockItemForm } from '@/components/stock/stock-item-form'
import { useAuth } from '@/hooks/use-auth'
import {
  useStockItem,
  useStockMovementsForItem,
  useUpdateStockItem,
  useArchiveStockItem,
} from '@/lib/stock/hooks'
import { DetailPageSkeleton, TableSkeleton } from '@/components/shared/skeletons'
import { MOVEMENT_TYPES, isLowStock, isOutOfStock, STOCK_CATEGORIES } from '@/lib/stock'
import { PageHeader } from '@haumea/ui'

type Tab = 'movements' | 'used-on' | 'edit'

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
}

function formatDate(s: string): string {
  return new Date(s).toLocaleString()
}

const MOVEMENT_COLOR: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  receipt: 'success',
  usage: 'warning',
  adjustment: 'default',
  transfer: 'default',
  write_off: 'danger',
}

export default function StockItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const orgId = profile?.organisation_id ?? ''
  const { data: item, isLoading } = useStockItem(id)
  const { data: movements, isLoading: movementsLoading } = useStockMovementsForItem(id)
  const updateItem = useUpdateStockItem()
  const archiveItem = useArchiveStockItem()
  const [tab, setTab] = useState<Tab>('movements')
  const [confirmArchive, setConfirmArchive] = useState(false)

  const usageMovements = useMemo(
    () => (movements ?? []).filter((m) => m.movement_type === 'usage' && m.related_job_id),
    [movements],
  )

  if (isLoading) {
    return <DetailPageSkeleton withTabs sideCards={1} />
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', path: '/dashboard' },
            { label: 'Stock', path: '/dashboard/stock' },
            { label: 'Not found' },
          ]}
        />
        <p className="text-label text-status-overdue">Stock item not found.</p>
      </div>
    )
  }

  const low = isLowStock(item)
  const out = isOutOfStock(item)

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Stock', path: '/dashboard/stock' },
          { label: item.name },
        ]}
      />

      {/* Top card */}
      <div className="bg-surface-card border border-border-default rounded-xl p-5">
        <div className="flex items-start gap-4">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              className="h-20 w-20 rounded-lg object-cover border border-border-default"
            />
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-lg bg-brand-500/10 text-brand-500 border border-border-default">
              <Package size={28} />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <PageHeader title={item.name} />
              {item.archived && (
                <Chip size="sm" variant="soft" color="default">
                  Archived
                </Chip>
              )}
              <Chip size="sm" variant="soft" color="default">
                {STOCK_CATEGORIES[item.category] ?? item.category}
              </Chip>
              {out ? (
                <Chip size="sm" variant="soft" color="danger">
                  Out of stock
                </Chip>
              ) : low ? (
                <Chip size="sm" variant="soft" color="warning">
                  Low stock
                </Chip>
              ) : null}
            </div>
            <p className="text-caption text-text-muted mt-1">
              {item.sku ? <span className="font-mono">{item.sku}</span> : 'No SKU'}
              {item.supplier_name ? ` · ${item.supplier_name}` : ''}
              {item.location ? ` · ${item.location}` : ''}
            </p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="On hand" value={`${item.current_qty} ${item.unit}`} highlight={low ? (out ? 'overdue' : 'due') : null} />
              <Stat label="Reorder point" value={String(item.reorder_point)} />
              <Stat label="Reorder qty" value={String(item.reorder_qty)} />
              <Stat label="Unit cost" value={formatCurrency(item.unit_cost)} />
            </div>
          </div>
          <div className="shrink-0">
            <Button
              variant="danger"
              size="sm"
              onPress={() => setConfirmArchive(true)}
              isDisabled={item.archived}
            >
              <Archive size={14} />
              {item.archived ? 'Archived' : 'Archive'}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border-default flex gap-1">
        {(
          [
            { id: 'movements', label: 'Movements' },
            { id: 'used-on', label: 'Used on' },
            { id: 'edit', label: 'Edit' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`text-label font-medium px-3 py-2 -mb-px border-b-2 transition-colors ${
              tab === t.id
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'movements' && (
        <SectionHeader title="Movement history" />
      )}

      {tab === 'movements' &&
        (movementsLoading ? (
          <TableSkeleton rows={5} cols={4} showHeader={false} showSearch={false} />
        ) : (movements?.length ?? 0) === 0 ? (
          <div className="bg-surface-card border border-border-default rounded-xl p-5 text-label text-text-muted">
            No movements recorded yet.
          </div>
        ) : (
          <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <table aria-label="Stock movements" className="w-full text-label">
                <thead><tr>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">When</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">Type</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-right">Unit cost</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">Reason / notes</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">Job</th>
                </tr></thead>
                <tbody>
                  {movements!.map((m) => (
                    <tr key={m.id} id={m.id} className="border-b border-border-default last:border-b-0">
                      <td className="px-3 py-2 text-text-secondary">{formatDate(m.performed_at)}</td>
                      <td className="px-3 py-2">
                        <Chip size="sm" variant="soft" color={MOVEMENT_COLOR[m.movement_type] ?? 'default'}>
                          {MOVEMENT_TYPES[m.movement_type]}
                        </Chip>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${m.quantity >= 0 ? 'text-status-compliant' : 'text-status-overdue'}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                        {m.unit_cost_at_time != null ? formatCurrency(m.unit_cost_at_time) : '—'}
                      </td>
                      <td className="px-3 py-2 text-text-muted">{m.reason ?? m.notes ?? '—'}</td>
                      <td className="px-3 py-2">
                        {m.related_job_id ? (
                          <Link
                            to={`/dashboard/jobs/${m.related_job_id}`}
                            className="text-brand-500 hover:underline"
                          >
                            View job
                          </Link>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        ))}

      {tab === 'used-on' && (
        usageMovements.length === 0 ? (
          <div className="bg-surface-card border border-border-default rounded-xl p-5 text-label text-text-muted">
            This part hasn't been used on any jobs yet.
          </div>
        ) : (
          <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <table aria-label="Stock usage on jobs" className="w-full text-label">
                <thead><tr>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">When</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">Job</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-right">Qty used</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-right">Cost</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">Notes</th>
                </tr></thead>
                <tbody>
                  {usageMovements.map((m) => {
                    const qty = Math.abs(m.quantity)
                    const cost = qty * (m.unit_cost_at_time ?? 0)
                    return (
                      <tr key={m.id} id={m.id} className="border-b border-border-default last:border-b-0">
                        <td className="px-3 py-2 text-text-secondary">{formatDate(m.performed_at)}</td>
                        <td className="px-3 py-2">
                          <Link
                            to={`/dashboard/jobs/${m.related_job_id}`}
                            className="text-brand-500 hover:underline"
                          >
                            View job
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{qty}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(cost)}</td>
                        <td className="px-3 py-2 text-text-muted">{m.notes ?? ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'edit' && (
        <div className="bg-surface-card border border-border-default rounded-xl p-5 max-w-3xl">
          <StockItemForm
            organisationId={orgId}
            initial={item}
            submitLabel="Save changes"
            submitting={updateItem.isPending}
            onSubmit={async (draft) => {
              await updateItem.mutateAsync({ id: item.id, patch: draft })
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive item"
        message={`Archive "${item.name}"? It will be hidden from the active stock list. This is a soft delete.`}
        confirmLabel="Archive"
        variant="danger"
        onConfirm={async () => {
          await archiveItem.mutateAsync(item.id)
          setConfirmArchive(false)
          navigate('/dashboard/stock')
        }}
        onCancel={() => setConfirmArchive(false)}
      />
    </div>
  )
}

interface StatProps {
  label: string
  value: string
  highlight?: 'due' | 'overdue' | null
}

function Stat({ label, value, highlight }: StatProps) {
  const valueClass =
    highlight === 'overdue'
      ? 'text-status-overdue'
      : highlight === 'due'
        ? 'text-status-due-soon'
        : 'text-text-primary'
  return (
    <div>
      <p className="text-micro uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`text-[15px] font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}
