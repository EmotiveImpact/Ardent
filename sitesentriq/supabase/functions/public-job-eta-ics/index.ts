// supabase/functions/public-job-eta-ics/index.ts
//
// Strategic 2 / S2 — Self-updating customer calendar feed.
//
// Onfleet shows live ETAs in a tracking link. We've already shipped that
// (D2 — /track/<token>). The next-level move nobody in UK FM has done:
// hand the customer a CALENDAR SUBSCRIPTION URL whose VEVENT updates
// itself as the engineer's ETA window narrows. Subscribe once, the
// block in their Google/Outlook/Apple Calendar shrinks automatically
// from 11:15-11:45 → 11:23-11:31 as we learn more, and auto-completes
// on arrival.
//
// Request:
//   GET  /functions/v1/public-job-eta-ics?token=<token>
//   GET  /functions/v1/public-job-eta-ics/<token>      (path-param form
//                                                       so calendar
//                                                       clients can
//                                                       subscribe with
//                                                       NO apikey
//                                                       header)
//
// Response (200):
//   text/calendar VCALENDAR + one VEVENT
//
// Response (410): empty body — token expired
// Response (404): empty body — token not found
//
// PII rules — same as public-job-eta:
//   - SUMMARY uses property name only (already shared in the call-out)
//   - DESCRIPTION uses engineer FIRST NAME only
//   - LOCATION is property name (no street address)
//   - URL points back to the public /track/<token> page
//
// Why path-param form: ICS subscription URLs are pasted into Google
// Calendar / Apple Calendar / Outlook with NO header customisation.
// Supabase edge functions normally require an `apikey` header, but
// we're already verify_jwt: false here AND public functions accept
// the anon key as a query parameter. We support BOTH URL shapes so
// the share button can pick whichever is cleanest for the target
// client.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PUBLIC_APP_ORIGIN = Deno.env.get('PUBLIC_APP_ORIGIN') ?? 'https://app.haumea.io'

// Calendar clients should always re-fetch — that's the whole point of
// an "auto-updating" feed. max-age=0 is the most aggressive hint short
// of no-store (which some clients treat as "do not subscribe").
const CALENDAR_HEADERS: Record<string, string> = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Cache-Control': 'no-cache, max-age=0',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TokenRow {
  id: string
  job_id: string
  organisation_id: string
  expires_at: string
  view_count: number
  ics_sequence: number
  ics_last_hash: string | null
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

/** "John Smith" → "John". Same rule as public-job-eta. */
function firstName(full: string | null | undefined): string | null {
  if (!full) return null
  const trimmed = full.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0]
}

/**
 * Format a Date as RFC 5545 UTC: 20260509T143000Z.
 * Calendar clients are picky — no dashes, no colons, trailing Z.
 */
function formatIcsUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/**
 * RFC 5545 escaping for SUMMARY/DESCRIPTION/LOCATION text values.
 *   \\  →  \\\\
 *   ;   →  \\;
 *   ,   →  \\,
 *   newlines → \\n  (literal backslash-n)
 */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * RFC 5545 line folding — lines over 75 octets must be folded with a
 * CRLF + space continuation. Most modern clients accept long lines but
 * Outlook still chokes on >998. Fold defensively.
 */
function foldIcsLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let i = 0
  while (i < line.length) {
    chunks.push(i === 0 ? line.slice(i, i + 75) : ' ' + line.slice(i, i + 74))
    i += i === 0 ? 75 : 74
  }
  return chunks.join('\r\n')
}

/**
 * Cheap stable hash — DJB2. Used to detect when the ETA "shape" has
 * changed so we can decide whether to bump SEQUENCE. We don't need
 * cryptographic strength here, just collision resistance for the
 * handful of fields we care about.
 */
function djb2(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  // Render as unsigned hex so the value is stable across re-deploys.
  return (hash >>> 0).toString(16)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CALENDAR_HEADERS })
  }
  if (req.method !== 'GET') {
    return new Response('', { status: 405, headers: CALENDAR_HEADERS })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('', { status: 500, headers: CALENDAR_HEADERS })
  }

  // Token can come from ?token=… OR from the trailing path segment so
  // calendar clients can subscribe with a clean header-less URL.
  // Path form: /functions/v1/public-job-eta-ics/<token>
  const url = new URL(req.url)
  let token: string | null = url.searchParams.get('token')
  if (!token) {
    // Strip leading "/" and any "/functions/v1/public-job-eta-ics/" prefix.
    const parts = url.pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1]
    if (last && last !== 'public-job-eta-ics') {
      token = decodeURIComponent(last)
    }
  }
  if (!token || typeof token !== 'string' || token.length < 16) {
    return new Response('', { status: 404, headers: CALENDAR_HEADERS })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Token lookup — service role bypasses RLS (the token IS the auth).
  const { data: tokenRow, error: tokenErr } = await admin
    .from('job_eta_tokens')
    .select('id, job_id, organisation_id, expires_at, view_count, ics_sequence, ics_last_hash')
    .eq('token', token)
    .maybeSingle()
  if (tokenErr) {
    console.error('[public-job-eta-ics] token lookup failed:', tokenErr.message)
    return new Response('', { status: 500, headers: CALENDAR_HEADERS })
  }
  if (!tokenRow) {
    return new Response('', { status: 404, headers: CALENDAR_HEADERS })
  }

  const t = tokenRow as TokenRow
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return new Response('', { status: 410, headers: CALENDAR_HEADERS })
  }

  // 2. Job + property — minimal projection. Matches public-job-eta.
  const { data: jobData, error: jobErr } = await admin
    .from('jobs')
    .select(
      'id, organisation_id, status, scheduled_date, completed_date, eta_earliest_at, eta_latest_at, properties:property_id(name)',
    )
    .eq('id', t.job_id)
    // Keep the public calendar surface bound to the token's tenant. Older RLS
    // allowed a caller to pair their org id with another org's job id, and this
    // service-role lookup would otherwise follow that cross-tenant reference.
    .eq('organisation_id', t.organisation_id)
    .maybeSingle()
  if (jobErr || !jobData) {
    return new Response('', { status: 404, headers: CALENDAR_HEADERS })
  }
  const job = jobData as unknown as JobRow

  // 3. Engineer first name only.
  const { data: assignment } = await admin
    .from('engineer_assignments')
    .select('engineer_id, profiles:engineer_id(full_name)')
    .eq('job_id', job.id)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const a = (assignment ?? null) as AssignmentRow | null
  const engineerName = firstName(a?.profiles?.full_name ?? null)

  // 4. Decide DTSTART / DTEND.
  //    Preference order: explicit ETA window → scheduled_date (1 hr block).
  //    If neither exists we still have to emit a VEVENT (calendar clients
  //    that already subscribed will otherwise treat the missing event as
  //    a CANCEL); fall back to a stub block at "now" for 30 min.
  let dtStart: Date
  let dtEnd: Date
  if (job.eta_earliest_at && job.eta_latest_at) {
    dtStart = new Date(job.eta_earliest_at)
    dtEnd = new Date(job.eta_latest_at)
  } else if (job.scheduled_date) {
    dtStart = new Date(job.scheduled_date)
    dtEnd = new Date(dtStart.getTime() + 60 * 60 * 1000)
  } else {
    const now = new Date()
    dtStart = now
    dtEnd = new Date(now.getTime() + 30 * 60 * 1000)
  }

  // 5. STATUS mapping.
  //    CONFIRMED for any "still happening" status; CANCELLED for the
  //    explicit cancel state. Completed jobs stay CONFIRMED — the
  //    customer wants the event to stick around in their history.
  const cancelled = job.status === 'cancelled' || job.status === 'failed_access'
  const icsStatus = cancelled ? 'CANCELLED' : 'CONFIRMED'

  // 6. Build SUMMARY / DESCRIPTION / LOCATION respecting PII rules.
  const propName = job.properties?.name ?? 'visit'
  const summary = `Engineer visit — ${propName}`
  const trackUrl = `${PUBLIC_APP_ORIGIN.replace(/\/$/, '')}/track/${token}`
  const descriptionLines: string[] = []
  if (engineerName) descriptionLines.push(`Engineer: ${engineerName}`)
  descriptionLines.push(`Status: ${job.status}`)
  descriptionLines.push(`Live ETA: ${trackUrl}`)
  const description = descriptionLines.join('\n')

  // 7. SEQUENCE — bump when the ETA "shape" has changed since last fetch.
  //    Hash includes DTSTART, DTEND, STATUS, SUMMARY. Anything else
  //    (e.g. live position) is invisible to calendar clients so we don't
  //    track it here.
  const shape = [dtStart.toISOString(), dtEnd.toISOString(), icsStatus, summary].join('|')
  const currentHash = djb2(shape)
  const lastHash = t.ics_last_hash
  let sequence = t.ics_sequence ?? 0
  if (lastHash !== currentHash) {
    sequence = sequence + 1
    void admin
      .from('job_eta_tokens')
      .update({
        ics_sequence: sequence,
        ics_last_hash: currentHash,
        view_count: (t.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('id', t.id)
      .then(({ error }) => {
        if (error) console.warn('[public-job-eta-ics] sequence bump failed:', error.message)
      })
  } else {
    void admin
      .from('job_eta_tokens')
      .update({
        view_count: (t.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq('id', t.id)
      .then(({ error }) => {
        if (error) console.warn('[public-job-eta-ics] view bump failed:', error.message)
      })
  }

  // 8. Assemble the VCALENDAR. Order matches the RFC 5545 examples
  //    so picky clients (Outlook, looking at you) parse cleanly.
  const now = new Date()
  const uid = `eta-${token}@haumea.io`
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Haumea//FacilitiesOS ETA//EN',
    'VERSION:2.0',
    'METHOD:PUBLISH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `LAST-MODIFIED:${formatIcsUtc(now)}`,
    `SEQUENCE:${sequence}`,
    `DTSTART:${formatIcsUtc(dtStart)}`,
    `DTEND:${formatIcsUtc(dtEnd)}`,
    `STATUS:${icsStatus}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(propName)}`,
    `URL:${trackUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(foldIcsLine)

  // RFC 5545 mandates CRLF line endings.
  const body = lines.join('\r\n') + '\r\n'

  return new Response(body, { status: 200, headers: CALENDAR_HEADERS })
})
