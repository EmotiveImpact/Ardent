// supabase/functions/generate-statement-of-compliance/index.ts
//
// Strategic 1 follow-up — Monthly Statement of Compliance.
//
// What this function does (per organisation):
//   1. Aggregate compliance_score_snapshots in [period_start, period_end]
//      → score_avg / min / max + per-axis breakdown_avg.
//   2. Render a branded HTML statement (same brand tokens as
//      job-completion-email).
//   3. Render a binary PDF via Browserless (pattern lifted from
//      generate-certificate). When BROWSERLESS_TOKEN is unset, the
//      function still saves the HTML and proceeds — graceful
//      degradation.
//   4. Upload the artifact to the statements-of-compliance storage
//      bucket at {org_id}/{YYYY-MM-DD}.{html,pdf}.
//   5. Upsert a statement_of_compliance row keyed by (org, period_start).
//   6. When RESEND_API_KEY is set, email a summary + (when present)
//      the PDF as an attachment to organisations.support_email.
//
// Inputs (POST body, all optional):
//   { organisation_id?: string, period_start?: string }
//
//   organisation_id — service-role callers may omit it for ALL organisations
//                     (cron mode); user callers are always scoped to their org.
//   period_start    — YYYY-MM-DD. Defaults to the first day of the
//                     previous calendar month.
//
// Output:
//   { results: Array<{ organisation_id, status, message }> }
//
// Auth:
//   verify_jwt = true. The cron call uses the service-role JWT in the
//   Authorization header (see comment at the bottom of this file). The
//   admin "Generate now" button on the dashboard uses the user's JWT —
//   the function then re-elevates with the service role for the
//   cross-table reads / storage writes.
//
// Cron schedule (run from the Supabase SQL editor — DO NOT auto-apply
// from the agent):
//   select cron.schedule(
//     'generate-statements-of-compliance',
//     '0 6 1 * *',  -- 06:00 UTC on the 1st of each month
//     $$ select net.http_post(
//          url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/generate-statement-of-compliance',
//          headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>"}'::jsonb,
//          body := '{}'::jsonb
//        ) $$
//   );

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Haumea <notifications@haumea.com>'
const BROWSERLESS_TOKEN = Deno.env.get('BROWSERLESS_TOKEN') ?? ''
const PUBLIC_APP_URL =
  Deno.env.get('PUBLIC_APP_URL') ?? 'https://app.haumea.com'
const RESEND_URL = 'https://api.resend.com/emails'
const STORAGE_BUCKET = 'statements-of-compliance'

// Brand tokens — mirrored from apps/web/src/index.css @theme block so
// every transactional artifact ships the same palette as the dashboard
// and the public Trust URL. If you change these here, change them
// alongside the --color-brand-*, --color-status-*, and --color-surface-
// sidebar tokens in index.css.
const BRAND_COLOR = '#e8772e' // --color-brand-500 (warm orange)
const BRAND_COLOR_DARK = '#d06420' // --color-brand-600
const BRAND_DARK = '#1b1f2e' // --color-surface-sidebar (light theme)
const TEXT_COLOR = '#111827' // --color-text-primary (light)
const TEXT_MUTED = '#6b7280'
const BORDER_LIGHT = '#e2e5ea' // --color-border-default (light)
const SURFACE_SOFT = '#f9fafb'

// Canonical status palette — matches --color-status-* in index.css
// and the Trust URL band tints (see apps/web/src/routes/trust/[slug].tsx).
// Only the three used by scoreTone() are exported here; the deep-red
// --color-status-non-compliant (#dc2626) is intentionally omitted —
// the four Trust URL bands don't go that deep.
const STATUS_COMPLIANT = '#22c55e'
const STATUS_DUE_SOON = '#f59e0b'
const STATUS_OVERDUE = '#ef4444'

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

interface OrgRow {
  id: string
  name: string | null
  support_email: string | null
  support_phone: string | null
  logo_url: string | null
  trust_url_slug: string | null
  trust_url_enabled: boolean | null
}

const ORG_SELECT =
  'id, name, support_email, support_phone, logo_url, trust_url_slug, trust_url_enabled'

interface SnapshotRow {
  snapshot_date: string
  score: number
  breakdown: Record<string, unknown>
}

interface PerOrgResult {
  organisation_id: string
  status: 'generated' | 'skipped' | 'error'
  message: string
  pdf_url?: string | null
  email_sent?: boolean
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
  // Trust the JWT role claim: verify_jwt=true gateway already validated signature.
  // String equality against SUPABASE_SERVICE_ROLE_KEY broke on key rotation.
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

  return {
    kind: 'user',
    organisation_id: String(profile.organisation_id),
  }
}

interface BreakdownAvg {
  compliance: number
  ppm_on_time: number
  pass_rate: number
  action_health: number
}

/**
 * Pure helper — derive [period_start, period_end] for the calendar
 * month `offsetMonths` away from `now`. offsetMonths = -1 means "the
 * previous full month" (the cron default). Returns ISO YYYY-MM-DD
 * strings so they slot directly into Supabase date columns.
 *
 * Examples (now = 2026-05-09):
 *   offsetMonths = -1 → { period_start: '2026-04-01', period_end: '2026-04-30' }
 *   offsetMonths =  0 → { period_start: '2026-05-01', period_end: '2026-05-31' }
 */
export function derivePeriodRange(
  now: Date,
  offsetMonths: number,
): { period_start: string; period_end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths + 1, 0))
  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
  }
}

function avgRound(values: number[]): number {
  if (values.length === 0) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round(sum / values.length)
}

function readBreakdownAxis(b: Record<string, unknown>, key: keyof BreakdownAvg): number {
  const v = b[key]
  return typeof v === 'number' ? v : 0
}

function aggregateSnapshots(rows: SnapshotRow[]): {
  score_avg: number
  score_min: number
  score_max: number
  breakdown_avg: BreakdownAvg
} | null {
  if (rows.length === 0) return null
  const scores = rows.map((r) => r.score)
  const breakdown_avg: BreakdownAvg = {
    compliance: avgRound(rows.map((r) => readBreakdownAxis(r.breakdown ?? {}, 'compliance'))),
    ppm_on_time: avgRound(rows.map((r) => readBreakdownAxis(r.breakdown ?? {}, 'ppm_on_time'))),
    pass_rate: avgRound(rows.map((r) => readBreakdownAxis(r.breakdown ?? {}, 'pass_rate'))),
    action_health: avgRound(rows.map((r) => readBreakdownAxis(r.breakdown ?? {}, 'action_health'))),
  }
  return {
    score_avg: avgRound(scores),
    score_min: Math.min(...scores),
    score_max: Math.max(...scores),
    breakdown_avg,
  }
}

function formatPeriodLabel(period_start: string): string {
  // 2026-04-01 → "April 2026"
  const d = new Date(period_start + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

interface BuildHtmlArgs {
  org: OrgRow
  period_start: string
  period_end: string
  score_avg: number
  score_min: number
  score_max: number
  breakdown_avg: BreakdownAvg
  snapshot_count: number
}

// Score bands must match the public Trust URL exactly — prospects
// comparing the Statement PDF and the Trust page should see identical
// labels and thresholds. Source of truth: BAND_META in
// apps/web/src/routes/trust/[slug].tsx and the disclosure copy:
//   "Exceptional 90+, Strong 75-89, Fair 60-74, Needs work below 60."
// The colour mapping mirrors the BAND_META tints (Strong reuses brand
// accent on purpose — see the comment block in that file).
function scoreTone(score: number): { fg: string; label: string } {
  if (score >= 90) return { fg: STATUS_COMPLIANT, label: 'Exceptional' }
  if (score >= 75) return { fg: BRAND_COLOR, label: 'Strong' }
  if (score >= 60) return { fg: STATUS_DUE_SOON, label: 'Fair' }
  return { fg: STATUS_OVERDUE, label: 'Needs work' }
}

function buildHtml(args: BuildHtmlArgs): string {
  const { org, period_start, period_end, score_avg, score_min, score_max, breakdown_avg, snapshot_count } = args
  const orgName = org.name ?? 'Your organisation'
  const periodLabel = formatPeriodLabel(period_start)
  const tone = scoreTone(score_avg)

  // Header: render the org logo (when present) ABOVE the org name so the
  // customer's brand reads first, then the issuing org name on the
  // following line. The Haumea wordmark is reserved for the footer so
  // the document feels like the org's own artefact, not a Haumea
  // promo. (Previously the wordmark was only shown when no logo was
  // available — meaning logo-bearing orgs lost the org name entirely.)
  const logoImg = org.logo_url
    ? `<img src="${escape(org.logo_url)}" alt="${escape(orgName)} logo" style="max-height:36px;max-width:160px;display:block;margin-bottom:10px;" />`
    : ''
  const logoBlock = `
    ${logoImg}
    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${escape(orgName)}</h1>
  `

  // Trust URL QR — when the org has published their public Trust page,
  // render a small QR linking to it in the footer so anyone holding the
  // printed PDF can verify the score live. Uses Google Charts as a
  // hosted-image fallback (no Deno dependency, renders identically in
  // Browserless and email clients that allow remote images).
  // TODO: swap to a self-hosted/inline SVG QR if Google retires the
  // Chart API endpoint (it's officially deprecated but still serving).
  const trustUrl =
    org.trust_url_enabled && org.trust_url_slug
      ? `${PUBLIC_APP_URL.replace(/\/$/, '')}/trust/${encodeURIComponent(org.trust_url_slug)}`
      : null
  const qrImg = trustUrl
    ? `https://chart.googleapis.com/chart?cht=qr&chs=120x120&chld=M|0&chl=${encodeURIComponent(trustUrl)}`
    : null

  // Breakdown table — four rows, axis label + percentage. Avoids any
  // chart libraries (we render plain HTML so Browserless renders
  // identically and email clients also degrade gracefully).
  const breakdownRows = [
    { label: 'Compliance items', value: breakdown_avg.compliance },
    { label: 'PPM on time', value: breakdown_avg.ppm_on_time },
    { label: 'Job pass rate', value: breakdown_avg.pass_rate },
    { label: 'Action health', value: breakdown_avg.action_health },
  ]
    .map(
      (r) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${BORDER_LIGHT};font-size:13px;color:${TEXT_COLOR};">
            ${escape(r.label)}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid ${BORDER_LIGHT};font-size:13px;color:${TEXT_COLOR};text-align:right;font-weight:600;">
            ${r.value}%
          </td>
        </tr>`,
    )
    .join('')

  const supportLine =
    org.support_email || org.support_phone
      ? `<p style="margin:8px 0 0 0;font-size:12px;color:${TEXT_MUTED};">
           Questions? ${org.support_email ? `Email <a href="mailto:${escape(org.support_email)}" style="color:${BRAND_COLOR};">${escape(org.support_email)}</a>` : ''}
           ${org.support_email && org.support_phone ? ' or ' : ''}
           ${org.support_phone ? `call <a href="tel:${escape(org.support_phone.replace(/\s+/g, ''))}" style="color:${BRAND_COLOR};">${escape(org.support_phone)}</a>` : ''}
         </p>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statement of Compliance — ${escape(periodLabel)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

        <!-- Header bar with org branding -->
        <tr><td style="background-color:${BRAND_DARK};padding:24px 32px;border-radius:12px 12px 0 0;">
          ${logoBlock}
          <p style="margin:8px 0 0 0;color:#9ca3af;font-size:13px;">
            Statement of Compliance &mdash; ${escape(periodLabel)}
          </p>
        </td></tr>

        <!-- Headline score -->
        <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};">
          <p style="margin:0 0 6px 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.08em;">
            Average compliance score
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td style="vertical-align:bottom;">
                <span style="font-size:64px;font-weight:700;line-height:1;letter-spacing:-0.04em;color:${tone.fg};">${score_avg}</span>
                <span style="font-size:18px;font-weight:500;color:${TEXT_MUTED};margin-left:6px;">/ 100</span>
              </td>
              <td style="vertical-align:bottom;text-align:right;">
                <span style="display:inline-block;background-color:${tone.fg}15;color:${tone.fg};font-size:12px;font-weight:600;padding:4px 10px;border-radius:9999px;text-transform:uppercase;letter-spacing:0.04em;">
                  ${escape(tone.label)}
                </span>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0 0;font-size:13px;color:${TEXT_COLOR};line-height:1.55;">
            Across <strong>${snapshot_count} day${snapshot_count === 1 ? '' : 's'}</strong> in ${escape(periodLabel)}, your compliance score
            ranged from <strong>${score_min}</strong> to <strong>${score_max}</strong>, averaging <strong>${score_avg}</strong>.
            This number rolls up the four operational signals shown below.
          </p>
        </td></tr>

        <!-- Range row -->
        <tr><td style="background-color:#ffffff;padding:0 32px 24px 32px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};">
          <table cellpadding="0" cellspacing="0" style="width:100%;background-color:${SURFACE_SOFT};border:1px solid ${BORDER_LIGHT};border-radius:8px;padding:16px;">
            <tr>
              <td style="padding:12px;text-align:center;">
                <p style="margin:0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;">Min</p>
                <p style="margin:4px 0 0 0;font-size:22px;font-weight:600;color:${TEXT_COLOR};">${score_min}</p>
              </td>
              <td style="padding:12px;text-align:center;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};">
                <p style="margin:0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;">Average</p>
                <p style="margin:4px 0 0 0;font-size:22px;font-weight:600;color:${tone.fg};">${score_avg}</p>
              </td>
              <td style="padding:12px;text-align:center;">
                <p style="margin:0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.06em;">Max</p>
                <p style="margin:4px 0 0 0;font-size:22px;font-weight:600;color:${TEXT_COLOR};">${score_max}</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Breakdown -->
        <tr><td style="background-color:#ffffff;padding:0 32px 32px 32px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};">
          <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:${TEXT_COLOR};">
            Breakdown by axis
          </p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            ${breakdownRows}
          </table>
          <p style="margin:14px 0 0 0;font-size:11px;color:${TEXT_MUTED};line-height:1.5;">
            Period covered: ${escape(period_start)} to ${escape(period_end)}. Generated on ${escape(new Date().toISOString().slice(0, 10))}.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#ffffff;padding:24px 32px;border-top:1px solid ${BORDER_LIGHT};border-radius:0 0 12px 12px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};border-bottom:1px solid ${BORDER_LIGHT};">
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            <tr>
              <td style="vertical-align:middle;">
                ${supportLine}
                ${
                  trustUrl
                    ? `<p style="margin:8px 0 0 0;font-size:12px;color:${TEXT_COLOR};">
                         Verify this score live at
                         <a href="${escape(trustUrl)}" style="color:${BRAND_COLOR};font-weight:600;">${escape(trustUrl.replace(/^https?:\/\//, ''))}</a>
                       </p>`
                    : ''
                }
              </td>
              ${
                qrImg
                  ? `<td style="vertical-align:middle;text-align:right;padding-left:16px;width:120px;">
                       <img src="${escape(qrImg)}" alt="Trust URL QR code" width="96" height="96" style="display:block;border:1px solid ${BORDER_LIGHT};border-radius:6px;padding:4px;background:#ffffff;" />
                     </td>`
                  : ''
              }
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:11px;color:${TEXT_MUTED};text-align:center;">
            Powered by <span style="color:${BRAND_COLOR_DARK};font-weight:600;">Haumea</span> &mdash; Facilities Management Platform
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

interface RenderArtifact {
  htmlPath: string
  pdfPath: string | null
  pdfError: string | null
}

/**
 * Save HTML always, attempt binary PDF render via Browserless when the
 * token is present. Returns the storage paths it persisted (the row
 * stores the path; signed URLs are minted on read).
 */
async function renderAndUpload(
  supabase: ReturnType<typeof createClient>,
  org: OrgRow,
  period_start: string,
  html: string,
): Promise<RenderArtifact> {
  const baseKey = `${org.id}/${period_start}`
  const htmlPath = `${baseKey}.html`
  const pdfPath = `${baseKey}.pdf`

  // 1) HTML — always saved, regardless of PDF success. Mirrors the
  //    generate-certificate two-path design.
  const { error: htmlErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(htmlPath, new Blob([html], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: true,
    })
  if (htmlErr) {
    throw new Error(`HTML upload failed: ${htmlErr.message}`)
  }

  // 2) PDF — only when the Browserless token is set. Failures here are
  //    non-fatal: we surface them in pdfError and the row falls back to
  //    HTML-only.
  if (!BROWSERLESS_TOKEN) {
    return { htmlPath, pdfPath: null, pdfError: null }
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
            margin: {
              top: '16mm',
              right: '16mm',
              bottom: '16mm',
              left: '16mm',
            },
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
    return { htmlPath, pdfPath, pdfError: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[generate-statement-of-compliance] PDF render failed:', msg)
    return { htmlPath, pdfPath: null, pdfError: msg }
  }
}

/**
 * Send the summary email with (when available) the PDF as a base64
 * attachment. Returns true on a successful Resend POST.
 */
async function sendSummaryEmail(args: {
  supabase: ReturnType<typeof createClient>
  org: OrgRow
  period_start: string
  html: string
  pdfPath: string | null
  scoreAvg: number
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  if (!args.org.support_email) return false

  const periodLabel = formatPeriodLabel(args.period_start)
  const subject = `Statement of Compliance — ${periodLabel} (avg score ${args.scoreAvg}/100)`

  // Pull the PDF bytes back out of storage so we can attach them. The
  // Resend API accepts attachments as { filename, content } where
  // content is a base64-encoded string.
  let attachments: Array<{ filename: string; content: string }> | undefined
  if (args.pdfPath) {
    const { data: pdfBlob, error: dlErr } = await args.supabase.storage
      .from(STORAGE_BUCKET)
      .download(args.pdfPath)
    if (!dlErr && pdfBlob) {
      const buf = new Uint8Array(await pdfBlob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
      const base64 = btoa(bin)
      attachments = [
        {
          filename: `statement-of-compliance-${args.period_start}.pdf`,
          content: base64,
        },
      ]
    }
  }

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [args.org.support_email],
      subject,
      html: args.html,
      ...(attachments ? { attachments } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.warn(
      `[generate-statement-of-compliance] resend ${res.status} for ${args.org.id}:`,
      text.slice(0, 200),
    )
    return false
  }
  return true
}

async function processOrganisation(
  supabase: ReturnType<typeof createClient>,
  org: OrgRow,
  period_start: string,
  period_end: string,
): Promise<PerOrgResult> {
  // 1) Pull the daily snapshots in the period.
  const { data: snapshotsData, error: snapErr } = await supabase
    .from('compliance_score_snapshots')
    .select('snapshot_date, score, breakdown')
    .eq('organisation_id', org.id)
    .gte('snapshot_date', period_start)
    .lte('snapshot_date', period_end)
    .order('snapshot_date', { ascending: true })

  if (snapErr) {
    return {
      organisation_id: org.id,
      status: 'error',
      message: `snapshot query failed: ${snapErr.message}`,
    }
  }

  const snapshots = (snapshotsData ?? []) as SnapshotRow[]
  const agg = aggregateSnapshots(snapshots)
  if (!agg) {
    return {
      organisation_id: org.id,
      status: 'skipped',
      message: 'no snapshots in period',
    }
  }

  // 2) Render HTML + (optionally) PDF and upload.
  const html = buildHtml({
    org,
    period_start,
    period_end,
    score_avg: agg.score_avg,
    score_min: agg.score_min,
    score_max: agg.score_max,
    breakdown_avg: agg.breakdown_avg,
    snapshot_count: snapshots.length,
  })

  let artifact: RenderArtifact
  try {
    artifact = await renderAndUpload(supabase, org, period_start, html)
  } catch (err) {
    return {
      organisation_id: org.id,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  // 3) Email (best-effort) — succeed the row even if email fails.
  let emailSent = false
  try {
    emailSent = await sendSummaryEmail({
      supabase,
      org,
      period_start,
      html,
      pdfPath: artifact.pdfPath,
      scoreAvg: agg.score_avg,
    })
  } catch (err) {
    console.warn(`[generate-statement-of-compliance] email failed for ${org.id}:`, err)
  }

  // 4) Upsert the row. (organisation_id, period_start) is the unique
  //    key — re-runs replace the previous row in-place.
  const { error: upsertErr } = await supabase
    .from('statement_of_compliance')
    .upsert(
      {
        organisation_id: org.id,
        period_start,
        period_end,
        score_avg: agg.score_avg,
        score_min: agg.score_min,
        score_max: agg.score_max,
        breakdown_avg: agg.breakdown_avg,
        pdf_url: artifact.pdfPath ?? artifact.htmlPath,
        email_sent_at: emailSent ? new Date().toISOString() : null,
      },
      { onConflict: 'organisation_id,period_start' },
    )

  if (upsertErr) {
    return {
      organisation_id: org.id,
      status: 'error',
      message: `upsert failed: ${upsertErr.message}`,
      pdf_url: artifact.pdfPath ?? artifact.htmlPath,
      email_sent: emailSent,
    }
  }

  return {
    organisation_id: org.id,
    status: 'generated',
    message: artifact.pdfError
      ? `generated (HTML only — PDF render failed: ${artifact.pdfError})`
      : artifact.pdfPath
        ? 'generated with PDF'
        : 'generated (HTML only — BROWSERLESS_TOKEN unset)',
    pdf_url: artifact.pdfPath ?? artifact.htmlPath,
    email_sent: emailSent,
  }
}

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

  let body: { organisation_id?: string; period_start?: string } = {}
  try {
    body = (await req.json().catch(() => ({}))) as typeof body
  } catch {
    // Empty body is fine — defaults to the cron behaviour.
  }

  // Default period: previous full calendar month.
  const period =
    body.period_start && /^\d{4}-\d{2}-\d{2}$/.test(body.period_start)
      ? (() => {
          const start = new Date(body.period_start + 'T00:00:00Z')
          // Snap to the 1st in case the caller passed a mid-month date.
          start.setUTCDate(1)
          const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
          return {
            period_start: start.toISOString().slice(0, 10),
            period_end: end.toISOString().slice(0, 10),
          }
        })()
      : derivePeriodRange(new Date(), -1)

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller

  let targetOrgId: string | null = body.organisation_id ?? null
  if (caller.kind === 'user') {
    if (targetOrgId && targetOrgId !== caller.organisation_id) {
      return jsonResponse({ error: 'organisation_forbidden' }, 403)
    }
    targetOrgId = caller.organisation_id
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Org list — single org when targeted, all orgs when cron mode.
  let orgs: OrgRow[] = []
  if (targetOrgId) {
    const { data, error } = await admin
      .from('organisations')
      .select(ORG_SELECT)
      .eq('id', targetOrgId)
      .single()
    if (error || !data) {
      return jsonResponse({ error: 'organisation_not_found' }, 404)
    }
    orgs = [data as OrgRow]
  } else {
    const { data, error } = await admin
      .from('organisations')
      .select(ORG_SELECT)
    if (error) {
      return jsonResponse({ error: `org list failed: ${error.message}` }, 500)
    }
    orgs = (data ?? []) as OrgRow[]
  }

  const results: PerOrgResult[] = []
  for (const org of orgs) {
    try {
      const r = await processOrganisation(admin, org, period.period_start, period.period_end)
      results.push(r)
    } catch (err) {
      results.push({
        organisation_id: org.id,
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return jsonResponse({
    period_start: period.period_start,
    period_end: period.period_end,
    organisations_processed: orgs.length,
    pdf_render_mode: BROWSERLESS_TOKEN ? 'browserless' : 'html_only',
    results,
  })
})
