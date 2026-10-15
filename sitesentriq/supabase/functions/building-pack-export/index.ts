// supabase/functions/building-pack-export/index.ts
//
// Trust wave W3-T9 — Golden-thread "Building Information Pack" export.
//
// The Building Safety Act's golden thread asks for a structured, current,
// handover-able digital record per building. This function assembles that
// pack for ONE property from live data and returns two signed URLs:
//   * a self-contained HTML "Building Information Pack" (human-readable)
//   * a JSON manifest (machine-readable: schema haumea.building_pack v1)
// Stored in the private `building-packs` bucket (00120), 7-day signed URLs.
//
// Sections: property & responsible persons, asset register, compliance
// status + certificate completions, document register WITH version chains,
// maintenance plans, job history, RAMS, risk assessments, log book,
// timeline + audit slices.
//
// Deliberately NOT included (decision D2): embedded file binaries, zip
// output, per-document signed URLs (a 7-day artifact full of live links is
// a leak surface). The manifest carries storage paths so an authorised
// consumer can fetch with its own credentials.
//
// Auth: verify_jwt = true; same resolveCallerContext pattern as
// generate-tender-pack, PLUS a per-property org check (403 when the
// property belongs to another org). PDF path mirrors tender-pack: inert
// while BROWSERLESS_TOKEN is unset (HTML is the real output).
//
// Deploy: supabase functions deploy building-pack-export

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const BROWSERLESS_TOKEN = Deno.env.get('BROWSERLESS_TOKEN') ?? ''
const STORAGE_BUCKET = 'building-packs'
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

const BRAND_COLOR_FALLBACK = '#e8772e'
const BRAND_DARK = '#1b1f2e'
const TEXT_COLOR = '#111827'
const TEXT_MUTED = '#6b7280'
const BORDER_LIGHT = '#e2e5ea'
const SURFACE_SOFT = '#f9fafb'
const STATUS_COMPLIANT = '#22c55e'
const STATUS_DUE_SOON = '#f59e0b'
const STATUS_OVERDUE = '#ef4444'
const STATUS_NON_COMPLIANT = '#dc2626'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function escape(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ── auth (copied from generate-tender-pack — deliberately not extracted) ──

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
  return decodeJwtPayload(jwt)?.role === 'service_role'
}

async function resolveCallerContext(req: Request): Promise<CallerContext | Response> {
  const jwt = readBearerToken(req)
  if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)
  if (isServiceRoleJwt(jwt)) return { kind: 'service_role' }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) return jsonResponse({ error: 'invalid_authorization' }, 401)

  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('organisation_id')
    .eq('id', userData.user.id)
    .single()
  if (profileErr || !profile?.organisation_id) {
    return jsonResponse({ error: 'profile_organisation_not_found' }, 403)
  }
  return { kind: 'user', organisation_id: String(profile.organisation_id) }
}

// ── helpers ──────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function timestampStamp(): string {
  return new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '').slice(0, 19)
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''))
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  compliant: { label: 'Compliant', color: STATUS_COMPLIANT },
  due_soon: { label: 'Due Soon', color: STATUS_DUE_SOON },
  overdue: { label: 'Overdue', color: STATUS_OVERDUE },
  non_compliant: { label: 'Non-Compliant', color: STATUS_NON_COMPLIANT },
}

type Row = Record<string, unknown>

// supabase-js generics don't survive being passed across function boundaries
// under strict deno check (known class — see PROGRESS.md); keep the client
// loosely typed at the seam and the row data strongly shaped instead.
// deno-lint-ignore no-explicit-any
type Client = any

// ── data assembly ────────────────────────────────────────────────────

interface BuildingPackData {
  property: Row
  clientName: string | null
  areas: Row[]
  assets: Row[]
  complianceItems: Row[]
  complianceCounts: Record<string, number>
  maintenancePlans: Row[]
  documentChains: { name: string; versions: Row[] }[]
  documentVersionTotal: number
  jobStatusCounts: Record<string, number>
  jobsTotal: number
  recentJobs: Row[]
  certCompletions: Row[]
  rams: Row[]
  riskAssessments: Row[]
  logBookEntries: Row[]
  timeline: Row[]
  audit: Row[]
  permits: Row[]
}

async function gatherBuildingPackData(
  admin: Client,
  orgId: string,
  propertyId: string,
): Promise<BuildingPackData> {
  // Phase 1 — everything keyed directly by property_id.
  const [propRes, areasRes, assetsRes, compRes, plansRes, docsRes, jobsRes, timelineRes, auditRes, riskRes, logRes, permitsRes] =
    await Promise.all([
      admin
        .from('properties')
        .select('*, clients(name)')
        .eq('id', propertyId)
        .eq('organisation_id', orgId)
        .maybeSingle(),
      admin.from('areas').select('id, name, floor, description').eq('property_id', propertyId),
      admin
        .from('assets')
        .select('id, name, category, make, model, serial_number, install_date, status, area_id')
        .eq('property_id', propertyId)
        .order('name', { ascending: true }),
      admin
        .from('compliance_items')
        .select('id, name, compliance_type, frequency, last_completed, next_due, status')
        .eq('property_id', propertyId)
        .order('next_due', { ascending: true }),
      admin
        .from('maintenance_plans')
        .select('id, name, frequency, schedule_mode, maintenance_type, last_completed, next_due, is_active')
        .eq('property_id', propertyId)
        .order('next_due', { ascending: true }),
      admin
        .from('documents')
        .select('id, name, version, document_type, file_url, mime_type, expiry_date, uploaded_at, compliance_item_id')
        .eq('property_id', propertyId)
        .order('name', { ascending: true })
        .order('version', { ascending: false }),
      admin
        .from('jobs')
        .select('id, job_number, title, status, job_type, scheduled_date, completed_date, sla_response_met_at, sla_fix_met_at, target_fix_at')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(500),
      admin
        .from('timeline_events')
        .select('event_type, description, created_at')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('system_audit_events')
        .select('action, entity_type, summary, severity, actor_email, created_at')
        .eq('organisation_id', orgId)
        .eq('entity_type', 'property')
        .eq('entity_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('risk_assessments')
        .select('reference, risk_type, severity, status, assessor, assessment_date')
        .eq('property_id', propertyId)
        .order('assessment_date', { ascending: false }),
      admin
        .from('log_book_entries')
        .select('log_type, entry, recorded_by, log_date')
        .eq('property_id', propertyId)
        .order('log_date', { ascending: false })
        .limit(100),
      admin
        .from('permits')
        .select('permit_type, status, conditions, issued_at, valid_from, valid_to, closed_at, created_at')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

  if (propRes.error) throw new Error(`property query failed: ${propRes.error.message}`)
  if (!propRes.data) throw new Error('property_not_found')
  for (const [label, res] of [
    ['areas', areasRes], ['assets', assetsRes], ['compliance', compRes], ['plans', plansRes],
    ['documents', docsRes], ['jobs', jobsRes], ['timeline', timelineRes], ['audit', auditRes],
    ['risk', riskRes], ['log book', logRes], ['permits', permitsRes],
  ] as const) {
    if (res.error) throw new Error(`${label} query failed: ${res.error.message}`)
  }

  const property = propRes.data as Row
  const assets = (assetsRes.data ?? []) as Row[]
  const jobs = (jobsRes.data ?? []) as Row[]
  const jobIds = jobs.map((j) => String(j.id))
  const assetIds = assets.map((a) => String(a.id))

  // Phase 2 — keyed by the property's jobs/assets.
  const [certByJobRes, certByAssetRes, ramsRes] = await Promise.all([
    jobIds.length > 0
      ? admin
          .from('cert_completions')
          .select('id, cert_type, outcome, completed_at, job_id, asset_id')
          .in('job_id', jobIds.slice(0, 200))
      : Promise.resolve({ data: [], error: null }),
    assetIds.length > 0
      ? admin
          .from('cert_completions')
          .select('id, cert_type, outcome, completed_at, job_id, asset_id')
          .in('asset_id', assetIds.slice(0, 200))
      : Promise.resolve({ data: [], error: null }),
    jobIds.length > 0
      ? admin
          .from('subcontractor_rams')
          .select('title, approval_status, approved_at, valid_until, job_id, subcontractors(company_name)')
          .in('job_id', jobIds.slice(0, 200))
      : Promise.resolve({ data: [], error: null }),
  ])
  if (certByJobRes.error) throw new Error(`certs query failed: ${certByJobRes.error.message}`)
  if (certByAssetRes.error) throw new Error(`asset certs query failed: ${certByAssetRes.error.message}`)
  if (ramsRes.error) throw new Error(`rams query failed: ${ramsRes.error.message}`)

  // De-dupe cert completions reached via both joins.
  const certMap = new Map<string, Row>()
  for (const c of [...(certByJobRes.data ?? []), ...(certByAssetRes.data ?? [])] as Row[]) {
    certMap.set(String(c.id), c)
  }
  const certCompletions = [...certMap.values()].sort((a, b) =>
    String(b.completed_at).localeCompare(String(a.completed_at)),
  )

  // Document version chains: (name) → versions desc (already ordered).
  const chains = new Map<string, Row[]>()
  for (const d of (docsRes.data ?? []) as Row[]) {
    const key = String(d.name)
    if (!chains.has(key)) chains.set(key, [])
    chains.get(key)!.push(d)
  }
  const documentChains = [...chains.entries()].map(([name, versions]) => ({ name, versions }))

  const complianceCounts: Record<string, number> = {}
  for (const item of (compRes.data ?? []) as Row[]) {
    const s = String(item.status ?? 'unknown')
    complianceCounts[s] = (complianceCounts[s] ?? 0) + 1
  }
  const jobStatusCounts: Record<string, number> = {}
  for (const j of jobs) {
    const s = String(j.status ?? 'unknown')
    jobStatusCounts[s] = (jobStatusCounts[s] ?? 0) + 1
  }

  return {
    property,
    clientName: ((property.clients as Row | null)?.name as string | null) ?? null,
    areas: (areasRes.data ?? []) as Row[],
    assets,
    complianceItems: (compRes.data ?? []) as Row[],
    complianceCounts,
    maintenancePlans: (plansRes.data ?? []) as Row[],
    documentChains,
    documentVersionTotal: ((docsRes.data ?? []) as Row[]).length,
    jobStatusCounts,
    jobsTotal: jobs.length,
    recentJobs: jobs.slice(0, 50),
    certCompletions,
    rams: (ramsRes.data ?? []) as Row[],
    riskAssessments: (riskRes.data ?? []) as Row[],
    logBookEntries: (logRes.data ?? []) as Row[],
    timeline: (timelineRes.data ?? []) as Row[],
    audit: (auditRes.data ?? []) as Row[],
    permits: (permitsRes.data ?? []) as Row[],
  }
}

// ── manifest ─────────────────────────────────────────────────────────

function buildManifest(orgId: string, propertyId: string, data: BuildingPackData): string {
  return JSON.stringify(
    {
      schema: 'haumea.building_pack',
      version: 1,
      generated_at: new Date().toISOString(),
      organisation_id: orgId,
      property_id: propertyId,
      property: data.property,
      client_name: data.clientName,
      areas: data.areas,
      assets: data.assets,
      compliance_items: data.complianceItems,
      compliance_counts: data.complianceCounts,
      maintenance_plans: data.maintenancePlans,
      document_chains: data.documentChains,
      job_status_counts: data.jobStatusCounts,
      recent_jobs: data.recentJobs,
      cert_completions: data.certCompletions,
      rams: data.rams,
      permits: data.permits,
      risk_assessments: data.riskAssessments,
      log_book_entries: data.logBookEntries,
      timeline: data.timeline,
      audit_events: data.audit,
    },
    null,
    2,
  )
}

// ── HTML rendering ───────────────────────────────────────────────────

const TH = `padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid ${BORDER_LIGHT};`
const TD = `padding:8px 10px;border-bottom:1px solid ${BORDER_LIGHT};font-size:12px;color:${TEXT_COLOR};`
const TD_MUTED = `padding:8px 10px;border-bottom:1px solid ${BORDER_LIGHT};font-size:12px;color:${TEXT_MUTED};`

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return `<p style="margin:0;font-size:13px;color:${TEXT_MUTED};">None recorded.</p>`
  const head = headers.map((h) => `<th style="${TH}">${escape(h)}</th>`).join('')
  const body = rows
    .map((cells) => `<tr>${cells.map((c, i) => `<td style="${i === 0 ? TD : TD_MUTED}">${c}</td>`).join('')}</tr>`)
    .join('')
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"><thead><tr style="background-color:${SURFACE_SOFT};">${head}</tr></thead><tbody>${body}</tbody></table>`
}

function statusChip(status: string): string {
  const meta = STATUS_META[status] ?? { label: status.replace(/_/g, ' '), color: TEXT_MUTED }
  return `<span style="display:inline-block;background-color:${meta.color}15;color:${meta.color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;">${escape(meta.label)}</span>`
}

interface OrgRow {
  id: string
  name: string | null
  logo_url: string | null
  accent_color: string | null
}

function buildHtml(org: OrgRow, data: BuildingPackData): string {
  const orgName = org.name ?? 'Your organisation'
  const accent =
    org.accent_color && /^#[0-9a-fA-F]{6}$/.test(org.accent_color)
      ? org.accent_color
      : BRAND_COLOR_FALLBACK
  const generatedOn = formatDate(todayIso())
  const p = data.property
  const propertyName = String(p.name ?? 'Property')

  const logoImg = org.logo_url
    ? `<img src="${escape(org.logo_url)}" alt="${escape(orgName)} logo" style="max-height:36px;max-width:160px;display:block;margin-bottom:10px;" />`
    : ''

  function section(title: string, subtitle: string, inner: string): string {
    return `
      <tr><td style="background-color:#ffffff;padding:24px 32px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};border-top:1px solid ${BORDER_LIGHT};">
        <p style="margin:0 0 2px 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.08em;">${escape(title)}</p>
        <p style="margin:0 0 16px 0;font-size:13px;color:${TEXT_COLOR};font-weight:600;">${escape(subtitle)}</p>
        ${inner}
      </td></tr>`
  }

  // Property & responsible persons.
  const detail = (label: string, value: unknown) =>
    value
      ? `<tr><td style="padding:4px 16px 4px 0;font-size:12px;color:${TEXT_MUTED};white-space:nowrap;vertical-align:top;">${escape(label)}</td><td style="padding:4px 0;font-size:12px;color:${TEXT_COLOR};">${escape(String(value))}</td></tr>`
      : ''
  const propertyBlock = `
    <table cellpadding="0" cellspacing="0">
      ${detail('Property number', p.property_number)}
      ${detail('Address', p.address)}
      ${detail('Client', data.clientName)}
      ${detail('Site type', p.site_type)}
      ${detail('Region', p.region)}
      ${detail('Site manager', p.site_manager_name)}
      ${detail('Site manager phone', p.site_manager_phone)}
      ${detail('Operating hours', p.operating_hours)}
      ${detail('Access notes', p.access_notes)}
      ${detail('Emergency details', p.emergency_details)}
      ${detail('Takeover date', p.takeover_date ? formatDate(String(p.takeover_date)) : null)}
      ${detail('Areas / floors', data.areas.length > 0 ? data.areas.map((a) => a.name).join(', ') : null)}
    </table>`

  // Asset register.
  const assetRows = data.assets.map((a) => [
    escape(String(a.name ?? '-')),
    escape(String(a.category ?? '-')),
    escape([a.make, a.model].filter(Boolean).join(' ') || '-'),
    escape(String(a.serial_number ?? '-')),
    escape(formatDate(a.install_date as string | null)),
    escape(String(a.status ?? '-')),
  ])

  // Compliance.
  const complianceCells = Object.entries(data.complianceCounts)
    .map(([key, count]) => {
      const meta = STATUS_META[key] ?? { label: key, color: TEXT_MUTED }
      return `<td style="padding:12px;text-align:center;border:1px solid ${BORDER_LIGHT};">
        <p style="margin:0;font-size:22px;font-weight:700;color:${meta.color};">${count}</p>
        <p style="margin:4px 0 0 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">${escape(meta.label)}</p>
      </td>`
    })
    .join('')
  const complianceRows = data.complianceItems.map((c) => [
    escape(String(c.name ?? '-')),
    escape(String(c.compliance_type ?? '-')),
    escape(String(c.frequency ?? '-')),
    escape(formatDate(c.last_completed as string | null)),
    escape(formatDate(c.next_due as string | null)),
    statusChip(String(c.status ?? 'unknown')),
  ])
  const complianceBlock = `
    ${data.complianceItems.length > 0 ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:14px;"><tr>${complianceCells}</tr></table>` : ''}
    ${table(['Item', 'Type', 'Frequency', 'Last done', 'Next due', 'Status'], complianceRows)}`

  // Certificate completions.
  const certRows = data.certCompletions.slice(0, 50).map((c) => [
    escape(String(c.cert_type ?? '-').replace(/_/g, ' ')),
    escape(String(c.outcome ?? '-')),
    escape(formatDate(c.completed_at as string | null)),
  ])

  // Document register with version chains.
  const docRows: string[][] = []
  for (const chain of data.documentChains) {
    chain.versions.forEach((v, idx) => {
      docRows.push([
        idx === 0 ? escape(chain.name) : `<span style="color:${TEXT_MUTED};">↳</span>`,
        `v${escape(String(v.version ?? 1))}`,
        escape(String(v.document_type ?? '-')),
        escape(formatDate(v.uploaded_at as string | null)),
        escape(v.expiry_date ? formatDate(String(v.expiry_date)) : '-'),
      ])
    })
  }

  // Maintenance plans.
  const planRows = data.maintenancePlans.map((m) => [
    escape(String(m.name ?? '-')),
    escape(String(m.frequency ?? '-')),
    escape(String(m.schedule_mode ?? '-')),
    escape(formatDate(m.last_completed as string | null)),
    escape(formatDate(m.next_due as string | null)),
    m.is_active ? 'Active' : 'Inactive',
  ])

  // Jobs.
  const jobCountLine = Object.entries(data.jobStatusCounts)
    .map(([s, n]) => `${escape(s.replace(/_/g, ' '))}: <strong>${n}</strong>`)
    .join(' · ')
  const jobRows = data.recentJobs.map((j) => [
    escape(String(j.job_number ?? '-')),
    escape(String(j.title ?? '-')),
    escape(String(j.status ?? '-').replace(/_/g, ' ')),
    escape(formatDate((j.completed_date ?? j.scheduled_date) as string | null)),
  ])
  const jobsBlock = `
    <p style="margin:0 0 12px 0;font-size:12px;color:${TEXT_MUTED};">${data.jobsTotal} job${data.jobsTotal === 1 ? '' : 's'} on record${data.jobsTotal >= 500 ? ' (most recent 500 analysed)' : ''}. ${jobCountLine}</p>
    ${table(['Job #', 'Title', 'Status', 'Date'], jobRows)}`

  // RAMS.
  const ramsRows = data.rams.map((r) => [
    escape(String(r.title ?? '-')),
    escape(String((r.subcontractors as Row | null)?.company_name ?? '-')),
    escape(String(r.approval_status ?? '-')),
    escape(r.valid_until ? formatDate(String(r.valid_until)) : '-'),
  ])

  // Permits (00121).
  const permitRows = data.permits.map((pm) => [
    escape(String(pm.permit_type ?? '-').replace(/_/g, ' ')),
    escape(String(pm.status ?? '-')),
    escape(pm.issued_at ? formatDate(String(pm.issued_at)) : '-'),
    escape(
      pm.valid_from || pm.valid_to
        ? `${pm.valid_from ? formatDate(String(pm.valid_from)) : '…'} → ${pm.valid_to ? formatDate(String(pm.valid_to)) : '…'}`
        : '-',
    ),
    escape(String(pm.conditions ?? '-').slice(0, 80)),
  ])

  // Risk assessments.
  const riskRows = data.riskAssessments.map((r) => [
    escape(String(r.reference ?? '-')),
    escape(String(r.risk_type ?? '-')),
    escape(String(r.severity ?? '-')),
    escape(String(r.status ?? '-')),
    escape(formatDate(r.assessment_date as string | null)),
  ])

  // Log book.
  const logRows = data.logBookEntries.slice(0, 30).map((l) => [
    escape(String(l.log_type ?? '-')),
    escape(String(l.entry ?? '-').slice(0, 120)),
    escape(formatDate(l.log_date as string | null)),
  ])

  // Timeline + audit slices.
  const timelineRows = data.timeline.slice(0, 40).map((t) => [
    escape(String(t.event_type ?? '-').replace(/_/g, ' ')),
    escape(String(t.description ?? '-').slice(0, 140)),
    escape(formatDate(t.created_at as string | null)),
  ])
  const auditRows = data.audit.map((a) => [
    escape(String(a.action ?? '-')),
    escape(String(a.summary ?? '-').slice(0, 140)),
    escape(String(a.actor_email ?? '-')),
    escape(formatDate(a.created_at as string | null)),
  ])
  const auditNote = `<p style="margin:10px 0 0 0;font-size:11px;color:${TEXT_MUTED};">Audit events recorded to date for this property entity.</p>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Building Information Pack — ${escape(propertyName)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;">

        <!-- Header -->
        <tr><td style="background-color:${BRAND_DARK};padding:28px 32px;border-radius:12px 12px 0 0;">
          ${logoImg}
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">${escape(propertyName)}</h1>
          <p style="margin:6px 0 0 0;color:#9ca3af;font-size:13px;">
            Building Information Pack &mdash; golden-thread export &mdash; generated ${escape(generatedOn)} by ${escape(orgName)}
          </p>
        </td></tr>

        ${section('Building', 'Property & responsible persons', propertyBlock)}
        ${section('Asset register', `${data.assets.length} asset${data.assets.length === 1 ? '' : 's'}`, table(['Asset', 'Category', 'Make / model', 'Serial', 'Installed', 'Status'], assetRows))}
        ${section('Compliance', 'Statutory items & status', complianceBlock)}
        ${section('Certificate completions', 'Engineer-completed statutory checklists', table(['Certificate', 'Outcome', 'Completed'], certRows))}
        ${section('Document register', `${data.documentChains.length} document${data.documentChains.length === 1 ? '' : 's'}, ${data.documentVersionTotal} version${data.documentVersionTotal === 1 ? '' : 's'} (full chains)`, table(['Document', 'Version', 'Type', 'Uploaded', 'Expires'], docRows))}
        ${section('Planned maintenance', 'PPM regimes for this building', table(['Plan', 'Frequency', 'Mode', 'Last done', 'Next due', 'Active'], planRows))}
        ${section('Job history', 'Work carried out', jobsBlock)}
        ${section('RAMS', 'Risk assessments & method statements (contractor)', table(['Title', 'Contractor', 'Approval', 'Valid until'], ramsRows))}
        ${section('Permits to work', 'Controlled works authorisations', table(['Type', 'Status', 'Issued', 'Validity', 'Conditions'], permitRows))}
        ${section('Risk assessments', 'Building risk register', table(['Reference', 'Type', 'Severity', 'Status', 'Assessed'], riskRows))}
        ${section('Log book', 'Most recent entries', table(['Type', 'Entry', 'Date'], logRows))}
        ${section('Timeline', 'Most recent events', table(['Event', 'Description', 'Date'], timelineRows))}
        ${section('Audit trail', 'Recorded property-entity audit events', table(['Action', 'Summary', 'Actor', 'Date'], auditRows) + auditNote)}

        <!-- Footer -->
        <tr><td style="background-color:#ffffff;padding:24px 32px;border-top:1px solid ${BORDER_LIGHT};border-radius:0 0 12px 12px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};border-bottom:1px solid ${BORDER_LIGHT};">
          <p style="margin:0;font-size:11px;color:${TEXT_MUTED};">
            This pack is a point-in-time export of the live building record as at ${escape(generatedOn)} — assets, statutory compliance, document version chains, planned maintenance, work history and audit trail. A machine-readable JSON manifest is produced alongside this document for data portability (Building Safety Act golden-thread handover).
          </p>
          <p style="margin:16px 0 0 0;font-size:11px;color:${TEXT_MUTED};text-align:center;">
            Powered by <span style="color:${accent};font-weight:600;">Haumea</span> &mdash; Facilities Management Platform
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── handler ──────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  let body: { property_id?: string; organisation_id?: string } = {}
  try {
    body = (await req.json().catch(() => ({}))) as typeof body
  } catch {
    // tolerated
  }
  const propertyId = body.property_id
  if (!propertyId) return jsonResponse({ error: 'property_id_required' }, 400)

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Resolve the property's org FIRST; user callers must own it.
  const { data: propOrg } = await admin
    .from('properties')
    .select('organisation_id')
    .eq('id', propertyId)
    .maybeSingle()
  if (!propOrg) return jsonResponse({ error: 'property_not_found' }, 404)
  const orgId = String((propOrg as Row).organisation_id)
  if (caller.kind === 'user' && orgId !== caller.organisation_id) {
    return jsonResponse({ error: 'organisation_forbidden' }, 403)
  }
  if (caller.kind === 'service_role' && body.organisation_id && body.organisation_id !== orgId) {
    return jsonResponse({ error: 'organisation_mismatch' }, 400)
  }

  const { data: orgData, error: orgErr } = await admin
    .from('organisations')
    .select('id, name, logo_url, accent_color')
    .eq('id', orgId)
    .single()
  if (orgErr || !orgData) return jsonResponse({ error: 'organisation_not_found' }, 404)

  let data: BuildingPackData
  try {
    data = await gatherBuildingPackData(admin, orgId, propertyId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: msg }, msg === 'property_not_found' ? 404 : 500)
  }

  const html = buildHtml(orgData as OrgRow, data)
  const manifest = buildManifest(orgId, propertyId, data)

  const stamp = timestampStamp()
  const baseKey = `${orgId}/${propertyId}/building-pack-${stamp}`
  const htmlPath = `${baseKey}.html`
  const jsonPath = `${baseKey}.json`

  const [htmlUp, jsonUp] = await Promise.all([
    admin.storage.from(STORAGE_BUCKET).upload(htmlPath, new Blob([html], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: true,
    }),
    admin.storage.from(STORAGE_BUCKET).upload(jsonPath, new Blob([manifest], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true,
    }),
  ])
  if (htmlUp.error) return jsonResponse({ error: `HTML upload failed: ${htmlUp.error.message}` }, 500)
  if (jsonUp.error) return jsonResponse({ error: `manifest upload failed: ${jsonUp.error.message}` }, 500)

  // PDF branch mirrors generate-tender-pack — inert while token unset.
  let pdfError: string | null = null
  let storagePath = htmlPath
  if (BROWSERLESS_TOKEN) {
    try {
      const pdfRes = await fetch(
        `https://chrome.browserless.io/pdf?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html,
            options: { format: 'A4', printBackground: true, margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' } },
          }),
        },
      )
      if (!pdfRes.ok) throw new Error(`Browserless ${pdfRes.status}`)
      const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
      const pdfPath = `${baseKey}.pdf`
      const { error: pdfUpErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true })
      if (pdfUpErr) throw new Error(pdfUpErr.message)
      storagePath = pdfPath
    } catch (err) {
      pdfError = err instanceof Error ? err.message : String(err)
    }
  }

  // Download filenames so the browser SAVES a named file instead of rendering
  // raw markup inline at the storage URL. Slug the property name for the file.
  const slug = String((data.property as Row).name ?? 'building')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'building'
  const dateStamp = todayIso()
  const mainExt = storagePath.endsWith('.pdf') ? 'pdf' : 'html'
  const mainName = `building-pack-${slug}-${dateStamp}.${mainExt}`
  const manifestName = `building-pack-${slug}-${dateStamp}-data.json`

  const [signedMain, signedManifest] = await Promise.all([
    admin.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download: mainName }),
    admin.storage.from(STORAGE_BUCKET).createSignedUrl(jsonPath, SIGNED_URL_TTL_SECONDS, { download: manifestName }),
  ])
  if (signedMain.error || !signedMain.data?.signedUrl) {
    return jsonResponse({ error: `signed URL failed: ${signedMain.error?.message ?? 'unknown'}` }, 500)
  }

  return jsonResponse({
    ok: true,
    html_url: signedMain.data.signedUrl,
    manifest_url: signedManifest.data?.signedUrl ?? null,
    storage_paths: { html: htmlPath, manifest: jsonPath },
    expires_in: SIGNED_URL_TTL_SECONDS,
    pdf_render_mode: BROWSERLESS_TOKEN ? 'browserless' : 'html_only',
    pdf_error: pdfError,
    summary: {
      assets: data.assets.length,
      compliance_items: data.complianceItems.length,
      documents: data.documentChains.length,
      document_versions: data.documentVersionTotal,
      jobs: data.jobsTotal,
      certificates: data.certCompletions.length,
      rams: data.rams.length,
      permits: data.permits.length,
      risk_assessments: data.riskAssessments.length,
    },
  })
})
