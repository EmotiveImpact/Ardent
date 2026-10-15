// supabase/functions/send-push/index.ts
//
// Web Push fan-out. Given a list of `user_ids` (or a single `user_id`),
// looks up every active row in `notification_subscriptions` for those
// users, builds a Web Push payload, signs it with the org's VAPID
// keypair, and POSTs to each subscription's endpoint.
//
// Auth model: this endpoint is called server-side from the in-app
// notification creator (anon key + JWT — caller is the user being
// notified or an admin notifying others) AND from Postgres triggers
// via pg_net (service role). We use the service role key internally
// so we can read across users (a user may be sending a notification
// to a colleague). RLS on `notification_subscriptions` only permits
// `user_id = auth.uid()` — the service role bypasses it.
//
// VAPID library decision:
//   We use `npm:web-push@3.6.7`. Deno supports `npm:` specifiers since
//   1.28 and the Supabase Edge Runtime (Deno 1.45+) handles it natively.
//   Hand-rolling Web Push (ECDH P-256 + HKDF + AES-GCM + JWT ES256) is
//   ~80 LOC of fragile crypto; using the audited library is safer.
//
// Server-side ENV (set via Supabase Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY     — base64url, public half of the VAPID keypair
//   VAPID_PRIVATE_KEY    — base64url, private half
//   VAPID_SUBJECT        — `mailto:notifications@haumea.com`
//   SUPABASE_URL         — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
//
// Generate keys:
//   npx web-push generate-vapid-keys --json
//
// Body schema (both forms accepted):
//   { user_ids: string[], title, body, link?, icon? }
//   { user_id:  string,   payload: { title, body?, url?, icon?, data? } }
//
// Response:
//   { unconfigured: true }                       — VAPID env vars missing
//   { sent: N, failed: M, removed: K }           — fan-out result
//   { error: string }                            — bad input / 5xx
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt=false

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:notifications@haumea.com'

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

interface PushBodyMulti {
  user_ids: string[]
  title: string
  body: string
  link?: string
  icon?: string
  data?: Record<string, unknown>
}

interface PushBodySingle {
  user_id: string
  payload: {
    title: string
    body?: string
    url?: string
    icon?: string
    data?: Record<string, unknown>
  }
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string | null
  auth: string | null
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

/** Normalise either body shape into a `(userIds, pushPayload)` pair. */
function normaliseBody(input: unknown): {
  userIds: string[]
  payload: { title: string; body: string; url?: string; icon?: string; data?: Record<string, unknown> }
} | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>

  // Multi-user shape
  if (Array.isArray(obj.user_ids) && typeof obj.title === 'string') {
    const b = obj as unknown as PushBodyMulti
    return {
      userIds: b.user_ids.filter((u) => typeof u === 'string'),
      payload: {
        title: b.title,
        body: b.body ?? '',
        url: b.link,
        icon: b.icon,
        data: b.data,
      },
    }
  }

  // Single-user shape (matches src/lib/push.ts sendPush())
  if (typeof obj.user_id === 'string' && obj.payload && typeof obj.payload === 'object') {
    const b = obj as unknown as PushBodySingle
    return {
      userIds: [b.user_id],
      payload: {
        title: b.payload.title,
        body: b.payload.body ?? '',
        url: b.payload.url,
        icon: b.payload.icon,
        data: b.payload.data,
      },
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
    console.error('[send-push] profile target lookup failed:', error.message)
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

  // Defensive — UI hides cleanly when the function returns this.
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ unconfigured: true })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = normaliseBody(raw)
  if (!parsed || parsed.userIds.length === 0 || !parsed.payload.title) {
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

  // Configure web-push for this invocation. (web-push caches the details
  // statically, but each cold-start re-runs this — safe.)
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'VAPID setup failed'
    console.error('[send-push] setVapidDetails failed:', msg)
    return jsonResponse({ error: `VAPID config invalid: ${msg}` }, 500)
  }

  // Fetch all subscriptions for the target users in one query.
  const { data: subs, error: subsErr } = await adminClient
    .from('notification_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', targetUserIds)

  if (subsErr) {
    console.error('[send-push] sub lookup failed:', subsErr.message)
    return jsonResponse({ error: 'Subscription lookup failed' }, 500)
  }

  if (!subs || subs.length === 0) {
    // No active subscriptions across all users — not an error.
    return jsonResponse({ sent: 0, failed: 0, removed: 0 })
  }

  // Build the payload once. Service workers receive this as `event.data`.
  const wireBody = JSON.stringify({
    title: parsed.payload.title,
    body: parsed.payload.body,
    url: parsed.payload.url ?? '/',
    icon: parsed.payload.icon ?? '/icons/icon-192.png',
    data: parsed.payload.data ?? {},
  })

  let sent = 0
  let failed = 0
  const toDelete: string[] = []

  // web-push.sendNotification is async per endpoint; fan out in parallel.
  await Promise.all(
    (subs as SubscriptionRow[]).map(async (s) => {
      if (!s.p256dh || !s.auth) {
        // Malformed subscription — drop it.
        toDelete.push(s.id)
        return
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          wireBody,
          { TTL: 60 * 60 * 24 }, // 24h — push servers retry within this window
        )
        sent++
      } catch (err) {
        // web-push throws WebPushError with a `statusCode` on protocol errors.
        // 410 Gone / 404 Not Found mean the subscription is dead — clean up.
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 410 || statusCode === 404) {
          toDelete.push(s.id)
        } else {
          failed++
          const msg = err instanceof Error ? err.message : 'unknown'
          console.warn(`[send-push] endpoint ${s.endpoint.slice(0, 60)}… failed (${statusCode ?? '?'}):`, msg)
        }
      }
    }),
  )

  // Best-effort cleanup of dead subscriptions.
  let removed = 0
  if (toDelete.length > 0) {
    const { error: delErr, count } = await adminClient
      .from('notification_subscriptions')
      .delete({ count: 'exact' })
      .in('id', toDelete)
    if (delErr) {
      console.warn('[send-push] cleanup failed:', delErr.message)
    } else {
      removed = count ?? toDelete.length
    }
  }

  return jsonResponse({ sent, failed, removed })
})
