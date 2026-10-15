import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, Chip, Modal, Tabs, Tooltip } from '@haumea/ui'
import { Plus, Package, ArrowDownToLine, Settings2, Archive, X } from 'lucide-react'
import { SearchInput, FormSelect } from '@haumea/ui'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import { LowStockBanner } from '@/components/stock/low-stock-banner'
import { TableSkeleton } from '@/components/shared/skeletons'
import {
  useStockItems,
  useRecordMovement,
  useArchiveStockItem,
  useUpdateStockItem,
} from '@/lib/stock/hooks'
import {
  STOCK_CATEGORIES,
  isLowStock,
  isOutOfStock,
  adjustmentDelta,
  type StockCategory,
  type StockItem,
} from '@/lib/stock'

type ViewMode = 'all' | 'low' | 'out' | 'category'

const inputClass =
  'bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-navy-950/30'

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
}

interface MovementModalState {
  open: boolean
  mode: 'receipt' | 'adjustment'
  itemId: string
}

const initialMovementModal: MovementModalState = { open: false, mode: 'receipt', itemId: '' }

export default function StockListPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const orgId = profile?.organisation_id ?? ''
  const { data: items, isLoading } = useStockItems()
  const recordMovement = useRecordMovement()
  const archiveItem = useArchiveStockItem()
  const updateItem = useUpdateStockItem()

  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('all')
  const [categoryFilter, setCategoryFilter] = useState<StockCategory | ''>('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkCategory, setBulkCategory] = useState<StockCategory | ''>('')
  const [movementModal, setMovementModal] = useState<MovementModalState>(initialMovementModal)
  const [movementQty, setMovementQty] = useState<number>(0)
  const [movementSupplier, setMovementSupplier] = useState('')
  const [movementUnitCost, setMovementUnitCost] = useState<string>('')
  const [movementReason, setMovementReason] = useState('')

  const filtered = useMemo(() => {
    if (!items) return []
    let rows = items
    if (view === 'low') rows = rows.filter(isLowStock)
    if (view === 'out') rows = rows.filter(isOutOfStock)
    if (view === 'category' && categoryFilter) {
      rows = rows.filter((it) => it.category === categoryFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          (it.sku ?? '').toLowerCase().includes(q) ||
          (it.supplier_name ?? '').toLowerCase().includes(q) ||
          (it.location ?? '').toLowerCase().includes(q),
      )
    }
    return rows
  }, [items, view, categoryFilter, search])

  const lowStockCount = useMemo(() => (items ?? []).filter(isLowStock).length, [items])

  const openReceiveFor = (itemId: string) => {
    setMovementModal({ open: true, mode: 'receipt', itemId })
    setMovementQty(0)
    setMovementSupplier('')
    setMovementUnitCost('')
    setMovementReason('')
  }

  const openAdjustFor = (itemId: string) => {
    const it = items?.find((x) => x.id === itemId)
    setMovementModal({ open: true, mode: 'adjustment', itemId })
    setMovementQty(it?.current_qty ?? 0)
    setMovementReason('')
  }

  const submitMovement = async () => {
    if (!orgId || !movementModal.itemId) return
    const item = items?.find((x) => x.id === movementModal.itemId)
    if (!item) return

    if (movementModal.mode === 'receipt') {
      const unitCost =
        movementUnitCost.trim() === '' ? item.unit_cost : Number(movementUnitCost)
      await recordMovement.mutateAsync({
        organisation_id: orgId,
        stock_item_id: item.id,
        movement_type: 'receipt',
        quantity: Math.max(1, movementQty),
        unit_cost_at_time: unitCost,
        related_purchase_order: movementSupplier.trim() || null,
        notes: movementReason.trim() || null,
        performed_by_user_id: profile?.id ?? null,
      })
    } else {
      // Adjustment — movementQty is the new on-hand qty.
      const delta = adjustmentDelta(item.current_qty, movementQty)
      if (delta === 0) {
        setMovementModal(initialMovementModal)
        return
      }
      await recordMovement.mutateAsync({
        organisation_id: orgId,
        stock_item_id: item.id,
        movement_type: 'adjustment',
        quantity: delta,
        unit_cost_at_time: item.unit_cost,
        reason: movementReason.trim() || null,
        performed_by_user_id: profile?.id ?? null,
      })
    }
    setMovementModal(initialMovementModal)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const clearSelection = () => setSelectedIds([])

  const handleBulkArchive = async () => {
    for (const id of selectedIds) {
      await archiveItem.mutateAsync(id)
    }
    clearSelection()
  }

  const handleBulkCategoryChange = async () => {
    if (!bulkCategory) return
    for (const id of selectedIds) {
      await updateItem.mutateAsync({ id, patch: { category: bulkCategory } })
    }
    setBulkCategory('')
    clearSelection()
  }

  if (isLoading) {
    return <TableSkeleton rows={8} cols={5} />
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Stock' }]} />

      <SectionHeader
        variant="page"
        title="Stock & Parts"
        subtitle="Track inventory, receive deliveries, and link parts to jobs"
        action={
          <div className="flex items-center gap-2">
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/stock/new">
                <Plus size={14} />
                Add stock item
              </Link>
            </Button>
          </div>
        }
      />

      {/* Low-stock banner */}
      <LowStockBanner items={items} onView={() => setView('low')} />

      {/* View tabs + filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          selectedKey={view}
          onSelectionChange={(key) => setView(key as ViewMode)}
          aria-label="Stock view"
          className="w-max"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Stock view">
              {(
                [
                  { id: 'all', label: 'All', count: items?.length ?? 0 },
                  { id: 'low', label: 'Low stock', count: lowStockCount },
                  { id: 'out', label: 'Out of stock', count: (items ?? []).filter(isOutOfStock).length },
                  { id: 'category', label: 'By category' },
                ] as const
              ).map((v) => (
                <Tabs.Tab key={v.id} id={v.id}>
                  {v.label}
                  {'count' in v && typeof v.count === 'number' ? (
                    <span className="ml-1.5 opacity-60">({v.count})</span>
                  ) : null}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            ariaLabel="Search stock"
            placeholder="Search SKU, name, supplier…"
            className="w-64"
          />
          {view === 'category' && (
            <div className="w-48">
              <FormSelect<StockCategory | ''>
                value={categoryFilter}
                onChange={setCategoryFilter}
                ariaLabel="Category"
                placeholder="All categories"
                clearable
                options={Object.entries(STOCK_CATEGORIES).map(([k, label]) => ({ value: k as StockCategory, label }))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-2.5">
          <span className="text-caption text-text-primary">
            {selectedIds.length} selected
          </span>
          <div className="flex items-center gap-2">
            <div className="w-56">
              <FormSelect<StockCategory | ''>
                value={bulkCategory}
                onChange={setBulkCategory}
                ariaLabel="Change category"
                placeholder="Change category…"
                clearable
                options={Object.entries(STOCK_CATEGORIES).map(([k, label]) => ({ value: k as StockCategory, label }))}
              />
            </div>
            <Button variant="outline" size="sm" onPress={handleBulkCategoryChange} isDisabled={!bulkCategory}>
              Apply
            </Button>
            <Button variant="danger" size="sm" onPress={handleBulkArchive}>
              <Archive size={14} />
              Archive
            </Button>
            <Button variant="ghost" size="sm" onPress={clearSelection}>
              <X size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <EmptyState
            icon={Package}
            title={(items ?? []).length === 0 ? 'No stock items yet' : 'No matching items'}
            description={
              (items ?? []).length === 0
                ? 'Add your first stock item to start tracking parts and consumables.'
                : 'Try adjusting your search or filter.'
            }
            action={
              (items ?? []).length === 0 ? (
                <Button asChild variant="primary" size="sm">
                  <Link to="/dashboard/stock/new">
                    <Plus size={14} />
                    Add stock item
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
          <table aria-label="Stock items" className="w-full text-label">
              <thead><tr>
                <th className="px-3 py-2 w-10 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="rounded border-border-strong accent-brand-500"
                    checked={filtered.length > 0 && filtered.every((it) => selectedIds.includes(it.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(filtered.map((it) => it.id))
                      } else {
                        clearSelection()
                      }
                    }}
                  />
                </th>
                <th className="px-3 py-2 font-medium text-text-muted text-left">Item</th>
                <th className="px-3 py-2 font-medium text-text-muted text-left">SKU</th>
                <th className="px-3 py-2 font-medium text-text-muted text-left">Category</th>
                <th className="px-3 py-2 font-medium text-text-muted text-right">On hand</th>
                <th className="px-3 py-2 font-medium text-text-muted text-left">Unit</th>
                <th className="px-3 py-2 font-medium text-text-muted text-right">Unit cost</th>
                <th className="px-3 py-2 font-medium text-text-muted text-left">Location</th>
                <th className="px-3 py-2 font-medium text-text-muted text-left">Supplier</th>
                <th className="px-3 py-2 font-medium text-text-muted text-right">Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map((it) => (
                  <StockRow
                    key={it.id}
                    item={it}
                    selected={selectedIds.includes(it.id)}
                    onToggle={() => toggleSelect(it.id)}
                    onOpen={() => navigate(`/dashboard/stock/${it.id}`)}
                    onReceive={() => openReceiveFor(it.id)}
                    onAdjust={() => openAdjustFor(it.id)}
                  />
                ))}
              </tbody>
          </table>
        </div>
      )}

      {/* Movement modal — receive or adjust */}
      {movementModal.open && (
        <MovementModal
          mode={movementModal.mode}
          item={items?.find((x) => x.id === movementModal.itemId) ?? null}
          qty={movementQty}
          setQty={setMovementQty}
          supplier={movementSupplier}
          setSupplier={setMovementSupplier}
          unitCost={movementUnitCost}
          setUnitCost={setMovementUnitCost}
          reason={movementReason}
          setReason={setMovementReason}
          onCancel={() => setMovementModal(initialMovementModal)}
          onSubmit={submitMovement}
          submitting={recordMovement.isPending}
        />
      )}
    </div>
  )
}

interface StockRowProps {
  item: StockItem
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onReceive: () => void
  onAdjust: () => void
}

function StockRow({ item, selected, onToggle, onOpen, onReceive, onAdjust }: StockRowProps) {
  const low = isLowStock(item)
  const out = isOutOfStock(item)

  return (
    <tr id={item.id} className="border-b border-border-default last:border-b-0 hover:bg-surface-page/60">
      <td className="px-3 py-2 align-middle">
        <input
          type="checkbox"
          aria-label={`Select ${item.name}`}
          checked={selected}
          onChange={onToggle}
          className="rounded border-border-strong accent-brand-500"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-2.5 text-left group hover:text-text-accent transition-colors"
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt=""
              className="h-8 w-8 rounded object-cover border border-border-default"
            />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded bg-brand-500/10 text-brand-500 border border-border-default">
              <Package size={14} />
            </span>
          )}
          <span className="font-medium text-text-primary">{item.name}</span>
          {item.archived && (
            <Chip size="sm" variant="soft" color="default">
              archived
            </Chip>
          )}
        </button>
      </td>
      <td className="px-3 py-2 align-middle text-text-muted font-mono text-caption">
        {item.sku ?? '—'}
      </td>
      <td className="px-3 py-2 align-middle">
        <Chip size="sm" variant="soft" color="default">
          {STOCK_CATEGORIES[item.category] ?? item.category}
        </Chip>
      </td>
      <td className="px-3 py-2 align-middle text-right">
        <span
          className={`inline-flex items-center justify-end gap-2 tabular-nums ${
            out ? 'text-status-overdue font-semibold' : low ? 'text-status-due-soon font-semibold' : 'text-text-primary'
          }`}
        >
          {item.current_qty}
          {(low || out) && (
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ring-2 ${
                out ? 'bg-status-overdue ring-status-overdue/30' : 'bg-status-due-soon ring-status-due-soon/30'
              }`}
            />
          )}
        </span>
      </td>
      <td className="px-3 py-2 align-middle text-text-muted">{item.unit}</td>
      <td className="px-3 py-2 align-middle text-right tabular-nums text-text-secondary">
        {formatCurrency(item.unit_cost)}
      </td>
      <td className="px-3 py-2 align-middle text-text-muted">{item.location ?? '—'}</td>
      <td className="px-3 py-2 align-middle text-text-muted">{item.supplier_name ?? '—'}</td>
      <td className="px-3 py-2 align-middle">
        <div className="flex items-center justify-end gap-1">
          <Tooltip delay={400}>
            <Tooltip.Trigger>
              <button
                type="button"
                onClick={onReceive}
                className="p-1.5 rounded-md hover:bg-surface-page text-text-muted hover:text-text-primary transition-colors"
                aria-label={`Receive stock for ${item.name}`}
              >
                <ArrowDownToLine size={16} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="top">
              <Tooltip.Arrow />
              Receive
            </Tooltip.Content>
          </Tooltip>
          <Tooltip delay={400}>
            <Tooltip.Trigger>
              <button
                type="button"
                onClick={onAdjust}
                className="p-1.5 rounded-md hover:bg-surface-page text-text-muted hover:text-text-primary transition-colors"
                aria-label={`Adjust stock for ${item.name}`}
              >
                <Settings2 size={16} />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content placement="top">
              <Tooltip.Arrow />
              Adjust
            </Tooltip.Content>
          </Tooltip>
        </div>
      </td>
    </tr>
  )
}

interface MovementModalProps {
  mode: 'receipt' | 'adjustment'
  item: StockItem | null
  qty: number
  setQty: (n: number) => void
  supplier: string
  setSupplier: (s: string) => void
  unitCost: string
  setUnitCost: (s: string) => void
  reason: string
  setReason: (s: string) => void
  onCancel: () => void
  onSubmit: () => void
  submitting: boolean
}

function MovementModal({
  mode,
  item,
  qty,
  setQty,
  supplier,
  setSupplier,
  unitCost,
  setUnitCost,
  reason,
  setReason,
  onCancel,
  onSubmit,
  submitting,
}: MovementModalProps) {
  // Wave 17C — MovementModal migrated to HeroUI <Modal>.
  return (
    <Modal.Backdrop
      isOpen={!!item}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>
              {mode === 'receipt' ? 'Receive stock' : 'Adjust stock'}
            </Modal.Heading>
            {item && (
              <p className="text-caption text-text-muted mt-1">
                {item.name}
                {item.sku ? ` (${item.sku})` : ''} — currently <span className="text-text-primary font-medium">{item.current_qty} {item.unit}</span>
              </p>
            )}
          </Modal.Header>
          {item && (
            <>
              <Modal.Body>
                <div className="space-y-3">
                  <label className="block">
                    <span className="block text-caption font-medium text-text-muted mb-1">
                      {mode === 'receipt' ? 'Quantity received' : 'New on-hand quantity'}
                    </span>
                    <input
                      type="number"
                      min={mode === 'receipt' ? 1 : 0}
                      step={1}
                      value={qty}
                      onChange={(e) => setQty(Math.max(0, parseInt(e.target.value || '0', 10)))}
                      className={`w-full ${inputClass}`}
                    />
                  </label>

                  {mode === 'receipt' && (
                    <>
                      <label className="block">
                        <span className="block text-caption font-medium text-text-muted mb-1">Supplier / PO ref (optional)</span>
                        <input
                          type="text"
                          value={supplier}
                          onChange={(e) => setSupplier(e.target.value)}
                          className={`w-full ${inputClass}`}
                        />
                      </label>
                      <label className="block">
                        <span className="block text-caption font-medium text-text-muted mb-1">
                          Unit cost (optional override — defaults to {formatCurrency(item.unit_cost)})
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={unitCost}
                          onChange={(e) => setUnitCost(e.target.value)}
                          className={`w-full ${inputClass}`}
                        />
                      </label>
                    </>
                  )}

                  <label className="block">
                    <span className="block text-caption font-medium text-text-muted mb-1">
                      {mode === 'adjustment' ? 'Reason (e.g. stocktake, damaged)' : 'Notes (optional)'}
                    </span>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      className={`w-full ${inputClass}`}
                    />
                  </label>
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={onCancel}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={onSubmit} isDisabled={submitting}>
                  {submitting ? 'Saving…' : mode === 'receipt' ? 'Receive' : 'Adjust'}
                </Button>
              </Modal.Footer>
            </>
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
