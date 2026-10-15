import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { Chip } from '@haumea/ui'
import { Check, X, FileSignature, ArrowLeft } from 'lucide-react'
import { useQuote, useClientQuoteDecision, useConvertQuoteToJob } from '@/hooks/use-quotes'
import { formatDate, formatCurrency } from '@haumea/utils'
import type { QuoteLine } from '@haumea/types'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  draft: 'default',
  sent: 'accent',
  approved: 'success',
  rejected: 'danger',
  expired: 'default',
  converted: 'accent',
}

export default function PortalQuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: quote, isLoading, isError } = useQuote(id!)
  const decideQuote = useClientQuoteDecision()
  const convertToJob = useConvertQuoteToJob()
  const [actionFeedback, setActionFeedback] = useState<'approved' | 'rejected' | null>(null)

  const handleAction = (status: 'approved' | 'rejected') => {
    if (!quote) return
    decideQuote.mutate(
      { quoteId: quote.id, decision: status },
      {
        onSuccess: () => {
          setActionFeedback(status)
          // Mirror the list page: approval auto-converts to a job so the
          // FM operator's pipeline closes without another manual step.
          // Convert failure is non-fatal — the quote stays 'approved'.
          if (status === 'approved') {
            convertToJob.mutate(
              {
                id: quote.id,
                quote_number: quote.quote_number,
                property_id: quote.property_id ?? undefined,
                organisation_id: quote.organisation_id,
                client_id: quote.client_id,
              },
              {
                onError: (err) => {
                  console.warn('[portal/quote-detail] auto-convert to job failed:', err)
                },
              },
            )
          }
          setTimeout(() => setActionFeedback(null), 3000)
        },
      },
    )
  }

  if (isLoading) return <DetailPageSkeleton withTabs={false} />

  if (isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <FileSignature size={28} strokeWidth={1.5} className="mb-2" />
          <p className="text-label text-text-muted">Could not load this quote</p>
          <p className="text-micro text-text-muted mt-1">Please try again later</p>
        </div>
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <FileSignature size={28} strokeWidth={1.5} className="mb-2" />
          <p className="text-label text-text-muted">Quote not found</p>
          <p className="text-micro text-text-muted mt-1">It may have been removed or you no longer have access</p>
        </div>
      </div>
    )
  }

  const lines = (quote.quote_lines ?? []) as QuoteLine[]
  const subtotal = lines.reduce((sum, l) => sum + (l.total || 0), 0)
  const tax = lines.reduce(
    (sum, l) => sum + (l.quantity || 0) * (l.unit_price || 0) * ((l.tax_rate ?? 20) / 100),
    0,
  )
  const total = quote.total ?? subtotal + tax

  return (
    <div className="space-y-6">
      <BackLink />

      <PageHeader
        title={`Quote ${quote.quote_number}`}
        actions={
          <Chip variant="soft" color={STATUS_CHIP_COLOR[quote.status] ?? 'default'} size="sm" className="capitalize">
            {quote.status}
          </Chip>
        }
      />

      {/* Summary card */}
      <div className="bg-surface-card border border-border-default rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Detail label="Property" value={quote.properties?.name ?? '-'} />
        <Detail label="Client" value={quote.clients?.name ?? '-'} />
        <Detail label="Valid Until" value={quote.valid_until ? formatDate(quote.valid_until) : '-'} />
      </div>

      {/* Line items */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <p className="text-label text-text-muted">No line items on this quote</p>
          </div>
        ) : (
          <table aria-label="Quote line items" className="overflow-hidden">
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

        {/* Totals */}
        <div className="border-t border-border-default px-4 py-4 flex flex-col items-end gap-1.5">
          <TotalRow label="Subtotal" value={formatCurrency(subtotal)} />
          <TotalRow label="Tax" value={formatCurrency(tax)} />
          <div className="flex items-center gap-6 pt-1.5 mt-1 border-t border-border-subtle min-w-[200px] justify-between">
            <span className="text-label font-semibold text-text-primary">Total</span>
            <span className="text-[15px] font-semibold text-text-primary">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Approve / Reject — only when the quote is awaiting the client's review */}
      {quote.status === 'sent' && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => handleAction('rejected')}
            disabled={decideQuote.isPending}
            className="inline-flex items-center border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-4 py-2 text-label font-medium disabled:opacity-50 transition-colors"
          >
            <X size={14} className="mr-1.5" /> Reject
          </button>
          <button
            onClick={() => handleAction('approved')}
            disabled={decideQuote.isPending}
            className="inline-flex items-center bg-foreground text-background hover:bg-foreground/90 rounded-lg px-4 py-2 text-label font-medium disabled:opacity-50 transition-colors"
          >
            <Check size={14} className="mr-1.5" /> Approve
          </button>
        </div>
      )}

      {/* Success toast */}
      {actionFeedback && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 shadow-lg flex items-center gap-2 text-label font-medium ${
          actionFeedback === 'approved'
            ? 'bg-status-compliant/10 border border-status-compliant/30 text-status-compliant'
            : 'bg-status-overdue/10 border border-status-overdue/30 text-status-overdue'
        }`}>
          {actionFeedback === 'approved' ? <Check size={14} /> : <X size={14} />}
          Quote {actionFeedback === 'approved' ? 'approved' : 'rejected'} successfully
        </div>
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/portal/quotes"
      className="inline-flex items-center gap-1.5 text-label text-text-muted hover:text-text-secondary transition-colors"
    >
      <ArrowLeft size={14} /> Back to Quotes
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
