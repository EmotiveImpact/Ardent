// supabase/functions/generate-tender-pack/index.ts
//
// One-click Tender Pack export.
//
// UK FM operators hand-build a "compliance evidence pack" for every
// tender bid. This function assembles that pack for the caller's own
// organisation and returns a downloadable signed URL:
//   1. Current compliance score + band + last-12-months trend
//      (from compliance_score_snapshots).
//   2. In-date certificates (next_due >= today, revoked_at is null)
//      with type / number / test_date / next_due.
//   3. Compliance items summary — counts by status.
//   4. Active contracts summary — count + total value (optional).
//
// It renders a BRANDED A4 HTML document (org name, logo, accent colour),
// stores it in the `tender-packs` private storage bucket at
// {org_id}/tender-pack-{YYYY-MM-DD-HHmmss}.{html,pdf}, and returns a
// short-lived signed URL. The PDF render path mirrors
// generate-statement-of-compliance / generate-certificate: when
// BROWSERLESS_TOKEN is set a binary PDF is produced; otherwise the
// function gracefully degrades to HTML-only and still returns a usable
// signed URL.
//
// Auth:
//   verify_jwt = true. Authenticated admins call with their user JWT;
//   the function resolves the org from profiles (same pattern as
//   generate-statement-of-compliance) and then re-elevates with the
//   service role for the cross-table reads / storage writes. Service-role
//   callers may pass { organisation_id } explicitly.
//
// PII stance: this is the operator's OWN data exported by an
// authenticated admin, so full certificate detail is included.
//
// Inputs (POST body, all optional):
//   { organisation_id?: string }
//
// Output:
//   { ok, url, storage_path, expires_in, pdf_render_mode, pdf_error?,
//     summary: { score, band, certificate_count, ... } }
//
// Deploy with: supabase functions deploy generate-tender-pack
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided)
// Optional env: BROWSERLESS_TOKEN

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const BROWSERLESS_TOKEN = Deno.env.get('BROWSERLESS_TOKEN') ?? ''
const STORAGE_BUCKET = 'tender-packs'
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

// Brand fallbacks — mirrored from apps/web/src/index.css @theme block.
// The org's own accent_color overrides BRAND_COLOR at render time.
const BRAND_COLOR_FALLBACK = '#e8772e' // --color-brand-500
const BRAND_COLOR_DARK_FALLBACK = '#d06420' // --color-brand-600
const BRAND_DARK = '#1b1f2e' // --color-surface-sidebar
const TEXT_COLOR = '#111827'
const TEXT_MUTED = '#6b7280'
const BORDER_LIGHT = '#e2e5ea'
const SURFACE_SOFT = '#f9fafb'

// Canonical status palette — matches --color-status-* in index.css.
const STATUS_COMPLIANT = '#22c55e'
const STATUS_DUE_SOON = '#f59e0b'
const STATUS_OVERDUE = '#ef4444'
const STATUS_NON_COMPLIANT = '#dc2626'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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

// ── auth (copied from generate-statement-of-compliance) ──────────────

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
  if (!jwt) {
    return jsonResponse({ error: 'missing_authorization' }, 401)
  }

  if (isServiceRoleJwt(jwt)) {
    return { kind: 'service_role' }
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'invalid_authorization' }, 401)
  }

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

// ── data shapes ──────────────────────────────────────────────────────

interface OrgRow {
  id: string
  name: string | null
  support_email: string | null
  support_phone: string | null
  logo_url: string | null
  accent_color: string | null
  accent_color_dark: string | null
}

const ORG_SELECT =
  'id, name, support_email, support_phone, logo_url, accent_color, accent_color_dark'

interface SnapshotRow {
  snapshot_date: string
  score: number
}

interface CertificateRow {
  type: string
  certificate_number: string
  test_date: string | null
  next_due: string | null
  outcome: string | null
}

interface ComplianceItemRow {
  status: string | null
}

interface ContractRow {
  value: number | null
}

interface TenderPackData {
  currentScore: number | null
  scoreDate: string | null
  trend: SnapshotRow[]
  certificates: CertificateRow[]
  complianceCounts: Record<string, number>
  complianceTotal: number
  activeContractCount: number
  activeContractValue: number
}

// ── helpers ──────────────────────────────────────────────────────────

// Score bands — identical thresholds/labels to the Statement of
// Compliance and public Trust URL.
function scoreTone(score: number): { fg: string; label: string } {
  if (score >= 90) return { fg: STATUS_COMPLIANT, label: 'Exceptional' }
  if (score >= 75) return { fg: BRAND_COLOR_FALLBACK, label: 'Strong' }
  if (score >= 60) return { fg: STATUS_DUE_SOON, label: 'Fair' }
  return { fg: STATUS_OVERDUE, label: 'Needs work' }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function twelveMonthsAgoIso(): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - 12)
  return d.toISOString().slice(0, 10)
}

function timestampStamp(): string {
  // 2026-05-29-143012 — sortable, filesystem-safe.
  return new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '').slice(0, 19)
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''))
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  compliant: { label: 'Compliant', color: STATUS_COMPLIANT },
  due_soon: { label: 'Due Soon', color: STATUS_DUE_SOON },
  overdue: { label: 'Overdue', color: STATUS_OVERDUE },
  non_compliant: { label: 'Non-Compliant', color: STATUS_NON_COMPLIANT },
}

// Inline SVG sparkline of the score trend — no chart deps, renders
// identically in Browserless and any HTML viewer.
function buildSparkline(points: SnapshotRow[], stroke: string): string {
  if (points.length < 2) return ''
  const W = 560
  const H = 80
  const PAD = 4
  const scores = points.map((p) => p.score)
  const min = Math.min(...scores, 0)
  const max = Math.max(...scores, 100)
  const range = max - min || 1
  const stepX = (W - PAD * 2) / (points.length - 1)
  const coords = points.map((p, i) => {
    const x = PAD + i * stepX
    const y = PAD + (H - PAD * 2) * (1 - (p.score - min) / range)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = coords.join(' ')
  const area = `${PAD},${H - PAD} ${line} ${(PAD + (points.length - 1) * stepX).toFixed(1)},${H - PAD}`
  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="display:block;">
      <polygon points="${area}" fill="${stroke}1f" />
      <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
    </svg>`
}

// ── data assembly ────────────────────────────────────────────────────

async function gatherTenderPackData(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<TenderPackData> {
  const today = todayIso()
  const periodStart = twelveMonthsAgoIso()

  const [snapRes, certRes, itemRes, contractRes] = await Promise.all([
    supabase
      .from('compliance_score_snapshots')
      .select('snapshot_date, score')
      .eq('organisation_id', orgId)
      .gte('snapshot_date', periodStart)
      .order('snapshot_date', { ascending: true }),
    supabase
      .from('certificates')
      .select('type, certificate_number, test_date, next_due, outcome')
      .eq('organisation_id', orgId)
      .is('revoked_at', null)
      .gte('next_due', today)
      .order('next_due', { ascending: true }),
    supabase
      .from('compliance_items')
      .select('status')
      .eq('organisation_id', orgId),
    supabase
      .from('contracts')
      .select('value')
      .eq('organisation_id', orgId)
      .eq('status', 'active'),
  ])

  if (snapRes.error) throw new Error(`snapshot query failed: ${snapRes.error.message}`)
  if (certRes.error) throw new Error(`certificate query failed: ${certRes.error.message}`)
  if (itemRes.error) throw new Error(`compliance item query failed: ${itemRes.error.message}`)
  if (contractRes.error) throw new Error(`contract query failed: ${contractRes.error.message}`)

  const trend = (snapRes.data ?? []) as SnapshotRow[]
  const certificates = (certRes.data ?? []) as CertificateRow[]
  const items = (itemRes.data ?? []) as ComplianceItemRow[]
  const contracts = (contractRes.data ?? []) as ContractRow[]

  const complianceCounts: Record<string, number> = {}
  for (const item of items) {
    const status = item.status ?? 'unknown'
    complianceCounts[status] = (complianceCounts[status] ?? 0) + 1
  }

  const latest = trend.length > 0 ? trend[trend.length - 1] : null

  return {
    currentScore: latest ? latest.score : null,
    scoreDate: latest ? latest.snapshot_date : null,
    trend,
    certificates,
    complianceCounts,
    complianceTotal: items.length,
    activeContractCount: contracts.length,
    activeContractValue: contracts.reduce((sum, c) => sum + (c.value ?? 0), 0),
  }
}

// ── HTML rendering ───────────────────────────────────────────────────

function buildHtml(org: OrgRow, data: TenderPackData): string {
  const orgName = org.name ?? 'Your organisation'
  const accent =
    org.accent_color && /^#[0-9a-fA-F]{6}$/.test(org.accent_color)
      ? org.accent_color
      : BRAND_COLOR_FALLBACK
  const accentDark =
    org.accent_color_dark && /^#[0-9a-fA-F]{6}$/.test(org.accent_color_dark)
      ? org.accent_color_dark
      : BRAND_COLOR_DARK_FALLBACK
  const generatedOn = formatDate(todayIso())

  const logoImg = org.logo_url
    ? `<img src="${escape(org.logo_url)}" alt="${escape(orgName)} logo" style="max-height:36px;max-width:160px;display:block;margin-bottom:10px;" />`
    : ''

  // Headline score block.
  const score = data.currentScore
  const tone = score != null ? scoreTone(score) : { fg: accent, label: 'No data' }
  const scoreFg = score != null && score >= 75 ? accent : tone.fg
  const scoreBlock =
    score != null
      ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="vertical-align:bottom;">
              <span style="font-size:64px;font-weight:700;line-height:1;letter-spacing:-0.04em;color:${scoreFg};">${score}</span>
              <span style="font-size:18px;font-weight:500;color:${TEXT_MUTED};margin-left:6px;">/ 100</span>
            </td>
            <td style="vertical-align:bottom;text-align:right;">
              <span style="display:inline-block;background-color:${scoreFg}15;color:${scoreFg};font-size:12px;font-weight:600;padding:4px 10px;border-radius:9999px;text-transform:uppercase;letter-spacing:0.04em;">
                ${escape(tone.label)}
              </span>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0 0;font-size:13px;color:${TEXT_COLOR};line-height:1.55;">
          Current compliance score as at <strong>${escape(formatDate(data.scoreDate))}</strong>, derived from live operational data across compliance, planned maintenance, job pass rate and remedial actions.
        </p>`
      : `<p style="margin:0;font-size:14px;color:${TEXT_MUTED};">No compliance score snapshots available yet.</p>`

  // 12-month trend sparkline + range.
  const trendScores = data.trend.map((t) => t.score)
  const trendBlock =
    data.trend.length >= 2
      ? `
        ${buildSparkline(data.trend, accent)}
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px;">
          <tr>
            <td style="font-size:11px;color:${TEXT_MUTED};">${escape(formatDate(data.trend[0].snapshot_date))}</td>
            <td style="font-size:11px;color:${TEXT_MUTED};text-align:center;">Low ${Math.min(...trendScores)} · High ${Math.max(...trendScores)} · ${data.trend.length} snapshots</td>
            <td style="font-size:11px;color:${TEXT_MUTED};text-align:right;">${escape(formatDate(data.trend[data.trend.length - 1].snapshot_date))}</td>
          </tr>
        </table>`
      : `<p style="margin:0;font-size:13px;color:${TEXT_MUTED};">Not enough history to plot a 12-month trend yet.</p>`

  // Compliance items summary — counts by status.
  const statusOrder = ['compliant', 'due_soon', 'overdue', 'non_compliant']
  const orderedKeys = [
    ...statusOrder.filter((k) => k in data.complianceCounts),
    ...Object.keys(data.complianceCounts).filter((k) => !statusOrder.includes(k)),
  ]
  const complianceCells = orderedKeys
    .map((key) => {
      const meta = STATUS_META[key] ?? { label: key, color: TEXT_MUTED }
      return `
        <td style="padding:12px;text-align:center;border:1px solid ${BORDER_LIGHT};">
          <p style="margin:0;font-size:24px;font-weight:700;color:${meta.color};">${data.complianceCounts[key]}</p>
          <p style="margin:4px 0 0 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">${escape(meta.label)}</p>
        </td>`
    })
    .join('')
  const complianceBlock =
    data.complianceTotal > 0
      ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr>${complianceCells}</tr></table>
         <p style="margin:10px 0 0 0;font-size:12px;color:${TEXT_MUTED};">${data.complianceTotal} compliance item${data.complianceTotal === 1 ? '' : 's'} tracked in total.</p>`
      : `<p style="margin:0;font-size:13px;color:${TEXT_MUTED};">No compliance items tracked yet.</p>`

  // In-date certificates table.
  const certRows = data.certificates
    .map(
      (c) => `
        <tr>
          <td style="padding:9px 10px;border-bottom:1px solid ${BORDER_LIGHT};font-size:12px;color:${TEXT_COLOR};">${escape(c.type)}</td>
          <td style="padding:9px 10px;border-bottom:1px solid ${BORDER_LIGHT};font-size:12px;color:${TEXT_COLOR};font-family:monospace;">${escape(c.certificate_number)}</td>
          <td style="padding:9px 10px;border-bottom:1px solid ${BORDER_LIGHT};font-size:12px;color:${TEXT_MUTED};">${escape(formatDate(c.test_date))}</td>
          <td style="padding:9px 10px;border-bottom:1px solid ${BORDER_LIGHT};font-size:12px;color:${TEXT_COLOR};font-weight:600;">${escape(formatDate(c.next_due))}</td>
          <td style="padding:9px 10px;border-bottom:1px solid ${BORDER_LIGHT};font-size:12px;color:${STATUS_COMPLIANT};text-transform:capitalize;">${escape(c.outcome ?? 'Valid')}</td>
        </tr>`,
    )
    .join('')
  const certBlock =
    data.certificates.length > 0
      ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background-color:${SURFACE_SOFT};">
              <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid ${BORDER_LIGHT};">Type</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid ${BORDER_LIGHT};">Number</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid ${BORDER_LIGHT};">Test Date</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid ${BORDER_LIGHT};">Next Due</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid ${BORDER_LIGHT};">Outcome</th>
            </tr>
          </thead>
          <tbody>${certRows}</tbody>
        </table>
        <p style="margin:10px 0 0 0;font-size:12px;color:${TEXT_MUTED};">${data.certificates.length} in-date certificate${data.certificates.length === 1 ? '' : 's'} (valid as at ${escape(generatedOn)}).</p>`
      : `<p style="margin:0;font-size:13px;color:${TEXT_MUTED};">No in-date certificates on record.</p>`

  // Active contracts summary (optional).
  const contractBlock =
    data.activeContractCount > 0
      ? `
        <table cellpadding="0" cellspacing="0" style="width:100%;background-color:${SURFACE_SOFT};border:1px solid ${BORDER_LIGHT};border-radius:8px;">
          <tr>
            <td style="padding:14px;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:700;color:${TEXT_COLOR};">${data.activeContractCount}</p>
              <p style="margin:4px 0 0 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Active contracts</p>
            </td>
            <td style="padding:14px;text-align:center;border-left:1px solid ${BORDER_LIGHT};">
              <p style="margin:0;font-size:24px;font-weight:700;color:${accent};">${escape(formatCurrency(data.activeContractValue))}</p>
              <p style="margin:4px 0 0 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Total portfolio value</p>
            </td>
          </tr>
        </table>`
      : ''

  const supportLine =
    org.support_email || org.support_phone
      ? `<p style="margin:0;font-size:12px;color:${TEXT_MUTED};">
           Questions? ${org.support_email ? `Email <a href="mailto:${escape(org.support_email)}" style="color:${accent};">${escape(org.support_email)}</a>` : ''}
           ${org.support_email && org.support_phone ? ' or ' : ''}
           ${org.support_phone ? `call <a href="tel:${escape(org.support_phone.replace(/\s+/g, ''))}" style="color:${accent};">${escape(org.support_phone)}</a>` : ''}
         </p>`
      : ''

  function section(title: string, subtitle: string, inner: string): string {
    return `
      <tr><td style="background-color:#ffffff;padding:24px 32px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};border-top:1px solid ${BORDER_LIGHT};">
        <p style="margin:0 0 2px 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.08em;">${escape(title)}</p>
        <p style="margin:0 0 16px 0;font-size:13px;color:${TEXT_COLOR};font-weight:600;">${escape(subtitle)}</p>
        ${inner}
      </td></tr>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tender Compliance Pack — ${escape(orgName)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;">

        <!-- Header -->
        <tr><td style="background-color:${BRAND_DARK};padding:28px 32px;border-radius:12px 12px 0 0;">
          ${logoImg}
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">${escape(orgName)}</h1>
          <p style="margin:8px 0 0 0;color:#9ca3af;font-size:13px;">
            Tender Compliance Pack &mdash; generated ${escape(generatedOn)}
          </p>
        </td></tr>

        ${section('Compliance score', 'Current standing', scoreBlock)}
        ${section('12-month trend', 'How the score has moved', trendBlock)}
        ${section('Compliance items', 'Summary by status', complianceBlock)}
        ${section('Certificates', 'In-date evidence', certBlock)}
        ${data.activeContractCount > 0 ? section('Contracts', 'Active service agreements', contractBlock) : ''}

        <!-- Footer -->
        <tr><td style="background-color:#ffffff;padding:24px 32px;border-top:1px solid ${BORDER_LIGHT};border-radius:0 0 12px 12px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};border-bottom:1px solid ${BORDER_LIGHT};">
          ${supportLine}
          <p style="margin:${supportLine ? '12px' : '0'} 0 0 0;font-size:11px;color:${TEXT_MUTED};">
            This pack reflects live compliance data as at ${escape(generatedOn)}. Certificate numbers and due dates are exported directly from the operator's records.
          </p>
          <p style="margin:16px 0 0 0;font-size:11px;color:${TEXT_MUTED};text-align:center;">
            Powered by <span style="color:${accentDark};font-weight:600;">Haumea</span> &mdash; Facilities Management Platform
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── render + upload ──────────────────────────────────────────────────

interface RenderResult {
  storagePath: string
  pdfStored: boolean
  pdfError: string | null
}

async function renderAndUpload(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  html: string,
): Promise<RenderResult> {
  const stamp = timestampStamp()
  const baseKey = `${orgId}/tender-pack-${stamp}`
  const htmlPath = `${baseKey}.html`
  const pdfPath = `${baseKey}.pdf`

  // HTML — always saved.
  const { error: htmlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(htmlPath, new Blob([html], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: true,
    })
  if (htmlErr) {
    throw new Error(`HTML upload failed: ${htmlErr.message}`)
  }

  // PDF — only when Browserless token present. Non-fatal on failure.
  if (!BROWSERLESS_TOKEN) {
    return { storagePath: htmlPath, pdfStored: false, pdfError: null }
  }

  try {
    const pdfRes = await fetch(
      `https://chrome.browserless.io/pdf?token=${encodeURIComponent(BROWSERLESS_TOKEN)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          options: {
            format: 'A4',
            printBackground: true,
            margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
          },
        }),
      },
    )
    if (!pdfRes.ok) {
      const body = await pdfRes.text().catch(() => '')
      throw new Error(`Browserless ${pdfRes.status}: ${body.slice(0, 200) || pdfRes.statusText}`)
    }
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (uploadErr) {
      throw new Error(`PDF upload failed: ${uploadErr.message}`)
    }
    return { storagePath: pdfPath, pdfStored: true, pdfError: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[generate-tender-pack] PDF render failed:', msg)
    return { storagePath: htmlPath, pdfStored: false, pdfError: msg }
  }
}

// ── handler ──────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  let body: { organisation_id?: string } = {}
  try {
    body = (await req.json().catch(() => ({}))) as typeof body
  } catch {
    // Empty body is acceptable for user callers.
  }

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller

  let targetOrgId: string | null = body.organisation_id ?? null
  if (caller.kind === 'user') {
    if (targetOrgId && targetOrgId !== caller.organisation_id) {
      return jsonResponse({ error: 'organisation_forbidden' }, 403)
    }
    targetOrgId = caller.organisation_id
  }
  if (!targetOrgId) {
    return jsonResponse({ error: 'organisation_id required for service_role calls' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: orgData, error: orgErr } = await admin
    .from('organisations')
    .select(ORG_SELECT)
    .eq('id', targetOrgId)
    .single()
  if (orgErr || !orgData) {
    return jsonResponse({ error: 'organisation_not_found' }, 404)
  }
  const org = orgData as OrgRow

  let data: TenderPackData
  try {
    data = await gatherTenderPackData(admin, org.id)
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    )
  }

  const html = buildHtml(org, data)

  let render: RenderResult
  try {
    render = await renderAndUpload(admin, org.id, html)
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    )
  }

  // Download filename so the browser SAVES a named file instead of rendering
  // raw markup inline at the storage URL.
  const tpSlug = String(org.name ?? 'tender-pack')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tender-pack'
  const tpName = `tender-pack-${tpSlug}-${todayIso()}.${render.storagePath.endsWith('.pdf') ? 'pdf' : 'html'}`
  const { data: signed, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(render.storagePath, SIGNED_URL_TTL_SECONDS, { download: tpName })
  if (signErr || !signed?.signedUrl) {
    return jsonResponse(
      { error: `signed URL failed: ${signErr?.message ?? 'unknown'}` },
      500,
    )
  }

  return jsonResponse({
    ok: true,
    url: signed.signedUrl,
    storage_path: render.storagePath,
    expires_in: SIGNED_URL_TTL_SECONDS,
    pdf_render_mode: BROWSERLESS_TOKEN ? 'browserless' : 'html_only',
    pdf_error: render.pdfError,
    summary: {
      score: data.currentScore,
      score_date: data.scoreDate,
      trend_points: data.trend.length,
      certificate_count: data.certificates.length,
      compliance_total: data.complianceTotal,
      active_contracts: data.activeContractCount,
    },
  })
})
