// supabase/functions/sso-jit-provision/index.ts
//
// Just-In-Time provisioning for SSO sign-ins (Microsoft Entra +
// Google Workspace). The browser calls this immediately after the
// OAuth round-trip lands the user back at /auth/sso/callback.
//
// Flow:
//   1. Verify the caller's JWT — they must already be authenticated
//      against Supabase (the OAuth exchange handles that).
//   2. Look up an active row in `sso_domain_mappings` for the user's
//      email domain.
//      - No row              → return { action: 'no_mapping' } so the
//                              client routes to onboarding.
//      - auto_provision=false → { action: 'blocked' }.
//      - Found and auto on   → upsert profile.org_id + role. If the
//                              user already has a different org we
//                              do NOT overwrite (no silent re-tenant).
//   3. Append a row to `sso_provisioning_log` for audit.
//
// Deploy:
//   supabase functions deploy sso-jit-provision
//
// Required env (auto-set by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Action =
  | 'provisioned'
  | 'already_member'
  | 'blocked'
  | 'no_mapping'
  | 'error'

interface JitBody {
  user_id?: string
  email?: string
  provider?: 'azure' | 'google' | string
}

interface JitResult {
  action: Action
  org_id: string | null
  role: string | null
  error?: string
}

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function userClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return null
  const d = email.slice(at + 1).trim().toLowerCase()
  return d.includes('.') ? d : null
}

function json(body: JitResult, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function logAttempt(
  db: SupabaseClient,
  row: {
    email: string
    domain: string
    org_id: string | null
    provider: string
    action: Action
    error_message?: string | null
  }
) {
  try {
    await db.from('sso_provisioning_log').insert({
      email: row.email,
      domain: row.domain,
      org_id: row.org_id,
      provider: row.provider,
      action: row.action,
      error_message: row.error_message ?? null,
    })
  } catch (err) {
    // Don't fail the user-facing flow on a logging blip.
    console.error('[sso-jit-provision] log insert failed:', err)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json(
      { action: 'error', org_id: null, role: null, error: 'Method not allowed' },
      405
    )
  }

  // ── 1. Authenticate ──────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return json(
      { action: 'error', org_id: null, role: null, error: 'Missing bearer token' },
      401
    )
  }

  const { data: userData, error: userErr } = await userClient(
    jwt
  ).auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return json(
      { action: 'error', org_id: null, role: null, error: 'Invalid token' },
      401
    )
  }

  const authedUser = userData.user

  let body: JitBody
  try {
    body = (await req.json()) as JitBody
  } catch {
    return json(
      { action: 'error', org_id: null, role: null, error: 'Invalid JSON body' },
      400
    )
  }

  // SECURITY (CRITICAL): email + provider + user_id MUST be derived from the
  // VERIFIED JWT, never from the request body. The email's DOMAIN decides which
  // organisation (and role) the user is JIT-provisioned into — trusting
  // body.email let any authenticated user POST { email: "x@target-org.com" } and
  // join an arbitrary SSO-mapped org with that org's default role
  // (cross-tenant join + privilege escalation). body.* is ignored here.
  const email = (authedUser.email ?? '').toLowerCase().trim()
  const provider = (authedUser.app_metadata?.provider ?? '').toString()
  const userId = authedUser.id

  if (body.user_id && body.user_id !== authedUser.id) {
    return json(
      { action: 'error', org_id: null, role: null, error: 'user_id mismatch' },
      403
    )
  }
  if (!email) {
    return json(
      { action: 'error', org_id: null, role: null, error: 'email required' },
      400
    )
  }

  const domain = extractDomain(email)
  if (!domain) {
    return json(
      { action: 'error', org_id: null, role: null, error: 'invalid email' },
      400
    )
  }

  const db = adminClient()

  // ── 2. Look up domain mapping ────────────────────────────
  const { data: mapping, error: mapErr } = await db
    .from('sso_domain_mappings')
    .select('organisation_id, default_role, auto_provision')
    .eq('domain', domain)
    .is('disabled_at', null)
    .maybeSingle()

  if (mapErr) {
    await logAttempt(db, {
      email,
      domain,
      org_id: null,
      provider,
      action: 'error',
      error_message: mapErr.message,
    })
    return json({
      action: 'error',
      org_id: null,
      role: null,
      error: `domain lookup failed: ${mapErr.message}`,
    })
  }

  if (!mapping) {
    await logAttempt(db, {
      email,
      domain,
      org_id: null,
      provider,
      action: 'no_mapping',
    })
    return json({ action: 'no_mapping', org_id: null, role: null })
  }

  if (!mapping.auto_provision) {
    await logAttempt(db, {
      email,
      domain,
      org_id: mapping.organisation_id as string,
      provider,
      action: 'blocked',
    })
    return json({
      action: 'blocked',
      org_id: mapping.organisation_id as string,
      role: null,
    })
  }

  const targetOrgId = mapping.organisation_id as string
  const targetRole = (mapping.default_role as string) ?? 'engineer'

  // ── 3. Provision profile ─────────────────────────────────
  // Read the existing profile (the auto_profile_trigger creates one
  // on user signup, but we don't rely on that — we upsert.)
  const { data: existingProfile, error: profErr } = await db
    .from('profiles')
    .select('id, organisation_id, role')
    .eq('id', userId)
    .maybeSingle()

  if (profErr) {
    await logAttempt(db, {
      email,
      domain,
      org_id: targetOrgId,
      provider,
      action: 'error',
      error_message: profErr.message,
    })
    return json({
      action: 'error',
      org_id: targetOrgId,
      role: null,
      error: profErr.message,
    })
  }

  // Already a member of the target org with the right role → no-op.
  if (
    existingProfile &&
    existingProfile.organisation_id === targetOrgId &&
    existingProfile.role === targetRole
  ) {
    await logAttempt(db, {
      email,
      domain,
      org_id: targetOrgId,
      provider,
      action: 'already_member',
    })
    return json({
      action: 'already_member',
      org_id: targetOrgId,
      role: targetRole,
    })
  }

  // Already in a *different* org → don't silently retenant. Treat as
  // already_member (their existing org wins) and log it.
  if (
    existingProfile &&
    existingProfile.organisation_id &&
    existingProfile.organisation_id !== targetOrgId
  ) {
    await logAttempt(db, {
      email,
      domain,
      org_id: existingProfile.organisation_id as string,
      provider,
      action: 'already_member',
    })
    return json({
      action: 'already_member',
      org_id: existingProfile.organisation_id as string,
      role: existingProfile.role as string,
    })
  }

  // Upsert profile with target org + role.
  const upsertRow = {
    id: userId,
    email,
    organisation_id: targetOrgId,
    role: targetRole,
  }
  const { error: upsertErr } = await db
    .from('profiles')
    .upsert(upsertRow, { onConflict: 'id' })

  if (upsertErr) {
    await logAttempt(db, {
      email,
      domain,
      org_id: targetOrgId,
      provider,
      action: 'error',
      error_message: upsertErr.message,
    })
    return json({
      action: 'error',
      org_id: targetOrgId,
      role: null,
      error: upsertErr.message,
    })
  }

  await logAttempt(db, {
    email,
    domain,
    org_id: targetOrgId,
    provider,
    action: 'provisioned',
  })
  return json({
    action: 'provisioned',
    org_id: targetOrgId,
    role: targetRole,
  })
})
