import { useEffect, useRef, useState } from 'react'
import { Button, Chip } from '@haumea/ui'
import { Sparkles, X } from 'lucide-react'
import { COMPLIANCE_TYPE_LABELS } from '@/lib/constants'
import {
  suggestComplianceType,
  ComplianceSuggestException,
  type ComplianceSuggestion,
} from './client'

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  six_monthly: '6-Monthly',
  annual: 'Annual',
}

interface SuggesterCardProps {
  /** Asset display name — primary signal for the model. */
  assetName?: string | null
  /** Asset category / type slug (e.g. "boiler"). */
  assetType?: string | null
  /** Property type the asset lives in (office, retail, etc.). */
  propertyType?: string | null
  /** Whatever the user has typed into the form so far. Used as a hint. */
  currentText?: string | null
  /** Called when the user clicks "Apply suggestion". */
  onAccept: (suggestion: ComplianceSuggestion) => void
  /** Called when the user dismisses the card. */
  onReject?: () => void
  /** Optional className to position the card inside a form layout. */
  className?: string
}

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; suggestion: ComplianceSuggestion }
  | { kind: 'error'; message: string }
  | { kind: 'hidden' }
  | { kind: 'dismissed' }

/**
 * Reusable AI suggestion surface for the new-compliance form. Calls
 * the `ai-suggest-compliance` edge function on mount, displays the
 * model's classification with a confidence bar + reasoning, and lets
 * the user apply the result back into the form.
 *
 * If the edge function reports `AI_NOT_CONFIGURED` (no Anthropic API
 * key), the card hides itself silently — facilities admins should
 * never see "AI suggestions unavailable" on a fresh install.
 */
export function SuggesterCard({
  assetName,
  assetType,
  propertyType,
  currentText,
  onAccept,
  onReject,
  className = '',
}: SuggesterCardProps) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  // Guard against double-fire from React 18 StrictMode + ensure we
  // don't re-fetch on every keystroke into `currentText`.
  const hasFetchedRef = useRef(false)
  const errorTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true

    let cancelled = false

    suggestComplianceType({
      asset_name: assetName ?? null,
      asset_type: assetType ?? null,
      property_type: propertyType ?? null,
      current_text: currentText ?? null,
    })
      .then((suggestion) => {
        if (cancelled) return
        setStatus({ kind: 'ready', suggestion })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ComplianceSuggestException) {
          if (err.detail.kind === 'not_configured') {
            // Hide silently. Admins without an API key shouldn't see
            // a banner advertising a feature they can't use.
            setStatus({ kind: 'hidden' })
            return
          }
          if (err.detail.kind === 'quota_exceeded') {
            setStatus({
              kind: 'error',
              message: 'Monthly AI quota reached for your organisation.',
            })
          } else {
            setStatus({
              kind: 'error',
              message: 'AI suggestions unavailable.',
            })
          }
        } else {
          setStatus({ kind: 'error', message: 'AI suggestions unavailable.' })
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-dismiss the inline error after 3s — the card disappears
  // entirely so it doesn't hold real estate on the form.
  useEffect(() => {
    if (status.kind !== 'error') return
    errorTimerRef.current = window.setTimeout(() => {
      setStatus({ kind: 'hidden' })
    }, 3000)
    return () => {
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current)
      }
    }
  }, [status.kind])

  if (status.kind === 'hidden' || status.kind === 'dismissed') {
    return null
  }

  return (
    <div
      className={`rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3 ${className}`.trim()}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <Sparkles size={14} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption font-semibold uppercase tracking-[0.04em] text-brand-600">
              AI suggestion
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus({ kind: 'dismissed' })
                onReject?.()
              }}
              aria-label="Dismiss AI suggestion"
              className="text-text-muted hover:text-text-secondary transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {status.kind === 'loading' ? (
            <SuggesterSkeleton />
          ) : status.kind === 'error' ? (
            <p className="mt-2 text-caption text-text-muted">{status.message}</p>
          ) : (
            <SuggestionBody
              suggestion={status.suggestion}
              onAccept={() => {
                onAccept(status.suggestion)
                setStatus({ kind: 'dismissed' })
              }}
              onDismiss={() => {
                setStatus({ kind: 'dismissed' })
                onReject?.()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SuggesterSkeleton() {
  return (
    <div className="mt-2 space-y-2">
      <div className="h-3 w-1/3 animate-pulse rounded bg-brand-100" />
      <div className="h-2 w-1/2 animate-pulse rounded bg-brand-100" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-brand-100" />
    </div>
  )
}

interface SuggestionBodyProps {
  suggestion: ComplianceSuggestion
  onAccept: () => void
  onDismiss: () => void
}

function SuggestionBody({
  suggestion,
  onAccept,
  onDismiss,
}: SuggestionBodyProps) {
  const typeLabel =
    COMPLIANCE_TYPE_LABELS[suggestion.suggestion] ?? suggestion.suggestion
  const freqLabel =
    FREQUENCY_LABELS[suggestion.suggested_frequency] ??
    suggestion.suggested_frequency
  const confidencePct = Math.round(
    Math.max(0, Math.min(1, suggestion.confidence)) * 100,
  )

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="soft" color="accent">
          {typeLabel}
        </Chip>
        <span className="text-micro uppercase tracking-[0.04em] text-text-muted">
          {freqLabel}
        </span>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.04em] text-text-muted">
          <span>Confidence</span>
          <span className="font-medium text-text-secondary">
            {confidencePct}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-brand-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width]"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      <p className="text-caption leading-relaxed text-text-secondary">
        {suggestion.reasoning}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onPress={onAccept}>
          <Sparkles size={12} />
          Apply suggestion
        </Button>
        <Button size="sm" variant="outline" onPress={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
