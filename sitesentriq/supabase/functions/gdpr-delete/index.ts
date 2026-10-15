// supabase/functions/gdpr-delete/index.ts
//
// GDPR Right-to-be-Forgotten (Article 17) — soft-anonymises a user's
// personal data while preserving audit trail integrity.
//
// Strategy: SOFT ANONYMISE, not HARD DELETE.
//   - Hard-deleting auth.users / profiles cascades into jobs/quotes/etc. and
//     destroys the audit story (e.g. "who completed this PPM?"). UK ICO
//     guidance allows pseudonymisation when full deletion conflicts with
//     legitimate-interest record-keeping (financial / safety obligations).
//   - We strip every direct identifier (name/email/phone/signature/notes
//     body) but keep the foreign-key actor IDs intact so historical events
//     remain attributable to "Deleted User #abc12345".
//   - Hard-delete v2 would need a cascade strategy + a 30-day escrow window
//     for restore — out of scope for v1 (documented inline below).
//
// Auth model:
//   - Caller must be org_admin or super_admin in the subject's org.
//   - Caller must supply confirmation_phrase === `DELETE-{subject_email}`.
//   - The org's LAST admin cannot be deleted (would orphan the org).
//
// Deploy:
//   supabase functions deploy gdpr-delete

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ReqBody {
  subject_user_id?: string
  confirmation_phrase?: string
  request_id?: string
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[gdpr-delete] ${label} failed:`, msg)
    return { ok: false, error: msg }
  }
}

async function anonymiseSubject(
  admin: SupabaseClient,
  subjectUserId: string,
  subjectEmail: string,
): Promise<{ steps: Record<string, unknown>; warnings: string[] }> {
  const warnings: string[] = []
  const steps: Record<string, unknown> = {}

  const shortId = subjectUserId.slice(0, 8)
  const anonEmail = `deleted-${shortId}@deleted.local`
  const farFuture = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()

  // 1. auth.users — anon email + permanent ban
  const r1 = await safe('auth.users.update', async () => {
    const { error } = await admin.auth.admin.updateUserById(subjectUserId, {
      email: anonEmail,
      ban_duration: '876000h', // 100 years
      user_metadata: { gdpr_deleted_at: new Date().toISOString() },
    })
    if (error) throw error
    return true
  })
  steps.auth_user = r1.ok ? 'anonymised' : `failed: ${r1.error}`
  if (!r1.ok) warnings.push(`auth.users: ${r1.error}`)

  // 2. profiles
  const r2 = await safe('profiles.update', async () => {
    const { error } = await admin
      .from('profiles')
      .update({
        full_name: 'Deleted User',
        email: anonEmail,
        phone: null,
        avatar_url: null,
      })
      .eq('id', subjectUserId)
    if (error) throw error
    return true
  })
  steps.profile = r2.ok ? 'anonymised' : `failed: ${r2.error}`
  if (!r2.ok) warnings.push(`profiles: ${r2.error}`)

  // 3. engineers — strip name/contact + delete signature image from storage
  const r3 = await safe('engineers.update', async () => {
    const { data: engineers } = await admin
      .from('engineers')
      .select('id, signature_image_url')
      .eq('profile_id', subjectUserId)
    for (const e of engineers ?? []) {
      // Best-effort signature blob removal
      if (e.signature_image_url) {
        const path = String(e.signature_image_url).replace(/^.*\/object\/(public|sign)\/[^/]+\//, '')
        await safe('signature.remove', async () => {
          const { error } = await admin.storage.from('engineer-signatures').remove([path])
          if (error) throw error
          return true
        })
      }
    }
    const { error } = await admin
      .from('engineers')
      .update({ name: 'Deleted Engineer', email: null, phone: null, signature_image_url: null })
      .eq('profile_id', subjectUserId)
    if (error) throw error
    return engineers?.length ?? 0
  })
  steps.engineers = r3.ok ? `anonymised (${r3.data} rows)` : `failed: ${r3.error}`
  if (!r3.ok) warnings.push(`engineers: ${r3.error}`)

  // 4. notes — redact the note body + author name.
  // Real columns are `content` + `user_id` (NOT body/author_id) — the old names
  // never existed, so this redaction step silently failed on every erasure,
  // leaving the data subject's note text intact (a GDPR compliance gap).
  const r4 = await safe('notes.redact', async () => {
    const { error, count } = await admin
      .from('notes')
      .update({ content: '[redacted by GDPR delete request]', user_name: '[redacted]' }, { count: 'exact' })
      .eq('user_id', subjectUserId)
    if (error) throw error
    return count ?? 0
  })
  steps.notes = r4.ok ? `redacted (${r4.data} rows)` : `failed: ${r4.error}`

  // 5. field_events — strip metadata personal data (keep skeletal record).
  // field_events keys the subject by engineer_id (= profile/user id), NOT
  // user_id — there is no user_id column, so the old filter errored (and was
  // swallowed), silently leaving GPS/metadata PII unscrubbed. Matches the
  // gdpr-export function's keying.
  const r5 = await safe('field_events.scrub', async () => {
    const { error } = await admin
      .from('field_events')
      .update({ metadata: {} })
      .eq('engineer_id', subjectUserId)
    if (error) throw error
    return true
  })
  steps.field_events = r5.ok ? 'metadata stripped' : `failed: ${r5.error}`

  // 6. PRESERVED (audit integrity): notifications, timeline_events,
  //    audit_log_view, system_audit_events, ai_audit_log, import_runs.
  //    These keep actor_user_id but the joined profile already shows
  //    "Deleted User" so PII is removed downstream.
  steps.notifications = 'preserved (actor only)'
  steps.timeline_events = 'preserved (actor only)'
  steps.audit_log = 'preserved (actor only)'
  steps.system_audit_events = 'preserved (actor only)'
  steps.ai_audit_log = 'preserved (actor only)'
  steps.import_runs = 'preserved (actor only)'

  return { steps, warnings }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let body: ReqBody = {}
  try {
    body = (await req.json()) as ReqBody
  } catch {
    /* empty body */
  }
  const { subject_user_id, confirmation_phrase, request_id } = body
  if (!subject_user_id || !confirmation_phrase) {
    return new Response(
      JSON.stringify({ error: 'subject_user_id and confirmation_phrase required' }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  const verify = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await verify.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const callerId = userData.user.id

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Authorize: org_admin / super_admin only.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id, role, organisation_id')
    .eq('id', callerId)
    .maybeSingle()
  const { data: subjectProfile } = await admin
    .from('profiles')
    .select('id, organisation_id, email, role, full_name')
    .eq('id', subject_user_id)
    .maybeSingle()

  if (!callerProfile || !subjectProfile) {
    return new Response(JSON.stringify({ error: 'Caller or subject profile not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  if (callerProfile.organisation_id !== subjectProfile.organisation_id) {
    return new Response(JSON.stringify({ error: 'Cross-org delete not permitted' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  if (!['org_admin', 'super_admin'].includes(callerProfile.role)) {
    return new Response(JSON.stringify({ error: 'Only org admins can delete user data' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Confirmation phrase must match `DELETE-{subject_email}` (case-insensitive
  // on email, exact on the DELETE- prefix).
  const expected = `DELETE-${subjectProfile.email ?? ''}`.toLowerCase()
  if (confirmation_phrase.trim().toLowerCase() !== expected) {
    return new Response(
      JSON.stringify({
        error: 'Confirmation phrase does not match. Type exactly: ' + `DELETE-${subjectProfile.email}`,
      }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  // Block last-admin deletion.
  if (['org_admin', 'super_admin'].includes(subjectProfile.role)) {
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', subjectProfile.organisation_id)
      .in('role', ['org_admin', 'super_admin'])
    if ((count ?? 0) <= 1) {
      return new Response(
        JSON.stringify({
          error: 'Cannot delete the organisation\'s last admin. Promote another user to admin first.',
        }),
        {
          status: 409,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        },
      )
    }
  }

  // Find or create gdpr_requests row.
  // SECURITY: only honour a body-supplied request_id that belongs to THIS org —
  // otherwise an org_admin of Org A could pass Org B's request_id and the
  // status/notes updates below would overwrite Org B's GDPR audit row with Org
  // A's subject email. A foreign/unknown id is dropped → fresh own-org row.
  let rowId = request_id
  if (rowId) {
    const { data: ownRow } = await admin
      .from('gdpr_requests')
      .select('id')
      .eq('id', rowId)
      .eq('organisation_id', subjectProfile.organisation_id)
      .maybeSingle()
    if (!ownRow) rowId = undefined
  }
  if (!rowId) {
    const { data: ins, error: insErr } = await admin
      .from('gdpr_requests')
      .insert({
        organisation_id: subjectProfile.organisation_id,
        requested_by_user_id: callerId,
        subject_user_id,
        subject_email: subjectProfile.email ?? null,
        request_type: 'delete',
        status: 'processing',
      })
      .select('id')
      .single()
    if (insErr || !ins) {
      return new Response(JSON.stringify({ error: insErr?.message ?? 'Failed to create request row' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    rowId = ins.id
  } else {
    await admin.from('gdpr_requests').update({ status: 'processing' }).eq('id', rowId)
  }

  const { steps, warnings } = await anonymiseSubject(admin, subject_user_id, subjectProfile.email ?? '')

  const completedAt = new Date().toISOString()
  await admin
    .from('gdpr_requests')
    .update({
      status: 'completed',
      completed_at: completedAt,
      notes: JSON.stringify({ steps, warnings, original_email: subjectProfile.email }),
    })
    .eq('id', rowId)

  return new Response(
    JSON.stringify({
      ok: true,
      request_id: rowId,
      strategy: 'soft-anonymise',
      steps,
      warnings,
      completed_at: completedAt,
      note:
        'v1 strategy is pseudonymisation (preserves audit integrity). Hard delete with 30-day escrow is roadmap v2.',
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  )
})
