// supabase/functions/portal-callout-notify/index.ts
//
// Emails an FM operator's ops staff (org_admin + scheduler) when one of their
// PORTAL CLIENTS raises a call-out. The portal client can't call `send-email`
// directly — that function is locked to internal roles (org_admin/scheduler),
// so a client_admin/tenant_user invoke 403'd and the notification was silently
// dropped (Promise.allSettled fire-and-forget).
//
// Design (secure + simple): delegate authorisation to the EXISTING RLS, exactly
// like sign-tenant-file. The client sends ONLY { job_id }. We re-read that job
// with the CALLER's JWT, so the RESTRICTIVE portal policies prove ownership for
// free:
//   - jobs_client_admin_scope (00096): client_id = my_client_id()
//   - jobs_select_tenant     (00035): property_id = tenant_property_id()
// A client_admin of Client A literally cannot SELECT Client B's job, so a
// cross-client / cross-tenant notification is structurally impossible. The
// recipient set is then resolved SERVER-SIDE from the job's own organisation_id
// (never from the request body), so there is no spam / address-enumeration
// surface. Mail is sent via the service role, which send-email trusts and which
// bypasses ALLOWED_USER_ROLES + recipientBelongsToOrg legitimately — without
// modifying send-email or any guard.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors() } })
}
function bearer(req: Request): string | null {
  const m = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}
// Mirror send-email's recipient validation (reject empty / header-injection /
// non-email) before anything reaches Resend.
function isUsableEmail(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  if (/[\r\n<>]/.test(value)) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
// Strip control chars, cap length, THEN HTML-escape. send-email's
// job_notification template raw-interpolates description/propertyName into HTML,
// and job.title is portal-user-controlled (free-form per the tenant call-out
// insert RLS), so without escaping a client could land live markup / a phishing
// link in every ops-staff inbox. Slice the plain text first so we never cut a
// multi-char entity in half.
function sanitize(value: string, max = 300): string {
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface JobRow {
  id: string
  organisation_id: string | null
  client_id: string | null
  property_id: string | null
  title: string | null
  priority: string | null
  created_via: string | null
  is_callout: boolean | null
  callout_metadata: Record<string, unknown> | null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  // ANON_KEY is required: the ownership reflection MUST read jobs as the
  // authenticated caller. Falling back to the service-role key would read
  // RLS-exempt and hand any job to any caller — fail closed instead.
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return json({ error: 'not_configured' }, 500)

  const jwt = bearer(req)
  if (!jwt) return json({ error: 'missing_authorization' }, 401)

  // Accept ONLY { job_id }. Any 'to' / 'organisation_id' / 'recipients' in the
  // body is ignored — recipients are derived server-side from the job row.
  let body: { job_id?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  const jobId = typeof body.job_id === 'string' ? body.job_id : ''
  if (!jobId) return json({ error: 'invalid_body' }, 400)

  // ── Ownership gate via RLS reflection (caller-scoped read) ──────────────
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: job, error } = await userClient
    .from('jobs')
    .select('id, organisation_id, client_id, property_id, title, priority, created_via, is_callout, callout_metadata')
    .eq('id', jobId)
    .maybeSingle<JobRow>()
  if (error) return json({ error: 'lookup_failed', detail: error.message }, 400)
  // Not visible under RLS → the caller doesn't own it (or it doesn't exist).
  if (!job) return json({ error: 'not_found_or_forbidden' }, 403)
  // Purpose guard — this endpoint only notifies for portal-raised call-outs.
  if (job.created_via !== 'portal' || job.is_callout !== true) {
    return json({ error: 'not_a_portal_callout' }, 403)
  }
  if (!job.organisation_id) return json({ error: 'job_missing_org' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  // ── Idempotency / mailbomb guard ───────────────────────────────────────
  const meta = (job.callout_metadata ?? {}) as Record<string, unknown>
  if (meta.portal_callout_notified === true) {
    return json({ ok: true, skipped: 'already_notified' })
  }

  // ── Recipients: org_admin/scheduler of the JOB's org (server-derived) ───
  const { data: opsStaff } = await admin
    .from('profiles')
    .select('id, email')
    .eq('organisation_id', job.organisation_id)
    .in('role', ['org_admin', 'scheduler'])

  const recipients = (opsStaff ?? [])
    .map((s) => (s as { email?: unknown }).email)
    .filter(isUsableEmail)

  // Property name for the email body (server-side lookup, not from the body).
  const { data: prop } = await admin
    .from('properties')
    .select('name')
    .eq('id', job.property_id)
    .maybeSingle<{ name: string | null }>()

  const isCritical = job.priority === 'urgent' // portal maps "critical" → "urgent"
  const description = sanitize(
    `${isCritical ? 'CRITICAL' : 'New'} portal call-out — ${job.title ?? 'site call-out'}`,
  )

  // Send via the EXISTING send-email function using the service-role JWT
  // (trusted internal caller → bypasses ALLOWED_USER_ROLES + recipientBelongsToOrg).
  let sent = 0
  if (recipients.length > 0) {
    const results = await Promise.allSettled(
      recipients.map((to) =>
        admin.functions.invoke('send-email', {
          body: {
            type: 'job_notification',
            to,
            organisation_id: job.organisation_id,
            data: {
              recipientName: '',
              jobReference: String(job.id).slice(0, 8),
              propertyName: sanitize(prop?.name ?? 'site', 120),
              scheduledDate: new Date().toLocaleDateString('en-GB'),
              description,
            },
          },
        }),
      ),
    )
    sent = results.filter((r) => r.status === 'fulfilled' && !(r.value as { error?: unknown }).error).length
  }

  // Mark notified ONLY when at least one email actually went out — otherwise a
  // transient Resend/edge outage (or an org with no usable ops emails) would
  // permanently mark the job notified and silently drop the call-out, the exact
  // failure this function exists to fix. Sequential re-invokes for the same job
  // then retry until one lands. (A concurrent double-invoke can still double-send
  // — bounded to the job's fixed org_admin/scheduler set — accepted as LOW.)
  if (sent > 0) {
    await admin
      .from('jobs')
      .update({ callout_metadata: { ...meta, portal_callout_notified: true } })
      .eq('id', job.id)
  }

  return json({ ok: true, sent })
})
