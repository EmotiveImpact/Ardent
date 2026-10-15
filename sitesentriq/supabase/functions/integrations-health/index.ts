// supabase/functions/integrations-health/index.ts
//
// Sprint 2C — single-call manifest of which back-end integrations are
// actually configured for this deployment. Powers the
// /dashboard/settings/health page so org admins can see at a glance
// what's live and what still needs an env var.
//
// We deliberately do NOT make any outbound network calls here (no
// pinging Resend, Stripe, etc.) — that would be slow, paid traffic,
// and rate-limited. Instead we report configured-vs-missing based on
// presence of the env vars + sentinel checks against the database
// (e.g. "the expo_push_tokens table exists and has rows"). A user
// actually sending a test message tells you the rest.
//
// Response shape:
//   {
//     web_push:   { status, missing: string[] },
//     expo_push:  { status, tokenCount },
//     email:      { status, provider: 'resend' | null },
//     stripe:     { status, missing: string[] },
//     slack:      { status, integrationsCount },
//     calendar:   { status },
//     ai:         { status }
//   }
//
//   status ∈ 'configured' | 'misconfigured' | 'unconfigured'

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Status = 'configured' | 'misconfigured' | 'unconfigured'

type CallerContext =
  | { kind: 'service_role' }
  | { kind: 'user'; organisation_id: string; role: string }

interface Section {
  status: Status
  /** Names of env vars that are missing — empty when status === configured. */
  missing?: string[]
  /** Free-form extras (token counts, provider name, etc.) */
  [key: string]: unknown
}

function present(name: string): boolean {
  const v = Deno.env.get(name)
  return typeof v === 'string' && v.length > 0
}

function evalRequired(names: string[]): { status: Status; missing: string[] } {
  const missing = names.filter((n) => !present(n))
  if (missing.length === 0) return { status: 'configured', missing: [] }
  if (missing.length === names.length) return { status: 'unconfigured', missing }
  return { status: 'misconfigured', missing }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split('.')
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isServiceRoleJwt(jwt: string): boolean {
  // Trust the JWT role claim: verify_jwt=true gateway already validated signature.
  // String equality against SUPABASE_SERVICE_ROLE_KEY broke on key rotation.
  return decodeJwtPayload(jwt)?.role === 'service_role'
}

async function resolveCallerContext(req: Request): Promise<CallerContext | Response> {
  const jwt = readBearerToken(req)
  if (!jwt) {
    return jsonResponse({ error: 'missing_authorization' }, 401)
  }

  if (isServiceRoleJwt(jwt)) {
    return { kind: 'service_role' }
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'invalid_authorization' }, 401)
  }

  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('organisation_id, role')
    .eq('id', userData.user.id)
    .single()

  if (profileErr || !profile?.organisation_id || !profile.role) {
    return jsonResponse({ error: 'profile_organisation_not_found' }, 403)
  }

  return {
    kind: 'user',
    organisation_id: String(profile.organisation_id),
    role: String(profile.role),
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller
  if (caller.kind === 'user' && !['super_admin', 'org_admin'].includes(caller.role)) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  // ---- Web push (VAPID) ---------------------------------------------
  const webPush: Section = evalRequired([
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
  ])

  // ---- Email (Resend) -----------------------------------------------
  const email: Section = present('RESEND_API_KEY')
    ? { status: 'configured', provider: 'resend' }
    : { status: 'unconfigured', missing: ['RESEND_API_KEY'], provider: null }

  // ---- Stripe -------------------------------------------------------
  // STRIPE_SECRET_KEY is the minimum to run checkout.
  // STRIPE_WEBHOOK_SECRET is required for the stripe-webhook function
  // to validate signatures — without it, webhooks are silently ignored.
  const stripe: Section = evalRequired([
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ])

  // ---- Slack --------------------------------------------------------
  // Slack uses a per-org install rather than a single env var, so we
  // count organisation installs as a proxy for "anyone can post".
  let slack: Section = { status: 'unconfigured', integrationsCount: 0 }
  let expoPush: Section = { status: 'unconfigured', tokenCount: 0 }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    let slackQuery = admin
      .from('slack_connections')
      .select('id', { count: 'exact', head: true })
    if (caller.kind === 'user') {
      slackQuery = slackQuery.eq('organisation_id', caller.organisation_id)
    }
    const { count: slackCount } = await slackQuery
    slack = {
      status: (slackCount ?? 0) > 0 ? 'configured' : 'unconfigured',
      integrationsCount: slackCount ?? 0,
    }
  } catch (err) {
    // Table might not exist on older deploys — treat as unconfigured.
    console.debug('[integrations-health] slack lookup failed:', err)
  }

  try {
    let expoQuery = admin
      .from('expo_push_tokens')
      .select('id', { count: 'exact', head: true })
    if (caller.kind === 'user') {
      expoQuery = expoQuery.eq('organisation_id', caller.organisation_id)
    }
    const { count: tokenCount } = await expoQuery
    expoPush = {
      status: (tokenCount ?? 0) > 0 ? 'configured' : 'unconfigured',
      tokenCount: tokenCount ?? 0,
    }
  } catch (err) {
    console.debug('[integrations-health] expo token lookup failed:', err)
  }

  // ---- Calendar (Google) --------------------------------------------
  // Calendar sync is opt-in per user (OAuth), so the org-level signal
  // is "do we have the OAuth client configured at the platform level".
  const calendar: Section = evalRequired([
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
  ])

  // ---- AI (OpenAI / Anthropic) --------------------------------------
  // AI suggestion features need at least one provider key.
  const ai: Section = present('OPENAI_API_KEY') || present('ANTHROPIC_API_KEY')
    ? {
        status: 'configured',
        provider: present('OPENAI_API_KEY') ? 'openai' : 'anthropic',
      }
    : { status: 'unconfigured', missing: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'] }

  return jsonResponse(
    {
      web_push: webPush,
      expo_push: expoPush,
      email,
      stripe,
      slack,
      calendar,
      ai,
    },
    200,
  )
})
