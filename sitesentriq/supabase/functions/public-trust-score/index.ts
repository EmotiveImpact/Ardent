// supabase/functions/public-trust-score/index.ts
//
// Strategic 1 follow-up — Public Trust URL endpoint.
//
// Request:
//   GET /functions/v1/public-trust-score?slug=<slug>
//
// Response (200):
//   {
//     org_name: string,
//     org_logo_url: string | null,
//     current_score: number,             // 0–100
//     current_breakdown: { compliance, ppm_on_time, pass_rate, action_health } | null,
//     score_band: 'exceptional' | 'strong' | 'fair' | 'needs_work',
//     snapshot_date: string,             // YYYY-MM-DD
//     history: { date: string, score: number }[] | null  // last 30 days
//   }
//
// Response (404): { error: 'org_not_found' }   — slug not found OR trust_url_enabled = false
// Response (410): { error: 'no_snapshots' }    — org found but the cron hasn't produced a score yet
// Response (400): { error: 'invalid_slug' }
//
// Security guarantees enforced here:
//   1. Service role used internally — bypasses RLS so the page works
//      with no auth at all (the slug IS the surface).
//   2. PII-minimal: only the score, breakdown, org name, and logo URL
//      are returned. NO client list, property addresses, engineer names,
//      job details, or anything else operational.
//   3. trust_url_enabled MUST be TRUE on the org — disabled orgs 404
//      (not 401) so we don't leak slug existence.
//   4. trust_url_show_breakdown / trust_url_show_history toggles are
//      enforced HERE, not in the UI — so a curious developer hitting
//      the endpoint directly can't bypass the org's privacy choices.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 30 days of history is enough for a sparkline that tells a "trending
// up" story without leaking long-term operational dips.
const HISTORY_DAYS = 30

// Cache the response for a minute at the CDN edge — the underlying
// snapshot is computed daily, so even an aggressive prospect refreshing
// the page won't see stale numbers and we save a round-trip on viral
// shares.
const CDN_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  })
}

interface OrgRow {
  id: string
  name: string
  logo_url: string | null
  branding_enabled: boolean | null
  trust_url_show_breakdown: boolean
  trust_url_show_history: boolean
}

interface SnapshotRow {
  snapshot_date: string
  score: number
  breakdown: Record<string, unknown> | null
}

/**
 * Score → band. Tuned so that "exceptional" feels rare (90+), "strong"
 * is the realistic happy path for a well-run FM (75–89), "fair" flags
 * room for improvement (60–74), and "needs_work" is the explicit "this
 * org is not on top of compliance right now" zone.
 */
function scoreBand(score: number): 'exceptional' | 'strong' | 'fair' | 'needs_work' {
  if (score >= 90) return 'exceptional'
  if (score >= 75) return 'strong'
  if (score >= 60) return 'fair'
  return 'needs_work'
}

/** Defensive read of the breakdown jsonb. */
function readBreakdown(input: SnapshotRow['breakdown']): {
  compliance: number
  ppm_on_time: number
  pass_rate: number
  action_health: number
} {
  const b = (input ?? {}) as Record<string, unknown>
  return {
    compliance: typeof b.compliance === 'number' ? b.compliance : 0,
    ppm_on_time: typeof b.ppm_on_time === 'number' ? b.ppm_on_time : 0,
    pass_rate: typeof b.pass_rate === 'number' ? b.pass_rate : 0,
    action_health: typeof b.action_health === 'number' ? b.action_health : 0,
  }
}

/**
 * Slug rules — must match the validator on the client side
 * (see apps/web/src/hooks/use-trust-url.ts → isValidSlug).
 * Lowercase a-z 0-9 and hyphens, 3-32 chars.
 */
const SLUG_RE = /^[a-z0-9-]{3,32}$/

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  const url = new URL(req.url)
  const rawSlug = (url.searchParams.get('slug') ?? '').trim().toLowerCase()
  if (!rawSlug || !SLUG_RE.test(rawSlug)) {
    return json({ error: 'invalid_slug' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Org lookup — gated on trust_url_enabled. We deliberately 404
  //    (not 401/403) when disabled so we don't leak which slugs exist.
  const { data: orgData, error: orgErr } = await admin
    .from('organisations')
    .select(
      'id, name, logo_url, branding_enabled, trust_url_show_breakdown, trust_url_show_history',
    )
    .ilike('trust_url_slug', rawSlug)
    .eq('trust_url_enabled', true)
    .maybeSingle()
  if (orgErr) {
    console.error('[public-trust-score] org lookup failed:', orgErr.message)
    return json({ error: 'lookup_failed' }, 500)
  }
  if (!orgData) {
    return json({ error: 'org_not_found' }, 404)
  }
  const org = orgData as OrgRow

  // 2. Most recent snapshot (the headline number).
  const { data: latestData, error: latestErr } = await admin
    .from('compliance_score_snapshots')
    .select('snapshot_date, score, breakdown')
    .eq('organisation_id', org.id)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) {
    console.error('[public-trust-score] snapshot lookup failed:', latestErr.message)
    return json({ error: 'lookup_failed' }, 500)
  }
  if (!latestData) {
    // Org exists & opted in, but the cron hasn't produced a snapshot
    // yet (brand new tenant, day-1 before the cron run, etc.). 410
    // GONE rather than 404 so the front-end can show a "Score will
    // appear shortly" empty state instead of "URL not found".
    return json({ error: 'no_snapshots' }, 410)
  }
  const latest = latestData as SnapshotRow

  // 3. History — only fetch when the org has opted in to publishing it.
  //    Saves a round-trip when disabled and avoids reading data we're
  //    going to throw away.
  let history: { date: string; score: number }[] | null = null
  if (org.trust_url_show_history) {
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - HISTORY_DAYS)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const { data: histData, error: histErr } = await admin
      .from('compliance_score_snapshots')
      .select('snapshot_date, score')
      .eq('organisation_id', org.id)
      .gte('snapshot_date', cutoffStr)
      .order('snapshot_date', { ascending: true })
    if (histErr) {
      console.warn('[public-trust-score] history lookup failed:', histErr.message)
    } else {
      history = (histData ?? []).map((r) => ({
        date: (r as { snapshot_date: string }).snapshot_date,
        score: (r as { score: number }).score,
      }))
    }
  }

  // 4. Suppress logo when branding isn't enabled — the logo URL is in
  //    the public bucket but the org chose not to white-label, so
  //    surfacing it here would surprise them.
  const logoUrl = org.branding_enabled ? org.logo_url : null

  // 5. Build the sanitised public response.
  return json(
    {
      org_name: org.name,
      org_logo_url: logoUrl,
      current_score: latest.score,
      current_breakdown: org.trust_url_show_breakdown ? readBreakdown(latest.breakdown) : null,
      score_band: scoreBand(latest.score),
      snapshot_date: latest.snapshot_date,
      history,
    },
    200,
    CDN_CACHE_HEADERS,
  )
})
