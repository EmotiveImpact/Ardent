import { useParams, useNavigate } from 'react-router'
import { AlertDialog, Button, Chip, Dropdown } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { useState } from 'react'
import { Send, Check, Bell, Trash2, FileText, CreditCard, Download, Plug, Clock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  useInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
  usePushInvoiceToAccounting,
  useMarkInvoicePaid,
} from '@/hooks/use-invoices'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { PullFromTimeModal } from '@/components/time/pull-from-time-modal'
import { AddPaymentModal } from '@/components/invoices/add-payment-modal'
import { formatCurrency, formatDate } from '@haumea/utils'
import { generateInvoicePdf } from '@/lib/pdf'
import { sendInvoiceReminder } from '@/lib/email'
import { getInvoiceTotalPaid, getOutstandingInvoiceBalance } from '@/lib/invoices/balance'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { AccountingStatusChip } from '@/components/shared/accounting-status-chip'
import { InvoiceSyncPanel } from '@/components/invoices/invoice-sync-panel'
import { useXeroConnection, useQuickBooksConnection } from '@/lib/integrations/accounting/hooks'
import type { AccountingProvider, AccountingStatus } from '@/lib/integrations/accounting/types'
import type { InvoiceLine, Payment } from '@haumea/types'

const STATUS_CHIP_COLOR: Record<string, 'default' | 'accent' | 'success' | 'danger'> = {
  draft: 'default',
  sent: 'accent',
  paid: 'success',
  overdue: 'danger',
}

// Resolve the best email for invoice correspondence: prefer the dedicated
// billing email, fall back to the general contact email. Accepts unknown
// because the embedded `clients` relation is loosely typed by the Supabase
// query builder; we narrow it here.
function getClientEmail(clients: unknown): string | undefined {
  const c = clients as { billing_email?: string | null; contact_email?: string | null } | null | undefined
  return c?.billing_email || c?.contact_email || undefined
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: invoice, isLoading } = useInvoice(id!)
  const updateInvoice = useUpdateInvoice()
  const deleteInvoice = useDeleteInvoice()
  const pushInvoice = usePushInvoiceToAccounting()
  const markPaid = useMarkInvoicePaid()
  const { data: xeroConn } = useXeroConnection()
  const { data: qbConn } = useQuickBooksConnection()
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [sendingInvoice, setSendingInvoice] = useState(false)
  const [lastReminded, setLastReminded] = useState<string | null>(null)
  const [showPullTimeModal, setShowPullTimeModal] = useState(false)
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const queryClient = useQueryClient()

  if (isLoading) return <DetailPageSkeleton withTabs={false} />
  if (!invoice) return <p className="text-label text-text-muted">Invoice not found.</p>

  const lines = invoice.invoice_lines || []
  const payments = invoice.payments || []
  // Derive the breakdown from the STORED invoice amounts, not a hardcoded 20%.
  // There is no DB trigger on invoices, so invoice.subtotal/tax/total are the
  // source of truth (e.g. a quote→invoice conversion carries the quote's actual
  // VAT, which may not be 20%). The old `subtotal * 0.2` invented tax and made
  // the PDF/email disagree with the Amount Due. Mirrors the portal invoice page.
  const lineSubtotal = lines.reduce((sum: number, l: InvoiceLine) => sum + (l.total || 0), 0)
  const subtotal = invoice.subtotal ?? lineSubtotal
  const total = invoice.total ?? subtotal
  const tax = invoice.tax ?? Math.max(0, total - subtotal)
  const totalPaid = getInvoiceTotalPaid(payments)
  const outstandingBalance = getOutstandingInvoiceBalance(invoice.total, payments)

  const handleStatusChange = (status: string, extra?: Record<string, string>) => {
    updateInvoice.mutate({ id: invoice.id, status, ...extra })
  }

  // "Send Invoice" flips the status to 'sent' AND emails the client the
  // invoice via the existing send-email edge function (same path the
  // "Send Reminder" button uses). The email links to the client portal
  // invoice page so they can view/pay. Email is best-effort — the status
  // update is the source of truth and we never block it on the email.
  const handleSendInvoice = async () => {
    handleStatusChange('sent')

    const clientEmail = getClientEmail(invoice.clients)
    if (!clientEmail) {
      toast.info('Invoice marked as sent, but no client email found to send it to')
      return
    }

    setSendingInvoice(true)
    try {
      const result = await sendInvoiceReminder({
        to: clientEmail,
        clientName: invoice.clients?.name || 'Client',
        invoiceNumber: invoice.invoice_number,
        amountDue: formatCurrency(total),
        dueDate: invoice.due_date ? formatDate(invoice.due_date) : 'N/A',
        invoiceUrl: `${window.location.origin}/portal/invoices/${invoice.id}`,
      })
      if (result.success) {
        toast.success('Invoice sent to client via email')
      } else {
        toast.error('Invoice marked as sent, but email could not be sent', {
          description: result.error || 'Edge Function may not be deployed',
        })
      }
    } catch (error) {
      toast.error('Invoice marked as sent, but email could not be sent', {
        description: error instanceof Error ? error.message : 'Unexpected email failure',
      })
    } finally {
      setSendingInvoice(false)
    }
  }

  const handleDelete = () => {
    setConfirmDeleteOpen(true)
  }

  const handleConfirmDelete = () => {
    setConfirmDeleteOpen(false)
    deleteInvoice.mutate(invoice.id, { onSuccess: () => navigate('/dashboard/invoices') })
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Invoices', path: '/dashboard/invoices' },
        { label: invoice.invoice_number },
      ]} />

      <div className="flex items-center gap-4 flex-wrap">
        <PageHeader title={invoice.invoice_number} />
        <Chip variant="soft" color={STATUS_CHIP_COLOR[invoice.status] || 'default'} size="sm">
          {invoice.status}
        </Chip>
        <AccountingStatusChip
          status={(invoice as { accounting_status?: AccountingStatus }).accounting_status}
          provider={(invoice as { accounting_provider?: AccountingProvider }).accounting_provider}
          errorMessage={(invoice as { accounting_error?: string | null }).accounting_error}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AppCard padding="md">
          <h3 className="text-body font-semibold text-text-primary mb-4">Invoice Info</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Client</dt>
              <dd className="text-label text-text-secondary mt-0.5">{invoice.clients?.name || '-'}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Created</dt>
              <dd className="text-label text-text-secondary mt-0.5">{formatDate(invoice.created_at)}</dd>
            </div>
            {invoice.due_date && (
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Due Date</dt>
                <dd className="text-label text-text-secondary mt-0.5">{formatDate(invoice.due_date)}</dd>
              </div>
            )}
            {invoice.paid_date && (
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Paid Date</dt>
                <dd className="text-label text-text-secondary mt-0.5">{formatDate(invoice.paid_date)}</dd>
              </div>
            )}
          </dl>
        </AppCard>

        <AppCard padding="md">
          <h3 className="text-body font-semibold text-text-primary mb-4">Actions</h3>
          <div className="flex flex-wrap gap-2">
            {invoice.status === 'draft' && (
              <Button variant="primary" size="sm" isDisabled={sendingInvoice} onPress={handleSendInvoice}>
                <Send size={14} /> {sendingInvoice ? 'Sending...' : 'Send Invoice'}
              </Button>
            )}
            {(invoice.status === 'sent' || invoice.status === 'overdue') && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={markPaid.isPending}
                  onPress={() =>
                    markPaid.mutate({
                      id: invoice.id,
                      organisation_id: invoice.organisation_id,
                      total: outstandingBalance,
                    })
                  }
                >
                  <Check size={14} /> {markPaid.isPending ? 'Marking…' : 'Mark Paid'}
                </Button>
                <Button variant="secondary" size="sm" onPress={() => setShowReminderModal(true)}>
                  <Bell size={14} /> Send Reminder
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onPress={() =>
                generateInvoicePdf({
                  invoice_number: invoice.invoice_number,
                  created_at: invoice.created_at,
                  due_date: invoice.due_date,
                  client_name: invoice.clients?.name || 'Client',
                  lines: lines.map((l: InvoiceLine) => ({
                    description: l.description,
                    quantity: l.quantity,
                    unit_price: l.unit_price,
                    total: l.total,
                  })),
                  subtotal,
                  tax,
                  total,
                })
              }
            >
              <Download size={14} /> Download PDF
            </Button>
            {(xeroConn || qbConn) && (
              <Dropdown>
                <Dropdown.Trigger>
                  <Button variant="outline" size="sm" isDisabled={pushInvoice.isPending}>
                    <Plug size={14} /> {pushInvoice.isPending ? 'Pushing…' : 'Push to Accounting'}
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover>
                  <Dropdown.Menu aria-label="Push to accounting">
                    <>
                      {xeroConn && (
                        <Dropdown.Item
                          id="push-xero"
                          textValue="Push to Xero"
                          onAction={() => pushInvoice.mutate({ invoice_id: invoice.id, provider: 'xero' })}
                        >
                          Push to Xero
                        </Dropdown.Item>
                      )}
                      {qbConn && (
                        <Dropdown.Item
                          id="push-qb"
                          textValue="Push to QuickBooks"
                          onAction={() => pushInvoice.mutate({ invoice_id: invoice.id, provider: 'quickbooks' })}
                        >
                          Push to QuickBooks
                        </Dropdown.Item>
                      )}
                    </>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}
            <Button variant="danger" size="sm" onPress={handleDelete}>
              <Trash2 size={14} /> Delete
            </Button>
          </div>
          {lastReminded && (
            <p className="text-caption text-text-muted mt-3">Last reminded: {formatDate(lastReminded)}</p>
          )}
        </AppCard>
      </div>

      <AppCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-body font-semibold text-text-primary">Line Items</h3>
          {(invoice.status === 'draft' || invoice.status === 'sent') && (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => setShowPullTimeModal(true)}
            >
              <Clock size={14} /> Pull from time entries
            </Button>
          )}
        </div>
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <FileText size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
            <p className="text-label text-text-muted">No line items.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Invoice Line Items" className="overflow-hidden">
                <thead><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Description</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Qty</th>
                  <th id="unitPrice" className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Unit Price</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Total</th>
                </tr></thead>
                <tbody>
                  {lines.map((line: InvoiceLine) => (
                    <tr key={line.id} id={line.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-label text-text-secondary">{line.description}</td>
                      <td className="px-4 py-3 text-label text-text-secondary text-right">{line.quantity}</td>
                      <td className="px-4 py-3 text-label font-medium text-text-primary text-right">{formatCurrency(line.unit_price)}</td>
                      <td className="px-4 py-3 text-label font-medium text-text-primary text-right">{formatCurrency(line.total)}</td>
                    </tr>
                  ))}
                </tbody>
            </table>

            <div className="border-t border-border-subtle mt-2 pt-4 space-y-1 text-right">
              <div className="flex justify-end gap-8">
                <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Subtotal</span>
                <span className="text-label font-medium text-text-primary">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-end gap-8">
                <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">
                  VAT
                </span>
                <span className="text-label font-medium text-text-primary">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-end gap-8 pt-1">
                <span className="text-body font-semibold text-text-primary">Total</span>
                <span className="text-body font-semibold text-text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        )}
      </AppCard>

      <AppCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-body font-semibold text-text-primary">Payments</h3>
          {invoice.status !== 'draft' && (
            <Button variant="secondary" size="sm" onPress={() => setShowAddPaymentModal(true)}>
              <Plus size={14} /> Add payment
            </Button>
          )}
        </div>
        {payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CreditCard size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
            <p className="text-label text-text-muted">No payments recorded.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table aria-label="Payments" className="overflow-hidden">
                <thead><tr>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Date</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Method</th>
                  <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Reference</th>
                  <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Amount</th>
                </tr></thead>
                <tbody>
                  {payments.map((payment: Payment) => (
                    <tr key={payment.id} id={payment.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 text-label text-text-secondary">{formatDate(payment.paid_at)}</td>
                      <td className="px-4 py-3 text-label text-text-secondary">{payment.payment_method || '-'}</td>
                      <td className="px-4 py-3 text-label text-text-secondary">{payment.reference || '-'}</td>
                      <td className="px-4 py-3 text-label font-medium text-text-primary text-right">{formatCurrency(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
            </table>
            </div>
            <div className="border-t border-border-subtle mt-2 pt-3 text-right">
              <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mr-4">Total Paid:</span>
              <span className="text-label font-medium text-text-primary">{formatCurrency(totalPaid)}</span>
            </div>
          </>
        )}
      </AppCard>

      {/* Trust wave W1-T3: per-invoice accounting sync history + retry */}
      <InvoiceSyncPanel
        invoiceId={invoice.id}
        accountingStatus={(invoice as { accounting_status?: AccountingStatus }).accounting_status}
        accountingProvider={(invoice as { accounting_provider?: AccountingProvider }).accounting_provider}
        accountingError={(invoice as { accounting_error?: string | null }).accounting_error}
        accountingPushedAt={(invoice as { accounting_pushed_at?: string | null }).accounting_pushed_at}
        updatedAt={(invoice as { updated_at?: string | null }).updated_at}
      />

      {/* Critical-fix #4: manual payment recording modal */}
      <AddPaymentModal
        open={showAddPaymentModal}
        onClose={() => setShowAddPaymentModal(false)}
        invoiceId={invoice.id}
        organisationId={invoice.organisation_id}
        defaultAmount={outstandingBalance}
      />

      {/* Pull from time entries modal — Wave 12 / Task 107 */}
      {showPullTimeModal && (
        <PullFromTimeModal
          invoiceId={invoice.id}
          clientId={invoice.client_id}
          onClose={() => setShowPullTimeModal(false)}
          onLinesGenerated={async (newLines) => {
            const startSort = lines.length
            const rows = newLines.map((l, idx) => ({
              invoice_id: invoice.id,
              description: l.description,
              quantity: l.quantity,
              unit_price: l.unit_price,
              total: l.total,
              sort_order: startSort + idx,
            }))
            const { error } = await supabase.from('invoice_lines').insert(rows)
            if (error) {
              toast.error(error.message || 'Failed to add lines')
              // THROW (don't just return): the caller (PullFromTimeModal) marks
              // the time entries billed only if this resolves. A bare return
              // resolves the promise, so on failure the entries would be flipped
              // to billed against an invoice that never got the lines —
              // permanently removing them from the unbilled pool.
              throw error
            }

            // Roll the new lines into the invoice HEADER totals. There is no DB
            // trigger that recomputes invoices.subtotal/tax/total from
            // invoice_lines, and every downstream consumer (the footer, the PDF,
            // the Amount Due that Mark Paid uses, the reminder email) reads the
            // STORED header amounts — so inserting lines without updating the
            // header shows the pulled time as a line yet never bills it
            // (revenue loss). Preserve the invoice's effective VAT rate.
            const round2 = (n: number) => Math.round(n * 100) / 100
            const addedSubtotal = rows.reduce((s, r) => s + (r.total || 0), 0)
            const newSubtotal = round2(subtotal + addedSubtotal)
            const effectiveRate = subtotal > 0 ? tax / subtotal : 0.2
            const newTax = round2(newSubtotal * effectiveRate)
            const newTotal = round2(newSubtotal + newTax)
            const { error: updErr } = await supabase
              .from('invoices')
              .update({ subtotal: newSubtotal, tax: newTax, total: newTotal })
              .eq('id', invoice.id)
            if (updErr) {
              toast.error(updErr.message || 'Lines added, but updating invoice totals failed')
              // Throw so the caller does NOT mark the entries billed — the lines
              // landed but the header is stale; treat the whole pull as failed.
              throw updErr
            }

            toast.success(`${rows.length} line${rows.length !== 1 ? 's' : ''} added from time entries`)
            queryClient.invalidateQueries({ queryKey: ['invoices', invoice.id] })
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
          }}
        />
      )}

      {/* Reminder confirmation — Wave 17C: HeroUI <AlertDialog> */}
      <AlertDialog.Backdrop
        isOpen={showReminderModal}
        onOpenChange={(next) => {
          if (!next) setShowReminderModal(false)
        }}
        isDismissable
        isKeyboardDismissDisabled={false}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-md">
            <AlertDialog.Header>
              <AlertDialog.Icon status="accent">
                <Bell className="size-5" />
              </AlertDialog.Icon>
              <AlertDialog.Heading>Send Payment Reminder</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="text-label text-text-secondary">
                Send a payment reminder to <span className="font-medium text-text-primary">{invoice.clients?.name || 'the client'}</span> for invoice <span className="font-medium text-text-primary">{invoice.invoice_number}</span> ({formatCurrency(outstandingBalance)})?
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                variant="tertiary"
                onPress={() => setShowReminderModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={sendingReminder}
                onPress={async () => {
                  setSendingReminder(true)
                  // Use the client's billing email (or contact email) if available, otherwise show a warning
                  const clientEmail = getClientEmail(invoice.clients)
                  if (!clientEmail) {
                    toast.error('No client email address found')
                    setSendingReminder(false)
                    setShowReminderModal(false)
                    return
                  }
                  const result = await sendInvoiceReminder({
                    to: clientEmail,
                    clientName: invoice.clients?.name || 'Client',
                    invoiceNumber: invoice.invoice_number,
                    // Bill the REMAINING balance, not the gross total — partial
                    // payments (recorded via Add Payment) don't change invoice
                    // status, so a 'sent'/'overdue' invoice can already be part-paid.
                    amountDue: formatCurrency(outstandingBalance),
                    dueDate: invoice.due_date ? formatDate(invoice.due_date) : 'N/A',
                    invoiceUrl: `${window.location.origin}/portal/invoices/${invoice.id}`,
                  })
                  if (result.success) {
                    toast.success('Payment reminder sent successfully')
                    setLastReminded(new Date().toISOString())
                  } else {
                    toast.error('Failed to send reminder email', {
                      description: result.error || 'Edge Function may not be deployed',
                    })
                  }
                  setSendingReminder(false)
                  setShowReminderModal(false)
                }}
              >
                {sendingReminder ? 'Sending...' : 'Send Reminder'}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice ${invoice.invoice_number}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  )
}
