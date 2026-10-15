// supabase/functions/google-calendar-sync/index.ts
// One-way Google Calendar push for assigned jobs.
// Actions (POST body): connect | sync | sync_job | disconnect
// Deploy with: supabase functions deploy google-calendar-sync
// Required secrets:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   APP_URL                   (used to build the OAuth redirect URI)
//   SUPABASE_URL              (provided by platform)
//   SUPABASE_SERVICE_ROLE_KEY (provided by platform)
//   SUPABASE_ANON_KEY         (provided by platform)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const SYNC_DAYS = 90
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}

function envMissing(): string[] {
  const missing: string[] = []
  if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID')
  if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET')
  if (!APP_URL) missing.push('APP_URL')
  if (!SUPABASE_URL) missing.push('SUPABASE_URL')
  if (!SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return missing
}

interface JobRow {
  id: string
  title: string | null
  description: string | null
  status: string | null
  priority: string | null
  scheduled_date: string | null
  time_start: string | null
  time_end: string | null
  time_window: string | null
  organisation_id: string
  properties?: { name: string | null; address: string | null } | null
}

function buildEventResource(job: JobRow): Record<string, unknown> | null {
  if (!job.scheduled_date) return null
  const baseDate = new Date(job.scheduled_date)
  if (Number.isNaN(baseDate.getTime())) return null

  // Day from scheduled_date; clock times from time_start/time_end (the columns
  // the app writes — 00010/00036). time_window is legacy/never-written, so the
  // old parse never matched and every synced event was midnight UTC + 1h.
  const dateStr = job.scheduled_date.slice(0, 10) // YYYY-MM-DD
  const atTime = (hm: string | null | undefined): Date | null => {
    const m = hm?.match(/^(\d{1,2}):(\d{2})/)
    if (!m) return null
    const d = new Date(`${dateStr}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return null
    d.setUTCHours(Number(m[1]), Number(m[2]), 0, 0)
    return d
  }
  const windowEnd = job.time_window?.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/)?.[2] ?? null

  const start = atTime(job.time_start) ?? baseDate
  let end = atTime(job.time_end) ?? atTime(windowEnd) ?? new Date(start.getTime() + 60 * 60 * 1000)
  if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000)

  const propertyName = job.properties?.name ?? 'Site'
  const summary = `${job.title ?? 'Job'} @ ${propertyName}`
  const description = [
    job.description ?? '',
    job.priority ? `Priority: ${job.priority}` : '',
    job.status ? `Status: ${job.status}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const priority = (job.priority ?? '').toLowerCase()
  const useReminder = priority === 'high' || priority === 'urgent' || priority === 'critical'

  return {
    summary,
    description,
    location: job.properties?.address ?? undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    status: job.status === 'cancelled' ? 'cancelled' : 'confirmed',
    extendedProperties: {
      private: { facilities_os_job_id: job.id },
    },
    reminders: {
      useDefault: !useReminder,
      overrides: useReminder ? [{ method: 'popup', minutes: 30 }] : undefined,
    },
  }
}

// ── Google API helpers ───────────────────────────────

async function exchangeCode(code: string, redirectUri: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google token exchange failed: ${res.status} ${txt}`)
  }
  return await res.json()
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google token refresh failed: ${res.status} ${txt}`)
  }
  return await res.json()
}

async function ensureAccessToken(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ accessToken: string; calendarId: string }> {
  const { data: row } = await admin
    .from('google_calendar_tokens')
    .select('refresh_token, access_token, expires_at, calendar_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row) throw new Error('Google Calendar not connected')

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0
  const skewMs = 60 * 1000
  if (row.access_token && expiresAt - skewMs > Date.now()) {
    return { accessToken: row.access_token as string, calendarId: (row.calendar_id as string) || 'primary' }
  }

  const refreshed = await refreshAccessToken(row.refresh_token as string)
  const newExpires = new Date(Date.now() + (refreshed.expires_in - 30) * 1000).toISOString()
  await admin
    .from('google_calendar_tokens')
    .update({ access_token: refreshed.access_token, expires_at: newExpires })
    .eq('user_id', userId)
  return { accessToken: refreshed.access_token, calendarId: (row.calendar_id as string) || 'primary' }
}

async function findEventByJobId(
  accessToken: string,
  calendarId: string,
  jobId: string,
): Promise<{ id: string } | null> {
  const url = new URL(`${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`)
  url.searchParams.set('privateExtendedProperty', `facilities_os_job_id=${jobId}`)
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('showDeleted', 'false')
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const body = await res.json()
  if (Array.isArray(body.items) && body.items.length > 0) return { id: body.items[0].id }
  return null
}

async function upsertJobEvent(
  accessToken: string,
  calendarId: string,
  job: JobRow,
): Promise<{ ok: boolean; error?: string }> {
  const resource = buildEventResource(job)
  if (!resource) return { ok: false, error: 'no scheduled_date' }

  const existing = await findEventByJobId(accessToken, calendarId, job.id)
  const url = existing
    ? `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${existing.id}`
    : `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`
  const method = existing ? 'PATCH' : 'POST'

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(resource),
  })
  if (!res.ok) {
    const txt = await res.text()
    return { ok: false, error: `${res.status} ${txt}` }
  }
  return { ok: true }
}

// ── Handler ──────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const missing = envMissing()
  if (missing.length) {
    console.error('[google-calendar-sync] Missing env:', missing.join(', '))
    return json({ error: 'Google Calendar sync not configured', missing }, 503)
  }

  // Resolve calling user from JWT.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthenticated' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let body: { action?: string; code?: string; redirect_uri?: string; job_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const action = body.action ?? ''

  // ── connect ───────────────────────────────────────
  if (action === 'connect') {
    if (!body.code) return json({ error: 'Missing authorization code' }, 400)
    const redirectUri = body.redirect_uri || `${APP_URL}/dashboard/integrations/calendar`
    try {
      const tok = await exchangeCode(body.code, redirectUri)
      if (!tok.refresh_token) {
        // Google only returns refresh_token on first consent.
        return json({
          error:
            'Google did not return a refresh token. Disconnect this app from your Google account and try again with prompt=consent.',
        }, 400)
      }
      const expiresAt = new Date(Date.now() + (tok.expires_in - 30) * 1000).toISOString()

      // Pull org for context (best-effort).
      const { data: profile } = await admin
        .from('profiles')
        .select('organisation_id')
        .eq('id', user.id)
        .maybeSingle()

      const { error } = await admin.from('google_calendar_tokens').upsert(
        {
          user_id: user.id,
          organisation_id: profile?.organisation_id ?? null,
          refresh_token: tok.refresh_token,
          access_token: tok.access_token,
          expires_at: expiresAt,
          scope: tok.scope,
          calendar_id: 'primary',
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      console.error('[google-calendar-sync] connect failed:', msg)
      return json({ error: msg }, 500)
    }
  }

  // ── disconnect ────────────────────────────────────
  if (action === 'disconnect') {
    const { data: row } = await admin
      .from('google_calendar_tokens')
      .select('refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()
    if (row?.refresh_token) {
      try {
        await fetch(`${REVOKE_URL}?token=${encodeURIComponent(row.refresh_token as string)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      } catch (e) {
        console.warn('[google-calendar-sync] revoke failed (continuing):', e)
      }
    }
    await admin.from('google_calendar_tokens').delete().eq('user_id', user.id)
    return json({ ok: true })
  }

  // ── sync (full window) or sync_job (single) ───────
  if (action === 'sync' || action === 'sync_job') {
    let accessToken: string
    let calendarId: string
    try {
      const t = await ensureAccessToken(admin, user.id)
      accessToken = t.accessToken
      calendarId = t.calendarId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return json({ error: msg }, 400)
    }

    if (action === 'sync_job') {
      if (!body.job_id) return json({ error: 'Missing job_id' }, 400)
      // Verify the user is assigned (or scope it to org).
      const { data: assigned } = await admin
        .from('engineer_assignments')
        .select('id')
        .eq('engineer_id', user.id)
        .eq('job_id', body.job_id)
        .maybeSingle()
      if (!assigned) return json({ ok: true, skipped: true, reason: 'not assigned' })

      const { data: job } = await admin
        .from('jobs')
        .select(
          'id, title, description, status, priority, scheduled_date, time_start, time_end, time_window, organisation_id, properties(name, address)',
        )
        .eq('id', body.job_id)
        .maybeSingle()
      if (!job) return json({ error: 'Job not found' }, 404)

      const result = await upsertJobEvent(accessToken, calendarId, job as unknown as JobRow)
      await admin
        .from('google_calendar_tokens')
        .update({ last_synced_at: new Date().toISOString(), last_error: result.ok ? null : result.error })
        .eq('user_id', user.id)
      return json(result.ok ? { ok: true } : { ok: false, error: result.error }, result.ok ? 200 : 500)
    }

    // Full sync: assigned jobs in window.
    const now = new Date()
    const horizon = new Date(now.getTime() + SYNC_DAYS * 24 * 60 * 60 * 1000)
    const startIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const horizonIso = horizon.toISOString()

    const { data: assignments } = await admin
      .from('engineer_assignments')
      .select('job_id')
      .eq('engineer_id', user.id)
    const ids = (assignments ?? []).map((a) => a.job_id).filter(Boolean) as string[]
    if (ids.length === 0) {
      await admin
        .from('google_calendar_tokens')
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq('user_id', user.id)
      return json({ ok: true, synced: 0 })
    }

    const { data: jobs, error: jobsErr } = await admin
      .from('jobs')
      .select(
        'id, title, description, status, priority, scheduled_date, time_start, time_end, time_window, organisation_id, properties(name, address)',
      )
      .in('id', ids)
      .gte('scheduled_date', startIso)
      .lte('scheduled_date', horizonIso)
      .order('scheduled_date', { ascending: true })

    if (jobsErr) return json({ error: jobsErr.message }, 500)

    let synced = 0
    let failed = 0
    const errors: string[] = []
    for (const job of (jobs ?? []) as unknown as JobRow[]) {
      const r = await upsertJobEvent(accessToken, calendarId, job)
      if (r.ok) synced++
      else {
        failed++
        if (errors.length < 5 && r.error) errors.push(r.error)
      }
    }

    await admin
      .from('google_calendar_tokens')
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: failed > 0 ? errors.join('; ') : null,
      })
      .eq('user_id', user.id)

    return json({ ok: true, synced, failed, errors })
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
