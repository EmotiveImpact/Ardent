// supabase/functions/auto-assign-job/index.ts
// Auto-assignment edge function — scores engineers for a job and optionally applies the top match.
// Deploy with: supabase functions deploy auto-assign-job
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ── Engine (mirrors src/lib/auto-assign/engine.ts) ─────

const DEFAULT_WEIGHTS = {
  skill: 30,
  location: 25,
  availability: 20,
  workload: 15,
  familiarity: 10,
}

const CATEGORY_ACCREDITATION_MAP: Record<string, string[]> = {
  gas: ['Gas Safe'],
  boiler: ['Gas Safe'],
  electrical: ['NICEIC'],
  fire_safety: ['NICEIC'],
  refrigeration: ['F-Gas'],
  hvac: ['F-Gas'],
  air_conditioning: ['F-Gas'],
  height: ['IPAF'],
  lift: ['IPAF'],
}

interface CandidateEngineer {
  id: string
  name: string
  status?: string | null
  accreditations: string[]
  home_latitude?: number | null
  home_longitude?: number | null
  busy_windows: { start_at?: string | null; end_at?: string | null }[]
  workload_this_week: number
  familiarity_count: number
}

interface CandidateJob {
  id?: string | null
  category?: string | null
  property_id?: string | null
  property_latitude?: number | null
  property_longitude?: number | null
  start_at?: string | null
  end_at?: string | null
}

interface AutoAssignRule {
  required_accreditations: string[]
  max_distance_km: number
  prefer_familiar: boolean
  weight_overrides?: Partial<typeof DEFAULT_WEIGHTS>
}

const DEFAULT_RULE: AutoAssignRule = {
  required_accreditations: [],
  max_distance_km: 80,
  prefer_familiar: true,
}

function clamp(n: number, min = 0, max = 100): number {
  if (Number.isNaN(n)) return 0
  return Math.max(min, Math.min(max, n))
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function intervalsOverlap(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined,
): boolean {
  if (!aStart || !bStart) return false
  const a1 = new Date(aStart).getTime()
  const a2 = aEnd ? new Date(aEnd).getTime() : a1 + 60 * 60 * 1000
  const b1 = new Date(bStart).getTime()
  const b2 = bEnd ? new Date(bEnd).getTime() : b1 + 60 * 60 * 1000
  return a1 < b2 && b1 < a2
}

function effectiveWeights(rule: AutoAssignRule) {
  const ovr = rule.weight_overrides ?? {}
  const merged = {
    skill: ovr.skill ?? DEFAULT_WEIGHTS.skill,
    location: ovr.location ?? DEFAULT_WEIGHTS.location,
    availability: ovr.availability ?? DEFAULT_WEIGHTS.availability,
    workload: ovr.workload ?? DEFAULT_WEIGHTS.workload,
    familiarity: ovr.familiarity ?? DEFAULT_WEIGHTS.familiarity,
  }
  const total =
    merged.skill +
    merged.location +
    merged.availability +
    merged.workload +
    merged.familiarity
  if (total <= 0) return DEFAULT_WEIGHTS
  if (Math.abs(total - 100) < 0.5) return merged
  return {
    skill: (merged.skill / total) * 100,
    location: (merged.location / total) * 100,
    availability: (merged.availability / total) * 100,
    workload: (merged.workload / total) * 100,
    familiarity: (merged.familiarity / total) * 100,
  }
}

interface ScoredCandidate {
  engineer: CandidateEngineer
  score: number
  breakdown: Record<string, number>
  reasons: string[]
}

function scoreEngineers(
  job: CandidateJob,
  engineers: CandidateEngineer[],
  rule: AutoAssignRule,
): ScoredCandidate[] {
  const weights = effectiveWeights(rule)
  const categoryRequired = (job.category &&
    CATEGORY_ACCREDITATION_MAP[job.category.toLowerCase()]) || []
  const requiredAccreditations = Array.from(
    new Set([...(rule.required_accreditations ?? []), ...categoryRequired]),
  )

  const ranked: ScoredCandidate[] = []

  for (const engineer of engineers) {
    if (engineer.status && engineer.status !== 'active') continue
    const reasons: string[] = []

    // Skill
    let skillScore = 100
    let skillFail = false
    if (requiredAccreditations.length > 0) {
      const have = new Set(engineer.accreditations.map((a) => a.toLowerCase()))
      const missing = requiredAccreditations.filter((r) => !have.has(r.toLowerCase()))
      if (missing.length === 0) {
        reasons.push(`Holds all required accreditations: ${requiredAccreditations.join(', ')}`)
      } else {
        reasons.push(`Missing accreditations: ${missing.join(', ')}`)
        skillScore = 0
        skillFail = true
      }
    } else {
      reasons.push('No accreditations required')
    }

    // Location
    let locationScore = 50
    let locationFail = false
    if (
      engineer.home_latitude != null &&
      engineer.home_longitude != null &&
      job.property_latitude != null &&
      job.property_longitude != null
    ) {
      const km = haversineKm(
        engineer.home_latitude,
        engineer.home_longitude,
        job.property_latitude,
        job.property_longitude,
      )
      locationScore = clamp(100 - km * 2)
      if (km > rule.max_distance_km) {
        reasons.push(`${km.toFixed(0)}km away — exceeds max ${rule.max_distance_km}km`)
        locationFail = true
        locationScore = 0
      } else {
        reasons.push(`${km.toFixed(0)}km from site`)
      }
    } else {
      reasons.push('Location data missing — neutral score')
    }

    // Availability
    let availabilityScore = 100
    let availabilityFail = false
    if (job.start_at) {
      const conflict = engineer.busy_windows.some((w) =>
        intervalsOverlap(w.start_at, w.end_at, job.start_at, job.end_at),
      )
      if (conflict) {
        availabilityScore = 0
        availabilityFail = true
        reasons.push('Has a conflicting assignment')
      } else {
        reasons.push('Available at the scheduled time')
      }
    } else {
      reasons.push('No scheduled time — assuming available')
    }

    // Workload
    const workloadScore = clamp(100 - engineer.workload_this_week * 10)
    reasons.push(
      `${engineer.workload_this_week} job${engineer.workload_this_week === 1 ? '' : 's'} this week`,
    )

    // Familiarity
    const familiarityRaw = clamp(engineer.familiarity_count * 25)
    const familiarityScore = rule.prefer_familiar ? familiarityRaw : familiarityRaw * 0.5
    if (engineer.familiarity_count > 0) {
      reasons.push(
        `${engineer.familiarity_count} previous successful visit${engineer.familiarity_count === 1 ? '' : 's'} at this site`,
      )
    } else {
      reasons.push('No prior visits at this site')
    }

    const breakdown = {
      skill: skillScore,
      location: locationScore,
      availability: availabilityScore,
      workload: workloadScore,
      familiarity: familiarityScore,
    }

    let total = 0
    if (!skillFail && !availabilityFail && !locationFail) {
      total =
        (breakdown.skill * weights.skill +
          breakdown.location * weights.location +
          breakdown.availability * weights.availability +
          breakdown.workload * weights.workload +
          breakdown.familiarity * weights.familiarity) /
        100
    }

    ranked.push({ engineer, score: Math.round(total), breakdown, reasons })
  }

  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, 5)
}

// ── HTTP entry point ───────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function startOfWeekIso(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday-based week
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const { job_id, mode } = await req.json()
    if (!job_id || (mode !== 'suggest' && mode !== 'apply')) {
      return jsonResponse({ error: 'job_id and mode required' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse({ error: 'Auto-assign function is not configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'Missing bearer token' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
    if (userErr || !userData.user) {
      return jsonResponse({ error: 'Invalid token' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // 1) Load job
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select(
        'id, organisation_id, property_id, scheduled_date, time_start, time_end, job_type, routine_check_type, properties:property_id(latitude, longitude)',
      )
      .eq('id', job_id)
      .maybeSingle()
    if (jobErr || !job) {
      return jsonResponse({ error: 'Job not found' }, 404)
    }

    const orgId = (job as any).organisation_id as string

    // SECURITY: the job was loaded with the service role (RLS bypassed), so we
    // MUST verify the caller belongs to the job's organisation before returning
    // engineer candidates or writing assignments. Without this any authenticated
    // user could pass another org's job_id to enumerate its engineers and
    // trigger assignment writes (cross-tenant read + write).
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('organisation_id, role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!callerProfile || (callerProfile as any).organisation_id !== orgId) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }
    const callerRole = (callerProfile as any).role as string
    if (!['org_admin', 'manager', 'scheduler'].includes(callerRole)) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }

    const property = (job as any).properties as { latitude: number | null; longitude: number | null } | null
    const category =
      (job as any).routine_check_type ?? (job as any).job_type ?? null

    const startAt =
      (job as any).scheduled_date && (job as any).time_start
        ? `${(job as any).scheduled_date.slice(0, 10)}T${(job as any).time_start}`
        : (job as any).scheduled_date ?? null
    const endAt =
      (job as any).scheduled_date && (job as any).time_end
        ? `${(job as any).scheduled_date.slice(0, 10)}T${(job as any).time_end}`
        : null

    // 2) Find applicable rule (category match first, then "all")
    const { data: rules } = await supabase
      .from('auto_assignment_rules')
      .select('*')
      .eq('organisation_id', orgId)
      .eq('enabled', true)
    const applicable =
      (rules ?? []).find((r: any) => r.category && category && r.category === category) ??
      (rules ?? []).find((r: any) => !r.category) ??
      null
    const rule: AutoAssignRule = applicable
      ? {
          required_accreditations: applicable.required_accreditations ?? [],
          max_distance_km: applicable.max_distance_km ?? 80,
          prefer_familiar: applicable.prefer_familiar ?? true,
          weight_overrides: applicable.weight_overrides ?? undefined,
        }
      : DEFAULT_RULE

    // 3) Load active engineers + accreditations
    const { data: engineerRows } = await supabase
      .from('engineers')
      .select(
        'id, name, status, home_latitude, home_longitude, engineer_accreditations(accreditation_type, status, expiry_date)',
      )
      .eq('organisation_id', orgId)
      .eq('status', 'active')

    const engineerIds = (engineerRows ?? []).map((e: any) => e.id)
    const profileIds: string[] = []
    // Map engineer.id -> profile_id when available so we can look up assignments.
    const { data: engineerProfileMap } = await supabase
      .from('engineers')
      .select('id, profile_id')
      .in('id', engineerIds.length > 0 ? engineerIds : ['00000000-0000-0000-0000-000000000000'])
    const idToProfile: Record<string, string | null> = {}
    for (const e of engineerProfileMap ?? []) {
      idToProfile[(e as any).id] = (e as any).profile_id ?? null
      if ((e as any).profile_id) profileIds.push((e as any).profile_id)
    }

    // 4) Workload this week + busy windows for the relevant profiles.
    // We deliberately DON'T upper-bound the query: busy-window conflict
    // detection must still see future jobs to flag a clash for a job scheduled
    // beyond this week. But the `workload_this_week` sub-score must only count
    // THIS week, so we gate the workload increment on the Mon→Sun window
    // (otherwise every future-dated job inflates it and over-penalises the
    // engineer).
    const weekStart = startOfWeekIso()
    const weekEnd = new Date(new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: weekJobs } = await supabase
      .from('jobs')
      .select('id, scheduled_date, time_start, time_end, engineer_assignments(engineer_id)')
      .eq('organisation_id', orgId)
      .gte('scheduled_date', weekStart)
      // Bound to the week (weekEnd was computed but never applied), exclude the
      // TARGET job's own existing assignment (self-conflict on re-runs), and drop
      // terminal/non-work statuses — cancelled/rejected/no-access jobs were
      // counted as phantom busy windows, hard-excluding otherwise-free engineers.
      .lt('scheduled_date', weekEnd)
      .neq('id', job_id)
      .not('status', 'in', '(cancelled,rejected,failed_access)')

    const profileBusy: Record<string, { start_at?: string | null; end_at?: string | null }[]> = {}
    const profileWorkload: Record<string, number> = {}
    for (const j of weekJobs ?? []) {
      const sd = (j as any).scheduled_date as string | null
      const ts = (j as any).time_start as string | null
      const te = (j as any).time_end as string | null
      const sa = sd && ts ? `${sd.slice(0, 10)}T${ts}` : sd
      const ea = sd && te ? `${sd.slice(0, 10)}T${te}` : null
      const inThisWeek = !!sd && sd >= weekStart && sd < weekEnd
      const assignments = ((j as any).engineer_assignments ?? []) as { engineer_id: string }[]
      for (const a of assignments) {
        if (inThisWeek) {
          profileWorkload[a.engineer_id] = (profileWorkload[a.engineer_id] ?? 0) + 1
        }
        ;(profileBusy[a.engineer_id] ??= []).push({ start_at: sa, end_at: ea })
      }
    }

    // 5) Familiarity counts at the property (completed + pass outcome)
    const propertyId = (job as any).property_id as string | null
    const profileFamiliarity: Record<string, number> = {}
    if (propertyId) {
      const { data: pastJobs } = await supabase
        .from('jobs')
        .select('id, status, outcome, engineer_assignments(engineer_id)')
        .eq('property_id', propertyId)
        .eq('status', 'completed')
      for (const j of pastJobs ?? []) {
        if ((j as any).outcome && (j as any).outcome !== 'pass') continue
        for (const a of ((j as any).engineer_assignments ?? []) as { engineer_id: string }[]) {
          profileFamiliarity[a.engineer_id] = (profileFamiliarity[a.engineer_id] ?? 0) + 1
        }
      }
    }

    // 6) Build candidate list
    const candidates: CandidateEngineer[] = (engineerRows ?? []).map((e: any) => {
      const profileId = idToProfile[e.id] ?? null
      return {
        id: e.id,
        name: e.name,
        status: e.status,
        home_latitude: e.home_latitude,
        home_longitude: e.home_longitude,
        accreditations: ((e.engineer_accreditations ?? []) as any[])
          // Keep any accreditation that ISN'T expired. The recurring
          // refresh_engineer_accreditation_statuses() cron (00044/00063) rewrites
          // every row to 'active'/'expiring'/'expired' and never 'valid', so a
          // `=== 'valid'` filter silently dropped ALL accreditations after the
          // first nightly run — zeroing every skill match and breaking
          // skill-gated auto-assignment (apply-mode threshold could never be met).
          .filter((a) => !a.status || a.status !== 'expired')
          .map((a) => a.accreditation_type),
        busy_windows: profileId ? profileBusy[profileId] ?? [] : [],
        workload_this_week: profileId ? profileWorkload[profileId] ?? 0 : 0,
        familiarity_count: profileId ? profileFamiliarity[profileId] ?? 0 : 0,
      }
    })

    const ranked = scoreEngineers(
      {
        id: (job as any).id,
        category,
        property_id: propertyId,
        property_latitude: property?.latitude ?? null,
        property_longitude: property?.longitude ?? null,
        start_at: startAt,
        end_at: endAt,
      },
      candidates,
      rule,
    )

    let appliedInfo: { engineer_id: string; score: number } | null = null

    if (mode === 'apply' && ranked.length > 0 && ranked[0].score >= 30) {
      const top = ranked[0]
      const profileId = idToProfile[top.engineer.id]
      if (profileId) {
        const { error: assignErr } = await supabase.from('engineer_assignments').insert({
          job_id: (job as any).id,
          engineer_id: profileId,
        })
        if (!assignErr) {
          appliedInfo = { engineer_id: top.engineer.id, score: top.score }

          // Notify engineer
          await supabase.from('notifications').insert({
            user_id: profileId,
            organisation_id: orgId,
            notification_type: 'visit_booked',
            title: 'Auto-assigned to a job',
            message: `You have been auto-assigned to job ${(job as any).id} (score ${top.score}).`,
            link: `/dashboard/jobs/${(job as any).id}`,
            read: false,
          })

          // Timeline event
          await supabase.from('timeline_events').insert({
            organisation_id: orgId,
            property_id: propertyId,
            job_id: (job as any).id,
            event_type: 'visit_completed',
            description: `Auto-assigned ${top.engineer.name} (score ${top.score})`,
            metadata: { breakdown: top.breakdown, reasons: top.reasons },
          })

          // Bump pending → scheduled
          await supabase
            .from('jobs')
            .update({ status: 'scheduled' })
            .eq('id', (job as any).id)
            .eq('status', 'pending')
        }
      }
    }

    // Always log the scoring round
    await supabase.from('auto_assignment_log').insert({
      organisation_id: orgId,
      job_id: (job as any).id,
      mode,
      top_engineer_id: ranked[0]?.engineer.id ?? null,
      top_score: ranked[0]?.score ?? null,
      breakdown: ranked[0]?.breakdown ?? null,
      applied: appliedInfo !== null,
    })

    return jsonResponse({ candidates: ranked, applied: appliedInfo })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-assign failed'
    return jsonResponse({ error: message }, 500)
  }
})
