// src/lib/certificates/auto-mint.ts
//
// Sprint 2 / C2 — When a job is marked completed, automatically mint
// a compliance certificate IF the job's data clearly maps to one.
// This is the Joblogic moat: an engineer marks a gas service done and
// the CP12 is in the client's portal before the engineer leaves the
// car park. No extra clicks, no missed paperwork.
//
// Design constraints (in order of importance):
//
//   1. NEVER mint a duplicate. Check certificates table first by
//      job_id; bail if any exists.
//
//   2. NEVER mint on a failure. The auto-mint is only safe when the
//      most recent service report for the job has outcome='pass'. A
//      'fail' or 'incomplete' must go through the human cert flow so
//      the engineer can attach defects + observations.
//
//   3. NEVER guess the type. We only auto-mint when the linked asset's
//      category (or the job's compliance type) maps unambiguously to a
//      known template (gas_safety / eicr / fra). 'generic' inferences
//      are skipped — better no cert than a wrong-shaped cert.
//
//   4. NEVER block the UI. Returns a discriminated result object;
//      callers fire-and-forget.
//
// The actual rendering + storage upload is delegated to the existing
// generateCertificate() pipeline. This file is just the gate.

import { supabase } from '@/lib/supabase'
import { generateCertificate, inferCertificateType } from '@/lib/certificates'
import type { CertificateType } from '@/lib/certificates'
import { logTimelineEvent } from '@/lib/timeline'
import { TIMELINE_EVENT_TYPES } from '@/lib/constants'

export type AutoMintResult =
  | { status: 'minted'; certificate_id: string; certificate_number: string; type: CertificateType }
  | { status: 'skipped'; reason: AutoMintSkipReason }
  | { status: 'error'; reason: string }

export type AutoMintSkipReason =
  | 'already_exists'    // a cert is already on the job
  | 'no_report'         // no service_report attached yet
  | 'not_pass'          // outcome was fail / incomplete / n_a
  | 'no_template_match' // we can't infer a non-generic type
  | 'no_job'            // job lookup returned nothing

interface JobRow {
  id: string
  organisation_id: string
  title: string
  property_id: string | null
  client_id: string | null
}

interface AssetRow {
  id: string
  category: string | null
  name: string | null
}

/**
 * Conservatively decide whether to auto-mint, and do it. Safe to call
 * unconditionally on every job-completed event — it gates internally.
 */
export async function maybeAutoMintCertificate(jobId: string): Promise<AutoMintResult> {
  // Gate 1: idempotency. If we've already minted for this job, bail.
  // This protects against re-firing on subsequent updates (e.g. an
  // engineer corrects a typo on a completed job — that shouldn't
  // produce a second cert).
  const { data: existing } = await supabase
    .from('certificates')
    .select('id')
    .eq('job_id', jobId)
    .limit(1)
    .maybeSingle()
  if (existing) {
    return { status: 'skipped', reason: 'already_exists' }
  }

  // Gate 2: latest service report must exist and have outcome='pass'.
  // A failed inspection is exactly the case where a human needs to
  // hand-craft the cert with defects + observations.
  const { data: report } = await supabase
    .from('service_reports')
    .select('outcome')
    .eq('job_id', jobId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!report) {
    return { status: 'skipped', reason: 'no_report' }
  }
  if ((report as { outcome?: string }).outcome !== 'pass') {
    return { status: 'skipped', reason: 'not_pass' }
  }

  // Gate 3: type inference must land on a known template, NOT generic.
  // We try multiple signals:
  //   - the linked asset's category (boilers → gas_safety, panels → eicr, etc.)
  //   - the job's title (a "Gas service" job implies gas_safety)
  // First non-generic match wins.
  const { data: jobData } = await supabase
    .from('jobs')
    .select('id, organisation_id, title, property_id')
    .eq('id', jobId)
    .single()
  if (!jobData) {
    return { status: 'skipped', reason: 'no_job' }
  }
  const job = jobData as JobRow

  const candidateType = await inferTypeForJob(job)
  if (!candidateType) {
    return { status: 'skipped', reason: 'no_template_match' }
  }

  // All gates passed — mint.
  try {
    const built = await generateCertificate({
      jobId: job.id,
      type: candidateType,
      outcome: 'pass',
    })

    // Timeline event so the FM team sees the auto-mint in the audit
    // log. CERTIFICATE_ISSUED was added to TIMELINE_EVENT_TYPES in the
    // same commit as this auto-mint helper.
    void logTimelineEvent({
      orgId: job.organisation_id,
      propertyId: job.property_id ?? undefined,
      eventType: TIMELINE_EVENT_TYPES.CERTIFICATE_ISSUED,
      description: `${candidateType.replace('_', ' ')} certificate ${built.certificate_number} auto-issued from completed job "${job.title}"`,
    }).catch((err) => console.warn('[auto-mint] timeline event failed:', err))

    return {
      status: 'minted',
      certificate_id: built.id,
      certificate_number: built.certificate_number,
      type: built.type,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[auto-mint] generateCertificate failed:', msg)
    return { status: 'error', reason: msg }
  }
}

/**
 * Infer a non-generic certificate type from the job's linked asset
 * (preferred) or job title (fallback). Returns null when nothing
 * unambiguous matches — better to skip than mint the wrong shape.
 */
async function inferTypeForJob(job: JobRow): Promise<CertificateType | null> {
  // Resolve the job's linked compliance item (the real link is
  // jobs.compliance_item_id) and infer from its compliance_type, then the linked
  // asset's category, then the job title. (The previous helpers queried columns
  // that never existed — a `job_assets` table, `jobs.asset_id`, and
  // `compliance_items.related_job_id` — so the asset/compliance signals silently
  // never fired and auto-mint fell back to title parsing alone.)
  const fromComplianceItem = await inferFromComplianceItem(job.id)
  if (fromComplianceItem && fromComplianceItem !== 'generic') return fromComplianceItem

  const fromTitle = inferCertificateType(job.title)
  if (fromTitle !== 'generic') return fromTitle

  return null
}

// Postgrest returns the embedded relation as either a single object
// (for to-one FKs) or an array (for to-many) — and the generated
// types frequently widen it to `{...}[]`. This helper normalises both
// shapes to a single AssetRow without forcing the caller through a
// double-cast.
function pickAsset(raw: unknown): AssetRow | null {
  if (!raw) return null
  if (Array.isArray(raw)) return (raw[0] as AssetRow | undefined) ?? null
  return raw as AssetRow
}

async function inferFromComplianceItem(jobId: string): Promise<CertificateType | null> {
  // Real link: jobs.compliance_item_id -> compliance_items(id). Infer the cert
  // type from the compliance_type first, then the linked asset's category.
  const { data: job } = await supabase
    .from('jobs')
    .select('compliance_item_id')
    .eq('id', jobId)
    .maybeSingle()
  const complianceItemId = (job as { compliance_item_id?: string | null } | null)?.compliance_item_id
  if (!complianceItemId) return null

  const { data: ci } = await supabase
    .from('compliance_items')
    .select('compliance_type, assets:asset_id (id, name, category)')
    .eq('id', complianceItemId)
    .maybeSingle()
  const row = ci as { compliance_type?: string | null; assets?: unknown } | null
  if (!row) return null

  if (row.compliance_type) {
    const fromType = inferCertificateType(row.compliance_type)
    if (fromType !== 'generic') return fromType
  }
  const asset = pickAsset(row.assets)
  if (asset?.category) return inferCertificateType(asset.category)
  return null
}
