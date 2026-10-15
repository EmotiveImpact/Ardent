// Auto-assignment scoring engine
// Pure TypeScript — runs both client-side (preview) and inside Edge Function (apply).
// No external deps. Haversine math inlined.

export type ScoreWeightKey =
  | 'skill'
  | 'location'
  | 'availability'
  | 'workload'
  | 'familiarity'
  | 'parts'

export interface AutoAssignWeights {
  skill: number
  location: number
  availability: number
  workload: number
  familiarity: number
  /** Sprint 3 / C4 — van-stock readiness vs the rule's required_parts. */
  parts: number
}

// Default weights deliberately sum to 100. Parts is 0 by default so
// existing rules (which never set parts) behave EXACTLY as before —
// no surprise score regressions on production rules. Admins opt in
// by raising the parts weight when they configure required_parts.
export const DEFAULT_WEIGHTS: AutoAssignWeights = {
  skill: 30,
  location: 25,
  availability: 20,
  workload: 15,
  familiarity: 10,
  parts: 0,
}

/**
 * Sprint 3 / C4 — required parts shape for the parts_readiness score.
 * Match priority: sku exact (case-sensitive) → name case-insensitive
 * substring. `min_qty` defaults to 1 when omitted.
 */
export interface RequiredPart {
  sku?: string | null
  name?: string | null
  min_qty?: number
}

export interface AutoAssignRule {
  id?: string
  organisation_id?: string
  name?: string
  category?: string | null
  required_accreditations: string[]
  required_parts?: RequiredPart[]
  max_distance_km: number
  prefer_familiar: boolean
  weight_overrides?: Partial<AutoAssignWeights>
  enabled?: boolean
}

export const DEFAULT_RULE: AutoAssignRule = {
  required_accreditations: [],
  required_parts: [],
  max_distance_km: 80,
  prefer_familiar: true,
}

/** Mapping of job categories to common required accreditations. */
export const CATEGORY_ACCREDITATION_MAP: Record<string, string[]> = {
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

export interface CandidateEngineer {
  id: string
  name: string
  trade?: string | null
  skills?: string[] | null
  status?: string | null
  /** Accreditation type strings the engineer currently holds (valid). */
  accreditations: string[]
  /** Engineer home location for distance scoring. */
  home_latitude?: number | null
  home_longitude?: number | null
  /** Existing engineer_assignment windows for availability check. */
  busy_windows: { start_at?: string | null; end_at?: string | null }[]
  /** Count of jobs scheduled in the current week. */
  workload_this_week: number
  /** Count of completed jobs at the target property with passing outcome. */
  familiarity_count: number
  /**
   * Sprint 3 / C4 — current van inventory derived from stock_movements
   * (sum by stock_item_id where related_engineer_id = engineer.id).
   * Empty array is treated as "unknown" for the parts score, not zero.
   */
  van_stock?: { sku?: string | null; name?: string | null; qty: number }[]
}

export interface CandidateJob {
  id?: string | null
  category?: string | null
  property_id?: string | null
  property_latitude?: number | null
  property_longitude?: number | null
  start_at?: string | null
  end_at?: string | null
}

export interface ScoreBreakdown {
  skill: number
  location: number
  availability: number
  workload: number
  familiarity: number
  /** Sprint 3 / C4 — 0–100, % of required parts the engineer has on hand. */
  parts: number
}

export interface ScoredCandidate {
  engineer: CandidateEngineer
  score: number
  breakdown: ScoreBreakdown
  reasons: string[]
}

export interface ScoreInput {
  job: CandidateJob
  engineers: CandidateEngineer[]
  rule?: AutoAssignRule
}

// ── Helpers ─────────────────────────────────────────────

function clamp(n: number, min = 0, max = 100): number {
  if (Number.isNaN(n)) return 0
  return Math.max(min, Math.min(max, n))
}

/** Inline Haversine — distance between two lat/lng pairs in kilometres. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
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
  if (Number.isNaN(a1) || Number.isNaN(b1)) return false
  return a1 < b2 && b1 < a2
}

function effectiveWeights(rule: AutoAssignRule): AutoAssignWeights {
  const ovr = rule.weight_overrides ?? {}
  const merged: AutoAssignWeights = {
    skill: ovr.skill ?? DEFAULT_WEIGHTS.skill,
    location: ovr.location ?? DEFAULT_WEIGHTS.location,
    availability: ovr.availability ?? DEFAULT_WEIGHTS.availability,
    workload: ovr.workload ?? DEFAULT_WEIGHTS.workload,
    familiarity: ovr.familiarity ?? DEFAULT_WEIGHTS.familiarity,
    parts: ovr.parts ?? DEFAULT_WEIGHTS.parts,
  }
  // Normalise to percentages (sum to 100) so override mistakes don't break ranking.
  const total =
    merged.skill +
    merged.location +
    merged.availability +
    merged.workload +
    merged.familiarity +
    merged.parts
  if (total <= 0) return DEFAULT_WEIGHTS
  if (Math.abs(total - 100) < 0.5) return merged
  return {
    skill: (merged.skill / total) * 100,
    location: (merged.location / total) * 100,
    availability: (merged.availability / total) * 100,
    workload: (merged.workload / total) * 100,
    familiarity: (merged.familiarity / total) * 100,
    parts: (merged.parts / total) * 100,
  }
}

// ── Component scorers ───────────────────────────────────

function scoreSkill(
  engineer: CandidateEngineer,
  required: string[],
  reasons: string[],
): { score: number; hardFail: boolean } {
  if (required.length === 0) {
    reasons.push('No accreditations required')
    return { score: 100, hardFail: false }
  }
  const have = new Set(engineer.accreditations.map((a) => a.toLowerCase()))
  const missing = required.filter((r) => !have.has(r.toLowerCase()))
  if (missing.length === 0) {
    reasons.push(`Holds all required accreditations: ${required.join(', ')}`)
    return { score: 100, hardFail: false }
  }
  reasons.push(`Missing accreditations: ${missing.join(', ')}`)
  return { score: 0, hardFail: true }
}

function scoreLocation(
  engineer: CandidateEngineer,
  job: CandidateJob,
  maxDistanceKm: number,
  reasons: string[],
): { score: number; distanceKm: number | null; hardFail: boolean } {
  const elat = engineer.home_latitude
  const elon = engineer.home_longitude
  const plat = job.property_latitude
  const plon = job.property_longitude
  if (elat == null || elon == null || plat == null || plon == null) {
    reasons.push('Location data missing — neutral score')
    return { score: 50, distanceKm: null, hardFail: false }
  }
  const km = haversineKm(elat, elon, plat, plon)
  const score = clamp(100 - km * 2)
  if (km > maxDistanceKm) {
    reasons.push(`${km.toFixed(0)}km away — exceeds max ${maxDistanceKm}km`)
    return { score: 0, distanceKm: km, hardFail: true }
  }
  reasons.push(`${km.toFixed(0)}km from site`)
  return { score, distanceKm: km, hardFail: false }
}

function scoreAvailability(
  engineer: CandidateEngineer,
  job: CandidateJob,
  reasons: string[],
): { score: number; hardFail: boolean } {
  if (!job.start_at) {
    reasons.push('No scheduled time — assuming available')
    return { score: 100, hardFail: false }
  }
  const conflict = engineer.busy_windows.some((w) =>
    intervalsOverlap(w.start_at, w.end_at, job.start_at, job.end_at),
  )
  if (conflict) {
    reasons.push('Has a conflicting assignment')
    return { score: 0, hardFail: true }
  }
  reasons.push('Available at the scheduled time')
  return { score: 100, hardFail: false }
}

function scoreWorkload(
  engineer: CandidateEngineer,
  reasons: string[],
): number {
  const score = clamp(100 - engineer.workload_this_week * 10)
  reasons.push(
    `${engineer.workload_this_week} job${engineer.workload_this_week === 1 ? '' : 's'} this week`,
  )
  return score
}

/**
 * Sprint 3 / C4 — score how ready an engineer is to do this job
 * given their current van inventory vs the rule's required_parts.
 *
 * Rules:
 *   - No required_parts on the rule → neutral 100 (we have nothing
 *     to compare against, don't penalise anyone).
 *   - Engineer has no van_stock data at all → neutral 50 (can't
 *     prove they're missing anything; safer than assuming worst).
 *   - Otherwise: % of required parts they meet at the configured
 *     min_qty. Match by sku exact, then case-insensitive name
 *     substring (so "Boiler O-ring" finds "Boiler O-Ring 12mm").
 *
 * Not a hard fail — an engineer with a slightly low van will still
 * appear, ranked lower. The dispatcher can override.
 */
function scoreParts(
  engineer: CandidateEngineer,
  required: RequiredPart[] | undefined,
  reasons: string[],
): number {
  const list = required ?? []
  if (list.length === 0) {
    // Don't bother adding a reason — silent neutral when nothing's required.
    return 100
  }
  const stock = engineer.van_stock
  if (!stock) {
    reasons.push('Van stock unknown — neutral parts score')
    return 50
  }
  let matched = 0
  const missing: string[] = []
  for (const req of list) {
    const min = Math.max(1, req.min_qty ?? 1)
    let have = 0
    if (req.sku) {
      const hit = stock.find((s) => s.sku && s.sku === req.sku)
      if (hit) have = hit.qty
    }
    if (have < min && req.name) {
      const needle = req.name.toLowerCase()
      const hit = stock.find((s) => s.name && s.name.toLowerCase().includes(needle))
      if (hit) have = Math.max(have, hit.qty)
    }
    if (have >= min) {
      matched++
    } else {
      missing.push(`${req.name ?? req.sku ?? 'part'} (need ${min}, have ${have})`)
    }
  }
  const pct = (matched / list.length) * 100
  if (missing.length === 0) {
    reasons.push(`Has all ${list.length} required part${list.length === 1 ? '' : 's'} on the van`)
  } else {
    reasons.push(`Van missing ${missing.length} of ${list.length} required parts: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? '…' : ''}`)
  }
  return Math.round(pct)
}

function scoreFamiliarity(
  engineer: CandidateEngineer,
  reasons: string[],
): number {
  const score = clamp(engineer.familiarity_count * 25)
  if (engineer.familiarity_count > 0) {
    reasons.push(
      `${engineer.familiarity_count} previous successful visit${engineer.familiarity_count === 1 ? '' : 's'} at this site`,
    )
  } else {
    reasons.push('No prior visits at this site')
  }
  return score
}

// ── Public API ──────────────────────────────────────────

export function scoreEngineers(input: ScoreInput): ScoredCandidate[] {
  const { job, engineers } = input
  const rule = input.rule ?? DEFAULT_RULE
  const weights = effectiveWeights(rule)

  // Combine category-derived and rule-defined required accreditations.
  const categoryRequired = (job.category &&
    CATEGORY_ACCREDITATION_MAP[job.category.toLowerCase()]) || []
  const requiredAccreditations = Array.from(
    new Set([...(rule.required_accreditations ?? []), ...categoryRequired]),
  )

  const ranked: ScoredCandidate[] = []

  for (const engineer of engineers) {
    const reasons: string[] = []

    // Skip clearly inactive engineers entirely.
    if (engineer.status && engineer.status !== 'active') {
      continue
    }

    const skill = scoreSkill(engineer, requiredAccreditations, reasons)
    const location = scoreLocation(engineer, job, rule.max_distance_km, reasons)
    const availability = scoreAvailability(engineer, job, reasons)
    const workload = scoreWorkload(engineer, reasons)
    const familiarityRaw = scoreFamiliarity(engineer, reasons)
    // If `prefer_familiar` is false, dampen the familiarity weight by half.
    const familiarity = rule.prefer_familiar
      ? familiarityRaw
      : familiarityRaw * 0.5
    const parts = scoreParts(engineer, rule.required_parts, reasons)

    const breakdown: ScoreBreakdown = {
      skill: skill.score,
      location: location.score,
      availability: availability.score,
      workload,
      familiarity,
      parts,
    }

    // Hard filters — if required accreditations missing OR conflict OR distance over cap, score 0.
    // Parts is intentionally NOT a hard fail — a near-miss engineer
    // who's 15 min away beats a perfectly-stocked one who's 50 km away.
    let total = 0
    if (skill.hardFail || availability.hardFail || location.hardFail) {
      total = 0
    } else {
      total =
        (breakdown.skill * weights.skill +
          breakdown.location * weights.location +
          breakdown.availability * weights.availability +
          breakdown.workload * weights.workload +
          breakdown.familiarity * weights.familiarity +
          breakdown.parts * weights.parts) /
        100
    }

    ranked.push({
      engineer,
      score: Math.round(total),
      breakdown,
      reasons,
    })
  }

  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, 5)
}

/** Merge a partial rule with defaults — used when callers provide just overrides. */
export function withDefaultRule(rule?: Partial<AutoAssignRule>): AutoAssignRule {
  return {
    ...DEFAULT_RULE,
    ...(rule ?? {}),
    required_accreditations:
      rule?.required_accreditations ?? DEFAULT_RULE.required_accreditations,
    required_parts: rule?.required_parts ?? DEFAULT_RULE.required_parts,
  }
}
