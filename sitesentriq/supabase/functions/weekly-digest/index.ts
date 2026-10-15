// supabase/functions/weekly-digest/index.ts
// Weekly compliance digest — runs Monday 07:00 UTC via pg_cron, or
// can be invoked ad-hoc with { preview: true, recipient: '...' }.
//
// Deploy:  supabase functions deploy weekly-digest
// Required secrets (Supabase Dashboard > Edge Functions > Secrets):
//   - RESEND_API_KEY
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - APP_URL                (e.g. https://app.facilities-os.com)
//   - DIGEST_FROM_EMAIL      (optional, defaults to 'Facilities OS <reports@facilities-os.com>')

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// ── Env / config ─────────────────────────────────────
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.facilities-os.com'
const FROM_EMAIL =
  Deno.env.get('DIGEST_FROM_EMAIL') ?? 'Facilities OS <reports@facilities-os.com>'

const RESEND_URL = 'https://api.resend.com/emails'

// ── Brand constants ──────────────────────────────────
const BRAND_ORANGE = '#e8772e'
const BRAND_NAVY = '#0d0d15'
const TEXT_BODY = '#374151'
const TEXT_MUTED = '#9ca3af'
const SURFACE_PAGE = '#f8fafc'
const STATUS_OVERDUE = '#ef4444'
const STATUS_DUE_SOON = '#f59e0b'
const STATUS_OK = '#10b981'

// ── Types ────────────────────────────────────────────
type ComplianceRow = {
  id: string
  name: string
  compliance_type: string
  status: string
  next_due: string | null
  property_id: string
  organisation_id: string
  properties: { name: string } | null
}

type ActionRow = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  property_id: string | null
  organisation_id: string
  properties: { name: string } | null
}

type DigestSummary = {
  org: { id: string; name: string }
  week_of: string
  overdue_count: number
  due_soon_count: number
  jobs_completed_count: number
  open_actions_count: number
  compliance_pct: number
  total_compliance: number
  compliant_count: number
  overdue_top: ComplianceRow[]
  due_soon_top: ComplianceRow[]
  actions_top: ActionRow[]
}

type SendResult = { recipient: string; status: 'sent' | 'failed' | 'skipped'; error?: string; id?: string }

// ── Helpers ──────────────────────────────────────────
function escapeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

function weekOfLabel(now = new Date()): string {
  return now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// ── Email rendering ──────────────────────────────────
function renderDigestHtml(s: DigestSummary): string {
  const overdueRows = s.overdue_top
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${TEXT_BODY};">${escapeHtml(r.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${TEXT_MUTED};">${escapeHtml(r.properties?.name ?? '—')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${STATUS_OVERDUE};white-space:nowrap;">${fmtDate(r.next_due)}</td>
      </tr>`
    )
    .join('')

  const dueSoonRows = s.due_soon_top
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${TEXT_BODY};">${escapeHtml(r.name)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${TEXT_MUTED};">${escapeHtml(r.properties?.name ?? '—')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${STATUS_DUE_SOON};white-space:nowrap;">${fmtDate(r.next_due)}</td>
      </tr>`
    )
    .join('')

  const actionsRows = s.actions_top
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${TEXT_BODY};">${escapeHtml(r.title)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${TEXT_MUTED};">${escapeHtml(r.properties?.name ?? '—')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eef2f7;font-size:13px;color:${BRAND_ORANGE};text-transform:uppercase;font-weight:600;letter-spacing:0.04em;">${escapeHtml(r.priority)}</td>
      </tr>`
    )
    .join('')

  const stat = (label: string, value: string | number, color: string) => `
    <td align="center" style="padding:18px 8px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;width:25%;">
      <div style="font-size:12px;color:${TEXT_MUTED};letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">${escapeHtml(label)}</div>
      <div style="font-size:28px;color:${color};font-weight:700;margin-top:6px;line-height:1;">${escapeHtml(String(value))}</div>
    </td>`

  const section = (title: string, body: string) => `
    <h3 style="margin:28px 0 10px;font-size:14px;color:${BRAND_NAVY};text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">${escapeHtml(title)}</h3>
    ${body}`

  const tableWrap = (headers: string[], rowsHtml: string, emptyCopy: string) => {
    if (!rowsHtml.trim()) {
      return `<p style="margin:0;padding:14px 16px;background:#f8fafc;border:1px dashed #e5e7eb;border-radius:8px;font-size:13px;color:${TEXT_MUTED};">${escapeHtml(emptyCopy)}</p>`
    }
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;">
            ${headers
              .map(
                (h) =>
                  `<th align="left" style="padding:10px 12px;font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;font-weight:600;border-bottom:1px solid #e5e7eb;">${escapeHtml(h)}</th>`
              )
              .join('')}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Portfolio Update</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_BODY};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE_PAGE};padding:32px 16px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

        <!-- Header -->
        <tr><td style="background:${BRAND_NAVY};padding:24px 28px;border-radius:14px 14px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Facilities OS</td>
              <td align="right" style="font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.08em;">Weekly Digest</td>
            </tr>
          </table>
        </td></tr>

        <!-- Hero -->
        <tr><td style="background:#ffffff;padding:28px 28px 8px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:${TEXT_MUTED};letter-spacing:0.06em;text-transform:uppercase;font-weight:600;">Week of ${escapeHtml(s.week_of)}</p>
          <h1 style="margin:6px 0 4px;font-size:24px;color:${BRAND_NAVY};letter-spacing:-0.02em;font-weight:700;">Your weekly portfolio update</h1>
          <p style="margin:0;font-size:14px;color:${TEXT_BODY};line-height:1.5;">${escapeHtml(s.org.name)} — here's what's on your plate this week.</p>
        </td></tr>

        <!-- Stat tiles -->
        <tr><td style="background:#ffffff;padding:18px 28px 0;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;">
            <tr>
              ${stat('Overdue', s.overdue_count, STATUS_OVERDUE)}
              ${stat('Due in 7 days', s.due_soon_count, STATUS_DUE_SOON)}
              ${stat('Compliance %', `${s.compliance_pct}%`, STATUS_OK)}
              ${stat('Jobs done', s.jobs_completed_count, BRAND_ORANGE)}
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:8px 28px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          ${section(
            'Overdue compliance',
            tableWrap(['Item', 'Property', 'Was due'], overdueRows, 'Nothing overdue. Excellent work.')
          )}
          ${section(
            'Due in the next 7 days',
            tableWrap(['Item', 'Property', 'Due'], dueSoonRows, 'No upcoming compliance items this week.')
          )}
          ${section(
            'Open high & critical actions',
            tableWrap(['Action', 'Property', 'Priority'], actionsRows, 'No open critical actions — well done.')
          )}

          <div style="margin-top:32px;padding:18px 20px;background:${BRAND_ORANGE};border-radius:10px;text-align:center;">
            <a href="${escapeHtml(APP_URL)}/dashboard" style="display:inline-block;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Open the dashboard &rarr;</a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#ffffff;padding:20px 28px 26px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 14px 14px;">
          <p style="margin:0 0 6px;font-size:12px;color:${TEXT_MUTED};text-align:center;line-height:1.6;">
            You're receiving this because you've subscribed to weekly digests.<br>
            Manage your email preferences in <a href="${escapeHtml(APP_URL)}/dashboard/settings/profile" style="color:${BRAND_ORANGE};text-decoration:none;font-weight:600;">Settings</a>.
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:${TEXT_MUTED};text-align:center;">© Facilities OS</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Aggregation ──────────────────────────────────────
async function buildOrgSummary(
  client: ReturnType<typeof createClient>,
  orgId: string,
  orgName: string
): Promise<DigestSummary> {
  const now = new Date()
  const sevenDays = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()

  // Compliance — fetch all, then partition (table is bounded per org).
  const { data: complianceAll, error: cErr } = await client
    .from('compliance_items')
    .select('id, name, compliance_type, status, next_due, property_id, organisation_id, properties(name)')
    .eq('organisation_id', orgId)
    .order('next_due', { ascending: true })

  if (cErr) console.error('[weekly-digest] compliance query error', cErr.message)

  const compliance = (complianceAll ?? []) as unknown as ComplianceRow[]
  const overdue = compliance.filter((r) => r.status === 'overdue')
  const dueSoon = compliance.filter(
    (r) => r.status !== 'overdue' && r.next_due && r.next_due <= sevenDays && r.next_due >= now.toISOString()
  )
  const compliantCount = compliance.filter((r) => r.status === 'compliant').length
  const total = compliance.length
  const compliancePct = total === 0 ? 100 : Math.round((compliantCount / total) * 100)

  // Jobs completed in last 7 days
  const { count: jobsDone } = await client
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId)
    .eq('status', 'completed')
    .gte('completed_date', sevenDaysAgo)

  // Open high/critical actions
  const { data: actionsAll } = await client
    .from('actions')
    .select('id, title, priority, status, due_date, property_id, organisation_id, properties(name)')
    .eq('organisation_id', orgId)
    .in('status', ['open', 'in_progress'])
    // Section is "Open high & critical actions" — 'critical' is the top-tier
    // priority (00055) and was missing, so the MOST severe open actions never
    // appeared in their own digest section (and open_actions_count under-counted).
    .in('priority', ['critical', 'urgent', 'high'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50)

  const actions = (actionsAll ?? []) as unknown as ActionRow[]

  return {
    org: { id: orgId, name: orgName },
    week_of: weekOfLabel(now),
    overdue_count: overdue.length,
    due_soon_count: dueSoon.length,
    jobs_completed_count: jobsDone ?? 0,
    open_actions_count: actions.length,
    compliance_pct: compliancePct,
    total_compliance: total,
    compliant_count: compliantCount,
    overdue_top: overdue.slice(0, 5),
    due_soon_top: dueSoon.slice(0, 5),
    actions_top: actions.slice(0, 5),
  }
}

// ── Resend send + log ────────────────────────────────
async function sendOne(
  client: ReturnType<typeof createClient>,
  args: { to: string; subject: string; html: string; userId?: string | null; orgId?: string | null }
): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    const result: SendResult = { recipient: args.to, status: 'failed', error: 'RESEND_API_KEY not set' }
    await client.from('email_log').insert({
      user_id: args.userId ?? null,
      organisation_id: args.orgId ?? null,
      recipient: args.to,
      subject: args.subject,
      template: 'weekly_digest',
      status: 'failed',
      error: result.error,
    })
    return result
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [args.to],
        subject: args.subject,
        html: args.html,
      }),
    })
    const data = await res.json().catch(() => ({} as any))

    if (!res.ok) {
      const err = (data && (data.message || data.error)) || `Resend HTTP ${res.status}`
      await client.from('email_log').insert({
        user_id: args.userId ?? null,
        organisation_id: args.orgId ?? null,
        recipient: args.to,
        subject: args.subject,
        template: 'weekly_digest',
        status: 'failed',
        error: String(err),
      })
      return { recipient: args.to, status: 'failed', error: String(err) }
    }

    await client.from('email_log').insert({
      user_id: args.userId ?? null,
      organisation_id: args.orgId ?? null,
      recipient: args.to,
      subject: args.subject,
      template: 'weekly_digest',
      status: 'sent',
      provider_id: data?.id ?? null,
    })

    if (args.userId) {
      await client.from('profiles').update({ last_digest_sent_at: new Date().toISOString() }).eq('id', args.userId)
    }

    return { recipient: args.to, status: 'sent', id: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown send error'
    await client.from('email_log').insert({
      user_id: args.userId ?? null,
      organisation_id: args.orgId ?? null,
      recipient: args.to,
      subject: args.subject,
      template: 'weekly_digest',
      status: 'failed',
      error: message,
    })
    return { recipient: args.to, status: 'failed', error: message }
  }
}

// ── Caller authorization ─────────────────────────────
// Cross-tenant guard (O10): verify_jwt=true means SOME authenticated caller, but
// the preview path used to trust body.orgId + body.recipient blindly while
// reading another org's data with the service role. We now resolve the caller and
// pin preview to their OWN org + email.
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

type CallerContext =
  | { kind: 'service_role' }
  | { kind: 'user'; userId: string; organisation_id: string; role: string; email: string | null }

function readBearerToken(req: Request): string | null {
  const match = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)
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

async function resolveCaller(req: Request): Promise<CallerContext | Response> {
  const jwt = readBearerToken(req)
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'missing_authorization' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
  if (decodeJwtPayload(jwt)?.role === 'service_role') {
    return { kind: 'service_role' }
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'invalid_authorization' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('organisation_id, role')
    .eq('id', userData.user.id)
    .single()
  if (profileErr || !profile?.organisation_id || !profile.role) {
    return new Response(JSON.stringify({ error: 'profile_organisation_not_found' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
  return {
    kind: 'user',
    userId: userData.user.id,
    organisation_id: String(profile.organisation_id),
    role: String(profile.role),
    email: userData.user.email ?? null,
  }
}

// ── Main handler ─────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    )
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Parse body — empty body is fine (cron call).
  let body: { preview?: boolean; recipient?: string; orgId?: string } = {}
  try {
    if (req.method === 'POST') {
      const text = await req.text()
      if (text) body = JSON.parse(text)
    }
  } catch {
    // ignore — treat as cron-style empty payload
  }

  const results: SendResult[] = []

  try {
    // ── Preview mode: send a single preview email ──
    // SECURITY (O10): pin the preview to the CALLER's own org + email. A user may
    // only ever preview their own organisation's digest, sent to their own
    // address — body.orgId / body.recipient are ignored for `user` callers so
    // nobody can exfiltrate another tenant's summary. service_role (cron/admin)
    // callers may still target an explicit org/recipient.
    if (body.preview) {
      const caller = await resolveCaller(req)
      if (caller instanceof Response) return caller

      let orgId: string | null
      let recipient: string | null

      if (caller.kind === 'user') {
        orgId = caller.organisation_id
        recipient = caller.email
        if (!recipient) {
          return new Response(
            JSON.stringify({ error: 'Your account has no email address for the preview' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
          )
        }
      } else {
        // service_role: trust the explicit targets (admin tooling / tests).
        orgId = body.orgId ?? null
        recipient = body.recipient ?? null
        if (!recipient) {
          return new Response(
            JSON.stringify({ error: 'recipient is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
          )
        }
      }

      // Resolve org name + the recipient's profile id (for logging) via service role.
      const { data: targetProfile } = await client
        .from('profiles')
        .select('id, organisation_id, organisations:organisation_id (id, name)')
        .eq('email', recipient)
        .maybeSingle()

      orgId = orgId ?? (targetProfile?.organisation_id as string | undefined) ?? null

      if (!orgId) {
        return new Response(
          JSON.stringify({ error: 'Could not resolve organisation for preview recipient' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
        )
      }

      const orgName =
        ((targetProfile?.organisations as any)?.name as string | undefined) ??
        'Your organisation'

      const summary = await buildOrgSummary(client, orgId, orgName)
      const html = renderDigestHtml(summary)
      const subject = `Your weekly portfolio update — ${summary.week_of}`

      const result = await sendOne(client, {
        to: recipient,
        subject,
        html,
        userId: (targetProfile?.id as string | undefined) ?? null,
        orgId,
      })
      results.push(result)

      return new Response(
        JSON.stringify({
          preview: true,
          sent: result.status === 'sent' ? 1 : 0,
          failed: result.status === 'failed' ? 1 : 0,
          errors: result.status === 'failed' ? [result] : [],
          results,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      )
    }

    // ── Cron / batch mode: every org × every subscribed profile ──
    // Only the cron (service_role) may trigger the org-wide sweep — otherwise any
    // authenticated user could POST {} and blast a digest to the entire user base.
    const batchCaller = await resolveCaller(req)
    if (batchCaller instanceof Response) return batchCaller
    if (batchCaller.kind !== 'service_role') {
      return new Response(
        JSON.stringify({ error: 'forbidden — batch digest is cron-only' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      )
    }

    const { data: orgs } = await client.from('organisations').select('id, name')

    for (const org of orgs ?? []) {
      const summary = await buildOrgSummary(client, org.id as string, org.name as string)
      const html = renderDigestHtml(summary)
      const subject = `Your weekly portfolio update — ${summary.week_of}`

      const { data: subscribers } = await client
        .from('profiles')
        .select('id, email, full_name')
        .eq('organisation_id', org.id)
        .eq('weekly_digest', true)

      for (const sub of subscribers ?? []) {
        const email = sub.email as string | null
        if (!email) {
          results.push({ recipient: '(no email)', status: 'skipped', error: 'profile missing email' })
          continue
        }
        const r = await sendOne(client, {
          to: email,
          subject,
          html,
          userId: sub.id as string,
          orgId: org.id as string,
        })
        results.push(r)
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length
    const failed = results.filter((r) => r.status === 'failed').length
    const skipped = results.filter((r) => r.status === 'skipped').length

    return new Response(
      JSON.stringify({
        sent,
        failed,
        skipped,
        errors: results.filter((r) => r.status === 'failed'),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[weekly-digest] fatal', err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
