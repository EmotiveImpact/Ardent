// supabase/functions/compute-compliance-scores/index.ts
//
// Strategic 1 — "Continuous Compliance Score" foundational slice.
//
// Cron-equivalent edge function. Walks every active organisation,
// computes today's score from compliance_items + jobs + actions, and
// UPSERTs a row in compliance_score_snapshots keyed by (org, today).
//
// Inputs (POST body — all optional):
//   { organisation_ids?: string[] }   — restrict to a subset (used by
//                                       the dashboard "Recompute now"
//                                       link, which only wants today's
//                                       org refreshed). User JWTs are
//                                       forced to their own org; only the
//                                       service-role cron may sweep all orgs.
//
// Output:
//   { processed: N, updated: M, errors: K, snapshot_date: string }
//
// Schedule (deploy then run once in the Supabase SQL editor):
//   select cron.schedule(
//     'compute-compliance-scores',
//     '15 1 * * *',
//     $$select net.http_post(
//        url := 'https://<PROJECT>.supabase.co/functions/v1/compute-compliance-scores',
//        headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>", "Content-Type": "application/json"}'::jsonb,
//        body := '{}'::jsonb
//      )$$
//   );
//
// Why 01:15 UTC: late enough that yesterday's last-minute job updates
// have settled, early enough that the morning shift (UK 09:00) sees a
// fresh score.
//
// Idempotency: the snapshots table has UNIQUE(org_id, snapshot_date),
// so re-running today is safe (UPSERT). The "Recompute now" UI relies
// on this.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

type CallerContext =
  | { kind: 'service_role' }
  | { kind: 'user'; organisation_id: string }

function readBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') ?? ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const [, payload] = jwt.split('.')
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isServiceRoleJwt(jwt: string): boolean {
  // Trust the JWT role claim: verify_jwt=true at the gateway has already
  // validated the signature, so the role claim is signed-and-attested.
  // String equality against SUPABASE_SERVICE_ROLE_KEY env var was too brittle —
  // it broke when the project had multiple/rotated service-role keys.
  return decodeJwtPayload(jwt)?.role === 'service_role'
}

async function resolveCallerContext(req: Request): Promise<CallerContext | Response> {
  const jwt = readBearerToken(req)
  if (!jwt) {
    return json({ error: 'missing_authorization' }, 401)
  }

  if (isServiceRoleJwt(jwt)) {
    return { kind: 'service_role' }
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return json({ error: 'invalid_authorization' }, 401)
  }

  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('organisation_id')
    .eq('id', userData.user.id)
    .single()

  if (profileErr || !profile?.organisation_id) {
    return json({ error: 'profile_organisation_not_found' }, 403)
  }

  return { kind: 'user', organisation_id: String(profile.organisation_id) }
}

// ── Inlined scoring logic ─────────────────────────────────────────
//
// We intentionally duplicate calculateComplianceScore here rather
// than imports across the workspace boundary. The Deno edge runtime
// can't pull from apps/web — we'd need a shared package or an
// import-map shim. The pure function is ~60 lines; the cost of
// duplication is one place to update if weights change. The unit
// tests live with the canonical TS copy in apps/web/src/lib.
//
// Rule of thumb: if you change WEIGHTS or a sub-metric calc here,
// change it in apps/web/src/lib/compliance-score/calculate.ts AND
// update the tests.

const WEIGHTS = {
  compliance: 0.4,
  ppm_on_time: 0.25,
  pass_rate: 0.25,
  action_health: 0.1,
}

const OVERDUE_ACTION_PRIORITY = 'critical'

interface ScoreInput {
  compliance_items: { status: string }[]
  ppm_jobs: { scheduled_date: string | null; completed_date: string | null }[]
  pass_jobs: { outcome: string | null }[]
  overdue_actions_count: number
}

interface ScoreBreakdown {
  compliance: number
  ppm_on_time: number
  pass_rate: number
  action_health: number
}

interface ScoreResult {
  score: number
  breakdown: ScoreBreakdown
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  if (n > max) return max
  return n
}

function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  return iso.slice(0, 10)
}

function calculateComplianceScore(input: ScoreInput): ScoreResult {
  const totalSignals =
    input.compliance_items.length +
    input.ppm_jobs.length +
    input.pass_jobs.length +
    input.overdue_actions_count
  if (totalSignals === 0) {
    return {
      score: 0,
      breakdown: { compliance: 0, ppm_on_time: 0, pass_rate: 0, action_health: 0 },
    }
  }

  const complianceItems = input.compliance_items
  const compliantCount = complianceItems.filter(
    (i) => i.status === 'compliant' || i.status === 'due_soon',
  ).length
  const compliance = complianceItems.length
    ? Math.round((compliantCount / complianceItems.length) * 100)
    : 0

  let ppmOnTimeCount = 0
  for (const j of input.ppm_jobs) {
    const scheduledDay = dayOf(j.scheduled_date)
    const completedDay = dayOf(j.completed_date)
    if (!scheduledDay) continue
    if (completedDay && completedDay <= scheduledDay) ppmOnTimeCount++
  }
  const ppmDenom = input.ppm_jobs.filter((j) => !!dayOf(j.scheduled_date)).length
  const ppm_on_time = ppmDenom ? Math.round((ppmOnTimeCount / ppmDenom) * 100) : 0

  const passWithOutcome = input.pass_jobs.filter((j) => j.outcome != null)
  const passCount = passWithOutcome.filter((j) => j.outcome === 'pass').length
  const pass_rate = passWithOutcome.length
    ? Math.round((passCount / passWithOutcome.length) * 100)
    : 0

  const action_health = 100 - clamp(input.overdue_actions_count * 5, 0, 100)

  const raw =
    compliance * WEIGHTS.compliance +
    ppm_on_time * WEIGHTS.ppm_on_time +
    pass_rate * WEIGHTS.pass_rate +
    action_health * WEIGHTS.action_health

  return {
    score: clamp(Math.round(raw), 0, 100),
    breakdown: { compliance, ppm_on_time, pass_rate, action_health },
  }
}

// ── End inlined scoring logic ─────────────────────────────────────

interface OrgRow { id: string }

interface ComplianceItemRow { status: string | null }

interface JobRow {
  scheduled_date: string | null
  completed_date: string | null
  outcome: string | null
  // Used to detect a PPM (vs a reactive callout): the existing schema
  // uses `maintenance_plan_id` to link a job to its plan. Reactive
  // callouts have it null.
  maintenance_plan_id: string | null
  is_callout: boolean | null
}

interface ActionRow {
  status: string | null
  priority: string | null
  created_at: string
}

async function computeOneOrg(
  admin: ReturnType<typeof createClient>,
  organisation_id: string,
): Promise<{ score: number; breakdown: ScoreBreakdown }> {
  // 90-day window for jobs (PPM-on-time + pass-rate signals).
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setUTCHours(0, 0, 0, 0)
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90)
  const ninetyIso = ninetyDaysAgo.toISOString()

  // 7-day age cutoff for "overdue" critical actions.
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setUTCHours(0, 0, 0, 0)
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)
  const sevenIso = sevenDaysAgo.toISOString()

  const [{ data: compliance }, { data: jobs }, { data: actions }] = await Promise.all([
    admin
      .from('compliance_items')
      .select('status')
      .eq('organisation_id', organisation_id),
    admin
      .from('jobs')
      .select('scheduled_date, completed_date, outcome, maintenance_plan_id, is_callout')
      .eq('organisation_id', organisation_id)
      .gte('scheduled_date', ninetyIso),
    admin
      .from('actions')
      .select('status, priority, created_at')
      .eq('organisation_id', organisation_id)
      .in('status', ['open', 'in_progress'])
      .eq('priority', OVERDUE_ACTION_PRIORITY)
      .lt('created_at', sevenIso),
  ])

  const complianceRows = (compliance as ComplianceItemRow[] | null) ?? []
  const jobRows = (jobs as JobRow[] | null) ?? []
  const actionRows = (actions as ActionRow[] | null) ?? []

  const ppmJobs = jobRows.filter((j) => j.maintenance_plan_id != null)
  // pass_jobs = jobs completed in last 90d with an outcome recorded.
  const passJobs = jobRows.filter((j) => j.completed_date != null && j.outcome != null)

  return calculateComplianceScore({
    compliance_items: complianceRows.map((r) => ({ status: r.status ?? '' })),
    ppm_jobs: ppmJobs.map((j) => ({
      scheduled_date: j.scheduled_date,
      completed_date: j.completed_date,
    })),
    pass_jobs: passJobs.map((j) => ({ outcome: j.outcome })),
    overdue_actions_count: actionRows.length,
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  let requestedOrgIds: string[] | null = null
  try {
    const body = (await req.json().catch(() => ({}))) as {
      organisation_id?: string
      organisation_ids?: string[]
    }
    if (Array.isArray(body.organisation_ids) && body.organisation_ids.length > 0) {
      requestedOrgIds = body.organisation_ids
    } else if (body.organisation_id) {
      requestedOrgIds = [body.organisation_id]
    }
  } catch {
    // Empty body keeps cron sweep semantics only for service-role callers.
  }

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller

  let restrictTo = requestedOrgIds
  if (caller.kind === 'user') {
    const requested = new Set(requestedOrgIds ?? [caller.organisation_id])
    if (requested.size !== 1 || !requested.has(caller.organisation_id)) {
      return json({ error: 'organisation_forbidden' }, 403)
    }
    restrictTo = [caller.organisation_id]
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Today as UK-civil date (YYYY-MM-DD). The cron should run at
  // 01:15 UTC, so UTC date == UK date for ~all of the year except a
  // 1-hour daylight-saving overlap that's a non-issue at this hour.
  const today = new Date()
  const snapshotDate = today.toISOString().slice(0, 10)

  // 1. Pull every active org (or the requested subset).
  const orgQuery = admin.from('organisations').select('id')
  const { data: orgs, error: orgsErr } = restrictTo
    ? await orgQuery.in('id', restrictTo)
    : await orgQuery
  if (orgsErr) {
    console.error('[compute-compliance-scores] org lookup failed:', orgsErr.message)
    return json({ error: 'org_lookup_failed' }, 500)
  }

  const orgRows = (orgs as OrgRow[] | null) ?? []

  let processed = 0
  let updated = 0
  let errors = 0

  for (const org of orgRows) {
    processed++
    try {
      const { score, breakdown } = await computeOneOrg(admin, org.id)

      const { error: upsertErr } = await admin
        .from('compliance_score_snapshots')
        .upsert(
          {
            organisation_id: org.id,
            snapshot_date: snapshotDate,
            score,
            breakdown: { ...breakdown, weights: WEIGHTS, version: 1 },
          },
          { onConflict: 'organisation_id,snapshot_date' },
        )
      if (upsertErr) {
        errors++
        console.warn(
          `[compute-compliance-scores] upsert failed for org ${org.id}:`,
          upsertErr.message,
        )
      } else {
        updated++
      }
    } catch (err) {
      errors++
      console.warn(
        `[compute-compliance-scores] compute failed for org ${org.id}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return json({ processed, updated, errors, snapshot_date: snapshotDate })
})
