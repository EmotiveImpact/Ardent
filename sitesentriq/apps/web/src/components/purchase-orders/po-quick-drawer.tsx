// Sprint 3 / D1 — Right-side quick-capture drawer for new POs.
//
// Wave G1 a11y — migrated off the bespoke `fixed inset-0` div pile to
// HeroUI <Modal> (same canonical pattern as csv-import-modal.tsx). Modal
// is built on react-aria-components and gives us focus trap, ESC dismiss,
// click-outside dismiss, and aria-modal semantics for free. The visual
// "slides in from the right, panel layout" is preserved by overriding the
// container className — Modal.Container is just a positioning wrapper, and
// HeroUI accepts arbitrary className overrides.
//
// Why a drawer (not a modal, not a separate route):
//   The dispatcher's most common PO is "we need 4 of these from this
//   supplier, charge it to that job." Today that takes a full page
//   navigation, which means losing list context (filter chip, scroll
//   position). The Linear pattern — quick capture in a drawer,
//   escape-hatch to the full editor when needed — keeps the list
//   in view and makes the common case 5 seconds instead of 30.
//
// Scope:
//   This drawer captures the 80% case: PO number, supplier, single
//   line item (description / qty / unit cost / tax). Multi-line POs,
//   property/job linkage, delivery address, notes — all live in the
//   full /new editor, reachable via the "Open full editor" link in
//   the drawer footer.
//
// Behaviour:
//   - Slides in from the right; full-width on mobile.
//   - ESC + click-outside both close (handled by Modal.Backdrop).
//   - Focus is trapped inside the panel (handled by react-aria).
//   - Successful create closes + invalidates the parent list.
//   - PO number prefilled to a short timestamp suffix (matches the
//     pattern in /new); user can override.

import { useEffect } from 'react'
import { Link } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, Modal, TextField } from '@haumea/ui'
import { FormSelectController } from '@haumea/ui'
import { ExternalLink } from 'lucide-react'
import { useCreatePurchaseOrder, useSuppliers } from '@/hooks/use-purchase-orders'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@haumea/utils'

const quickPoSchema = z.object({
  po_number: z.string().min(1, 'PO number is required'),
  supplier_id: z.string().min(1, 'Pick a supplier'),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(0.01, 'Must be at least 0.01'),
  unit_cost: z.number().min(0, 'Cannot be negative'),
  tax_rate: z.number().min(0).max(100),
})

type QuickPoForm = z.infer<typeof quickPoSchema>

interface PoQuickDrawerProps {
  open: boolean
  onClose: () => void
}

export function PoQuickDrawer({ open, onClose }: PoQuickDrawerProps) {
  const { data: suppliers } = useSuppliers()
  const { profile } = useAuth()
  const createPo = useCreatePurchaseOrder()

  const form = useForm<QuickPoForm>({
    resolver: zodResolver(quickPoSchema),
    defaultValues: {
      po_number: `PO-${String(Date.now()).slice(-6)}`,
      supplier_id: '',
      description: '',
      quantity: 1,
      unit_cost: 0,
      tax_rate: 20,
    },
  })

  const { register, handleSubmit, watch, reset, control, formState: { errors } } = form
  const watched = watch()
  const subtotal = (watched.quantity || 0) * (watched.unit_cost || 0)
  const tax = subtotal * ((watched.tax_rate ?? 20) / 100)
  const total = subtotal + tax

  // Reset the form to a fresh PO number every time the drawer opens.
  // Otherwise re-opening shows the last submitted state, which is
  // confusing.
  useEffect(() => {
    if (open) {
      reset({
        po_number: `PO-${String(Date.now()).slice(-6)}`,
        supplier_id: '',
        description: '',
        quantity: 1,
        unit_cost: 0,
        tax_rate: 20,
      })
    }
  }, [open, reset])

  const onSubmit = (values: QuickPoForm) => {
    createPo.mutate(
      {
        // organisation_id is NOT NULL + RLS-checked and has no DB default/trigger,
        // so omitting it (as this drawer did) made every quick-PO insert fail.
        organisation_id: profile?.organisation_id,
        created_by: profile?.id,
        po_number: values.po_number,
        supplier_id: values.supplier_id,
        property_id: null,
        job_id: null,
        order_date: toLocalYmd(new Date()),
        expected_date: null,
        delivery_address: null,
        notes: null,
        // Wrap the single line into the lines array shape the create
        // mutation expects.
        lines: [
          {
            description: values.description,
            sku: undefined,
            quantity: values.quantity,
            unit_cost: values.unit_cost,
            tax_rate: values.tax_rate,
          },
        ],
        subtotal,
        tax,
        total,
      } as Parameters<typeof createPo.mutate>[0],
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {/* Right-anchored container so the dialog reads as a slide-in panel.
          Modal.Container accepts className overrides; we pin to the right
          edge and let the dialog itself fill the panel. */}
      <Modal.Container
        size="md"
        className="!fixed !inset-y-0 !right-0 !left-auto !top-0 !translate-x-0 !translate-y-0 !w-full sm:!w-[440px] !max-w-full !rounded-none"
      >
        <Modal.Dialog
          aria-label="New purchase order"
          className="h-full !rounded-none flex flex-col"
        >
          <Modal.Header className="flex items-center justify-between border-b border-border-default px-5 py-4">
            <Modal.Heading className="text-[15px] font-semibold text-text-primary">
              New purchase order
            </Modal.Heading>
            <Modal.CloseTrigger />
          </Modal.Header>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <Modal.Body className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              <TextField isInvalid={!!errors.po_number}>
                <Label>PO number</Label>
                <Input {...register('po_number')} />
                {errors.po_number && <FieldError>{errors.po_number.message}</FieldError>}
              </TextField>

              <div>
                <Label>Supplier</Label>
                <FormSelectController
                  control={control}
                  name="supplier_id"
                  ariaLabel="Supplier"
                  placeholder="Select a supplier"
                  options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))}
                />
                {errors.supplier_id && (
                  <p className="mt-1 text-caption text-status-overdue">{errors.supplier_id.message}</p>
                )}
              </div>

              <TextField isInvalid={!!errors.description}>
                <Label>Description</Label>
                <Input
                  {...register('description')}
                  placeholder="e.g. Boiler valve replacement"
                />
                {errors.description && <FieldError>{errors.description.message}</FieldError>}
              </TextField>

              <div className="grid grid-cols-3 gap-3">
                <TextField isInvalid={!!errors.quantity}>
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...register('quantity', { valueAsNumber: true })}
                  />
                  {errors.quantity && <FieldError>{errors.quantity.message}</FieldError>}
                </TextField>
                <TextField isInvalid={!!errors.unit_cost}>
                  <Label>Unit cost</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...register('unit_cost', { valueAsNumber: true })}
                  />
                  {errors.unit_cost && <FieldError>{errors.unit_cost.message}</FieldError>}
                </TextField>
                <TextField isInvalid={!!errors.tax_rate}>
                  <Label>VAT %</Label>
                  <Input
                    type="number"
                    step="0.5"
                    {...register('tax_rate', { valueAsNumber: true })}
                  />
                  {errors.tax_rate && <FieldError>{errors.tax_rate.message}</FieldError>}
                </TextField>
              </div>

              <div className="bg-surface-page rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-caption text-text-muted">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-caption text-text-muted">
                  <span>VAT</span>
                  <span>{formatCurrency(tax)}</span>
                </div>
                <div className="flex justify-between text-body font-semibold text-text-primary border-t border-border-subtle pt-1.5">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <Link
                to="/dashboard/purchase-orders/new"
                className="inline-flex items-center gap-1 text-caption text-brand-600 hover:underline"
                onClick={onClose}
              >
                Need property, job, multi-line, or notes? Open full editor
                <ExternalLink size={11} />
              </Link>
            </Modal.Body>

            <Modal.Footer className="px-5 py-3 border-t border-border-default flex items-center gap-2 justify-end bg-surface-card">
              <Button variant="outline" size="sm" onPress={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isDisabled={createPo.isPending}
              >
                {createPo.isPending ? 'Creating…' : 'Create PO'}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
