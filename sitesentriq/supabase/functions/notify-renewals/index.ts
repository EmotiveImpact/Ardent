// supabase/functions/notify-renewals/index.ts
//
// Sprint 2 / C5 — Daily renewal-watch cron. Walks all active
// contracts and drops:
//   1. An in-app notification to every org_admin / scheduler in the
//      contract's owning org
//   2. (When RESEND_API_KEY is configured) a branded email to the
//      org's support_email
//
// for any contract crossing the 60-day, 30-day, 7-day, or 0-day (today)
// threshold. The "0-day" notification IS the "you're now out of
// contract" alert — engineers / FM staff need to know they're
// delivering work outside the agreement.
//
// Deduplication:
//   We don't want to spam the team daily for the same contract that
//   sits in the 60-30 day window. A contract_renewal_notifications
//   table tracks (contract_id, threshold_days, sent_at). Migration
//   00047 adds it. The cron only sends when no row exists for that
//   (contract, threshold) pair.
//
// Schedule:
//   Once per day, mid-morning UK time. Configure via Supabase Dashboard
//   → Database → Cron Jobs (pg_cron):
//     select cron.schedule('notify-renewals', '0 9 * * *',
//       'select net.http_post(url := ''https://<PROJECT>.supabase.co/functions/v1/notify-renewals'', headers := ''{"Authorization": "Bearer <SERVICE_ROLE_JWT>"}''::jsonb)');
//
// Inputs (POST body):
//   { dry_run?: boolean }   — when true, computes work but doesn't
//                              insert notifications or send email.
//                              Used by the integrations health page
//                              to verify the cron is reachable.
//
// Output:
//   { processed, sent_in_app, sent_email, skipped_already_sent }
//   { error: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Haumea <notifications@haumea.com>'
const RESEND_URL = 'https://api.resend.com/emails'

// Days-out values we alert on, in priority order. Each is checked
// against the contract's days_until_end (negative = overdue).
const THRESHOLDS = [0, 7, 30, 60]

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

// Decode the caller's JWT role so we can restrict this cross-org cron sweep to
// the scheduler (service_role). Mirrors weekly-digest / compute-compliance-scores.
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

interface ContractRow {
  id: string
  organisation_id: string
  client_id: string
  end_date: string
  status: string | null
  clients?: { name: string | null } | null
}

interface RecipientRow {
  id: string
  email: string | null
  full_name: string | null
}

interface SentRow {
  contract_id: string
  threshold_days: number
}

/**
 * Match a contract's days_until_end against the THRESHOLDS array.
 * Returns the highest-urgency threshold the contract has crossed but
 * not yet been notified about. Examples (today = 2026-05-09):
 *   end 2026-05-09 (0 days)  → 0
 *   end 2026-05-15 (6 days)  → 7  (crossed 7-day threshold)
 *   end 2026-05-29 (20 days) → 30 (crossed 30-day threshold)
 *   end 2026-06-30 (52 days) → 60
 *   end 2026-08-30 (113 days) → null (no threshold crossed yet)
 *   end 2026-04-01 (-38 days) → 0  (overdue maps to the 0-day "out of contract" alert)
 */
function pickThreshold(daysUntilEnd: number): number | null {
  if (daysUntilEnd < 0) return 0
  for (const t of THRESHOLDS) {
    if (daysUntilEnd <= t) return t
  }
  return null
}

function thresholdLabel(t: number, daysUntilEnd: number): string {
  if (t === 0) {
    if (daysUntilEnd < 0) {
      const abs = Math.abs(daysUntilEnd)
      return `expired ${abs} day${abs === 1 ? '' : 's'} ago`
    }
    return 'expires today'
  }
  return `expires in ${daysUntilEnd} day${daysUntilEnd === 1 ? '' : 's'}`
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  // Cron-only: this performs a CROSS-ORG sweep with the service-role key and
  // emails every org's contacts, so only the scheduler (a service_role JWT) may
  // invoke it — not an arbitrary authenticated user (verify_jwt would otherwise
  // admit any logged-in user). Mirrors weekly-digest / compute-compliance-scores.
  if (jwtRole(req) !== 'service_role') {
    return json({ error: 'forbidden — renewal sweep is cron-only' }, 403)
  }

  let dryRun = false
  try {
    const b = (await req.json().catch(() => ({}))) as { dry_run?: boolean }
    dryRun = !!b.dry_run
  } catch {
    // Body is optional — empty body = real run.
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Pull all in-scope contracts. We over-fetch slightly (everything
  //    ending in the next 90 days plus anything already overdue and
  //    not terminated) and filter to threshold-crossings client-side
  //    so the SQL stays simple.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + 60)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const { data: contracts, error: contractsErr } = await admin
    .from('contracts')
    .select('id, organisation_id, client_id, end_date, status, clients(name)')
    .lte('end_date', cutoffIso)
    .not('status', 'in', '(renewed,terminated,cancelled)')
  if (contractsErr) {
    console.error('[notify-renewals] contracts lookup failed:', contractsErr.message)
    return json({ error: 'contracts_lookup_failed' }, 500)
  }
  if (!contracts || contracts.length === 0) {
    return json({ processed: 0, sent_in_app: 0, sent_email: 0, skipped_already_sent: 0 })
  }

  // 2. Pull the dedup table so we can skip already-sent (contract, threshold) pairs.
  const contractIds = (contracts as ContractRow[]).map((c) => c.id)
  const { data: sentData } = await admin
    .from('contract_renewal_notifications')
    .select('contract_id, threshold_days')
    .in('contract_id', contractIds)
  const alreadySent = new Set<string>(
    ((sentData as SentRow[] | null) ?? []).map((r) => `${r.contract_id}:${r.threshold_days}`),
  )

  let processed = 0
  let sentInApp = 0
  let sentEmail = 0
  let skipped = 0

  for (const c of contracts as ContractRow[]) {
    processed++

    const endMs = new Date(c.end_date).getTime()
    const daysUntilEnd = Math.round((endMs - todayMs) / 86_400_000)
    const threshold = pickThreshold(daysUntilEnd)
    if (threshold === null) continue

    const dedupKey = `${c.id}:${threshold}`
    if (alreadySent.has(dedupKey)) {
      skipped++
      continue
    }

    const clientName = c.clients?.name ?? 'this client'
    const label = thresholdLabel(threshold, daysUntilEnd)
    const title = `Contract renewal: ${clientName} ${label}`
    const message = `The service contract with ${clientName} ${label}. Open it in Haumea to schedule the renewal conversation.`

    if (dryRun) continue

    // 3a. Find org_admin + scheduler recipients.
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('organisation_id', c.organisation_id)
      .in('role', ['org_admin', 'scheduler'])
    const recipients = (profiles as RecipientRow[] | null) ?? []

    // 3b. Drop in-app notifications (one row per recipient).
    if (recipients.length > 0) {
      const rows = recipients.map((r) => ({
        user_id: r.id,
        organisation_id: c.organisation_id,
        notification_type: 'contract_renewal_due',
        title,
        message,
        link: `/dashboard/contracts/${c.id}`,
        read: false,
      }))
      const { error: notifErr } = await admin.from('notifications').insert(rows)
      if (notifErr) {
        console.warn(`[notify-renewals] notification insert failed for ${c.id}:`, notifErr.message)
      } else {
        sentInApp += rows.length
      }
    }

    // 3c. Send a single summary email to the org's support_email, when
    //     configured. This is the "do something about it" prompt
    //     to the FM ops contact, not a per-user email blast.
    if (RESEND_API_KEY) {
      const { data: org } = await admin
        .from('organisations')
        .select('support_email, name')
        .eq('id', c.organisation_id)
        .single()
      const orgEmail = (org as { support_email?: string } | null)?.support_email
      if (orgEmail) {
        try {
          const res = await fetch(RESEND_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [orgEmail],
              subject: title,
              html: `<p>${message}</p><p><a href="https://app.haumea.com/dashboard/contracts/${c.id}">Open contract</a></p>`,
            }),
          })
          if (res.ok) sentEmail++
          else console.warn(`[notify-renewals] resend ${res.status} for ${c.id}`)
        } catch (err) {
          console.warn(`[notify-renewals] email failed for ${c.id}:`, err)
        }
      }
    }

    // 3d. Record the dedup row so the next cron run skips this pair.
    const { error: dedupErr } = await admin
      .from('contract_renewal_notifications')
      .insert({
        contract_id: c.id,
        threshold_days: threshold,
        organisation_id: c.organisation_id,
      })
    if (dedupErr) {
      console.warn(`[notify-renewals] dedup insert failed for ${c.id}:`, dedupErr.message)
    }
  }

  return json({
    processed,
    sent_in_app: sentInApp,
    sent_email: sentEmail,
    skipped_already_sent: skipped,
    dry_run: dryRun,
  })
})
