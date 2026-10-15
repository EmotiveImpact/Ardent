// supabase/functions/gdpr-export/index.ts
//
// GDPR Subject Access Request (Article 15) — assembles every row of personal
// data we hold about a single data subject into a JSON blob, uploads it to
// the private `gdpr-exports` bucket, and returns a 7-day signed URL.
//
// Auth model:
//   - Caller must be authenticated (JWT verified).
//   - Caller must EITHER be the subject themselves, OR be an org_admin /
//     super_admin in the same organisation as the subject.
//
// Defensive: any individual table query is wrapped in try/catch so missing
// tables (e.g. an early-stage org without time_entries yet) don't kill the
// whole export.
//
// Deploy:
//   supabase functions deploy gdpr-export

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
  request_id?: string // pre-created gdpr_requests row id (optional)
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[gdpr-export] ${label} failed:`, msg)
    return { ok: false, error: msg }
  }
}

async function fetchPersonalData(admin: SupabaseClient, subjectUserId: string, orgId: string) {
  const out: Record<string, unknown> = {}

  // auth.users — only available via admin API
  const { data: authUser } = await admin.auth.admin.getUserById(subjectUserId)
  out.auth_user = authUser?.user ?? null

  const tasks: Array<Promise<void>> = []

  const grab = (key: string, run: () => Promise<unknown>) => {
    tasks.push(
      safe(key, run).then((r) => {
        out[key] = r.ok ? r.data : { error: r.error }
      }),
    )
  }

  grab('profile', async () => {
    const { data, error } = await admin.from('profiles').select('*').eq('id', subjectUserId).maybeSingle()
    if (error) throw error
    return data
  })

  grab('engineers', async () => {
    const { data, error } = await admin.from('engineers').select('*').eq('profile_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('time_entries', async () => {
    // time_entries keys the subject by engineer_id (= profile/user id), not user_id.
    const { data, error } = await admin.from('time_entries').select('*').eq('engineer_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('notifications', async () => {
    const { data, error } = await admin.from('notifications').select('*').eq('user_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('field_events', async () => {
    // field_events keys the subject by engineer_id (= profile/user id), not user_id.
    const { data, error } = await admin.from('field_events').select('*').eq('engineer_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('audit_log_view', async () => {
    const { data, error } = await admin
      .from('audit_log_view')
      .select('*')
      .eq('actor_user_id', subjectUserId)
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) throw error
    return data ?? []
  })

  grab('notes_authored', async () => {
    // notes author column is user_id (no author_id column).
    const { data, error } = await admin.from('notes').select('*').eq('user_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('timeline_events', async () => {
    // timeline_events actor column is user_id (no actor_id column).
    const { data, error } = await admin.from('timeline_events').select('*').eq('user_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('ai_audit_log', async () => {
    const { data, error } = await admin.from('ai_audit_log').select('*').eq('user_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('system_audit_events', async () => {
    const { data, error } = await admin.from('system_audit_events').select('*').eq('actor_user_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('import_runs', async () => {
    const { data, error } = await admin.from('import_runs').select('*').eq('started_by_user_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  grab('engineer_assignments', async () => {
    // engineer_assignments keys the engineer by engineer_id (= profile/user id).
    const { data, error } = await admin.from('engineer_assignments').select('*').eq('engineer_id', subjectUserId)
    if (error) throw error
    return data ?? []
  })

  await Promise.all(tasks)
  return out
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
    /* empty body is fine */
  }
  const { subject_user_id, request_id } = body
  if (!subject_user_id) {
    return new Response(JSON.stringify({ error: 'subject_user_id required' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Identify caller via their JWT.
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

  // Service-role admin client for cross-table aggregation + storage upload.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Authorize: caller must be the subject OR an org_admin in the subject's org.
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id, role, organisation_id')
    .eq('id', callerId)
    .maybeSingle()
  const { data: subjectProfile } = await admin
    .from('profiles')
    .select('id, organisation_id, email, full_name')
    .eq('id', subject_user_id)
    .maybeSingle()

  if (!callerProfile || !subjectProfile) {
    return new Response(JSON.stringify({ error: 'Caller or subject profile not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  const isSelf = callerId === subject_user_id
  const isAdmin =
    callerProfile.organisation_id === subjectProfile.organisation_id &&
    ['org_admin', 'super_admin'].includes(callerProfile.role)
  if (!isSelf && !isAdmin) {
    return new Response(JSON.stringify({ error: 'Not authorised to export this user' }), {
      status: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const orgId = subjectProfile.organisation_id

  // Find or create the gdpr_requests row.
  // SECURITY: a body-supplied request_id is only honoured if it belongs to THIS
  // org. Otherwise an org_admin of Org A could pass Org B's request_id and the
  // status/download_url updates below would overwrite Org B's GDPR audit row
  // (cross-org tampering + a signed link to Org A's export bleeding into Org B's
  // row). A foreign/unknown id is dropped and a fresh own-org row is created, so
  // every update keyed on rowId is inherently scoped to this org.
  let rowId = request_id
  if (rowId) {
    const { data: ownRow } = await admin
      .from('gdpr_requests')
      .select('id')
      .eq('id', rowId)
      .eq('organisation_id', orgId)
      .maybeSingle()
    if (!ownRow) rowId = undefined
  }
  if (!rowId) {
    const { data: ins, error: insErr } = await admin
      .from('gdpr_requests')
      .insert({
        organisation_id: orgId,
        requested_by_user_id: callerId,
        subject_user_id,
        subject_email: subjectProfile.email ?? null,
        request_type: 'export',
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

  // Aggregate every personal-data table.
  const exportedAt = new Date().toISOString()
  const personalData = await fetchPersonalData(admin, subject_user_id, orgId)
  const blob = {
    schema_version: 1,
    request_id: rowId,
    organisation_id: orgId,
    subject_user_id,
    subject_email: subjectProfile.email,
    subject_full_name: subjectProfile.full_name,
    requested_by_user_id: callerId,
    exported_at: exportedAt,
    legal_basis: 'UK GDPR Article 15 — Right of access',
    data: personalData,
  }
  const json = JSON.stringify(blob, null, 2)

  // Upload to private bucket.
  const objectPath = `${orgId}/${rowId}.json`
  const { error: upErr } = await admin.storage
    .from('gdpr-exports')
    .upload(objectPath, new Blob([json], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true,
    })
  if (upErr) {
    await admin
      .from('gdpr_requests')
      .update({ status: 'failed', failure_reason: `upload: ${upErr.message}` })
      .eq('id', rowId)
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // 7-day signed URL.
  const { data: signed, error: signErr } = await admin.storage
    .from('gdpr-exports')
    .createSignedUrl(objectPath, 60 * 60 * 24 * 7)

  const downloadUrl = signed?.signedUrl ?? null
  const completedAt = new Date().toISOString()

  await admin
    .from('gdpr_requests')
    .update({
      status: signErr ? 'failed' : 'completed',
      download_url: downloadUrl,
      completed_at: signErr ? null : completedAt,
      failure_reason: signErr ? `sign: ${signErr.message}` : null,
    })
    .eq('id', rowId)

  return new Response(
    JSON.stringify({
      ok: true,
      request_id: rowId,
      download_url: downloadUrl,
      object_path: objectPath,
      expires_in_seconds: 60 * 60 * 24 * 7,
      completed_at: completedAt,
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  )
})
