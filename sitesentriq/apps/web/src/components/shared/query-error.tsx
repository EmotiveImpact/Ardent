import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@haumea/ui'

interface QueryErrorProps {
  /** Short title, e.g. "Quotes failed to load". */
  title: string
  /** The underlying error (its message is shown) or a fallback string. */
  error?: unknown
  /** Fallback message when the error has none. */
  fallback?: string
  /** Retry handler — typically the query's `refetch`. */
  onRetry?: () => void
  /** Disables the retry button + spins the icon while a refetch is in flight. */
  isRetrying?: boolean
}

/**
 * Canonical "this query failed" card. Surfaces a real fetch failure instead of
 * letting it fall through to an empty state (which reads as "no data" and masks
 * an outage). Mirrors the original jobs-list error card so every list page
 * fails the same, recoverable way.
 */
export function QueryError({ title, error, fallback, onRetry, isRetrying }: QueryErrorProps) {
  const message =
    (error instanceof Error && error.message) ||
    fallback ||
    'The request did not return from the server.'

  return (
    <div className="rounded-xl border border-status-overdue/30 bg-surface-card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-overdue/10">
            <AlertTriangle size={18} className="text-status-overdue" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-title font-semibold text-text-primary">{title}</h2>
            <p className="mt-1 text-label text-text-secondary">{message}</p>
          </div>
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" onPress={() => onRetry()} isDisabled={isRetrying}>
            <RefreshCw size={14} className={isRetrying ? 'animate-spin' : undefined} />
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  )
}
