// Auto-assign module — public client API.
// The engine is pure, the data layer wraps Supabase.

import { supabase } from '@/lib/supabase'
import {
  scoreEngineers,
  withDefaultRule,
  DEFAULT_WEIGHTS,
  CATEGORY_ACCREDITATION_MAP,
  type AutoAssignRule,
  type AutoAssignWeights,
  type CandidateEngineer,
  type CandidateJob,
  type ScoredCandidate,
} from './engine'

export {
  scoreEngineers,
  withDefaultRule,
  DEFAULT_WEIGHTS,
  CATEGORY_ACCREDITATION_MAP,
}
export type {
  AutoAssignRule,
  AutoAssignWeights,
  CandidateEngineer,
  CandidateJob,
  ScoredCandidate,
}

export interface AutoAssignLogRow {
  id: string
  organisation_id: string
  job_id: string | null
  mode: 'suggest' | 'apply'
  top_engineer_id: string | null
  top_score: number | null
  breakdown: Record<string, unknown> | null
  applied: boolean
  created_by_user_id: string | null
  created_at: string
}

/** Invoke the deployed edge function for a real job suggestion or apply. */
export async function invokeAutoAssign(
  jobId: string,
  mode: 'suggest' | 'apply',
): Promise<{
  candidates: ScoredCandidate[]
  applied: { engineer_id: string; score: number } | null
}> {
  const { data, error } = await supabase.functions.invoke('auto-assign-job', {
    body: { job_id: jobId, mode },
  })
  if (error) throw error
  return (data ?? { candidates: [], applied: null }) as {
    candidates: ScoredCandidate[]
    applied: { engineer_id: string; score: number } | null
  }
}

interface PreviewCandidateInput {
  property_id?: string | null
  category?: string | null
  scheduled_date?: string | null
  time_start?: string | null
  time_end?: string | null
}

/**
 * Client-side preview scoring used on the New Job page where no DB row exists yet.
 * Loads engineers + property/lat-lng from Supabase and runs the engine in-browser.
 */
export async function previewSuggest(
  orgId: string,
  candidate: PreviewCandidateInput,
  rule?: AutoAssignRule,
): Promise<ScoredCandidate[]> {
  // Property location (best-effort)
  let propertyLat: number | null = null
  let propertyLon: number | null = null
  if (candidate.property_id) {
    const { data: property } = await supabase
      .from('properties')
      .select('latitude, longitude')
      .eq('id', candidate.property_id)
      .maybeSingle()
    if (property) {
      propertyLat = (property as { latitude: number | null }).latitude
      propertyLon = (property as { longitude: number | null }).longitude
    }
  }

  // Engineers + accreditations + home lat/lng
  const { data: engineers } = await supabase
    .from('engineers')
    .select(
      'id, name, trade, skills, status, home_latitude, home_longitude, engineer_accreditations(accreditation_type, status, expiry_date)',
    )
    .eq('organisation_id', orgId)
    .eq('status', 'active')

  type EngineerRow = {
    id: string
    name: string
    trade: string | null
    skills: string[] | null
    status: string | null
    home_latitude: number | null
    home_longitude: number | null
    engineer_accreditations:
      | { accreditation_type: string; status: string | null; expiry_date: string | null }[]
      | null
  }

  const candidateEngineers: CandidateEngineer[] = ((engineers ?? []) as EngineerRow[]).map(
    (e) => ({
      id: e.id,
      name: e.name,
      trade: e.trade,
      skills: e.skills,
      status: e.status,
      home_latitude: e.home_latitude,
      home_longitude: e.home_longitude,
      accreditations: (e.engineer_accreditations ?? [])
        .filter((a) => !a.status || a.status === 'valid')
        .map((a) => a.accreditation_type),
      busy_windows: [],
      workload_this_week: 0,
      familiarity_count: 0,
    }),
  )

  // Sprint 3 / C4 — populate van_stock from stock_movements, only
  // when the rule actually has required_parts (avoids the SUM query
  // for callers who don't use the parts axis). Sums quantity per
  // engineer per stock_item across ALL movements; positive movements
  // (allocate_to_van, restock) and negative (consume_on_job) cancel
  // each other out so the result is the engineer's current on-hand.
  if (rule?.required_parts && rule.required_parts.length > 0 && candidateEngineers.length > 0) {
    const engineerIds = candidateEngineers.map((c) => c.id)
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('related_engineer_id, quantity, stock_items:stock_item_id(sku, name)')
      .in('related_engineer_id', engineerIds)

    type MovementRow = {
      related_engineer_id: string
      quantity: number
      stock_items: { sku: string | null; name: string | null } | { sku: string | null; name: string | null }[] | null
    }

    // Group by (engineer_id, sku|name) → running total.
    const stockByEng = new Map<string, Map<string, { sku: string | null; name: string | null; qty: number }>>()
    for (const m of (movements ?? []) as MovementRow[]) {
      const item = Array.isArray(m.stock_items) ? m.stock_items[0] : m.stock_items
      if (!item) continue
      const key = item.sku ?? item.name ?? ''
      if (!key) continue
      const map = stockByEng.get(m.related_engineer_id) ?? new Map()
      const existing = map.get(key) ?? { sku: item.sku, name: item.name, qty: 0 }
      existing.qty += m.quantity ?? 0
      map.set(key, existing)
      stockByEng.set(m.related_engineer_id, map)
    }
    for (const c of candidateEngineers) {
      const map = stockByEng.get(c.id)
      // Empty array (we ran the query but found no movements) =/= undefined
      // (no stock data at all). Engineers with no movements get [] which
      // the engine treats as "they have zero of the required parts" — a
      // soft penalty, not a hard fail.
      c.van_stock = map ? Array.from(map.values()).filter((v) => v.qty > 0) : []
    }
  }

  const startAt =
    candidate.scheduled_date && candidate.time_start
      ? `${candidate.scheduled_date}T${candidate.time_start}`
      : candidate.scheduled_date ?? null
  const endAt =
    candidate.scheduled_date && candidate.time_end
      ? `${candidate.scheduled_date}T${candidate.time_end}`
      : null

  return scoreEngineers({
    job: {
      id: null,
      category: candidate.category ?? null,
      property_id: candidate.property_id ?? null,
      property_latitude: propertyLat,
      property_longitude: propertyLon,
      start_at: startAt,
      end_at: endAt,
    },
    engineers: candidateEngineers,
    rule: withDefaultRule(rule),
  })
}

// ── Rules CRUD helpers ─────────────────────────────────

export async function fetchRules(orgId: string): Promise<AutoAssignRule[]> {
  const { data, error } = await supabase
    .from('auto_assignment_rules')
    .select('*')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AutoAssignRule[]
}

export async function fetchRecentLog(
  orgId: string,
  limit = 100,
): Promise<AutoAssignLogRow[]> {
  const { data, error } = await supabase
    .from('auto_assignment_log')
    .select('*')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AutoAssignLogRow[]
}
