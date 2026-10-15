import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { Button, Chip, Spinner } from '@haumea/ui'
import { Download, Receipt, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useInvoice } from '@/hooks/use-invoices'
import { generateInvoicePdf } from '@/lib/pdf'
import { formatDate, formatCurrency } from '@haumea/utils'
import type { InvoiceLine, Payment } from '@haumea/types'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  draft: 'default',
  sent: 'accent',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'default',
}

export default function PortalInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: invoice, isLoading, isError } = useInvoice(id!)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (!invoice || downloading) return
    setDownloading(true)
    try {
      const lines = (invoice.invoice_lines ?? []) as InvoiceLine[]
      const subtotal = lines.reduce((s, l) => s + (l.total ?? 0), 0)
      const total = invoice.total ?? subtotal
      const tax = Math.max(0, total - subtotal)
      generateInvoicePdf({
        invoice_number: invoice.invoice_number,
        created_at: invoice.created_at,
        due_date: invoice.due_date,
        client_name: invoice.clients?.name || 'Client',
        lines: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          total: l.total,
        })),
        subtotal,
        tax,
        total,
      })
    } catch (err) {
      toast.error((err as Error).message || 'Could not generate PDF')
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading) return <DetailPageSkeleton withTabs={false} />

  if (isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Receipt size={28} strokeWidth={1.5} className="mb-2" />
          <p className="text-label text-text-muted">Could not load this invoice</p>
          <p className="text-micro text-text-muted mt-1">Please try again later</p>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <Receipt size={28} strokeWidth={1.5} className="mb-2" />
          <p className="text-label text-text-muted">Invoice not found</p>
          <p className="text-micro text-text-muted mt-1">It may have been removed or you no longer have access</p>
        </div>
      </div>
    )
  }

  const lines = (invoice.invoice_lines ?? []) as InvoiceLine[]
  const payments = (invoice.payments ?? []) as Payment[]
  const subtotal = lines.reduce((s, l) => s + (l.total ?? 0), 0)
  const total = invoice.total ?? subtotal
  const tax = Math.max(0, total - subtotal)
  const amountPaid = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const balanceDue = Math.max(0, total - amountPaid)

  return (
    <div className="space-y-6">
      <BackLink />

      <PageHeader
        title={`Invoice ${invoice.invoice_number}`}
        actions={
          <div className="flex items-center gap-2">
            <Chip variant="soft" color={STATUS_CHIP_COLOR[invoice.status] ?? 'default'} size="sm" className="capitalize">
              {invoice.status}
            </Chip>
            <Button
              variant="outline"
              size="sm"
              isDisabled={downloading}
              onPress={handleDownload}
              aria-label={`Download invoice ${invoice.invoice_number} as PDF`}
            >
              {downloading ? <Spinner size="sm" /> : <Download size={13} />}
              PDF
            </Button>
          </div>
        }
      />

      {/* Summary card */}
      <div className="bg-surface-card border border-border-default rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Detail label="Client" value={invoice.clients?.name ?? '-'} />
        <Detail label="Due Date" value={invoice.due_date ? formatDate(invoice.due_date) : '-'} />
        <Detail label="Paid Date" value={invoice.paid_date ? formatDate(invoice.paid_date) : '-'} />
      </div>

      {/* Line items */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <p className="text-label text-text-muted">No line items on this invoice</p>
          </div>
        ) : (
          <table aria-label="Invoice line items" className="overflow-hidden">
              <thead><tr>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Description</th>
                <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Qty</th>
                <th id="unitPrice" className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Unit Price</th>
                <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Total</th>
              </tr></thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} id={line.id} className="border-b border-border-subtle">
                    <td className="py-3 px-4 text-label text-text-secondary">{line.description}</td>
                    <td className="py-3 px-4 text-label text-text-secondary text-right">{line.quantity}</td>
                    <td className="py-3 px-4 text-label text-text-secondary text-right">{formatCurrency(line.unit_price)}</td>
                    <td className="py-3 px-4 text-label text-text-secondary text-right">{formatCurrency(line.total)}</td>
                  </tr>
                ))}
              </tbody>
          </table>
        )}

        {/* Totals + payment status */}
        <div className="border-t border-border-default px-4 py-4 flex flex-col items-end gap-1.5">
          <TotalRow label="Subtotal" value={formatCurrency(subtotal)} />
          <TotalRow label="Tax" value={formatCurrency(tax)} />
          <div className="flex items-center gap-6 pt-1.5 mt-1 border-t border-border-subtle min-w-[200px] justify-between">
            <span className="text-label font-semibold text-text-primary">Total</span>
            <span className="text-[15px] font-semibold text-text-primary">{formatCurrency(total)}</span>
          </div>
          {amountPaid > 0 && (
            <>
              <TotalRow label="Amount Paid" value={formatCurrency(amountPaid)} />
              <div className="flex items-center gap-6 min-w-[200px] justify-between">
                <span className="text-label font-medium text-text-secondary">Balance Due</span>
                <span className="text-label font-semibold text-text-primary">{formatCurrency(balanceDue)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/portal/invoices"
      className="inline-flex items-center gap-1.5 text-label text-text-muted hover:text-text-secondary transition-colors"
    >
      <ArrowLeft size={14} /> Back to Invoices
    </Link>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">{label}</p>
      <p className="text-label text-text-secondary mt-1">{value}</p>
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-6 min-w-[200px] justify-between">
      <span className="text-label text-text-muted">{label}</span>
      <span className="text-label text-text-secondary">{value}</span>
    </div>
  )
}
