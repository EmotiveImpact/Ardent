// supabase/functions/calendar-feed/index.ts
// Public iCal feed for assigned jobs — used by Apple Cal / Outlook / Google subscriptions.
// Auth via signed HMAC token in the query string.
// Deploy with: supabase functions deploy calendar-feed --no-verify-jwt
// Required secrets:
//   CALENDAR_FEED_SECRET           HMAC key for signed tokens
//   SUPABASE_URL                   (provided by the platform)
//   SUPABASE_SERVICE_ROLE_KEY      (provided by the platform)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CALENDAR_FEED_SECRET = Deno.env.get('CALENDAR_FEED_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const FEED_DAYS = 90
const PRODID = '-//Facilities OS//Calendar Sync 1.0//EN'

// ── HMAC helpers ─────────────────────────────────────

function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64urlEncode(new Uint8Array(sig))
}

async function verifyToken(token: string, secret: string): Promise<{ user_id: string; exp?: number } | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payload64, sig64] = parts
  const expected = await hmacSign(payload64, secret)
  // Constant-time-ish compare
  if (expected.length !== sig64.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig64.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const json = new TextDecoder().decode(b64urlDecode(payload64))
    const obj = JSON.parse(json) as { user_id?: string; exp?: number }
    if (!obj.user_id) return null
    if (obj.exp && obj.exp < Math.floor(Date.now() / 1000)) return null
    return { user_id: obj.user_id, exp: obj.exp }
  } catch {
    return null
  }
}

// ── ICS helpers ──────────────────────────────────────

function escapeIcsText(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function formatIcsDate(d: Date): string {
  // UTC basic format: 20260424T130000Z
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

function foldLine(line: string): string {
  // RFC 5545: lines longer than 75 octets must be folded.
  if (line.length <= 75) return line
  const parts: string[] = []
  let i = 0
  while (i < line.length) {
    parts.push((i === 0 ? '' : ' ') + line.slice(i, i + 73))
    i += 73
  }
  return parts.join('\r\n')
}

interface JobRow {
  id: string
  title: string | null
  description: string | null
  status: string | null
  priority: string | null
  scheduled_date: string | null
  completed_date: string | null
  time_start: string | null
  time_end: string | null
  time_window: string | null
  properties?: { name: string | null; address: string | null } | null
}

function buildVEvent(job: JobRow): string | null {
  if (!job.scheduled_date) return null
  const baseDate = new Date(job.scheduled_date)
  if (Number.isNaN(baseDate.getTime())) return null

  // The DAY comes from scheduled_date; the CLOCK times come from time_start/
  // time_end (the columns the app actually writes — 00010/00036). time_window is
  // a legacy column that's never populated, so the old parse never matched and
  // every event collapsed to midnight UTC + 1h. Kept only as a last-resort
  // fallback for the end time. (Calendar is published as UTC — see X-WR-TIMEZONE.)
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
  // Guard against an end at/before start (missing or malformed end time).
  if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000)

  const propertyName = job.properties?.name ?? 'Site'
  const propertyAddress = job.properties?.address ?? ''
  const summary = `${job.title ?? 'Job'} @ ${propertyName}`
  const description = [
    job.description ?? '',
    job.priority ? `Priority: ${job.priority}` : '',
    job.status ? `Status: ${job.status}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const lines: string[] = []
  lines.push('BEGIN:VEVENT')
  lines.push(`UID:job-${job.id}@facilities-os`)
  lines.push(`DTSTAMP:${formatIcsDate(new Date())}`)
  lines.push(`DTSTART:${formatIcsDate(start)}`)
  lines.push(`DTEND:${formatIcsDate(end)}`)
  lines.push(`SUMMARY:${escapeIcsText(summary)}`)
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`)
  if (propertyAddress) lines.push(`LOCATION:${escapeIcsText(propertyAddress)}`)
  if (job.status) lines.push(`STATUS:${job.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`)

  // 30-minute alarm for high/critical priority jobs.
  const priority = (job.priority ?? '').toLowerCase()
  if (priority === 'high' || priority === 'urgent' || priority === 'critical') {
    lines.push('BEGIN:VALARM')
    lines.push('ACTION:DISPLAY')
    lines.push(`DESCRIPTION:${escapeIcsText(summary)}`)
    lines.push('TRIGGER:-PT30M')
    lines.push('END:VALARM')
  }

  lines.push('END:VEVENT')
  return lines.map(foldLine).join('\r\n')
}

function buildIcs(events: string[]): string {
  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Facilities OS',
    'X-WR-TIMEZONE:UTC',
  ].map(foldLine)
  const tail = ['END:VCALENDAR']
  return [...head, ...events, ...tail].join('\r\n') + '\r\n'
}

// ── Handler ──────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!CALENDAR_FEED_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[calendar-feed] Missing required environment variables')
    return new Response('Calendar feed not configured', { status: 503 })
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return new Response('Missing token', { status: 401 })

  const claims = await verifyToken(token, CALENDAR_FEED_SECRET)
  if (!claims) return new Response('Invalid or expired token', { status: 401 })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Confirm token is not revoked.
  const tokenHashBuf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  const tokenHash = Array.from(new Uint8Array(tokenHashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const { data: dbToken } = await supabase
    .from('calendar_feed_tokens')
    .select('id, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  // Fail CLOSED. A missing row used to fall through and serve the feed, so
  // deleting the token row — which users can do via their own DELETE policy,
  // and which cascades when an auth user is offboarded — removed the only
  // revocation record while leaving the year-long HMAC token fully working.
  if (!dbToken || dbToken.revoked_at) {
    return new Response('Token revoked', { status: 401 })
  }

  // Best-effort: bump last_used_at if we have a row.
  if (dbToken?.id) {
    await supabase
      .from('calendar_feed_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', dbToken.id)
  }

  const now = new Date()
  const horizon = new Date(now.getTime() + FEED_DAYS * 24 * 60 * 60 * 1000)

  // Find jobs assigned to this user via engineer_assignments OR created by them.
  const { data: assignments } = await supabase
    .from('engineer_assignments')
    .select('job_id')
    .eq('engineer_id', claims.user_id)

  const assignedIds = (assignments ?? []).map((a) => a.job_id).filter(Boolean) as string[]

  const horizonIso = horizon.toISOString()
  const startIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  let jobsQuery = supabase
    .from('jobs')
    .select(
      'id, title, description, status, priority, scheduled_date, completed_date, time_start, time_end, time_window, properties(name, address)',
    )
    .gte('scheduled_date', startIso)
    .lte('scheduled_date', horizonIso)
    .order('scheduled_date', { ascending: true })

  if (assignedIds.length > 0) {
    jobsQuery = jobsQuery.in('id', assignedIds)
  } else {
    // No assignments — return empty feed instead of leaking other users' jobs.
    const ics = buildIcs([])
    return new Response(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'public, max-age=900',
        'Content-Disposition': 'attachment; filename="facilities-os.ics"',
      },
    })
  }

  const { data: jobs, error } = await jobsQuery
  if (error) {
    console.error('[calendar-feed] jobs query failed:', error.message)
    return new Response('Failed to load jobs', { status: 500 })
  }

  const events = ((jobs ?? []) as unknown as JobRow[])
    .map(buildVEvent)
    .filter((e): e is string => !!e)

  const ics = buildIcs(events)

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Content-Disposition': 'attachment; filename="facilities-os.ics"',
    },
  })
})
