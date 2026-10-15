// supabase/functions/public-job-eta/index.ts
//
// Sprint 3 / D2 — Public, unauthenticated ETA endpoint.
//
// Request:
//   GET  /functions/v1/public-job-eta?token=<token>
//   POST /functions/v1/public-job-eta { token }
//
// Response (200):
//   {
//     status: 'scheduled' | 'travelling' | 'on_site' | 'completed' | 'cancelled',
//     property_name: string | null,
//     engineer_first_name: string | null,
//     scheduled_date: string | null,
//     eta_window: { earliest_at, latest_at } | null,  // see D3
//     completed_date: string | null,
//     /** Only true while engineer is actively travelling. */
//     show_live_position: boolean,
//     /** Live engineer position when status === 'travelling'.
//      *  null when status is anything else. */
//     engineer_position: { lat, lng, accuracy_m, captured_at } | null,
//   }
//
// Response (410): { error: 'token_expired' }
// Response (404): { error: 'token_not_found' }
//
// Security guarantees enforced here, not at the table level:
//   1. Service role used internally so we can read across orgs without
//      RLS getting in the way (the token IS the auth).
//   2. Expired tokens 410 even though the row may still exist.
//   3. Only the bare-minimum fields are returned. NO addresses, phone
//      numbers, full names, prices, internal notes, or photo URLs.
//   4. Engineer first name only — surnames stay internal.
//   5. Engineer live position is suppressed for any status that isn't
//      `travelling` (no point showing where they were yesterday).
//   6. View counter bumps on every successful read so leaked-token
//      abuse stands out in the FM dashboard.

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
  job_id: string
  organisation_id: string
  expires_at: string
  view_count: number
}

interface JobRow {
  id: string
  organisation_id: string
  status: string
  scheduled_date: string | null
  completed_date: string | null
  eta_earliest_at?: string | null
  eta_latest_at?: string | null
  properties?: { name: string | null } | null
}

interface AssignmentRow {
  engineer_id: string | null
  profiles?: { full_name: string | null } | null
}

interface LocationRow {
  latitude: number
  longitude: number
  accuracy_meters: number | null
  recorded_at: string
}

/**
 * Strip a full name down to just the first word — "John Smith" → "John".
 * Used so the public endpoint never leaks the engineer's surname.
 */
function firstName(full: string | null | undefined): string | null {
  if (!full) return null
  const trimmed = full.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0]
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  // Token can come from query string (GET) or body (POST). GET is the
  // common case — the public /track/<token> page hits this directly.
  let token: string | null = null
  if (req.method === 'GET') {
    const url = new URL(req.url)
    token = url.searchParams.get('token')
  } else if (req.method === 'POST') {
    try {
      const body = (await req.json().catch(() => ({}))) as { token?: string }
      token = body.token ?? null
    } catch {
      return json({ error: 'invalid_body' }, 400)
    }
  } else {
    return json({ error: 'method_not_allowed' }, 405)
  }
  if (!token || typeof token !== 'string' || token.length < 16) {
    return json({ error: 'invalid_token' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Token lookup — single indexed hit. Includes expires_at + view
  //    counter so we can update them in one round-trip.
  const { data: tokenRow, error: tokenErr } = await admin
    .from('job_eta_tokens')
    .select('id, job_id, organisation_id, expires_at, view_count')
    .eq('token', token)
    .maybeSingle()
  if (tokenErr) {
    console.error('[public-job-eta] token lookup failed:', tokenErr.message)
    return json({ error: 'lookup_failed' }, 500)
  }
  if (!tokenRow) {
    return json({ error: 'token_not_found' }, 404)
  }

  const t = tokenRow as TokenRow
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return json({ error: 'token_expired' }, 410)
  }

  // 2. Job + property — minimal projection only. Note we DO NOT pull
  //    address, phone, internal notes, or anything else PII-shaped.
  //    eta_earliest_at + eta_latest_at land on jobs in the D3 commit;
  //    they're optional here so this function works during the
  //    interim.
  const { data: jobData, error: jobErr } = await admin
    .from('jobs')
    .select(
      'id, organisation_id, status, scheduled_date, completed_date, eta_earliest_at, eta_latest_at, properties:property_id(name)',
    )
    .eq('id', t.job_id)
    // The token row is user-created and historically its RLS checked only the
    // supplied organisation_id, not that job_id belonged to the same org. Bind
    // both here because the service-role client bypasses the jobs RLS entirely.
    .eq('organisation_id', t.organisation_id)
    .maybeSingle()
  if (jobErr || !jobData) {
    return json({ error: 'job_not_found' }, 404)
  }
  const job = jobData as unknown as JobRow

  // 3. Assigned engineer's first name. Only the most-recent assignment
  //    is relevant — if multiple engineers are on a job we show the
  //    primary.
  const { data: assignment } = await admin
    .from('engineer_assignments')
    .select('engineer_id, profiles:engineer_id(full_name)')
    .eq('job_id', job.id)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const a = (assignment ?? null) as AssignmentRow | null
  const engineerName = firstName(a?.profiles?.full_name ?? null)

  // 4. Live position — ONLY surfaced when status is 'travelling'.
  //    For any other status the customer doesn't need (and shouldn't
  //    see) where the engineer happens to be. We use the most recent
  //    position from engineer_locations within the last 5 minutes —
  //    older than that is stale and worse than no position at all.
  let position: LocationRow | null = null
  if (job.status === 'travelling' && a?.engineer_id) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: locData } = await admin
      .from('engineer_locations')
      .select('latitude, longitude, accuracy_meters, recorded_at')
      .eq('engineer_id', a.engineer_id)
      .gte('recorded_at', fiveMinAgo)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    position = (locData ?? null) as LocationRow | null
  }

  // 5. Bump view counter. Best-effort — don't fail the response if it
  //    can't write.
  void admin
    .from('job_eta_tokens')
    .update({
      view_count: (t.view_count ?? 0) + 1,
      last_viewed_at: new Date().toISOString(),
    })
    .eq('id', t.id)
    .then(({ error }) => {
      if (error) console.warn('[public-job-eta] view count bump failed:', error.message)
    })

  // 6. Build the sanitised response.
  return json({
    status: job.status,
    property_name: job.properties?.name ?? null,
    engineer_first_name: engineerName,
    scheduled_date: job.scheduled_date,
    eta_window:
      job.eta_earliest_at && job.eta_latest_at
        ? { earliest_at: job.eta_earliest_at, latest_at: job.eta_latest_at }
        : null,
    completed_date: job.completed_date,
    show_live_position: job.status === 'travelling' && !!position,
    engineer_position: position
      ? {
          lat: position.latitude,
          lng: position.longitude,
          accuracy_m: position.accuracy_meters,
          captured_at: position.recorded_at,
        }
      : null,
  })
})
