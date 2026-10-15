// supabase/functions/quickbooks-oauth/index.ts
// QuickBooks Online OAuth 2.0 token exchange + connection management.
// Deploy with: supabase functions deploy quickbooks-oauth
// Required env:
//   - QUICKBOOKS_CLIENT_ID
//   - QUICKBOOKS_CLIENT_SECRET
//   - QUICKBOOKS_ENV (optional, 'sandbox' | 'production'; default 'production')
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Body schema:
//   { action: 'exchange', code: string, redirectUri: string, realmId: string }
//   { action: 'disconnect' }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const QB_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID') ?? ''
const QB_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

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

interface QbTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  x_refresh_token_expires_in: number
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<QbTokenResponse> {
  const basic = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`QuickBooks token exchange failed: ${res.status} ${err}`)
  }
  return await res.json() as QbTokenResponse
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
    return jsonResponse({ error: 'QUICKBOOKS_NOT_CONFIGURED' }, 200)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return jsonResponse({ error: 'Unauthorised' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ error: 'Unauthorised' }, 401)
  const userId = userData.user.id

  const { data: profile } = await admin
    .from('profiles')
    .select('organisation_id, role')
    .eq('id', userId)
    .maybeSingle()
  if (!profile?.organisation_id) return jsonResponse({ error: 'No organisation' }, 400)
  const organisationId = profile.organisation_id as string
  // Connecting/disconnecting the org's accounting integration is a finance/admin
  // action — without this gate any authenticated member (engineer, auditor, …)
  // could disconnect QuickBooks or attach a connection.
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
      const realmId = body.realmId as string
      if (!code || !redirectUri || !realmId) {
        return jsonResponse({ error: 'Missing code, redirectUri, or realmId' }, 400)
      }

      const token = await exchangeCodeForToken(code, redirectUri)
      const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString()

      const { error: upsertErr } = await admin.from('quickbooks_connections').upsert({
        organisation_id: organisationId,
        quickbooks_realm_id: realmId,
        refresh_token: token.refresh_token,
        access_token: token.access_token,
        expires_at: expiresAt,
        scopes: 'com.intuit.quickbooks.accounting',
        connected_by_user_id: userId,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      }, { onConflict: 'organisation_id' })
      if (upsertErr) throw upsertErr

      await admin.from('accounting_sync_log').insert({
        organisation_id: organisationId,
        provider: 'quickbooks',
        action: 'connect',
        status: 'success',
        external_id: realmId,
      })

      return jsonResponse({ success: true, realm_id: realmId })
    }

    if (action === 'disconnect') {
      const { error: updErr } = await admin
        .from('quickbooks_connections')
        .update({ disconnected_at: new Date().toISOString() })
        .eq('organisation_id', organisationId)
      if (updErr) throw updErr
      await admin.from('accounting_sync_log').insert({
        organisation_id: organisationId,
        provider: 'quickbooks',
        action: 'disconnect',
        status: 'success',
      })
      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[quickbooks-oauth] error:', msg)
    await admin.from('accounting_sync_log').insert({
      organisation_id: organisationId,
      provider: 'quickbooks',
      action: action || 'unknown',
      status: 'error',
      error: msg.slice(0, 1000),
    })
    return jsonResponse({ error: msg }, 500)
  }
})
