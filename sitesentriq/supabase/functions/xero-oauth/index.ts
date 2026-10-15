// supabase/functions/xero-oauth/index.ts
// Xero OAuth 2.0 token exchange + connection management.
// Deploy with: supabase functions deploy xero-oauth
// Required env (set in Supabase Dashboard > Edge Functions > Secrets):
//   - XERO_CLIENT_ID
//   - XERO_CLIENT_SECRET
//   - SUPABASE_URL          (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Body schema:
//   { action: 'exchange', code: string, redirectUri: string }
//   { action: 'disconnect' }
//
// Auth: caller must be a signed-in Supabase user (Authorization: Bearer <jwt>).
// We resolve their organisation via the user_profiles table.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const XERO_CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') ?? ''
const XERO_CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

interface XeroTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

interface XeroTenant {
  id: string
  tenantId: string
  tenantType: string
  tenantName: string
  createdDateUtc: string
  updatedDateUtc: string
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<XeroTokenResponse> {
  const basic = btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Xero token exchange failed: ${res.status} ${err}`)
  }
  return await res.json() as XeroTokenResponse
}

async function fetchXeroTenants(accessToken: string): Promise<XeroTenant[]> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Xero connections fetch failed: ${res.status} ${err}`)
  }
  return await res.json() as XeroTenant[]
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // Defensive: if env not configured, do not crash — return a structured error.
  if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET) {
    return jsonResponse({ error: 'XERO_NOT_CONFIGURED' }, 200)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  // Identify caller via JWT
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return jsonResponse({ error: 'Unauthorised' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorised' }, 401)
  const userId = userData.user.id

  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('organisation_id, role')
    .eq('id', userId)
    .maybeSingle()
  if (profileErr || !profile?.organisation_id) {
    return jsonResponse({ error: 'No organisation for user' }, 400)
  }
  const organisationId = profile.organisation_id as string
  // Connecting/disconnecting the org's accounting integration is a finance/admin
  // action (see quickbooks-oauth) — gate it so a low-privilege member can't.
  if (!['org_admin', 'finance', 'super_admin'].includes(profile.role as string)) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const action = (body.action as string) ?? ''

  try {
    if (action === 'exchange') {
      const code = body.code as string
      const redirectUri = body.redirectUri as string
      if (!code || !redirectUri) return jsonResponse({ error: 'Missing code or redirectUri' }, 400)

      const token = await exchangeCodeForToken(code, redirectUri)
      const tenants = await fetchXeroTenants(token.access_token)
      if (!tenants.length) {
        await adminClient.from('accounting_sync_log').insert({
          organisation_id: organisationId,
          provider: 'xero',
          action: 'connect',
          status: 'error',
          error: 'No tenants returned from Xero',
        })
        return jsonResponse({ error: 'No Xero tenants returned' }, 400)
      }
      const tenant = tenants[0]
      const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()

      // Upsert connection (organisation_id is unique)
      const { error: upsertErr } = await adminClient.from('xero_connections').upsert({
        organisation_id: organisationId,
        xero_tenant_id: tenant.tenantId,
        xero_tenant_name: tenant.tenantName,
        refresh_token: token.refresh_token,
        access_token: token.access_token,
        expires_at: expiresAt,
        scopes: token.scope,
        connected_by_user_id: userId,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      }, { onConflict: 'organisation_id' })

      if (upsertErr) throw upsertErr

      await adminClient.from('accounting_sync_log').insert({
        organisation_id: organisationId,
        provider: 'xero',
        action: 'connect',
        status: 'success',
        external_id: tenant.tenantId,
      })

      return jsonResponse({ success: true, tenant_name: tenant.tenantName })
    }

    if (action === 'disconnect') {
      const { error: updateErr } = await adminClient
        .from('xero_connections')
        .update({ disconnected_at: new Date().toISOString() })
        .eq('organisation_id', organisationId)
      if (updateErr) throw updateErr

      await adminClient.from('accounting_sync_log').insert({
        organisation_id: organisationId,
        provider: 'xero',
        action: 'disconnect',
        status: 'success',
      })
      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[xero-oauth] error:', msg)
    await adminClient.from('accounting_sync_log').insert({
      organisation_id: organisationId,
      provider: 'xero',
      action: action || 'unknown',
      status: 'error',
      error: msg,
    })
    return jsonResponse({ error: msg }, 500)
  }
})
