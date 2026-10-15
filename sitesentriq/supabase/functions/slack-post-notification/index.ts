// supabase/functions/slack-post-notification/index.ts
// Posts a notification event into the org's connected Slack channel.
// Called by the in-app notification creator (defensive fire-and-forget) and
// any other server-side caller (Postgres triggers via pg_net, Edge Functions, etc.)
// Deploy with: supabase functions deploy slack-post-notification
//
// Required env (Supabase Dashboard → Edge Functions → Secrets):
//   - SUPABASE_URL              (auto-injected)
//   - SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Body schema:
//   {
//     org_id:   string,    // organisation_id
//     type:     string,    // one of NOTIFICATION_TYPES
//     title:    string,    // displayed in the header block
//     body:     string,    // displayed in the section block (Markdown)
//     link?:    string,    // optional "View in Facilities OS" deep link
//     severity?: 'info' | 'warning' | 'critical' | 'success', // default 'info'
//     context?: { property?: string, client?: string }
//   }
//
// Auth: this function uses the service role key internally; we accept either
// the supabase anon key (for in-app callers) OR the service role key (for
// Postgres triggers via pg_net). We DO NOT require an end-user JWT — the
// org_id in the body identifies the tenant. Callers must already trust the
// payload (this is server-side-only).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

type CallerContext =
  | { kind: 'service_role' }
  | { kind: 'user'; organisation_id: string }

type Severity = 'info' | 'warning' | 'critical' | 'success'

interface PostBody {
  org_id?: string
  type: string
  title: string
  body: string
  link?: string
  severity?: Severity
  context?: { property?: string; client?: string }
}

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  success: 0,
  warning: 1,
  critical: 2,
}

const SEVERITY_EMOJI: Record<Severity, string> = {
  info: ':information_source:',
  success: ':white_check_mark:',
  warning: ':warning:',
  critical: ':rotating_light:',
}

const SEVERITY_COLOR: Record<Severity, string> = {
  info: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
}

interface BlockKitBlock {
  type: string
  // deliberately permissive — Block Kit is JSON
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any
}

interface BlockKitPayload {
  text?: string
  blocks: BlockKitBlock[]
  attachments?: Array<{ color: string; blocks: BlockKitBlock[] }>
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
    .select('organisation_id')
    .eq('id', userData.user.id)
    .single()

  if (profileErr || !profile?.organisation_id) {
    return jsonResponse({ error: 'profile_organisation_not_found' }, 403)
  }

  return { kind: 'user', organisation_id: String(profile.organisation_id) }
}

function buildBlockKitPayload(input: PostBody): BlockKitPayload {
  const severity: Severity = input.severity ?? 'info'
  const emoji = SEVERITY_EMOJI[severity] ?? ':bell:'
  const color = SEVERITY_COLOR[severity] ?? '#64748b'

  const blocks: BlockKitBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji}  ${input.title}`.slice(0, 150), emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: input.body.slice(0, 2900) },
    },
  ]

  const ctxElements: BlockKitBlock[] = []
  ctxElements.push({ type: 'mrkdwn', text: `*Severity:* ${severity}` })
  ctxElements.push({ type: 'mrkdwn', text: `*Type:* \`${input.type}\`` })
  if (input.context?.client) {
    ctxElements.push({ type: 'mrkdwn', text: `*Client:* ${input.context.client}` })
  }
  if (input.context?.property) {
    ctxElements.push({ type: 'mrkdwn', text: `*Property:* ${input.context.property}` })
  }
  blocks.push({ type: 'context', elements: ctxElements })

  if (input.link) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View in Facilities OS' },
          url: input.link,
          style: severity === 'critical' ? 'danger' : 'primary',
        },
      ],
    })
  }

  return {
    text: input.title, // fallback for notifications previews
    attachments: [{ color, blocks }],
    blocks: [],
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

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let payload: PostBody
  try {
    payload = await req.json() as PostBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const verifiedOrgId =
    caller.kind === 'service_role' ? payload.org_id : caller.organisation_id

  if (!verifiedOrgId || !payload.type || !payload.title) {
    return jsonResponse({ error: 'Missing org_id, type, or title' }, 400)
  }

  try {
    // 1. Look up the connection
    const { data: conn, error: connErr } = await adminClient
      .from('slack_connections')
      .select('incoming_webhook_url, incoming_webhook_channel, disconnected_at')
      .eq('organisation_id', verifiedOrgId)
      .maybeSingle()

    if (connErr) throw connErr
    if (!conn || conn.disconnected_at || !conn.incoming_webhook_url) {
      // Not connected — silent no-op (in-app notification still landed).
      return jsonResponse({ skipped: true, reason: 'not_connected' })
    }

    // 2. Look up per-type settings
    const { data: setting } = await adminClient
      .from('slack_notification_settings')
      .select('enabled, custom_channel, severity_threshold')
      .eq('organisation_id', verifiedOrgId)
      .eq('notification_type', payload.type)
      .maybeSingle()

    if (setting && !setting.enabled) {
      await adminClient.from('slack_post_log').insert({
        organisation_id: verifiedOrgId,
        notification_type: payload.type,
        status: 'skipped',
        error: 'type disabled',
      })
      return jsonResponse({ skipped: true, reason: 'type_disabled' })
    }

    const threshold = (setting?.severity_threshold as string) ?? 'info'
    const severity: Severity = payload.severity ?? 'info'
    if ((SEVERITY_RANK[severity] ?? 0) < (SEVERITY_RANK[threshold] ?? 0)) {
      await adminClient.from('slack_post_log').insert({
        organisation_id: verifiedOrgId,
        notification_type: payload.type,
        status: 'skipped',
        error: `below threshold (${severity} < ${threshold})`,
      })
      return jsonResponse({ skipped: true, reason: 'below_threshold' })
    }

    // 3. Build the Block Kit payload
    const block = buildBlockKitPayload(payload)
    const channel = setting?.custom_channel || conn.incoming_webhook_channel

    // Slack incoming webhooks ignore the `channel` field — it's tied to the
    // webhook itself. We surface custom_channel in the log for clarity.
    const slackRes = await fetch(conn.incoming_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(block),
    })

    if (!slackRes.ok) {
      const errText = await slackRes.text()
      await adminClient.from('slack_post_log').insert({
        organisation_id: verifiedOrgId,
        notification_type: payload.type,
        status: 'failed',
        error: `Slack ${slackRes.status}: ${errText.slice(0, 500)}`,
        channel,
      })
      return jsonResponse({ error: `Slack post failed: ${slackRes.status}` }, 502)
    }

    // Webhook responses don't include a message ts (only chat.postMessage does);
    // we record what we have.
    const ts = slackRes.headers.get('x-slack-req-id') ?? null

    await adminClient.from('slack_post_log').insert({
      organisation_id: verifiedOrgId,
      notification_type: payload.type,
      status: 'sent',
      slack_message_ts: ts,
      channel,
    })

    await adminClient
      .from('slack_connections')
      .update({ last_posted_at: new Date().toISOString() })
      .eq('organisation_id', verifiedOrgId)

    return jsonResponse({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[slack-post-notification] error:', msg)
    try {
      await adminClient.from('slack_post_log').insert({
        organisation_id: verifiedOrgId,
        notification_type: payload.type,
        status: 'failed',
        error: msg,
      })
    } catch (_) {
      // swallow — logging is best-effort
    }
    return jsonResponse({ error: msg }, 500)
  }
})
