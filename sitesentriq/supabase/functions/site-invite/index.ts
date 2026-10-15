// supabase/functions/site-invite/index.ts
// Wave 14 / Task 114 — Tenant portal invite flow.
//
// POST { property_id, client_id, email, full_name, role_at_site }
// Authorisation: caller must be an authenticated org_admin in the
// same organisation as the property.
//
// Behaviour:
//   1. Generate a 32-char URL-safe random token.
//   2. Upsert into property_contacts on (property_id, email).
//   3. Email the recipient with /site/accept-invite?invite=TOKEN.
//   4. Return { id, email, status }.
//
// Deploy: supabase functions deploy site-invite
// Required env (auto-set):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// Optional:
//   PUBLIC_APP_URL — base URL used for the accept-invite link
//                    (defaults to https://app.haumea.com)
//   RESEND_API_KEY — for email send via the existing send-email fn

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const PUBLIC_APP_URL =
  Deno.env.get('PUBLIC_APP_URL') ?? 'https://app.haumea.com'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InviteBody {
  property_id?: string
  client_id?: string
  email?: string
  full_name?: string
  role_at_site?: string
}

function admin(): SupabaseClient {
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function generateToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  // Base64url, 32 chars
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sendInviteEmail(args: {
  to: string
  fullName: string
  propertyName: string
  orgName: string
  inviteUrl: string
}): Promise<void> {
  // Reuse existing send-email function rather than calling Resend directly.
  try {
    const url = `${SUPABASE_URL}/functions/v1/send-email`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to: args.to,
        template: 'invite',
        data: {
          recipientName: args.fullName,
          inviterName: args.orgName,
          organisationName: `${args.propertyName} — ${args.orgName}`,
          role: 'site contact',
          signupUrl: args.inviteUrl,
        },
      }),
    })
    if (!res.ok) {
      console.error('[site-invite] email failed:', res.status, await res.text())
    }
  } catch (err) {
    console.error('[site-invite] email error:', err)
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // 1. Authenticate caller (must be a signed-in org user).
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return json({ error: 'Missing bearer token' }, 401)

  const userDb = userClient(jwt)
  const { data: userData, error: userErr } = await userDb.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return json({ error: 'Invalid token' }, 401)
  }
  const callerId = userData.user.id

  // Look up caller profile (org + role).
  const adminDb = admin()
  const { data: profile } = await adminDb
    .from('profiles')
    .select('id, organisation_id, role')
    .eq('id', callerId)
    .single()
  if (!profile) return json({ error: 'No profile' }, 403)
  if (
    profile.role !== 'org_admin' &&
    profile.role !== 'super_admin' &&
    profile.role !== 'scheduler'
  ) {
    return json({ error: 'Insufficient role' }, 403)
  }

  // 2. Parse body.
  let body: InviteBody
  try {
    body = (await req.json()) as InviteBody
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const { property_id, client_id, email, full_name } = body
  const role_at_site = body.role_at_site || 'site_lead'

  if (!property_id || !client_id || !email || !full_name) {
    return json({ error: 'Missing required fields' }, 400)
  }

  // 3. Verify property belongs to caller's org.
  const { data: property } = await adminDb
    .from('properties')
    .select('id, name, organisation_id, client_id')
    .eq('id', property_id)
    .single()
  if (!property || property.organisation_id !== profile.organisation_id) {
    return json({ error: 'Property not in your organisation' }, 403)
  }

  // 4. Generate token and upsert property_contact.
  const token = generateToken()
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  // Try to update an existing row first (resend case), else insert.
  const { data: existing } = await adminDb
    .from('property_contacts')
    .select('id, status')
    .eq('property_id', property_id)
    .eq('email', email)
    .maybeSingle()

  let row: { id: string; email: string; status: string } | null = null
  if (existing) {
    const { data: updated, error: updErr } = await adminDb
      .from('property_contacts')
      .update({
        full_name,
        role_at_site,
        invite_token: token,
        invite_token_expires_at: expires,
        invited_at: new Date().toISOString(),
        invited_by_user_id: callerId,
        status: existing.status === 'disabled' ? 'invited' : existing.status,
      })
      .eq('id', existing.id)
      .select('id, email, status')
      .single()
    if (updErr) return json({ error: updErr.message }, 500)
    row = updated
  } else {
    const { data: inserted, error: insErr } = await adminDb
      .from('property_contacts')
      .insert({
        organisation_id: profile.organisation_id,
        client_id,
        property_id,
        email,
        full_name,
        role_at_site,
        invite_token: token,
        invite_token_expires_at: expires,
        invited_by_user_id: callerId,
        status: 'invited',
      })
      .select('id, email, status')
      .single()
    if (insErr) return json({ error: insErr.message }, 500)
    row = inserted
  }

  // 5. Look up org name for the email.
  const { data: org } = await adminDb
    .from('organisations')
    .select('name')
    .eq('id', profile.organisation_id)
    .single()

  // 6. Send the invite email (best-effort).
  const inviteUrl = `${PUBLIC_APP_URL}/site/accept-invite?invite=${encodeURIComponent(token)}`
  await sendInviteEmail({
    to: email,
    fullName: full_name,
    propertyName: property.name,
    orgName: org?.name ?? 'your FM team',
    inviteUrl,
  })

  return json({
    id: row?.id,
    email: row?.email,
    status: row?.status,
  })
})
