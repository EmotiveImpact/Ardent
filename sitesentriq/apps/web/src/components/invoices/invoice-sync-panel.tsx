// Accounting sync panel for the invoice detail page.
//
// Competitive research (2026-06): broken/opaque accounting sync is the most
// cited single integration failure across field-service platforms — invoices
// silently missing from Xero/QBO with no way to see why or retry. This panel
// makes the sync state a first-class, diagnosable surface: current status,
// the exact provider error, the per-invoice push history, and a Retry that
// re-claims even a stale in-flight push (the edge functions treat a
// 'pushing' claim older than 10 minutes as abandoned).

import { Button, AppCard, Chip } from '@haumea/ui'
import { RefreshCw, Plug } from 'lucide-react'
import { formatDate } from '@haumea/utils'
import {
  useInvoiceSyncLog,
  useXeroConnection,
  useQuickBooksConnection,
} from '@/lib/integrations/accounting/hooks'
import { usePushInvoiceToAccounting } from '@/hooks/use-invoices'
import type {
  AccountingProvider,
  AccountingStatus,
  AccountingSyncLogRow,
} from '@/lib/integrations/accounting/types'

const STALE_PUSHING_MS = 10 * 60 * 1000

const PROVIDER_LABEL: Record<AccountingProvider, string> = {
  xero: 'Xero',
  quickbooks: 'QuickBooks',
}

export interface InvoiceSyncPanelProps {
  invoiceId: string
  accountingStatus?: AccountingStatus | null
  accountingProvider?: AccountingProvider | null
  accountingError?: string | null
  accountingPushedAt?: string | null
  /** invoices.updated_at — freshened by the edge function's 'pushing' claim,
   *  so it tells us whether an in-flight push is stale (crashed). */
  updatedAt?: string | null
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDate(iso)} ${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

export function InvoiceSyncPanel({
  invoiceId,
  accountingStatus,
  accountingProvider,
  accountingError,
  accountingPushedAt,
  updatedAt,
}: InvoiceSyncPanelProps) {
  const { data: xeroConn } = useXeroConnection()
  const { data: qbConn } = useQuickBooksConnection()
  const { data: log = [] } = useInvoiceSyncLog(invoiceId)
  const pushInvoice = usePushInvoiceToAccounting()

  const connectedProvider: AccountingProvider | null = xeroConn
    ? 'xero'
    : qbConn
      ? 'quickbooks'
      : null

  // Nothing to show for orgs with no accounting connection AND no history.
  if (!connectedProvider && log.length === 0 && !accountingStatus) return null

  const status: AccountingStatus = accountingStatus ?? 'none'
  // A push is "stale" (crashed mid-flight, safe to retry) only when we can SEE
  // that its claim is old. An unknown timestamp must NOT be treated as stale —
  // that would offer Retry on a push still running and risk a double-submit.
  const pushingIsStale =
    status === 'pushing' &&
    !!updatedAt &&
    Date.now() - new Date(updatedAt).getTime() > STALE_PUSHING_MS

  // Retry targets the invoice's own provider when known, else the connection.
  const retryProvider = accountingProvider ?? connectedProvider
  const canRetry = !!retryProvider && (status === 'error' || pushingIsStale)

  return (
    <AppCard padding="md">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-body font-semibold text-text-primary inline-flex items-center gap-2">
          <Plug size={15} aria-hidden />
          Accounting sync
        </h3>
        {canRetry && (
          <Button
            variant="outline"
            size="sm"
            isDisabled={pushInvoice.isPending}
            onPress={() =>
              pushInvoice.mutate({ invoice_id: invoiceId, provider: retryProvider! })
            }
          >
            <RefreshCw size={14} className={pushInvoice.isPending ? 'animate-spin' : undefined} />
            {pushInvoice.isPending ? 'Retrying…' : `Retry push to ${PROVIDER_LABEL[retryProvider!]}`}
          </Button>
        )}
      </div>

      {status === 'error' && accountingError && (
        <div className="rounded-md border border-status-overdue/30 bg-status-overdue/5 px-3 py-2 mb-3">
          <p className="text-caption font-medium text-status-overdue">Last push failed</p>
          <p className="text-caption text-text-secondary mt-0.5 break-words">{accountingError}</p>
        </div>
      )}
      {pushingIsStale && (
        <div className="rounded-md border border-status-due-soon/30 bg-status-due-soon/5 px-3 py-2 mb-3">
          <p className="text-caption text-text-secondary">
            A push started over 10 minutes ago and never finished — it can be safely retried.
          </p>
        </div>
      )}
      {status === 'pushed' && accountingPushedAt && (
        <p className="text-caption text-text-muted mb-3">
          Pushed{accountingProvider ? ` to ${PROVIDER_LABEL[accountingProvider]}` : ''} on{' '}
          {formatTime(accountingPushedAt)}
        </p>
      )}

      {log.length > 0 ? (
        <ul className="divide-y divide-border-subtle">
          {log.map((row: AccountingSyncLogRow) => (
            <li key={row.id} className="py-2 flex items-start gap-3">
              <Chip
                variant="soft"
                color={row.status === 'success' ? 'success' : 'danger'}
                size="sm"
              >
                {row.status}
              </Chip>
              <div className="min-w-0 flex-1">
                <p className="text-label text-text-secondary">
                  {row.action.replace(/_/g, ' ')} · {PROVIDER_LABEL[row.provider]}
                  {row.external_id ? (
                    <span className="text-text-muted"> · ref {row.external_id}</span>
                  ) : null}
                </p>
                {row.error && (
                  <p className="text-caption text-text-muted break-words mt-0.5">{row.error}</p>
                )}
              </div>
              <span className="text-caption text-text-muted whitespace-nowrap">
                {formatTime(row.created_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-text-muted">
          No pushes yet{connectedProvider ? ` — use “Push to Accounting” above.` : '.'}
        </p>
      )}
    </AppCard>
  )
}

export default InvoiceSyncPanel
