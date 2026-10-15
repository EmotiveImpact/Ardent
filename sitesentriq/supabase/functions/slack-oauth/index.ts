// supabase/functions/slack-oauth/index.ts
// Slack OAuth v2 token exchange + connection management.
// Deploy with: supabase functions deploy slack-oauth
//
// Required env (set in Supabase Dashboard > Edge Functions > Secrets):
//   - SLACK_CLIENT_ID
//   - SLACK_CLIENT_SECRET
//   - SUPABASE_URL              (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Body schema:
//   { action: 'authorize',  redirectUri: string, state?: string }
//      → returns the URL the browser must open to start the OAuth flow.
//   { action: 'callback',   code: string, redirectUri: string }
//      → exchanges the code at slack.com/api/oauth.v2.access, stores the
//        connection row, seeds default per-type notification settings.
//   { action: 'disconnect' }
//      → calls auth.revoke + soft-deletes the row.
//
// Auth: caller must be a signed-in Supabase user (Authorization: Bearer <jwt>).
// We resolve their organisation via the user_profiles table.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const SLACK_CLIENT_ID = Deno.env.get('SLACK_CLIENT_ID') ?? ''
const SLACK_CLIENT_SECRET = Deno.env.get('SLACK_CLIENT_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize'
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access'
const SLACK_REVOKE_URL = 'https://slack.com/api/auth.revoke'

// Scopes needed for v1:
//   chat:write           → post messages as the bot
//   incoming-webhook     → user picks a channel; Slack returns a webhook URL
//   channels:read        → list public channels (used for "Test message")
const SLACK_SCOPES = 'chat:write incoming-webhook channels:read'

// 14 notification types — must match NOTIFICATION_TYPES in src/lib/constants.ts
const NOTIFICATION_TYPES = [
  'compliance_due',
  'compliance_overdue',
  'visit_booked',
  'visit_reminder',
  'report_uploaded',
  'quote_awaiting_approval',
  'quote_approved',
  'quote_rejected',
  'invoice_due_soon',
  'invoice_overdue',
  'certificate_expiring',
  'action_overdue',
  'job_completed',
  'document_uploaded',
]

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

interface SlackTokenResponse {
  ok: boolean
  error?: string
  access_token?: string
  scope?: string
  bot_user_id?: string
  app_id?: string
  team?: { id: string; name: string }
  authed_user?: { id: string }
  incoming_webhook?: {
    url: string
    channel: string
    channel_id: string
    configuration_url?: string
  }
}

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<SlackTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: SLACK_CLIENT_ID,
    client_secret: SLACK_CLIENT_SECRET,
    redirect_uri: redirectUri,
  })
  const res = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Slack token exchange HTTP ${res.status}: ${text}`)
  }
  const json = await res.json() as SlackTokenResponse
  if (!json.ok) {
    throw new Error(`Slack token exchange failed: ${json.error ?? 'unknown'}`)
  }
  return json
}

async function revokeSlackToken(accessToken: string): Promise<void> {
  try {
    await fetch(SLACK_REVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
  } catch (err) {
    // Best-effort — Slack revoke failures should not block disconnect.
    console.warn('[slack-oauth] revoke failed:', err)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
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
  // Connecting/disconnecting the org's Slack integration is an admin/manager
  // action — gate it so a low-privilege member can't wire up or tear down the
  // org's notification channel.
  if (!['org_admin', 'manager', 'super_admin'].includes(profile.role as string)) {
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
    // ── authorize: build the Slack OAuth start URL ─────────────
    if (action === 'authorize') {
      if (!SLACK_CLIENT_ID) {
        return jsonResponse({ error: 'SLACK_NOT_CONFIGURED' }, 200)
      }
      const redirectUri = body.redirectUri as string
      if (!redirectUri) return jsonResponse({ error: 'Missing redirectUri' }, 400)
      const state = (body.state as string) || crypto.randomUUID()
      const params = new URLSearchParams({
        client_id: SLACK_CLIENT_ID,
        scope: SLACK_SCOPES,
        redirect_uri: redirectUri,
        state,
      })
      return jsonResponse({ url: `${SLACK_AUTHORIZE_URL}?${params.toString()}`, state })
    }

    // ── callback: exchange code, persist connection, seed settings ─
    if (action === 'callback') {
      if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
        return jsonResponse({ error: 'SLACK_NOT_CONFIGURED' }, 200)
      }
      const code = body.code as string
      const redirectUri = body.redirectUri as string
      if (!code || !redirectUri) return jsonResponse({ error: 'Missing code or redirectUri' }, 400)

      const token = await exchangeCodeForToken(code, redirectUri)

      const { error: upsertErr } = await adminClient.from('slack_connections').upsert({
        organisation_id: organisationId,
        slack_team_id: token.team?.id ?? '',
        slack_team_name: token.team?.name ?? null,
        bot_user_id: token.bot_user_id ?? null,
        access_token: token.access_token ?? '',
        scope: token.scope ?? null,
        incoming_webhook_url: token.incoming_webhook?.url ?? null,
        incoming_webhook_channel: token.incoming_webhook?.channel ?? null,
        incoming_webhook_channel_id: token.incoming_webhook?.channel_id ?? null,
        connected_by_user_id: userId,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
      }, { onConflict: 'organisation_id' })

      if (upsertErr) throw upsertErr

      // Seed default settings (all enabled, info threshold) for any types
      // that don't yet have a row for this org. Idempotent — safe on reconnect.
      const seedRows = NOTIFICATION_TYPES.map((t) => ({
        organisation_id: organisationId,
        notification_type: t,
        enabled: true,
        severity_threshold: 'info',
      }))
      // ignore conflicts on (organisation_id, notification_type)
      await adminClient
        .from('slack_notification_settings')
        .upsert(seedRows, { onConflict: 'organisation_id,notification_type', ignoreDuplicates: true })

      await adminClient.from('slack_post_log').insert({
        organisation_id: organisationId,
        notification_type: null,
        status: 'sent',
        channel: token.incoming_webhook?.channel ?? null,
        error: null,
      })

      return jsonResponse({
        success: true,
        team_name: token.team?.name ?? null,
        channel: token.incoming_webhook?.channel ?? null,
      })
    }

    // ── disconnect: revoke + soft-delete ───────────────────────
    if (action === 'disconnect') {
      const { data: existing } = await adminClient
        .from('slack_connections')
        .select('access_token')
        .eq('organisation_id', organisationId)
        .maybeSingle()

      if (existing?.access_token) {
        await revokeSlackToken(existing.access_token)
      }

      const { error: updErr } = await adminClient
        .from('slack_connections')
        .update({ disconnected_at: new Date().toISOString(), access_token: '' })
        .eq('organisation_id', organisationId)
      if (updErr) throw updErr

      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[slack-oauth] error:', msg)
    await adminClient.from('slack_post_log').insert({
      organisation_id: organisationId,
      notification_type: null,
      status: 'failed',
      error: `${action}: ${msg}`,
    })
    return jsonResponse({ error: msg }, 500)
  }
})
