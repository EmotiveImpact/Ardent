// supabase/functions/send-expo-push/index.ts
//
// Sprint 2A — Expo push fan-out for mobile devices.
//
// Why this is separate from `send-push`:
//   `send-push` handles browser Web Push via VAPID (notification_subscriptions
//   table, web-push npm). Expo's push API is HTTP — POST a JSON array of
//   messages to https://exp.host/--/api/v2/push/send and Expo handles the
//   APNs / FCM relay. The token format and protocol are completely
//   different, so a single function would be a confused mess.
//
// Body shapes (both accepted, mirroring `send-push`):
//   { user_ids: string[], title, body, link?, data? }
//   { user_id:  string,   payload: { title, body?, url?, data? } }
//
// Response:
//   { sent: N, failed: M, removed: K }
//
// Auth model:
//   Same as send-push — service role used internally so we can read
//   tokens across users (a notification recipient may not be the caller).
//
// Cleanup:
//   Expo's response includes a per-message status. Tokens that come back
//   as DeviceNotRegistered are deleted from expo_push_tokens — they're
//   dead (app uninstalled, token rotated, etc.). Other errors are logged
//   and counted as `failed` but the token is preserved for retry.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
// Expo accepts an optional access token for higher rate limits + analytics
// on the Expo dashboard. Falls back to public unauthenticated sends if
// not set — works fine for low volume.
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? ''

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

interface TokenRow {
  id: string
  token: string
}

interface ExpoMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  // Expo's "high" maps to APNs interruption-level=time-sensitive on iOS
  // and Android NotificationCompat.PRIORITY_HIGH. We always want field
  // notifications to wake the lock screen.
  priority: 'high'
  // Sound: 'default' uses the platform's default. Anything custom needs
  // bundling into the build, so 'default' it is.
  sound: 'default'
  // Channel id for Android (matches the one set in registerForPushNotificationsAsync)
  channelId: 'default'
}

interface ExpoTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
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

function normaliseBody(input: unknown): {
  userIds: string[]
  title: string
  body: string
  data?: Record<string, unknown>
  url?: string
} | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>

  // Multi-user shape
  if (Array.isArray(obj.user_ids) && typeof obj.title === 'string') {
    return {
      userIds: obj.user_ids.filter((u) => typeof u === 'string'),
      title: obj.title as string,
      body: typeof obj.body === 'string' ? obj.body : '',
      data: (obj.data as Record<string, unknown>) ?? undefined,
      url: typeof obj.link === 'string' ? obj.link : undefined,
    }
  }

  // Single-user shape
  if (typeof obj.user_id === 'string' && obj.payload && typeof obj.payload === 'object') {
    const p = obj.payload as Record<string, unknown>
    if (typeof p.title !== 'string') return null
    return {
      userIds: [obj.user_id as string],
      title: p.title,
      body: typeof p.body === 'string' ? p.body : '',
      data: (p.data as Record<string, unknown>) ?? undefined,
      url: typeof p.url === 'string' ? p.url : undefined,
    }
  }

  return null
}

async function resolveTargetUserIds(
  adminClient: ReturnType<typeof createClient>,
  caller: CallerContext,
  requestedUserIds: string[],
): Promise<string[]> {
  const uniqueIds = Array.from(new Set(requestedUserIds))
  if (caller.kind === 'service_role') return uniqueIds

  const { data, error } = await adminClient
    .from('profiles')
    .select('id')
    .in('id', uniqueIds)
    .eq('organisation_id', caller.organisation_id)

  if (error) {
    console.error('[send-expo-push] profile target lookup failed:', error.message)
    throw new Error('Target lookup failed')
  }

  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
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

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = normaliseBody(raw)
  if (!parsed || parsed.userIds.length === 0 || !parsed.title) {
    return jsonResponse({ error: 'Missing user_id(s) or title' }, 400)
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  let targetUserIds: string[]
  try {
    targetUserIds = await resolveTargetUserIds(adminClient, caller, parsed.userIds)
  } catch {
    return jsonResponse({ error: 'Target lookup failed' }, 500)
  }
  if (targetUserIds.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, removed: 0 })
  }

  // Pull all tokens for the target users in one query.
  const { data: tokens, error: tokensErr } = await adminClient
    .from('expo_push_tokens')
    .select('id, token')
    .in('user_id', targetUserIds)

  if (tokensErr) {
    console.error('[send-expo-push] token lookup failed:', tokensErr.message)
    return jsonResponse({ error: 'Token lookup failed' }, 500)
  }
  if (!tokens || tokens.length === 0) {
    return jsonResponse({ sent: 0, failed: 0, removed: 0 })
  }

  // Build one Expo message per token. Expo accepts up to 100 per request
  // — chunk just in case (a busy org can easily have >100 tokens once
  // engineers + admins all have devices).
  const tokenRows = tokens as TokenRow[]
  const messages: ExpoMessage[] = tokenRows.map((t) => ({
    to: t.token,
    title: parsed.title,
    body: parsed.body,
    data: { ...(parsed.data ?? {}), ...(parsed.url ? { url: parsed.url } : {}) },
    priority: 'high',
    sound: 'default',
    channelId: 'default',
  }))

  const tokenById = new Map(tokenRows.map((t) => [t.token, t.id]))

  let sent = 0
  let failed = 0
  const toDelete: string[] = []

  // Chunk into batches of 100 (Expo's documented per-request limit).
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100)
    let response: Response
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(EXPO_ACCESS_TOKEN ? { 'Authorization': `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(batch),
      })
    } catch (err) {
      console.error('[send-expo-push] batch fetch threw:', err)
      failed += batch.length
      continue
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.warn(`[send-expo-push] batch HTTP ${response.status}:`, text.slice(0, 200))
      failed += batch.length
      continue
    }

    const json = (await response.json().catch(() => null)) as { data?: ExpoTicket[] } | null
    const tickets = json?.data ?? []

    // Tickets are returned in the same order as the request batch.
    tickets.forEach((ticket, idx) => {
      const msg = batch[idx]
      if (ticket.status === 'ok') {
        sent++
      } else {
        const errCode = ticket.details?.error
        if (errCode === 'DeviceNotRegistered') {
          // Token is dead — schedule for deletion.
          const id = tokenById.get(msg.to)
          if (id) toDelete.push(id)
        } else {
          failed++
          console.warn(`[send-expo-push] ticket error (${errCode ?? '?'}):`, ticket.message ?? '')
        }
      }
    })

    // Bump last_used_at for every token in the batch where the ticket
    // came back ok. We do this in one UPDATE per batch rather than per
    // message to keep the round-trips down.
    const okTokens: string[] = []
    tickets.forEach((ticket, idx) => {
      if (ticket.status === 'ok') okTokens.push(batch[idx].to)
    })
    if (okTokens.length > 0) {
      const { error: bumpErr } = await adminClient
        .from('expo_push_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .in('token', okTokens)
      if (bumpErr) {
        console.warn('[send-expo-push] last_used_at bump failed:', bumpErr.message)
      }
    }
  }

  // Clean up dead tokens.
  let removed = 0
  if (toDelete.length > 0) {
    const { error: delErr, count } = await adminClient
      .from('expo_push_tokens')
      .delete({ count: 'exact' })
      .in('id', toDelete)
    if (delErr) {
      console.warn('[send-expo-push] cleanup failed:', delErr.message)
    } else {
      removed = count ?? toDelete.length
    }
  }

  return jsonResponse({ sent, failed, removed })
})
