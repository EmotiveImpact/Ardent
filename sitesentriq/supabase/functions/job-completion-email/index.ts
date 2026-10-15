// supabase/functions/job-completion-email/index.ts
//
// Sprint 2 / C1 — Auto-send a branded job-completion email to the
// client when a job transitions to status='completed'.
//
// Why this is its own function (vs. extending send-email's dispatch):
//   send-email is a thin string-template dispatcher. This template
//   needs a service-role read across 5 tables (job, property, client,
//   service_report, job_photos) to assemble the email — pushing that
//   logic to the client would mean either over-fetching for the
//   browser or building an RPC. A dedicated edge function keeps the
//   data load + template + send all on the server with one round-trip
//   from the caller.
//
// Inputs:
//   { job_id: string }
//
// Output:
//   { sent: true, message_id, recipient }
//   { error: 'no_recipient' }   — client has no billing_email or contact
//   { error: 'job_not_found' }
//   { error: 'not_completed' }  — defensive guard if the trigger fires
//                                  before the row settled
//
// Auth model:
//   Called from useUpdateJob's onSuccess when status changes to
//   completed. The caller's JWT is verified, then the job's
//   organisation_id must match the caller's profile organisation. The
//   service-role JWT may still call across organisations for trusted
//   server-side automation.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Haumea <notifications@haumea.com>'
const RESEND_URL = 'https://api.resend.com/emails'

// Brand tokens — kept in sync with send-email/index.ts intentionally
// (same look + feel across all transactional mail).
const BRAND_COLOR = '#08c4ae'
const BRAND_DARK = '#0f1225'
const TEXT_COLOR = '#374151'
const TEXT_MUTED = '#6b7280'
const BORDER_LIGHT = '#e5e7eb'

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

function escape(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

interface JobRow {
  id: string
  organisation_id: string
  property_id: string | null
  title: string
  description: string | null
  status: string
  scheduled_date: string | null
  completed_date: string | null
  properties?: {
    name: string | null
    address: string | null
    client_id: string | null
    clients?: {
      id: string
      name: string | null
      billing_email: string | null
      contact_email: string | null
    } | null
  } | null
}

interface ServiceReportRow {
  id: string
  notes: string | null
  outcome: string | null
  signature_url: string | null
  submitted_at: string
  profiles?: { full_name: string | null } | null
}

interface JobPhotoRow {
  id: string
  file_url: string
  caption: string | null
  photo_type: string | null
}

interface OrgRow {
  id: string
  name: string | null
  support_email: string | null
  support_phone: string | null
}

/**
 * Pick the most appropriate recipient email for the client. We prefer
 * billing_email (set explicitly for finance correspondence) over the
 * generic contact_email. Returns null when neither is set — the caller
 * uses that to short-circuit.
 */
function pickRecipient(job: JobRow): string | null {
  const c = job.properties?.clients
  if (!c) return null
  return (c.billing_email?.trim() || c.contact_email?.trim() || null)
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function outcomeChip(outcome: string | null): string {
  if (!outcome) return ''
  const colourFor: Record<string, { bg: string; fg: string }> = {
    pass: { bg: '#d1fae5', fg: '#065f46' },
    fail: { bg: '#fee2e2', fg: '#991b1b' },
    incomplete: { bg: '#fef3c7', fg: '#92400e' },
    n_a: { bg: '#e5e7eb', fg: '#374151' },
    revisit: { bg: '#fef3c7', fg: '#92400e' },
  }
  const c = colourFor[outcome] ?? { bg: '#e5e7eb', fg: '#374151' }
  return `<span style="display:inline-block;background-color:${c.bg};color:${c.fg};font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;text-transform:uppercase;letter-spacing:0.04em;">${escape(outcome.replace('_', ' '))}</span>`
}

const CERT_TYPE_LABELS: Record<string, string> = {
  fire_alarm: 'Fire & Alarm System',
  emergency_lighting: 'Emergency Lighting',
  fire_extinguisher: 'Fire Extinguisher',
  access_control: 'Access Control',
}

function buildHtml(args: {
  job: JobRow
  org: OrgRow | null
  report: ServiceReportRow | null
  photos: JobPhotoRow[]
  certs: { cert_type: string; outcome: string | null; completed_at: string }[]
}): string {
  const { job, org, report, photos, certs } = args
  const orgName = org?.name ?? 'Your facilities team'
  const propertyName = job.properties?.name ?? 'your site'
  const propertyAddress = job.properties?.address ?? ''
  const clientName = job.properties?.clients?.name ?? ''
  const engineerName = report?.profiles?.full_name ?? null
  const completedAt = formatDate(job.completed_date) || formatDate(new Date().toISOString())

  // Photo strip — render up to 6 thumbnails as a 3-column grid. Beyond
  // that, link to "view all" doesn't quite make sense in email, so we
  // truncate and show a "+N more" badge.
  const visiblePhotos = photos.slice(0, 6)
  const hiddenCount = Math.max(0, photos.length - visiblePhotos.length)
  const photoGrid =
    visiblePhotos.length > 0
      ? `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:8px;">
          <tr>
            ${visiblePhotos
              .map(
                (p) =>
                  `<td width="33%" style="padding:4px;vertical-align:top;">
                    <img src="${escape(p.file_url)}" alt="${escape(p.caption ?? 'Site photo')}" style="display:block;width:100%;height:120px;object-fit:cover;border-radius:6px;border:1px solid ${BORDER_LIGHT};" />
                  </td>`,
              )
              .join('')}
          </tr>
        </table>
        ${hiddenCount > 0 ? `<p style="margin:8px 0 0 0;font-size:12px;color:${TEXT_MUTED};">+ ${hiddenCount} more photo${hiddenCount === 1 ? '' : 's'} on file</p>` : ''}`
      : ''

  // Notes — render the engineer's notes verbatim (preserving newlines)
  // when present.
  const notesBlock = report?.notes
    ? `<p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Engineer notes</p>
       <p style="margin:0;font-size:14px;color:${TEXT_COLOR};white-space:pre-wrap;">${escape(report.notes)}</p>`
    : ''

  // Signature image — only if a real URL is present. Width-capped so a
  // huge canvas-export doesn't blow out the email.
  const signatureBlock = report?.signature_url
    ? `<div style="margin-top:16px;">
         <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Signed off by</p>
         <img src="${escape(report.signature_url)}" alt="Signature" style="display:block;max-width:240px;height:auto;border:1px solid ${BORDER_LIGHT};border-radius:6px;background:#fff;" />
         ${engineerName ? `<p style="margin:6px 0 0 0;font-size:13px;color:${TEXT_COLOR};">${escape(engineerName)}</p>` : ''}
       </div>`
    : engineerName
      ? `<p style="margin:16px 0 0 0;font-size:13px;color:${TEXT_MUTED};">Completed by ${escape(engineerName)}</p>`
      : ''

  // Footer support line — uses the org's support contact when set.
  const supportLine =
    org?.support_email || org?.support_phone
      ? `<p style="margin:8px 0 0 0;font-size:12px;color:${TEXT_MUTED};">
           Questions? ${org.support_email ? `Email <a href="mailto:${escape(org.support_email)}" style="color:${BRAND_COLOR};">${escape(org.support_email)}</a>` : ''}
           ${org.support_email && org.support_phone ? ' or ' : ''}
           ${org.support_phone ? `call <a href="tel:${escape(org.support_phone.replace(/\s+/g, ''))}" style="color:${BRAND_COLOR};">${escape(org.support_phone)}</a>` : ''}
         </p>`
      : ''

  const body = `
    <p style="margin:0 0 16px 0;font-size:16px;color:${TEXT_COLOR};line-height:1.5;">
      Hi${clientName ? ` ${escape(clientName)} team` : ''},
    </p>
    <p style="margin:0 0 16px 0;font-size:14px;color:${TEXT_COLOR};line-height:1.5;">
      We've finished the visit at <strong>${escape(propertyName)}</strong>${propertyAddress ? ` (${escape(propertyAddress)})` : ''} on ${escape(completedAt)}.
      Here's a summary of the work and any photos the engineer captured on site.
    </p>

    <div style="background-color:#f9fafb;border:1px solid ${BORDER_LIGHT};border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Job</p>
      <p style="margin:0 0 12px 0;font-size:15px;font-weight:600;color:${BRAND_DARK};">${escape(job.title)}</p>
      ${job.description ? `<p style="margin:0 0 12px 0;font-size:13px;color:${TEXT_COLOR};white-space:pre-wrap;">${escape(job.description)}</p>` : ''}
      ${report?.outcome ? `<div style="margin-bottom:12px;">${outcomeChip(report.outcome)}</div>` : ''}
      ${notesBlock}
    </div>

    ${
      photoGrid
        ? `<div style="margin:24px 0;">
             <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Site photos</p>
             ${photoGrid}
           </div>`
        : ''
    }

    ${
      certs.length > 0
        ? `<div style="margin:24px 0;">
             <p style="margin:0 0 8px 0;font-size:11px;font-weight:600;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Compliance checks completed</p>
             ${certs
               .map(
                 (c) =>
                   `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid ${BORDER_LIGHT};">
                      <span style="font-size:13px;color:${TEXT_COLOR};">${escape(CERT_TYPE_LABELS[c.cert_type] ?? c.cert_type)}</span>
                      ${outcomeChip(c.outcome)}
                    </div>`,
               )
               .join('')}
           </div>`
        : ''
    }

    ${signatureBlock}

    <hr style="border:none;border-top:1px solid ${BORDER_LIGHT};margin:24px 0;" />

    <p style="margin:0;font-size:13px;color:${TEXT_MUTED};">
      Sent automatically by ${escape(orgName)} when this visit was marked complete.
    </p>
    ${supportLine}
  `

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:${BRAND_DARK};padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">${escape(orgName)}</h1>
          <p style="margin:4px 0 0 0;color:#9ca3af;font-size:13px;">Job completed</p>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};">
          ${body}
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:24px 32px;border-top:1px solid ${BORDER_LIGHT};border-radius:0 0 12px 12px;border-left:1px solid ${BORDER_LIGHT};border-right:1px solid ${BORDER_LIGHT};border-bottom:1px solid ${BORDER_LIGHT};">
          <p style="margin:0;font-size:11px;color:${TEXT_MUTED};text-align:center;">
            Powered by Haumea &mdash; Facilities Management Platform
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  if (!RESEND_API_KEY) {
    return jsonResponse({ error: 'email_unconfigured' }, 503)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller

  let body: { job_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.job_id) {
    return jsonResponse({ error: 'Missing job_id' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1) Job + property + client (the recipient lookup needs all three).
  const { data: jobData, error: jobErr } = await admin
    .from('jobs')
    .select(
      `id, organisation_id, property_id, title, description, status,
       scheduled_date, completed_date,
       properties:property_id (
         name, address, client_id,
         clients:client_id ( id, name, billing_email, contact_email )
       )`,
    )
    .eq('id', body.job_id)
    .single()
  if (jobErr || !jobData) {
    return jsonResponse({ error: 'job_not_found' }, 404)
  }
  const job = jobData as unknown as JobRow

  if (caller.kind !== 'service_role' && job.organisation_id !== caller.organisation_id) {
    return jsonResponse({ error: 'organisation_mismatch' }, 403)
  }

  // Defensive — only fire on completed. If a frontend caller misses
  // the status check we don't want to leak a "completed" email for an
  // in-progress job.
  if (job.status !== 'completed') {
    return jsonResponse({ error: 'not_completed', status: job.status }, 409)
  }

  // Idempotency guard — a job can re-save as 'completed' many times (a notes
  // edit, a photo re-upload, an offline-queue replay, a double update), and the
  // caller fires on any patch with status:'completed', not just the transition.
  // The completion email must go out ONCE, so short-circuit if we already logged
  // a send for this job. (The certificate auto-mint alongside is likewise
  // idempotent — this brings the email in line.)
  const { data: priorSend } = await admin
    .from('timeline_events')
    .select('id')
    .eq('event_type', 'job.completion_email_sent')
    .eq('metadata->>job_id', job.id)
    .limit(1)
  if (priorSend && priorSend.length > 0) {
    return jsonResponse({ sent: false, already_sent: true, job_id: job.id }, 200)
  }

  // 2) Most recent service report for this job (for outcome, notes,
  //    signature, engineer name).
  const { data: reportData } = await admin
    .from('service_reports')
    .select('id, notes, outcome, signature_url, submitted_at, profiles:engineer_id (full_name)')
    .eq('job_id', job.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
  const report = (reportData?.[0] ?? null) as unknown as ServiceReportRow | null

  // 3) All photos linked to the job. Sorted by upload time so the email
  //    grid mirrors the order the engineer captured them.
  const { data: photosData } = await admin
    .from('job_photos')
    .select('id, file_url, caption, photo_type')
    .eq('job_id', job.id)
    .order('uploaded_at', { ascending: true })
  const photosRaw = (photosData ?? []) as JobPhotoRow[]

  // The job-photos + field-signatures buckets are PRIVATE (00059), so the stored
  // public file_url 403s when embedded as an <img src> in the email. Re-sign each
  // path (service role). A data-URL signature (mobile) is left as-is.
  const signUrl = async (bucket: string, url: string | null): Promise<string | null> => {
    if (!url) return null
    if (url.startsWith('data:')) return url // inline data-URL renders directly
    const marker = `/${bucket}/`
    const idx = url.indexOf(marker)
    let path: string | null = null
    if (idx >= 0) path = url.slice(idx + marker.length).split('?')[0]
    else if (!/^https?:\/\//i.test(url)) path = url.split('?')[0] // raw object path (canonical)
    else return url // some other absolute URL — leave as-is
    if (!path) return url
    const { data } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7)
    return data?.signedUrl ?? url
  }
  const photos = await Promise.all(
    photosRaw.map(async (p) => ({ ...p, file_url: (await signUrl('job-photos', p.file_url)) ?? p.file_url })),
  )
  if (report?.signature_url) {
    report.signature_url = (await signUrl('field-signatures', report.signature_url)) ?? report.signature_url
  }

  // 3b) Compliance certificates completed on this visit (V1 #9) — surfaced to
  //     the customer so the completion email reflects the checks carried out.
  const { data: certData } = await admin
    .from('cert_completions')
    .select('cert_type, outcome, completed_at')
    .eq('job_id', job.id)
    .order('completed_at', { ascending: true })
  const certs = (certData ?? []) as { cert_type: string; outcome: string | null; completed_at: string }[]

  // 4) Org row for branding name + support contact.
  const { data: orgData } = await admin
    .from('organisations')
    .select('id, name, support_email, support_phone')
    .eq('id', job.organisation_id)
    .single()
  const org = (orgData ?? null) as OrgRow | null

  // Resolve recipient from the verified job's client only.
  const recipient = pickRecipient(job)
  if (!recipient) {
    return jsonResponse({ error: 'no_recipient', client_id: job.properties?.client_id ?? null }, 200)
  }

  // Build + send.
  const html = buildHtml({ job, org, report, photos, certs })
  const subject = `Visit complete at ${job.properties?.name ?? 'your site'} — ${job.title}`

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [recipient],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[job-completion-email] Resend ${res.status}: ${text.slice(0, 300)}`)
    return jsonResponse({ error: 'resend_failed', status: res.status }, 502)
  }
  const sendResult = (await res.json().catch(() => ({}))) as { id?: string }

  // Best-effort timeline event so the FM team sees it landed in the
  // org log. We don't fail the email send on this — the timeline is
  // reconstructable from the email service if needed.
  try {
    await admin.from('timeline_events').insert({
      organisation_id: job.organisation_id,
      event_type: 'job.completion_email_sent',
      description: `Completion email sent to ${recipient} for job "${job.title}"`,
      property_id: job.property_id,
      client_id: job.properties?.client_id ?? null,
      metadata: {
        job_id: job.id,
        recipient,
        photo_count: photos.length,
        message_id: sendResult.id ?? null,
      },
    })
  } catch (err) {
    console.warn('[job-completion-email] timeline insert failed:', err)
  }

  return jsonResponse({
    sent: true,
    message_id: sendResult.id ?? null,
    recipient,
    photo_count: photos.length,
  })
})
