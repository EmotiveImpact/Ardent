// supabase/functions/site-accept-invite/index.ts
// Wave 14 / Task 114 — Tenant portal: accept an invite token.
//
// Two actions:
//   { action: 'inspect', token }            — return a sanitised view of the
//                                              invite for the accept page UI.
//   { action: 'accept', token, password }   — provision/match auth.users,
//                                              activate the property_contact,
//                                              and return a fresh session.
//
// Deploy: supabase functions deploy site-accept-invite --no-verify-jwt
//   (must be --no-verify-jwt — the user is anonymous when accepting.)
//
// Required env (auto-set):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY

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

interface Body {
  token?: string
  action?: 'inspect' | 'accept'
  password?: string
}

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function anon(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const token = body.token?.trim()
  if (!token) return json({ error: 'Missing token' }, 400)

  const db = admin()

  const { data: contact } = await db
    .from('property_contacts')
    .select(
      'id, email, full_name, status, invite_token_expires_at, organisation_id, client_id, property_id'
    )
    .eq('invite_token', token)
    .maybeSingle()

  if (!contact) return json({ error: 'Invite not found' }, 404)
  if (contact.status === 'disabled') {
    return json({ error: 'This invite has been disabled' }, 403)
  }
  if (
    contact.invite_token_expires_at &&
    new Date(contact.invite_token_expires_at) < new Date()
  ) {
    return json({ error: 'Invite has expired' }, 410)
  }

  const { data: property } = await db
    .from('properties')
    .select('name')
    .eq('id', contact.property_id)
    .single()
  const { data: client } = await db
    .from('clients')
    .select('name')
    .eq('id', contact.client_id)
    .single()
  const { data: org } = await db
    .from('organisations')
    .select('name')
    .eq('id', contact.organisation_id)
    .single()

  // ── Inspect — sanitised metadata only ─────────────────────
  if (!body.action || body.action === 'inspect') {
    return json({
      ok: true,
      email: contact.email,
      full_name: contact.full_name,
      property_name: property?.name,
      client_name: client?.name,
      org_name: org?.name,
    })
  }

  // ── Accept — provision auth user and activate the contact ─
  if (body.action === 'accept') {
    const password = body.password
    if (!password || password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400)
    }

    // 1. Try to create a fresh auth user. If the email already exists,
    //    fall back to updating the password via admin API.
    let userId: string | null = null
    let isExistingAccount = false
    const create = await db.auth.admin.createUser({
      email: contact.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: contact.full_name,
        property_id: contact.property_id,
        tenant_user: true,
      },
    })
    if (create.error) {
      const msg = create.error.message?.toLowerCase() ?? ''
      if (msg.includes('already') || msg.includes('exists')) {
        // Find the existing user by email. This must page through the whole
        // list — reading only page 1 meant that past ~200 auth users, any
        // tenant sorting outside that page hit a permanent 500 and could never
        // accept their invite.
        const wanted = contact.email.toLowerCase()
        let existing: { id: string } | undefined
        const PER_PAGE = 200
        for (let page = 1; page <= 50; page++) {
          const { data: list, error: listErr } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE })
          if (listErr) break
          const users = list?.users ?? []
          existing = users.find((u) => u.email?.toLowerCase() === wanted)
          if (existing || users.length < PER_PAGE) break
        }
        if (!existing) {
          return json(
            { error: 'Could not provision user (email already used)' },
            500
          )
        }
        userId = existing.id
        isExistingAccount = true
        // SECURITY: never reset an existing account's password from an
        // invite-accept — that would let anyone holding the invite token seize
        // a known email's account (cross-tenant takeover). For an existing
        // account we verify the typed password via sign-in below instead.
      } else {
        return json({ error: create.error.message }, 500)
      }
    } else {
      userId = create.data.user?.id ?? null
    }
    if (!userId) return json({ error: 'No user id after provisioning' }, 500)

    // 2. Verify credentials by signing in BEFORE activating anything. For a
    //    brand-new user this succeeds with the password we just set; for an
    //    existing account it only succeeds if the accepter supplied that
    //    account's REAL password — so a third party holding the invite token
    //    cannot hijack an account they don't already control.
    const session = await anon().auth.signInWithPassword({
      email: contact.email,
      password,
    })
    if (session.error || !session.data.session) {
      if (isExistingAccount) {
        return json(
          {
            error: 'account_exists',
            message:
              'This email already has an account. Sign in with your existing password to accept the invitation.',
          },
          409
        )
      }
      return json(
        {
          error: session.error?.message ?? 'Failed to sign in after activation',
        },
        500
      )
    }

    // 3. Verified — activate the property_contact row.
    await db
      .from('property_contacts')
      .update({
        user_id: userId,
        accepted_at: new Date().toISOString(),
        status: 'active',
        invite_token: null,
        invite_token_expires_at: null,
      })
      .eq('id', contact.id)

    return json({
      ok: true,
      access_token: session.data.session.access_token,
      refresh_token: session.data.session.refresh_token,
      email: contact.email,
      property_name: property?.name,
    })
  }

  return json({ error: 'Unknown action' }, 400)
})
