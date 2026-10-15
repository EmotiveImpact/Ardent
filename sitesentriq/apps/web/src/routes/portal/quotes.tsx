import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { Check, X, FileSignature, Eye } from 'lucide-react'
import { useQuotes, useClientQuoteDecision, useConvertQuoteToJob } from '@/hooks/use-quotes'
import { useAuth } from '@/hooks/use-auth'
import { formatDate, formatCurrency } from '@haumea/utils'
import type { QuoteWithRelations } from '@haumea/types'
import { TableSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'
import { usePortalProperty } from '@/components/layout/portal-layout'

type StatusTab = '' | 'sent' | 'approved' | 'rejected'
type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const TABS: { key: StatusTab; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'sent', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

const STATUS_CHIP_COLOR: Record<string, ChipColor> = {
  draft: 'default',
  sent: 'accent',
  approved: 'success',
  rejected: 'danger',
  expired: 'default',
  converted: 'accent',
}

export default function PortalQuotesPage() {
  const { profile } = useAuth()
  const [statusFilter, setStatusFilter] = useState<StatusTab>('')
  const { selectedPropertyId } = usePortalProperty()
  const { data: quotes, isLoading } = useQuotes({
    status: statusFilter || undefined,
    property_id: selectedPropertyId ?? undefined,
    // Defence-in-depth on top of RLS (00096) — scope to the client_admin's
    // client. NULL for staff preview (no extra filter).
    client_id: profile?.client_id ?? undefined,
  })
  const decideQuote = useClientQuoteDecision()
  const convertToJob = useConvertQuoteToJob()
  const [actionFeedback, setActionFeedback] = useState<{ id: string; status: string } | null>(null)

  const handleAction = (quote: QuoteWithRelations, status: 'approved' | 'rejected') => {
    // Goes through the client_set_quote_decision RPC — a client_admin's direct
    // UPDATE on quotes is blocked by RLS (00108), so useUpdateQuote 403s here.
    decideQuote.mutate(
      { quoteId: quote.id, decision: status },
      {
        onSuccess: () => {
          setActionFeedback({ id: quote.id, status })
          // On approval, auto-create the job so the FM operator's pipeline closes
          // without another manual step. Demo-closes the quote→job loop the v0.20.0
          // board flagged as broken. Convert failure is non-fatal — the quote stays
          // 'approved' and the operator can convert manually from the dashboard.
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
                  console.warn('[portal/quotes] auto-convert to job failed:', err)
                },
              },
            )
          }
          setTimeout(() => setActionFeedback(null), 3000)
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Quotes" />

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
          <TableSkeleton rows={6} cols={5} showHeader={false} showSearch={false} />
        ) : !quotes?.length ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <FileSignature size={28} strokeWidth={1.5} className="mb-2" />
            <p className="text-label text-text-muted">No quotes found</p>
            <p className="text-micro text-text-muted mt-1">Quotes requiring your review will appear here</p>
          </div>
        ) : (
          <table aria-label="Quotes" className="w-full overflow-hidden">
              <thead><tr>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Quote #</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Total</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                <th id="validUntil" className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Valid Until</th>
                <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
              </tr></thead>
              <tbody>
                {quotes.map((quote: QuoteWithRelations) => (
                  <tr key={quote.id} id={quote.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors">
                    <td className="py-3 px-4 text-label font-medium">
                      <Link
                        to={`/portal/quotes/${quote.id}`}
                        className="text-text-primary hover:text-accent underline-offset-2 hover:underline"
                      >
                        {quote.quote_number}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{quote.properties?.name || '-'}</td>
                    <td className="py-3 px-4 text-label text-text-secondary">{formatCurrency(quote.total)}</td>
                    <td className="py-3 px-4">
                      <Chip variant="soft" color={STATUS_CHIP_COLOR[quote.status] ?? 'default'} size="sm" className="capitalize">
                        {quote.status}
                      </Chip>
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">{quote.valid_until ? formatDate(quote.valid_until) : '-'}</td>
                    <td className="py-3 px-4 text-right">
                      {quote.status === 'sent' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onPress={() => handleAction(quote, 'approved')}
                            isDisabled={decideQuote.isPending}
                            startContent={<Check size={14} />}
                          >
                            {decideQuote.isPending ? 'Saving…' : 'Approve'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onPress={() => handleAction(quote, 'rejected')}
                            isDisabled={decideQuote.isPending}
                            startContent={<X size={14} />}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <Link
                          to={`/portal/quotes/${quote.id}`}
                          className="inline-flex items-center gap-1 text-caption font-medium text-text-secondary hover:text-accent"
                        >
                          <Eye size={14} /> View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        )}
      </div>

      {/* Success toast */}
      {actionFeedback && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 shadow-lg flex items-center gap-2 text-label font-medium ${
          actionFeedback.status === 'approved'
            ? 'bg-status-compliant/10 border border-status-compliant/30 text-status-compliant'
            : 'bg-status-overdue/10 border border-status-overdue/30 text-status-overdue'
        }`}>
          {actionFeedback.status === 'approved' ? <Check size={14} /> : <X size={14} />}
          Quote {actionFeedback.status === 'approved' ? 'approved' : 'rejected'} successfully
        </div>
      )}
    </div>
  )
}
