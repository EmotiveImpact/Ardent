import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button, Chip, Input } from '@haumea/ui'
import { CheckCircle2, Download, Mail, Send, Truck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { usePurchaseOrder, useUpdatePurchaseOrderWorkflow } from '@/hooks/use-purchase-orders'
import { sendPurchaseOrder } from '@/lib/email'
import { generatePurchaseOrderPdf } from '@/lib/pdf'
import { formatCurrency, formatDate } from '@haumea/utils'
import type { PurchaseOrder, PurchaseOrderLine } from '@haumea/types'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

const STATUS_COLORS: Record<string, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  draft: 'default',
  sent: 'accent',
  approved: 'warning',
  received: 'success',
  cancelled: 'danger',
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: purchaseOrder, isLoading, error } = usePurchaseOrder(id!)
  const updateWorkflow = useUpdatePurchaseOrderWorkflow()
  const [supplierEmail, setSupplierEmail] = useState('')
  const [sending, setSending] = useState(false)

  if (isLoading) {
    return <DetailPageSkeleton withTabs={false} sideCards={1} />
  }

  if (error || !purchaseOrder) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/purchase-orders" className="text-label text-brand-500 hover:text-brand-600">
          Back to purchase orders
        </Link>
        <p className="text-label text-status-overdue">{(error as Error)?.message || 'Purchase order not found.'}</p>
      </div>
    )
  }

  const setStatus = (status: PurchaseOrder['status']) => {
    const timestamp =
      status === 'approved'
        ? { approved_at: new Date().toISOString() }
        : status === 'received'
          ? { received_at: new Date().toISOString() }
          : status === 'cancelled'
            ? { cancelled_at: new Date().toISOString() }
            : {}
    updateWorkflow.mutate({ id: purchaseOrder.id, status, ...timestamp })
  }

  const lines = purchaseOrder.purchase_order_lines ?? []
  const effectiveSupplierEmail = supplierEmail || purchaseOrder.supplier_email || purchaseOrder.suppliers?.contact_email || ''

  const handleEmailSupplier = async () => {
    if (!effectiveSupplierEmail) {
      toast.error('Add a supplier email before sending')
      return
    }

    setSending(true)
    const result = await sendPurchaseOrder({
      to: effectiveSupplierEmail,
      supplierName: purchaseOrder.suppliers?.name ?? 'Supplier',
      poNumber: purchaseOrder.po_number,
      totalAmount: formatCurrency(purchaseOrder.total ?? 0),
      orderDate: purchaseOrder.order_date ? formatDate(purchaseOrder.order_date) : undefined,
      expectedDate: purchaseOrder.expected_date ? formatDate(purchaseOrder.expected_date) : undefined,
      deliveryAddress: purchaseOrder.delivery_address ?? undefined,
      poUrl: `${window.location.origin}/dashboard/purchase-orders/${purchaseOrder.id}`,
    })
    setSending(false)

    if (!result.success) {
      toast.error('PO email could not be sent', {
        description: result.error || 'Check send-email function deployment',
      })
      return
    }

    await updateWorkflow.mutateAsync({
      id: purchaseOrder.id,
      status: purchaseOrder.status === 'draft' ? 'sent' : purchaseOrder.status,
      supplier_email: effectiveSupplierEmail,
      emailed_to: effectiveSupplierEmail,
      sent_at: purchaseOrder.sent_at ?? new Date().toISOString(),
      last_emailed_at: new Date().toISOString(),
    })
    toast.success('Purchase order emailed to supplier')
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Purchase Orders', path: '/dashboard/purchase-orders' },
          { label: purchaseOrder.po_number },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <PageHeader title={purchaseOrder.po_number} />
            <Chip variant="soft" color={STATUS_COLORS[purchaseOrder.status] ?? 'default'} size="sm">
              {purchaseOrder.status}
            </Chip>
          </div>
          <p className="text-label text-text-muted mt-0.5">
            {purchaseOrder.suppliers?.name ?? 'Unknown supplier'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() =>
              generatePurchaseOrderPdf({
                po_number: purchaseOrder.po_number,
                supplier_name: purchaseOrder.suppliers?.name ?? 'Supplier',
                property_name: purchaseOrder.properties?.name,
                job_title: purchaseOrder.jobs?.title,
                order_date: purchaseOrder.order_date,
                expected_date: purchaseOrder.expected_date,
                delivery_address: purchaseOrder.delivery_address,
                notes: purchaseOrder.notes,
                lines,
                subtotal: purchaseOrder.subtotal ?? 0,
                tax: purchaseOrder.tax ?? 0,
                total: purchaseOrder.total ?? 0,
              })
            }
          >
            <Download size={14} />
            PDF
          </Button>
          {purchaseOrder.status === 'draft' && (
            <Button variant="primary" size="sm" isDisabled={updateWorkflow.isPending} onPress={() => setStatus('sent')}>
              <Send size={14} />
              Mark Sent
            </Button>
          )}
          {purchaseOrder.status === 'sent' && (
            <Button variant="primary" size="sm" isDisabled={updateWorkflow.isPending} onPress={() => setStatus('approved')}>
              <CheckCircle2 size={14} />
              Approve
            </Button>
          )}
          {purchaseOrder.status === 'approved' && (
            <Button variant="primary" size="sm" isDisabled={updateWorkflow.isPending} onPress={() => setStatus('received')}>
              <Truck size={14} />
              Mark Received
            </Button>
          )}
          {purchaseOrder.status !== 'cancelled' && purchaseOrder.status !== 'received' && (
            <Button variant="danger" size="sm" isDisabled={updateWorkflow.isPending} onPress={() => setStatus('cancelled')}>
              <XCircle size={14} />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <InfoCard label="Supplier" value={purchaseOrder.suppliers?.name ?? '-'} />
        <InfoCard label="Property" value={purchaseOrder.properties?.name ?? '-'} />
        <InfoCard label="Job" value={purchaseOrder.jobs?.title ?? '-'} />
        <InfoCard label="Order Date" value={purchaseOrder.order_date ? formatDate(purchaseOrder.order_date) : '-'} />
        <InfoCard label="Expected Date" value={purchaseOrder.expected_date ? formatDate(purchaseOrder.expected_date) : '-'} />
        <InfoCard label="Total" value={formatCurrency(purchaseOrder.total ?? 0)} strong />
      </div>

      <section className="bg-surface-card border border-border-default rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex-1">
            <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
              Supplier Email
            </label>
            <Input
              type="email"
              value={effectiveSupplierEmail}
              onChange={(event) => setSupplierEmail(event.target.value)}
              placeholder="orders@supplier.com"
            />
            {purchaseOrder.last_emailed_at && (
              <p className="text-caption text-text-muted mt-1">
                Last emailed {formatDate(purchaseOrder.last_emailed_at)} to {purchaseOrder.emailed_to}
              </p>
            )}
          </div>
          <Button
            variant="primary"
            isDisabled={sending || updateWorkflow.isPending}
            onPress={handleEmailSupplier}
          >
            <Mail size={14} />
            {sending ? 'Sending...' : 'Email PO'}
          </Button>
        </div>
      </section>

      <section className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">Line Items</h2>
        </div>
        <table aria-label="Purchase order lines" className="overflow-hidden">
            <thead><tr>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Description</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">SKU</th>
              <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Qty</th>
              <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Unit Cost</th>
              <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Tax</th>
              <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Total</th>
            </tr></thead>
            <tbody>
              {lines.map((line: PurchaseOrderLine) => (
                <tr key={line.id} id={line.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3 text-label font-medium text-text-primary">{line.description}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{line.sku || '-'}</td>
                  <td className="px-4 py-3 text-label text-text-secondary text-right">{line.quantity}</td>
                  <td className="px-4 py-3 text-label text-text-secondary text-right">{formatCurrency(line.unit_cost)}</td>
                  <td className="px-4 py-3 text-label text-text-secondary text-right">{formatCurrency(line.line_tax)}</td>
                  <td className="px-4 py-3 text-label font-medium text-text-primary text-right">{formatCurrency(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
        </table>
        <div className="border-t border-border-subtle p-5 space-y-1 text-right">
          <p className="text-label text-text-secondary">Subtotal: <span className="font-medium text-text-primary">{formatCurrency(purchaseOrder.subtotal)}</span></p>
          <p className="text-label text-text-secondary">Tax: <span className="font-medium text-text-primary">{formatCurrency(purchaseOrder.tax)}</span></p>
          <p className="text-[16px] font-semibold text-text-primary">Total: {formatCurrency(purchaseOrder.total)}</p>
        </div>
      </section>

      {(purchaseOrder.delivery_address || purchaseOrder.notes) && (
        <section className="bg-surface-card border border-border-default rounded-xl p-5">
          {purchaseOrder.delivery_address && (
            <div>
              <h2 className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Delivery Address</h2>
              <p className="text-label text-text-secondary mt-1 whitespace-pre-wrap">{purchaseOrder.delivery_address}</p>
            </div>
          )}
          {purchaseOrder.notes && (
            <div className="mt-4">
              <h2 className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Notes</h2>
              <p className="text-label text-text-secondary mt-1 whitespace-pre-wrap">{purchaseOrder.notes}</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function InfoCard({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-surface-card border border-border-default rounded-xl p-5">
      <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">{label}</p>
      <p className={`mt-1 text-label ${strong ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
        {value}
      </p>
    </div>
  )
}
