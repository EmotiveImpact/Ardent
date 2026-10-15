// supabase/functions/invite-team-member/index.ts
//
// Admin-gated team invitations (invite-only team join model).
//
//   POST { email: string, role?: 'org_admin'|'manager'|'scheduler'|'engineer', full_name?: string }
//   Authorization: Bearer <caller JWT>
//
//   200 { ok: true }
//   400 { error: 'invalid_email' | 'invalid_role' | 'invalid_body' }
//   401 { error: 'not_authenticated' }
//   403 { error: 'not_an_admin' }
//   409 { error: 'already_a_member' | 'already_invited' }
//   500 { error: ... }
//
// Security:
//   • The caller MUST be an org_admin (or manager) of an org — verified from
//     their JWT against public.profiles. organisation_id is taken from the
//     CALLER's profile, never from the request body, so an admin can only ever
//     invite into their own org.
//   • Writes the pending invitation row (service role) — handle_new_user links
//     the invited user to the org by matching this row on their verified email
//     at signup. Signup metadata is never trusted for the org link.
//   • Sends the invite via auth.admin.inviteUserByEmail → creates the auth user
//     + emails a magic link (through the project's Resend SMTP) that lands on
//     /invite to set a password.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const WEB_ORIGIN = Deno.env.get('TRUST_WEB_ORIGIN') ?? 'https://sitesentriq-web.vercel.app'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Invitable roles must be real profiles.role values with a frontend permission
// map entry (00085). `manager` was here but isn't a valid role → locked-out users.
const INTERNAL_ROLES = new Set(['org_admin', 'scheduler', 'finance', 'engineer', 'auditor'])
const ADMIN_ROLES = new Set(['org_admin', 'super_admin'])

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── Authenticate the caller ────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return json({ error: 'not_authenticated' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'not_authenticated' }, 401)

  const { data: caller, error: callerErr } = await admin
    .from('profiles')
    .select('organisation_id, role, full_name')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (callerErr || !caller?.organisation_id) return json({ error: 'not_an_admin' }, 403)
  if (!ADMIN_ROLES.has(caller.role as string)) return json({ error: 'not_an_admin' }, 403)

  const orgId = caller.organisation_id as string

  // ── Validate input ─────────────────────────────────────────────────
  let body: { email?: unknown; role?: unknown; full_name?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || /[\r\n<>]/.test(email) || !EMAIL_RE.test(email)) {
    return json({ error: 'invalid_email' }, 400)
  }

  const role = typeof body.role === 'string' && INTERNAL_ROLES.has(body.role) ? body.role : 'engineer'
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 120) : ''

  // ── Already a member of THIS org? ──────────────────────────────────
  const { data: existingMember } = await admin
    .from('profiles')
    .select('id')
    .eq('organisation_id', orgId)
    .ilike('email', email)
    .maybeSingle()
  if (existingMember) return json({ error: 'already_a_member' }, 409)

  // ── Upsert the pending invitation (service role bypasses RLS) ───────
  // Revoke any stale pending invite for this (org,email) then insert fresh,
  // so re-inviting refreshes the token + expiry.
  await admin
    .from('organisation_invitations')
    .update({ status: 'revoked' })
    .eq('organisation_id', orgId)
    .ilike('email', email)
    .eq('status', 'pending')

  const { error: invErr } = await admin.from('organisation_invitations').insert({
    organisation_id: orgId,
    email,
    role,
    invited_by_user_id: userData.user.id,
  })
  if (invErr) {
    console.error('[invite-team-member] invitation insert failed:', invErr.message)
    return json({ error: 'invite_failed' }, 500)
  }

  // ── Send the invite (creates the auth user + emails a magic link) ──
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName || undefined,
      invited_role: role,
      invited_org: orgId,
      invited_by: caller.full_name ?? undefined,
    },
    redirectTo: `${WEB_ORIGIN}/invite`,
  })

  if (inviteErr) {
    const msg = inviteErr.message?.toLowerCase() ?? ''
    if (msg.includes('already been registered') || msg.includes('already registered') || msg.includes('exists')) {
      // The email already has an account. handle_new_user only links on NEW
      // user creation, so we resolve the outcome honestly here based on the
      // existing account's current org (single-org-per-user data model).
      const { data: existingProfile } = await admin
        .from('profiles')
        .select('id, organisation_id')
        .ilike('email', email)
        .maybeSingle()

      if (existingProfile && !(existingProfile as { organisation_id: string | null }).organisation_id) {
        // Orphan account (no workspace yet) → add them to this org + role and
        // accept the invitation directly.
        await admin.from('profiles').update({ organisation_id: orgId, role }).eq('id', (existingProfile as { id: string }).id)
        await admin.from('organisation_invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('organisation_id', orgId).ilike('email', email).eq('status', 'pending')
        return json({ ok: true, role, linked_existing: true })
      }

      if (existingProfile && (existingProfile as { organisation_id: string }).organisation_id === orgId) {
        // Already in THIS org.
        await admin.from('organisation_invitations').update({ status: 'revoked' })
          .eq('organisation_id', orgId).ilike('email', email).eq('status', 'pending')
        return json({ error: 'already_a_member' }, 409)
      }

      // Belongs to a DIFFERENT workspace. The single-org model can't dual-add
      // them — revoke the dangling invite and say so plainly (no false promise).
      await admin.from('organisation_invitations').update({ status: 'revoked' })
        .eq('organisation_id', orgId).ilike('email', email).eq('status', 'pending')
      return json({
        error: 'belongs_to_another_workspace',
        detail: 'That email already belongs to another workspace, so it can’t be added here. They’d need to use a different email, or leave their current workspace first.',
      }, 409)
    }
    console.error('[invite-team-member] inviteUserByEmail failed:', inviteErr.message)
    return json({ error: 'invite_email_failed', detail: inviteErr.message }, 500)
  }

  return json({ ok: true, role })
})
