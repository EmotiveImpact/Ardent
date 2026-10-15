import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/hooks/use-auth'
import { Button, Chip, Spinner } from '@haumea/ui'
import { Download, Receipt, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useInvoices } from '@/hooks/use-invoices'
import { supabase } from '@/lib/supabase'
import { generateInvoicePdf } from '@/lib/pdf'
import { formatDate, formatCurrency } from '@haumea/utils'
import type { InvoiceWithRelations, InvoiceLine } from '@haumea/types'
import { TableSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

type StatusTab = '' | 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const TABS: { key: StatusTab; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'sent', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
]

const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  draft: 'default',
  // 'sent' = awaiting payment → amber (in-progress), not accent/navy which reads
  // as neutral/resolved next to a paid invoice.
  sent: 'warning',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'default',
}

export default function PortalInvoicesPage() {
  const { profile } = useAuth()
  const [statusFilter, setStatusFilter] = useState<StatusTab>('')
  // Sprint 3 / B7 — track which row is currently fetching its
  // lines + rendering the PDF, so we can disable just that button
  // and show a tiny spinner inline.
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // NOTE: invoices are account-level (billed to the client, not a single site) —
  // invoices.property_id is never populated by any create/convert path, so the
  // global site switcher deliberately does NOT narrow this list. Filtering by it
  // (.eq excludes NULLs) would hide every invoice whenever a site was selected.
  const { data: invoices, isLoading } = useInvoices({
    status: statusFilter || undefined,
    // Defence-in-depth on top of RLS (00096) — scope a client_admin to their
    // client. NULL for staff preview (no extra filter).
    client_id: profile?.client_id ?? undefined,
  })

  /**
   * Sprint 3 / B7 — Lazy fetch the invoice lines on click and call
   * generateInvoicePdf (the same helper the FM dashboard uses for
   * its Download PDF button). We don't preload lines for every row
   * in the list because most clients only download the one or two
   * they're checking.
   */
  const handleDownload = async (inv: InvoiceWithRelations) => {
    if (downloadingId) return
    setDownloadingId(inv.id)
    try {
      const { data, error } = await supabase
        .from('invoice_lines')
        .select('description, quantity, unit_price, total, sort_order')
        .eq('invoice_id', inv.id)
        .order('sort_order', { ascending: true })
      if (error) throw error
      const lines = (data ?? []) as Pick<InvoiceLine, 'description' | 'quantity' | 'unit_price' | 'total'>[]
      // Subtotal/tax/total: portal invoices show inv.total only and
      // we don't have a tax column on every install. Treat tax as
      // the difference between sum-of-lines and inv.total when there
      // is one, otherwise zero — same convention the FM-side detail
      // page uses.
      const subtotal = lines.reduce((s, l) => s + (l.total ?? 0), 0)
      const total = inv.total ?? subtotal
      const tax = Math.max(0, total - subtotal)
      generateInvoicePdf({
        invoice_number: inv.invoice_number,
        created_at: inv.created_at,
        due_date: inv.due_date,
        client_name: inv.clients?.name || 'Client',
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
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" />

      {/* Status tabs */}
      <div className="flex gap-0 border-b border-border-default">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2.5 text-label font-medium border-b-2 transition-colors ${
              statusFilter === tab.key
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} cols={6} showHeader={false} showSearch={false} />
        ) : !invoices?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Receipt size={28} strokeWidth={1.5} className="mb-2" />
            <p className="text-label text-text-muted">No invoices found</p>
            <p className="text-micro text-text-muted mt-1">Invoices for your properties will appear here</p>
          </div>
        ) : (
          <table aria-label="Invoices" className="w-full overflow-hidden">
              <thead><tr>
                <th id="invoiceNumber" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Invoice #</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Total</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                <th id="dueDate" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Due Date</th>
                <th id="paidDate" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Paid Date</th>
                <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
              </tr></thead>
              <tbody>
                {invoices.map((inv: InvoiceWithRelations) => (
                  <tr
                    key={inv.id}
                    id={inv.id}
                    className={`border-b border-border-subtle hover:bg-surface-page transition-colors ${
                      inv.status === 'overdue' ? 'bg-status-overdue/5' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-label font-medium">
                      <Link
                        to={`/portal/invoices/${inv.id}`}
                        className="text-text-primary hover:text-accent underline-offset-2 hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{formatCurrency(inv.total)}</td>
                    <td className="py-3 px-4">
                      <Chip variant="soft" color={STATUS_CHIP_COLOR[inv.status] ?? 'default'} size="sm" className="capitalize">
                        {inv.status}
                      </Chip>
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                    <td className="py-3 px-4 text-label text-text-secondary">{inv.paid_date ? formatDate(inv.paid_date) : '-'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="ghost" size="sm" startContent={<Eye size={14} />}>
                          <Link to={`/portal/invoices/${inv.id}`}>
                            View
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          isDisabled={downloadingId === inv.id}
                          onPress={() => handleDownload(inv)}
                          aria-label={`Download invoice ${inv.invoice_number} as PDF`}
                        >
                          {downloadingId === inv.id ? (
                            <Spinner size="sm" />
                          ) : (
                            <Download size={13} />
                          )}
                          PDF
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
