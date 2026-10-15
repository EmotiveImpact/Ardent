// Wave 14 / Task 114 — Site portal: quotes pending approval at this site.
import { useState } from 'react'
import { Button, Chip } from '@haumea/ui'
import { Check, X, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useTenantQuotes, useTenantQuoteDecision } from '@/lib/site-portal/hooks'
import { formatDate } from '@haumea/utils'
import { TableSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

const STATUS_CHIP_COLOR: Record<string, 'default' | 'accent' | 'success' | 'danger' | 'warning'> = {
  draft: 'default',
  sent: 'accent',
  approved: 'success',
  rejected: 'danger',
  converted: 'accent',
  expired: 'warning',
}

export default function SiteQuotesPage() {
  const { data: quotes, isLoading } = useTenantQuotes()
  const decide = useTenantQuoteDecision()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (isLoading) {
    return <TableSkeleton rows={5} cols={5} />
  }

  const onDecision = async (id: string, decision: 'approved' | 'rejected') => {
    setBusyId(id)
    try {
      await decide.mutateAsync({ quoteId: id, decision })
      toast.success(decision === 'approved' ? 'Quote approved' : 'Quote rejected')
    } catch {
      // The error toast is already raised by useTenantQuoteDecision's onError;
      // swallow here so the tenant doesn't see two identical error toasts.
    } finally {
      setBusyId(null)
    }
  }

  const pending = (quotes ?? []).filter((q) => q.status === 'sent')
  const others = (quotes ?? []).filter((q) => q.status !== 'sent')

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Quotes" subtitle="Approve or reject quotes raised by your FM team for this site." />
      </div>

      <Section title={`Awaiting your decision (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState message="No quotes are waiting for your decision." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {pending.map((q) => (
              <li key={q.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="min-w-0">
                  <p className="text-label font-medium text-text-primary">
                    {q.quote_number}
                  </p>
                  <p className="text-micro text-text-muted mt-0.5">
                    Total £{Number(q.total).toLocaleString()} · raised{' '}
                    {formatDate(q.created_at)}
                    {q.valid_until ? ` · valid until ${formatDate(q.valid_until)}` : ''}
                  </p>
                  {q.notes && (
                    <p className="text-micro text-text-muted mt-1 max-w-prose">
                      {q.notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onPress={() => onDecision(q.id, 'approved')}
                    isDisabled={busyId === q.id}
                  >
                    <Check size={13} className="mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => onDecision(q.id, 'rejected')}
                    isDisabled={busyId === q.id}
                  >
                    <X size={13} className="mr-1" /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Other quotes (${others.length})`}>
        {others.length === 0 ? (
          <EmptyState message="No previous quotes for this site." />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {others.map((q) => (
              <li key={q.id} className="px-5 py-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-label font-medium text-text-primary">
                    {q.quote_number}
                  </p>
                  <p className="text-micro text-text-muted mt-0.5">
                    £{Number(q.total).toLocaleString()} · {formatDate(q.created_at)}
                  </p>
                </div>
                <Chip variant="soft" color={STATUS_CHIP_COLOR[q.status] ?? 'default'} size="sm">
                  {q.status}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card border border-border-default rounded-xl">
      <div className="px-5 py-4 border-b border-border-subtle">
        <h2 className="text-body font-semibold text-text-primary">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center py-10 text-text-muted">
      <FileText size={28} strokeWidth={1.5} className="mb-2" />
      <p className="text-label">{message}</p>
    </div>
  )
}
