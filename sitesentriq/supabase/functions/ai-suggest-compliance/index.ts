// supabase/functions/ai-suggest-compliance/index.ts
//
// LLM-assisted compliance type suggester. Wave 9 — Builder 9A.
//
// POST { asset_name, asset_type, property_type, current_text? }
// from an authenticated user. The function:
//
//   1. Resolves the caller's organisation_id from their JWT.
//   2. Checks (and lazily creates) the org's ai_usage_quotas row.
//      If they're over `monthly_limit` for the month, returns 429.
//   3. Builds a structured Anthropic Messages prompt that constrains
//      the model to one of the 16 predefined compliance types.
//   4. Calls Anthropic with claude-haiku-4-5-20251001 — the cheapest
//      "smart enough" model in the 4.5 family (~$0.25 / 1M input
//      tokens at time of writing). Plenty for a 16-way classifier.
//   5. Parses the JSON response, falls back gracefully if the model
//      returned malformed output.
//   6. Records every call (success, error, malformed) into
//      `ai_audit_log` and bumps `current_month_used` on success.
//   7. Returns the suggestion + the audit log id so the client can
//      stamp it onto the compliance row's metadata.
//
// Returns `{ error: 'AI_NOT_CONFIGURED' }` when ANTHROPIC_API_KEY is
// absent — the UI hides the suggester component on that response.
//
// Deploy with:    supabase functions deploy ai-suggest-compliance
// Required env (Supabase Dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY        (from console.anthropic.com)
//   SUPABASE_URL             (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   SUPABASE_ANON_KEY        (auto, used to verify caller JWT)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3'

// Mirrors src/lib/constants.ts COMPLIANCE_TYPES — kept in this file
// because edge functions can't import from the browser bundle.
const COMPLIANCE_TYPES = [
  'fire_safety',
  'gas_safety',
  'electrical',
  'hvac',
  'water_hygiene',
  'pest_control',
  'haccp',
  'doors',
  'lighting',
  'alarms',
  'fire_extinguishers',
  'emergency_lighting',
  'pat_testing',
  'legionella',
  'asbestos',
  'other',
] as const

const ALLOWED_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'six_monthly',
  'annual',
] as const

const FEATURE = 'compliance-suggest'
const MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOKENS = 400

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface SuggestRequest {
  asset_name?: string | null
  asset_type?: string | null
  property_type?: string | null
  current_text?: string | null
}

interface SuggestResponse {
  suggestion: string
  confidence: number
  reasoning: string
  suggested_frequency: string
  next_due_offset_days: number
  audit_log_id: string | null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function buildPrompt(req: SuggestRequest): { system: string; user: string } {
  const allowedTypes = COMPLIANCE_TYPES.join(', ')
  const allowedFreqs = ALLOWED_FREQUENCIES.join(' | ')

  const system =
    'You are a UK Facilities Management compliance expert. Given an asset, ' +
    'suggest the most likely compliance type from this exact list: ' +
    `[${allowedTypes}]. Reply ONLY with a single JSON object, no prose, no ` +
    'markdown fences. Schema: { "type": "<one of the list>", "confidence": ' +
    '<number 0-1>, "reasoning": "<one short sentence>", ' +
    `"suggested_frequency": "${allowedFreqs}", ` +
    '"next_due_offset_days": <integer days until next due, e.g. 365 for annual> }.'

  const parts: string[] = []
  if (req.asset_name) parts.push(`Asset: ${req.asset_name}`)
  if (req.asset_type) parts.push(`(${req.asset_type})`)
  let assetLine = parts.join(' ')
  if (!assetLine) assetLine = 'Asset: (unspecified)'
  if (req.property_type) {
    assetLine += `. Property type: ${req.property_type}.`
  }
  const user = req.current_text
    ? `${assetLine} User has typed: ${req.current_text}`
    : assetLine

  return { system, user }
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { message?: string; type?: string }
}

async function callAnthropic(
  apiKey: string,
  system: string,
  user: string,
): Promise<{
  raw: string
  inputTokens: number
  outputTokens: number
  error: string | null
}> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  const body = (await res.json()) as AnthropicResponse

  if (!res.ok || body.error) {
    return {
      raw: '',
      inputTokens: 0,
      outputTokens: 0,
      error: body.error?.message || `Anthropic API error: ${res.status}`,
    }
  }

  const text =
    body.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('') ?? ''

  return {
    raw: text,
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    error: null,
  }
}

interface ParsedSuggestion {
  type: string
  confidence: number
  reasoning: string
  suggested_frequency: string
  next_due_offset_days: number
}

function safeParse(raw: string): ParsedSuggestion | null {
  if (!raw) return null

  // Strip markdown fences if the model ignored the system prompt.
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Last-ditch: pull the first JSON object out of arbitrary text.
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>

  const type = typeof p.type === 'string' ? p.type : ''
  if (!COMPLIANCE_TYPES.includes(type as (typeof COMPLIANCE_TYPES)[number])) {
    return null
  }

  const confidenceRaw =
    typeof p.confidence === 'number'
      ? p.confidence
      : Number.parseFloat(String(p.confidence ?? ''))
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0.5

  const reasoning =
    typeof p.reasoning === 'string' && p.reasoning.length > 0
      ? p.reasoning
      : 'No reasoning provided.'

  const freqCandidate =
    typeof p.suggested_frequency === 'string' ? p.suggested_frequency : ''
  const suggested_frequency = ALLOWED_FREQUENCIES.includes(
    freqCandidate as (typeof ALLOWED_FREQUENCIES)[number],
  )
    ? freqCandidate
    : 'annual'

  const offsetRaw =
    typeof p.next_due_offset_days === 'number'
      ? p.next_due_offset_days
      : Number.parseInt(String(p.next_due_offset_days ?? ''), 10)
  const next_due_offset_days = Number.isFinite(offsetRaw)
    ? Math.max(1, Math.min(3650, Math.round(offsetRaw)))
    : 365

  return {
    type,
    confidence,
    reasoning,
    suggested_frequency,
    next_due_offset_days,
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // Graceful "missing key" path. UI hides the suggester on this code.
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'AI_NOT_CONFIGURED' }, 503)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error('[ai-suggest-compliance] missing supabase env')
    return jsonResponse({ error: 'Server not configured' }, 500)
  }

  // ── Auth: resolve caller from the bearer token. ──────────
  const authHeader = req.headers.get('Authorization') || ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await userClient.auth.getUser()
  const user = userData?.user
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // Service-role client for audit + quota writes (RLS is locked down).
  const admin = createClient(supabaseUrl, serviceRoleKey)

  // Resolve the user's organisation.
  const { data: profile } = await admin
    .from('profiles')
    .select('organisation_id')
    .eq('id', user.id)
    .maybeSingle()
  const organisationId = profile?.organisation_id ?? null

  // ── Parse body ───────────────────────────────────────────
  let payload: SuggestRequest
  try {
    payload = (await req.json()) as SuggestRequest
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  if (
    !payload.asset_name &&
    !payload.asset_type &&
    !payload.current_text
  ) {
    return jsonResponse(
      { error: 'At least one of asset_name, asset_type or current_text is required' },
      400,
    )
  }

  // ── Quota check + month rollover ─────────────────────────
  if (organisationId) {
    const { data: quotaRow } = await admin
      .from('ai_usage_quotas')
      .select('id, monthly_limit, current_month_used, reset_at')
      .eq('organisation_id', organisationId)
      .eq('feature', FEATURE)
      .maybeSingle()

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    if (!quotaRow) {
      await admin.from('ai_usage_quotas').insert({
        organisation_id: organisationId,
        feature: FEATURE,
        monthly_limit: 1000,
        current_month_used: 0,
        reset_at: monthStart,
      })
    } else {
      // Rollover: if reset_at is older than the start of the current
      // month, zero the counter.
      const resetAt = quotaRow.reset_at ? new Date(quotaRow.reset_at) : null
      if (!resetAt || resetAt < new Date(monthStart)) {
        await admin
          .from('ai_usage_quotas')
          .update({ current_month_used: 0, reset_at: monthStart })
          .eq('id', quotaRow.id)
      } else if (
        (quotaRow.current_month_used ?? 0) >= (quotaRow.monthly_limit ?? 1000)
      ) {
        return jsonResponse(
          {
            error: 'Monthly AI quota reached. Contact your admin.',
            code: 'AI_QUOTA_EXCEEDED',
          },
          429,
        )
      }
    }
  }

  // ── Call Anthropic ───────────────────────────────────────
  const { system, user: userPrompt } = buildPrompt(payload)
  const startedAt = Date.now()
  const anthropic = await callAnthropic(apiKey, system, userPrompt)
  const latencyMs = Date.now() - startedAt

  // Always log — even errors and malformed responses — so the
  // future "AI usage" page has accurate cost data.
  const parsed = anthropic.error ? null : safeParse(anthropic.raw)
  const errMsg = anthropic.error
    ? anthropic.error
    : !parsed
    ? 'Could not parse Anthropic response into the expected schema'
    : null

  const auditPayload = {
    organisation_id: organisationId,
    user_id: user.id,
    feature: FEATURE,
    model: MODEL,
    prompt: `[system]\n${system}\n\n[user]\n${userPrompt}`,
    response: anthropic.raw || null,
    tokens_input: anthropic.inputTokens,
    tokens_output: anthropic.outputTokens,
    latency_ms: latencyMs,
    error: errMsg,
  }

  const { data: audit } = await admin
    .from('ai_audit_log')
    .insert(auditPayload)
    .select('id')
    .single()

  if (errMsg || !parsed) {
    return jsonResponse(
      {
        error: errMsg ?? 'Malformed AI response',
        audit_log_id: audit?.id ?? null,
      },
      502,
    )
  }

  // Bump the org quota now that we have a successful response.
  if (organisationId) {
    const { data: quotaRow } = await admin
      .from('ai_usage_quotas')
      .select('id, current_month_used')
      .eq('organisation_id', organisationId)
      .eq('feature', FEATURE)
      .maybeSingle()
    if (quotaRow) {
      await admin
        .from('ai_usage_quotas')
        .update({
          current_month_used: (quotaRow.current_month_used ?? 0) + 1,
        })
        .eq('id', quotaRow.id)
    }
  }

  const response: SuggestResponse = {
    suggestion: parsed.type,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    suggested_frequency: parsed.suggested_frequency,
    next_due_offset_days: parsed.next_due_offset_days,
    audit_log_id: audit?.id ?? null,
  }

  return jsonResponse(response, 200)
})
