// supabase/functions/sign-tenant-file/index.ts
//
// Returns a short-lived signed URL for a private storage object that a SITE
// tenant (a property_contact / tenant_user) is authorised to download.
//
// Why this exists:
//   The site surface lets a property contact view their site's documents, job
//   photos and service reports — they can read the ROWS (tenant RLS:
//   documents_select_tenant / job_photos_select_tenant / service_reports_select_tenant,
//   all scoped to jobs/property.property_id = tenant_property_id()). But the storage
//   buckets are PRIVATE and there is no storage policy for tenant_users (they have
//   no profiles row, so the org-prefix storage RLS never matches). So the download
//   links 403'd.
//
// Design (secure + simple): delegate authorisation to the EXISTING tenant RLS.
// We re-read the requested record using the CALLER's JWT — if RLS returns the row,
// the caller is authorised for that property — then sign the object with the
// service role. No broad storage policy, no cross-client leak.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SIGNED_TTL = 60 * 10 // 10 minutes

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors() } })
}
function bearer(req: Request): string | null {
  const m = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

// Each kind maps to (table, column holding the storage ref, bucket). The column
// is either a full legacy public URL (split on /<bucket>/) or a raw object path.
const KINDS: Record<string, { table: string; column: string; bucket: string }> = {
  document: { table: 'documents', column: 'file_url', bucket: 'documents' },
  job_photo: { table: 'job_photos', column: 'file_url', bucket: 'job-photos' },
  service_report: { table: 'service_reports', column: 'signature_url', bucket: 'field-signatures' },
}

function objectPath(value: string, bucket: string): string {
  const marker = `/${bucket}/`
  const idx = value.indexOf(marker)
  return idx >= 0 ? value.slice(idx + marker.length) : value // raw path otherwise
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() })
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'not_configured' }, 500)

  const jwt = bearer(req)
  if (!jwt) return json({ error: 'missing_authorization' }, 401)

  let body: { kind?: unknown; id?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  const kind = typeof body.kind === 'string' ? body.kind : ''
  const id = typeof body.id === 'string' ? body.id : ''
  const spec = KINDS[kind]
  if (!spec || !id) return json({ error: 'invalid_kind_or_id' }, 400)

  // Caller-scoped client — RLS (incl. the tenant policies) applies to this read.
  const userClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row, error } = await userClient
    .from(spec.table)
    .select(spec.column)
    .eq('id', id)
    .maybeSingle()
  if (error) return json({ error: 'lookup_failed', detail: error.message }, 400)
  // Not visible to this caller under RLS → not authorised (or doesn't exist).
  if (!row) return json({ error: 'not_found_or_forbidden' }, 403)

  const ref = (row as Record<string, unknown>)[spec.column]
  if (typeof ref !== 'string' || !ref) return json({ error: 'no_file' }, 404)

  const path = objectPath(ref, spec.bucket)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signed, error: signErr } = await admin.storage.from(spec.bucket).createSignedUrl(path, SIGNED_TTL)
  if (signErr || !signed?.signedUrl) return json({ error: 'sign_failed', detail: signErr?.message }, 500)

  return json({ url: signed.signedUrl })
})
