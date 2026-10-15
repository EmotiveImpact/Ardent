// supabase/functions/run-scheduled-reports/index.ts
//
// Cron-invoked executor for saved report schedules (report_schedules). Finds due
// schedules, generates each report via the run-report function (service-role,
// org-scoped), emails it to the recipients via Resend (CSV attached / HTML
// inline), then stamps last_run_at and advances next_run_at by the cadence.
//
// Invoked by pg_cron (see migration 00113) with the service-role key. Manual
// invocation: POST {} with the service-role bearer.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Haumea <notifications@haumea.com>'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Decode the caller's JWT role so we can restrict this cross-org cron sweep to
// the scheduler (service_role). Mirrors notify-renewals / weekly-digest.
// verify_jwt alone is NOT enough: the anon key shipped in the browser bundle is
// a validly-signed project JWT, as is any logged-in user's token.
function jwtRole(req: Request): string | null {
  const jwt = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!jwt) return null
  const [, payload] = jwt.split('.')
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const claims = JSON.parse(atob(padded)) as Record<string, unknown>
    return typeof claims.role === 'string' ? claims.role : null
  } catch {
    return null
  }
}

function isEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !/[\r\n<>]/.test(v)
}

// Advance from a base date by the cadence. Postgres-style month clamp via Date.
function advance(from: Date, frequency: string): Date {
  const d = new Date(from)
  switch ((frequency || '').toLowerCase()) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1)
      break
    case 'monthly': {
      const day = d.getUTCDate()
      d.setUTCMonth(d.getUTCMonth() + 1)
      if (d.getUTCDate() !== day) d.setUTCDate(0) // clamp month-end
      break
    }
    case 'weekly':
    default:
      d.setUTCDate(d.getUTCDate() + 7)
      break
  }
  return d
}

function toBase64Utf8(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

interface ScheduleRow {
  id: string
  organisation_id: string
  template_id: string | null
  frequency: string | null
  format: string | null
  recipients: string[] | null
  next_run_at: string | null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'not_configured' }, 500)

  // Cron only. This sweep runs every org's due schedules with the service role
  // (RLS bypassed) and emails the output, so a non-scheduler caller must never
  // reach it.
  if (jwtRole(req) !== 'service_role') {
    return json({ error: 'forbidden' }, 403)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()

  const { data: due, error } = await admin
    .from('report_schedules')
    .select('id, organisation_id, template_id, frequency, format, recipients, next_run_at')
    .eq('enabled', true)
    .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
    .limit(50)
  if (error) return json({ error: 'query_failed', detail: error.message }, 500)

  let ran = 0
  let sent = 0
  let failed = 0
  for (const s of (due ?? []) as ScheduleRow[]) {
    try {
      if (!s.template_id) {
        // Nothing to run — still advance so it doesn't spin every tick.
        await admin.from('report_schedules').update({ last_run_at: nowIso, next_run_at: advance(new Date(nowMs), s.frequency ?? 'weekly').toISOString() }).eq('id', s.id)
        continue
      }
      const recipients = (s.recipients ?? []).filter(isEmail)
      const fmt = s.format === 'pdf' ? 'html' : (s.format || 'csv')

      // Generate the report (service-role + explicit org scope).
      const repRes = await fetch(`${SUPABASE_URL}/functions/v1/run-report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: s.template_id, format: fmt, organisation_id: s.organisation_id }),
      })
      const reportBody = await repRes.text()

      if (repRes.ok && RESEND_API_KEY && recipients.length > 0) {
        const isCsv = (s.format || 'csv') === 'csv'
        const emailBody = isCsv
          ? {
              from: FROM_EMAIL,
              to: recipients,
              subject: 'Your scheduled report',
              html: '<p>Your scheduled report is attached as a CSV.</p>',
              attachments: [{ filename: 'report.csv', content: toBase64Utf8(reportBody) }],
            }
          : {
              from: FROM_EMAIL,
              to: recipients,
              subject: 'Your scheduled report',
              html: reportBody,
            }
        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(emailBody),
        })
        if (mailRes.ok) sent++
        else console.error('[run-scheduled-reports] resend failed:', mailRes.status, await mailRes.text())
      } else if (!repRes.ok) {
        console.error('[run-scheduled-reports] run-report failed:', repRes.status, reportBody.slice(0, 300))
        // Do NOT advance next_run_at on a failed generation — doing so silently
        // consumed the period and the customer's report just never arrived.
        // Leaving it due means the next cron tick retries.
        failed++
        continue
      }

      // Advance the schedule from its planned next_run_at (or now if it had none/
      // is overdue), so cadence stays anchored and never runs twice for one slot.
      const base = s.next_run_at && new Date(s.next_run_at).getTime() > nowMs ? new Date(s.next_run_at) : new Date(nowMs)
      await admin
        .from('report_schedules')
        .update({ last_run_at: nowIso, next_run_at: advance(base, s.frequency ?? 'weekly').toISOString() })
        .eq('id', s.id)
      ran++
    } catch (err) {
      console.error('[run-scheduled-reports] schedule failed:', s.id, err)
      failed++
    }
  }

  // `failed` is surfaced so a monitor can alert on it — previously a run where
  // every report errored still returned a clean ok:true.
  return json({ ok: failed === 0, due: (due ?? []).length, ran, sent, failed })
})
