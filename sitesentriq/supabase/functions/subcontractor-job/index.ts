// supabase/functions/subcontractor-job/index.ts
//
// Trust wave W2-T7 — per-use, no-login subcontractor work links.
//
// One token = one job + one subcontractor. The subbie taps the link and can:
//   GET  ?token=                        → job summary + progress
//   POST { token, action: 'accept' }    → issued → accepted
//   POST { token, action: 'request_upload', kind, filename, content_type }
//        → short-lived signed UPLOAD url + the metadata row recorded
//   POST { token, action: 'signature', base64 }
//        → PNG stored to field-signatures, path on jobs.engineer_signature_url
//   POST { token, action: 'complete', notes? }
//        → job → contractor_review + note + timeline event + org notified,
//          token → completed
//
// Security model (mirrors public-job-eta):
//   * verify_jwt = false — the token IS the auth. Service role internally.
//   * EVERY action re-validates: token exists (404), not expired/revoked
//     (410), status precondition holds (409).
//   * The job summary includes the property ADDRESS (the subbie attends
//     site) but no prices, contacts, or internal notes.
//   * Uploads go through createSignedUploadUrl — large bodies never transit
//     this function; content types are allow-listed per kind.
//   * view_count bumps on every GET so leaked tokens stand out.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

interface TokenRow {
  id: string
  organisation_id: string
  job_id: string
  subcontractor_id: string
  token: string
  status: 'issued' | 'accepted' | 'completed' | 'revoked'
  expires_at: string
  accepted_at: string | null
  completed_at: string | null
  view_count: number
}

const UPLOAD_KINDS = {
  rams: {
    bucket: 'subbie-uploads',
    contentTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  cert: {
    bucket: 'subbie-uploads',
    contentTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
    ],
  },
  photo: {
    bucket: 'job-photos',
    contentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  },
} as const

type UploadKind = keyof typeof UPLOAD_KINDS

function sanitizeFilename(name: string): string {
  return (name || 'file').replace(/[^\w.-]/g, '_').slice(0, 80)
}

function decodeBase64Png(data: string): Uint8Array {
  const normalized = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  let token: string | null = null
  let action = 'get'
  let body: Record<string, unknown> = {}
  if (req.method === 'GET') {
    token = new URL(req.url).searchParams.get('token')
  } else if (req.method === 'POST') {
    try {
      body = await req.json()
    } catch {
      return json({ error: 'invalid_json' }, 400)
    }
    token = typeof body.token === 'string' ? body.token : null
    action = typeof body.action === 'string' ? body.action : 'get'
  } else {
    return json({ error: 'method_not_allowed' }, 405)
  }
  if (!token || token.length < 16) return json({ error: 'token_required' }, 400)

  // ── Token validation (every action) ─────────────────────────────
  const { data: tok } = await admin
    .from('subcontractor_job_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (!tok) return json({ error: 'token_not_found' }, 404)
  const t = tok as TokenRow
  if (t.status === 'revoked') return json({ error: 'token_revoked' }, 410)
  if (new Date(t.expires_at).getTime() < Date.now()) return json({ error: 'token_expired' }, 410)

  // ── GET: job summary + progress ─────────────────────────────────
  if (action === 'get') {
    await admin
      .from('subcontractor_job_tokens')
      .update({ view_count: t.view_count + 1, last_viewed_at: new Date().toISOString() })
      .eq('id', t.id)

    const [{ data: job }, { data: sub }, { count: ramsCount }, { count: photoCount }] =
      await Promise.all([
        admin
          .from('jobs')
          .select('job_number, title, description, scheduled_date, priority, status, engineer_signature_url, properties(name, address)')
          .eq('id', t.job_id)
          .maybeSingle(),
        admin
          .from('subcontractors')
          .select('company_name')
          .eq('id', t.subcontractor_id)
          .maybeSingle(),
        admin
          .from('subcontractor_rams')
          .select('id', { count: 'exact', head: true })
          .eq('subcontractor_id', t.subcontractor_id)
          .eq('job_id', t.job_id),
        admin
          .from('job_photos')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', t.job_id),
      ])
    if (!job) return json({ error: 'job_not_found' }, 404)

    const j = job as Record<string, unknown> & { properties?: { name?: string; address?: string } | null }
    return json({
      token_status: t.status,
      expires_at: t.expires_at,
      subcontractor: (sub as { company_name?: string } | null)?.company_name ?? null,
      job: {
        job_number: j.job_number ?? null,
        title: j.title,
        description: j.description ?? null,
        scheduled_date: j.scheduled_date ?? null,
        priority: j.priority ?? null,
        property: { name: j.properties?.name ?? null, address: j.properties?.address ?? null },
      },
      progress: {
        accepted_at: t.accepted_at,
        completed_at: t.completed_at,
        rams_count: ramsCount ?? 0,
        photo_count: photoCount ?? 0,
        has_signature: !!j.engineer_signature_url,
      },
    })
  }

  // ── POST actions ────────────────────────────────────────────────
  if (action === 'accept') {
    if (t.status !== 'issued') return json({ error: `cannot_accept_from_${t.status}` }, 409)
    const { error } = await admin
      .from('subcontractor_job_tokens')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', t.id)
      .eq('status', 'issued') // race-safe precondition
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, token_status: 'accepted' })
  }

  if (action === 'request_upload') {
    if (t.status !== 'accepted') return json({ error: 'accept_first' }, 409)
    const kind = body.kind as UploadKind
    const spec = UPLOAD_KINDS[kind]
    if (!spec) return json({ error: 'invalid_kind' }, 400)
    const contentType = typeof body.content_type === 'string' ? body.content_type : ''
    if (!(spec.contentTypes as readonly string[]).includes(contentType)) {
      return json({ error: 'content_type_not_allowed' }, 400)
    }
    const filename = sanitizeFilename(String(body.filename ?? 'file'))
    const path =
      kind === 'photo'
        ? `${t.organisation_id}/${t.job_id}/${Date.now()}_subbie_${filename}`
        : `${t.organisation_id}/${t.job_id}/${kind}-${Date.now()}-${filename}`

    const { data: signed, error: signErr } = await admin.storage
      .from(spec.bucket)
      .createSignedUploadUrl(path)
    if (signErr || !signed) return json({ error: signErr?.message ?? 'sign_failed' }, 500)

    // Record the metadata row now — the client uploads straight to storage.
    if (kind === 'photo') {
      await admin.from('job_photos').insert({
        job_id: t.job_id,
        organisation_id: t.organisation_id,
        file_url: `${SUPABASE_URL}/storage/v1/object/public/job-photos/${path}`,
        caption: 'Uploaded by subcontractor',
        photo_type: 'general',
      })
    } else {
      const { data: doc } = await admin
        .from('subcontractor_documents')
        .insert({
          subcontractor_id: t.subcontractor_id,
          organisation_id: t.organisation_id,
          name: filename,
          document_type: kind,
          file_url: `subbie-uploads/${path}`,
          mime_type: contentType,
        })
        .select('id')
        .maybeSingle()
      if (kind === 'rams') {
        await admin.from('subcontractor_rams').insert({
          organisation_id: t.organisation_id,
          subcontractor_id: t.subcontractor_id,
          job_id: t.job_id,
          title: filename,
          subcontractor_document_id: (doc as { id?: string } | null)?.id ?? null,
          approval_status: 'pending',
        })
      }
    }
    return json({ ok: true, upload: { path, token: signed.token, signed_url: signed.signedUrl } })
  }

  if (action === 'signature') {
    if (t.status !== 'accepted') return json({ error: 'accept_first' }, 409)
    const base64 = typeof body.base64 === 'string' ? body.base64 : ''
    if (!base64 || base64.length > 2_000_000) return json({ error: 'invalid_signature' }, 400)
    let bytes: Uint8Array
    try {
      bytes = decodeBase64Png(base64)
    } catch {
      return json({ error: 'invalid_signature' }, 400)
    }
    const path = `${t.job_id}/subbie-${Date.now()}.png`
    const { error: upErr } = await admin.storage
      .from('field-signatures')
      .upload(path, bytes, { contentType: 'image/png', upsert: true })
    if (upErr) return json({ error: upErr.message }, 500)
    // Same convention as the mobile app: store the OBJECT PATH; readers sign it.
    const { error } = await admin
      .from('jobs')
      .update({ engineer_signature_url: path })
      .eq('id', t.job_id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (action === 'complete') {
    if (t.status !== 'accepted') return json({ error: 'accept_first' }, 409)
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : ''

    // Close the token FIRST, race-guarded on the still-'accepted' precondition.
    // This is the single point that decides whether this call "wins". A replay
    // or concurrent call (the initial t.status read is stale) matches 0 rows
    // here and returns without firing the side effects — so the job update,
    // note, timeline event, and notification blast happen EXACTLY ONCE.
    const { data: closed } = await admin
      .from('subcontractor_job_tokens')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', t.id)
      .eq('status', 'accepted')
      .select('id')
    if (!closed || closed.length === 0) {
      return json({ ok: true, token_status: 'completed' })
    }

    const { data: sub } = await admin
      .from('subcontractors')
      .select('company_name')
      .eq('id', t.subcontractor_id)
      .maybeSingle()
    const company = (sub as { company_name?: string } | null)?.company_name ?? 'Subcontractor'

    const { error: jobErr } = await admin
      .from('jobs')
      .update({ status: 'contractor_review' })
      .eq('id', t.job_id)
    if (jobErr) return json({ error: jobErr.message }, 500)

    if (notes) {
      await admin.from('notes').insert({
        job_id: t.job_id,
        organisation_id: t.organisation_id,
        content: `Subcontractor completion notes (${company}): ${notes}`,
        user_name: company,
      })
    }
    await admin.from('timeline_events').insert({
      organisation_id: t.organisation_id,
      job_id: t.job_id,
      event_type: 'job_status_changed',
      description: `${company} marked the job complete via work link — awaiting contractor review`,
      metadata: { source: 'subcontractor_job_token', token_id: t.id },
    })

    // Notify ops staff (org_admin + scheduler) in-app.
    const { data: staff } = await admin
      .from('profiles')
      .select('id')
      .eq('organisation_id', t.organisation_id)
      .in('role', ['org_admin', 'scheduler'])
    const rows = ((staff ?? []) as { id: string }[]).map((p) => ({
      user_id: p.id,
      organisation_id: t.organisation_id,
      title: 'Subcontractor work submitted',
      message: `${company} marked a job complete — it is awaiting contractor review.`,
      notification_type: 'job',
      link: `/dashboard/jobs/${t.job_id}`,
    }))
    if (rows.length > 0) await admin.from('notifications').insert(rows)

    return json({ ok: true, token_status: 'completed' })
  }

  return json({ error: 'unknown_action' }, 400)
})
