// Critical-fix #4: Manual "Add payment" modal on the invoice detail page.
//
// Wraps the existing useCreatePayment hook. Used for partial payments,
// deposits, or recording out-of-band reconciliation. The modal does NOT
// flip the invoice status — that decision is left to the user via the
// separate "Mark Paid" button (which also writes a payment row).

import { Button, FieldError, Input, Label, Modal, TextArea, TextField } from '@haumea/ui'
import { FormSelect } from '@haumea/ui'
import { useEffect, useState } from 'react'
import { useCreatePayment } from '@/hooks/use-invoices'

interface AddPaymentModalProps {
  open: boolean
  onClose: () => void
  invoiceId: string
  organisationId: string
  /** Used as the default amount (e.g. invoice total) so the common case is one keystroke. */
  defaultAmount?: number
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'direct_debit', label: 'Direct debit' },
  { value: 'other', label: 'Other' },
]

export function AddPaymentModal({
  open,
  onClose,
  invoiceId,
  organisationId,
  defaultAmount,
}: AddPaymentModalProps) {
  const createPayment = useCreatePayment()
  const [amount, setAmount] = useState<string>(defaultAmount != null ? String(defaultAmount) : '')
  const [method, setMethod] = useState<string>('bank_transfer')
  const [reference, setReference] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [amountError, setAmountError] = useState<string | null>(null)

  // Re-sync the prefilled amount whenever the modal (re)opens or the outstanding
  // balance changes. The component stays mounted on the invoice page, so the
  // one-time useState initializer would otherwise keep showing the OLD balance
  // after a partial payment refetches a smaller `defaultAmount` — forcing the
  // user to clear/retype, and tripping the overpayment guard with a stale value.
  useEffect(() => {
    if (open) {
      setAmount(defaultAmount != null ? String(defaultAmount) : '')
      setAmountError(null)
    }
  }, [open, defaultAmount])

  const reset = () => {
    setAmount(defaultAmount != null ? String(defaultAmount) : '')
    setMethod('bank_transfer')
    setReference('')
    setNotes('')
    setAmountError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setAmountError('Enter a positive amount')
      return
    }
    // Guard against accidental overpayment — the amount can't exceed the
    // outstanding balance (the prefilled default). 0.005 epsilon for float dust.
    // NOTE: no `defaultAmount > 0` clause — a fully-paid invoice has a 0 balance,
    // and the guard must still block any further payment (the button is shown on
    // 'paid' invoices). Previously the >0 clause disabled the cap at 0, letting a
    // user record an arbitrary payment against a settled invoice.
    if (defaultAmount != null && parsed > defaultAmount + 0.005) {
      setAmountError(`Amount can't exceed the £${defaultAmount.toFixed(2)} outstanding balance`)
      return
    }
    setAmountError(null)
    const trimmedRef = reference.trim()
    const trimmedNotes = notes.trim()
    // The payments table doesn't have a notes column — concat into reference
    // when both supplied so we don't lose the data.
    const finalReference =
      trimmedNotes && trimmedRef
        ? `${trimmedRef} — ${trimmedNotes}`
        : trimmedNotes || trimmedRef || undefined

    await createPayment.mutateAsync({
      invoice_id: invoiceId,
      organisation_id: organisationId,
      amount: parsed,
      payment_method: method,
      reference: finalReference,
    })
    handleClose()
  }

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
    >
      <Modal.Container size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Add payment</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className="space-y-4">
              <TextField isInvalid={!!amountError}>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
                {amountError && <FieldError>{amountError}</FieldError>}
              </TextField>

              <div>
                <Label>Method</Label>
                <div className="mt-1">
                  <FormSelect
                    value={method}
                    onChange={setMethod}
                    ariaLabel="Method"
                    options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
                  />
                </div>
              </div>

              <TextField>
                <Label>Reference (optional)</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. BACS ref, cheque number"
                />
              </TextField>

              <TextField>
                <Label>Notes (optional)</Label>
                <TextArea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any additional context"
                />
              </TextField>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isDisabled={createPayment.isPending}
              onPress={handleSubmit}
            >
              {createPayment.isPending ? 'Saving…' : 'Save payment'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
