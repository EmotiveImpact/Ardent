import { useMemo, useState } from 'react'
import { Button, Chip, Modal } from '@haumea/ui'
import { AppCard, FormSelect } from '@haumea/ui'
import { Plus, Package } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useStockItems,
  useStockMovementsForJob,
  useRecordMovement,
} from '@/lib/stock/hooks'
import { sumMovementCost, type StockItem } from '@/lib/stock'
import { ListSkeleton } from '@/components/shared/skeletons'

interface PartsUsedPanelProps {
  jobId: string
  /** When true, only show the read-only list (e.g. for client portal). */
  readOnly?: boolean
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(n)
}

/**
 * Panel mounted on the job detail page that lists parts (stock movements with
 * `movement_type='usage'`) consumed by this job, plus an "Add part" CTA that
 * opens a modal for selecting an item, qty, and notes.
 *
 * Decrements stock_items.current_qty via the apply_stock_movement DB trigger.
 */
export function PartsUsedPanel({ jobId, readOnly = false }: PartsUsedPanelProps) {
  const { profile } = useAuth()
  const { data: movements, isLoading } = useStockMovementsForJob(jobId)
  const { data: items } = useStockItems()
  const recordMovement = useRecordMovement()

  const [showAdd, setShowAdd] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [qty, setQty] = useState<number>(1)
  const [notes, setNotes] = useState('')

  const itemsById = useMemo(() => {
    const m = new Map<string, StockItem>()
    for (const it of items ?? []) m.set(it.id, it)
    return m
  }, [items])

  const totalCost = useMemo(() => sumMovementCost(movements ?? []), [movements])

  const resetForm = () => {
    setSelectedItemId('')
    setQty(1)
    setNotes('')
  }

  const handleSubmit = async () => {
    if (!profile?.organisation_id || !selectedItemId || qty <= 0) return
    const item = itemsById.get(selectedItemId)
    await recordMovement.mutateAsync({
      organisation_id: profile.organisation_id,
      stock_item_id: selectedItemId,
      movement_type: 'usage',
      quantity: qty,
      unit_cost_at_time: item?.unit_cost ?? null,
      related_job_id: jobId,
      performed_by_user_id: profile.id,
      notes: notes.trim() || null,
    })
    resetForm()
    setShowAdd(false)
  }

  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-brand-500" />
          <h3 className="text-body font-semibold text-text-primary">Parts used</h3>
          {(movements?.length ?? 0) > 0 && (
            <Chip size="sm" variant="soft" color="default">
              {movements?.length}
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(movements?.length ?? 0) > 0 && (
            <span className="text-caption text-text-muted">
              Total <span className="text-text-primary font-medium">{formatCurrency(totalCost)}</span>
            </span>
          )}
          {!readOnly && (
            <Button variant="primary" size="sm" onPress={() => setShowAdd(true)}>
              <Plus size={14} />
              Add part
            </Button>
          )}
        </div>
      </div>

      <div className="px-5 pb-5">
        {isLoading ? (
          <ListSkeleton rows={2} withAvatar={false} framed={false} />
        ) : (movements?.length ?? 0) === 0 ? (
          <p className="text-caption text-text-muted py-2">No parts recorded for this job yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border-default">
            <table aria-label="Parts used on job" className="w-full text-label">
                <thead><tr>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">Part</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">SKU</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-right">Unit cost</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-right">Line total</th>
                  <th className="px-3 py-2 font-medium text-text-muted text-left">Notes</th>
                </tr></thead>
                <tbody>
                  {movements!.map((m) => {
                    const it = itemsById.get(m.stock_item_id)
                    const absQty = Math.abs(m.quantity)
                    const cost = m.unit_cost_at_time ?? 0
                    return (
                      <tr key={m.id} id={m.id} className="border-b border-border-default last:border-b-0">
                        <td className="px-3 py-2 text-text-primary">{it?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-text-muted font-mono text-caption">{it?.sku ?? '—'}</td>
                        <td className="px-3 py-2 text-text-secondary text-right tabular-nums">{absQty}</td>
                        <td className="px-3 py-2 text-text-secondary text-right tabular-nums">{formatCurrency(cost)}</td>
                        <td className="px-3 py-2 text-text-primary text-right tabular-nums font-medium">
                          {formatCurrency(absQty * cost)}
                        </td>
                        <td className="px-3 py-2 text-text-muted">{m.notes ?? ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add part — Wave 17C: HeroUI <Modal> */}
      <Modal.Backdrop
        isOpen={showAdd}
        onOpenChange={(next) => {
          if (!next) setShowAdd(false)
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Add part to job</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="space-y-3">
                <label className="block">
                  <span className="block text-caption font-medium text-text-muted mb-1">Stock item</span>
                  <FormSelect
                    value={selectedItemId}
                    onChange={setSelectedItemId}
                    ariaLabel="Stock item"
                    placeholder="Select a part…"
                    options={(items ?? [])
                      .filter((it) => !it.archived)
                      .map((it) => ({ value: it.id, label: `${it.name}${it.sku ? ` (${it.sku})` : ''} — ${it.current_qty} on hand` }))}
                  />
                </label>

                <label className="block">
                  <span className="block text-caption font-medium text-text-muted mb-1">Quantity</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={qty}
                    onChange={(e) => setQty(Math.max(0, parseInt(e.target.value || '0', 10)))}
                    className="w-full bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </label>

                <label className="block">
                  <span className="block text-caption font-medium text-text-muted mb-1">Notes (optional)</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </label>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={!selectedItemId || qty <= 0 || recordMovement.isPending}
                onPress={handleSubmit}
              >
                {recordMovement.isPending ? 'Saving…' : 'Add part'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </AppCard>
  )
}
