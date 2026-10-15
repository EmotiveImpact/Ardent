// AI client wrappers — call the Supabase edge functions that
// proxy to Anthropic. The Anthropic SDK is intentionally NOT
// imported in the browser bundle; the API key only lives in
// edge-function secrets.

import { supabase } from '@/lib/supabase'

export interface ComplianceSuggestionInput {
  asset_name?: string | null
  asset_type?: string | null
  property_type?: string | null
  current_text?: string | null
}

export interface ComplianceSuggestion {
  suggestion: string
  confidence: number
  reasoning: string
  suggested_frequency: string
  next_due_offset_days: number
  audit_log_id: string | null
}

export type ComplianceSuggestError =
  | { kind: 'not_configured' }
  | { kind: 'unauthorized' }
  | { kind: 'quota_exceeded' }
  | { kind: 'malformed' }
  | { kind: 'network'; message: string }

export class ComplianceSuggestException extends Error {
  readonly detail: ComplianceSuggestError
  constructor(detail: ComplianceSuggestError, message?: string) {
    super(message ?? detail.kind)
    this.name = 'ComplianceSuggestException'
    this.detail = detail
  }
}

/**
 * Ask the LLM to classify an asset into a compliance type. The UI
 * should treat any thrown {@link ComplianceSuggestException} with
 * `kind: 'not_configured'` as a signal to silently hide the
 * suggester — every install starts without an Anthropic API key.
 */
export async function suggestComplianceType(
  input: ComplianceSuggestionInput,
): Promise<ComplianceSuggestion> {
  const { data, error } = await supabase.functions.invoke<unknown>(
    'ai-suggest-compliance',
    { body: input },
  )

  // Supabase wraps non-2xx responses in `error` but still gives us
  // the body in `data` — inspect both before deciding.
  const body = (data ?? null) as Record<string, unknown> | null

  if (body && typeof body.error === 'string') {
    if (body.error === 'AI_NOT_CONFIGURED') {
      throw new ComplianceSuggestException({ kind: 'not_configured' })
    }
    if (body.code === 'AI_QUOTA_EXCEEDED') {
      throw new ComplianceSuggestException({ kind: 'quota_exceeded' })
    }
  }

  if (error) {
    // The edge function returns 503 when the API key is unset; the
    // Supabase client surfaces that as an error. Treat it as "not
    // configured" only when the body confirms; otherwise it's a
    // genuine network / auth failure.
    if (body && body.error === 'AI_NOT_CONFIGURED') {
      throw new ComplianceSuggestException({ kind: 'not_configured' })
    }
    if (body && (body as { code?: string }).code === 'AI_QUOTA_EXCEEDED') {
      throw new ComplianceSuggestException({ kind: 'quota_exceeded' })
    }
    throw new ComplianceSuggestException(
      { kind: 'network', message: error.message },
      error.message,
    )
  }

  if (!body || typeof body.suggestion !== 'string') {
    throw new ComplianceSuggestException({ kind: 'malformed' })
  }

  return {
    suggestion: body.suggestion,
    confidence:
      typeof body.confidence === 'number' ? body.confidence : 0.5,
    reasoning:
      typeof body.reasoning === 'string'
        ? body.reasoning
        : 'No reasoning provided.',
    suggested_frequency:
      typeof body.suggested_frequency === 'string'
        ? body.suggested_frequency
        : 'annual',
    next_due_offset_days:
      typeof body.next_due_offset_days === 'number'
        ? body.next_due_offset_days
        : 365,
    audit_log_id:
      typeof body.audit_log_id === 'string'
        ? body.audit_log_id
        : null,
  }
}
