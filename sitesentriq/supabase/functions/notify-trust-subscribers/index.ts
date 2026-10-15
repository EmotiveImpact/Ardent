// supabase/functions/notify-trust-subscribers/index.ts
//
// TRUST-URL SUBSCRIPTIONS — daily alert fan-out (cron).
//
// Companion to trust-subscribe. Walks every organisation that has at
// least one watcher and emails subscribers when the org's public
// compliance score has dropped:
//   - threshold subscribers  → alerted when the CURRENT score is below
//                              their threshold (and we haven't already
//                              alerted them at this-or-lower score).
//   - "any drop" subscribers → alerted when the CURRENT score is below
//                              the last score we notified them about
//                              (or, first time, below the previous
//                              snapshot).
//
// Dedup is done inline on the subscription row (last_notified_score /
// last_notified_at) rather than a separate table — one watcher = one
// row, and we only ever alert on a NEW, lower number. A score that
// recovers and dips again re-alerts, which is the desired behaviour for
// an insurer watching for lapses.
//
// Empty-body all-orgs sweep, mirroring notify-renewals:
//   POST /functions/v1/notify-trust-subscribers
//   { dry_run?: boolean }
//
//   200 {
//     orgs_scanned, subscribers_considered, alerts_sent,
//     skipped_no_drop, skipped_already_notified, dry_run
//   }
//   500 { error: string }
//
// Schedule: once daily, shortly AFTER compute-compliance-scores has
// produced the day's snapshot (see report for the recommended cron).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Haumea <notifications@haumea.com>'
const RESEND_URL = 'https://api.resend.com/emails'
const WEB_ORIGIN = Deno.env.get('TRUST_WEB_ORIGIN') ?? 'https://sitesentriq-web.vercel.app'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BRAND_COLOR = '#e8772e'
const BRAND_DARK = '#0d0d15'
const TEXT_COLOR = '#374151'
const TEXT_MUTED = '#9ca3af'
const STATUS_OVERDUE = '#ef4444'

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

interface SubscriptionRow {
  id: string
  organisation_id: string
  email: string
  threshold: number | null
  last_notified_score: number | null
}

interface OrgRow {
  id: string
  name: string
  support_email: string | null
  trust_url_slug: string | null
  trust_url_enabled: boolean
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isUsableEmail(value: string | null | undefined): value is string {
  if (!value) return false
  if (/[\r\n<>]/.test(value)) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background-color:${BRAND_DARK};padding:24px 32px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">SiteSentriq Trust</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          ${content}
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:24px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-align:center;">
            Continuous compliance verification &mdash; SiteSentriq Trust
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function button(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;margin-top:8px;">${text}</a>`
}

function alertEmailHtml(params: {
  orgName: string
  oldScore: number
  newScore: number
  threshold: number | null
  trustUrl: string
  unsubUrl: string
}): string {
  const { orgName, oldScore, newScore, threshold, trustUrl, unsubUrl } = params
  const reason =
    threshold === null
      ? `dropped from <strong>${oldScore}</strong> to <strong>${newScore}</strong>`
      : `fell below your alert threshold of <strong>${threshold}</strong> &mdash; it's now <strong>${newScore}</strong> (was ${oldScore})`
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">Compliance score alert</h2>
    <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
      The public compliance score for <strong>${escapeHtml(orgName)}</strong> has ${reason}.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;padding:16px;margin:16px 0;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Previous</p>
        <p style="margin:0;font-size:22px;font-weight:700;color:${BRAND_DARK};">${oldScore}<span style="font-size:13px;color:${TEXT_MUTED};font-weight:500;">/100</span></p>
      </td><td align="right">
        <p style="margin:0 0 4px;font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.04em;">Now</p>
        <p style="margin:0;font-size:22px;font-weight:700;color:${STATUS_OVERDUE};">${newScore}<span style="font-size:13px;color:${TEXT_MUTED};font-weight:500;">/100</span></p>
      </td></tr>
    </table>
    ${button('View the live score', trustUrl)}
    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      You're receiving this because you subscribed to alerts for ${escapeHtml(orgName)}.
      <a href="${unsubUrl}" style="color:${TEXT_MUTED};">Unsubscribe</a>.
    </p>
  `)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  // Cron-only: cross-org sweep + email fan-out under the service-role key, so
  // restrict to the scheduler (service_role JWT) — not any authenticated user.
  if (jwtRole(req) !== 'service_role') {
    return json({ error: 'forbidden — trust-subscriber sweep is cron-only' }, 403)
  }

  let dryRun = false
  try {
    const b = (await req.json().catch(() => ({}))) as { dry_run?: boolean }
    dryRun = !!b.dry_run
  } catch {
    // optional body — empty = real run.
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Pull every confirmed subscription. The watcher base is small
  //    (insurers + top clients), so a single scan is fine and lets us
  //    group by org in memory.
  const { data: subsData, error: subsErr } = await admin
    .from('trust_subscriptions')
    .select('id, organisation_id, email, threshold, last_notified_score')
    .eq('confirmed', true)
  if (subsErr) {
    console.error('[notify-trust-subscribers] subscriptions lookup failed:', subsErr.message)
    return json({ error: 'subscriptions_lookup_failed' }, 500)
  }
  const subs = (subsData as SubscriptionRow[] | null) ?? []
  if (subs.length === 0) {
    return json({
      orgs_scanned: 0,
      subscribers_considered: 0,
      alerts_sent: 0,
      skipped_no_drop: 0,
      skipped_already_notified: 0,
      dry_run: dryRun,
    })
  }

  // Group subscriptions by org.
  const byOrg = new Map<string, SubscriptionRow[]>()
  for (const s of subs) {
    const list = byOrg.get(s.organisation_id) ?? []
    list.push(s)
    byOrg.set(s.organisation_id, list)
  }
  const orgIds = [...byOrg.keys()]

  // 2. Fetch the orgs (name, sender, slug, enabled flag). We still alert
  //    even if an org has since DISABLED its trust URL — the watcher
  //    subscribed while it was public; we just can't link them to a live
  //    page, so we omit the trust link for disabled orgs.
  const { data: orgsData, error: orgsErr } = await admin
    .from('organisations')
    .select('id, name, support_email, trust_url_slug, trust_url_enabled')
    .in('id', orgIds)
  if (orgsErr) {
    console.error('[notify-trust-subscribers] orgs lookup failed:', orgsErr.message)
    return json({ error: 'orgs_lookup_failed' }, 500)
  }
  const orgMap = new Map<string, OrgRow>()
  for (const o of (orgsData as OrgRow[] | null) ?? []) orgMap.set(o.id, o)

  let alertsSent = 0
  let skippedNoDrop = 0
  let skippedAlreadyNotified = 0
  let subscribersConsidered = 0

  for (const orgId of orgIds) {
    const org = orgMap.get(orgId)
    if (!org) continue
    const orgSubs = byOrg.get(orgId) ?? []

    // Latest two snapshots for this org — current + previous.
    const { data: snaps, error: snapErr } = await admin
      .from('compliance_score_snapshots')
      .select('snapshot_date, score')
      .eq('organisation_id', orgId)
      .order('snapshot_date', { ascending: false })
      .limit(2)
    if (snapErr) {
      console.warn(`[notify-trust-subscribers] snapshot lookup failed for ${orgId}:`, snapErr.message)
      continue
    }
    const rows = (snaps as { snapshot_date: string; score: number }[] | null) ?? []
    if (rows.length === 0) continue
    const current = rows[0].score
    const previous = rows.length > 1 ? rows[1].score : null

    const slug = org.trust_url_slug ?? ''
    const trustUrl =
      org.trust_url_enabled && slug
        ? `${WEB_ORIGIN}/trust/${encodeURIComponent(slug.toLowerCase())}`
        : WEB_ORIGIN
    const fromAddress = isUsableEmail(org.support_email)
      ? `${(org.name || 'SiteSentriq Trust').replace(/["<>\r\n]/g, '').trim()} <${org.support_email}>`
      : FROM_EMAIL

    for (const sub of orgSubs) {
      subscribersConsidered++

      // Baseline = the last score we told this watcher about, falling
      // back to the previous snapshot the first time we evaluate them.
      const baseline = sub.last_notified_score ?? previous ?? current

      let shouldAlert = false
      if (sub.threshold === null) {
        // "Any drop": current must be strictly below the baseline.
        shouldAlert = current < baseline
      } else {
        // Threshold: current must be below the threshold AND this must be
        // new information — i.e. we haven't already notified at a score
        // that was already at-or-below this current number. Re-alert only
        // when it drops FURTHER (or recovers above threshold then dips).
        const breached = current < sub.threshold
        const isNewLow = sub.last_notified_score === null || current < sub.last_notified_score
        shouldAlert = breached && isNewLow
      }

      if (!shouldAlert) {
        // Distinguish "no drop" from "already told them" for the summary.
        if (sub.last_notified_score !== null && current >= sub.last_notified_score) {
          skippedAlreadyNotified++
        } else {
          skippedNoDrop++
        }
        // When the score recovers to or above threshold, clear the
        // dedup marker so a future dip re-alerts cleanly.
        if (
          !dryRun &&
          sub.threshold !== null &&
          current >= sub.threshold &&
          sub.last_notified_score !== null
        ) {
          await admin
            .from('trust_subscriptions')
            .update({ last_notified_score: null, last_notified_at: null })
            .eq('id', sub.id)
        }
        continue
      }

      if (dryRun) {
        alertsSent++
        continue
      }

      // Send the alert (best-effort). We update dedup ONLY on a
      // successful send so a transient Resend failure retries next run.
      let sent = false
      if (RESEND_API_KEY && isUsableEmail(sub.email)) {
        const unsubUrl = `${WEB_ORIGIN}/trust/${encodeURIComponent(
          (slug || '').toLowerCase(),
        )}?unsub=__token__`
        // We don't have the token in this row's select; fetch it lazily
        // only when sending to keep the main scan lean.
        const { data: tokenRow } = await admin
          .from('trust_subscriptions')
          .select('unsubscribe_token')
          .eq('id', sub.id)
          .single()
        const token = (tokenRow as { unsubscribe_token?: string } | null)?.unsubscribe_token ?? ''
        const realUnsubUrl = token
          ? `${WEB_ORIGIN}/trust/${encodeURIComponent((slug || '').toLowerCase())}?unsub=${encodeURIComponent(token)}`
          : unsubUrl
        try {
          const res = await fetch(RESEND_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: fromAddress,
              to: [sub.email],
              subject: `${org.name} compliance score dropped to ${current}/100`,
              html: alertEmailHtml({
                orgName: org.name,
                oldScore: baseline,
                newScore: current,
                threshold: sub.threshold,
                trustUrl,
                unsubUrl: realUnsubUrl,
              }),
            }),
          })
          sent = res.ok
          if (!res.ok) {
            console.warn(`[notify-trust-subscribers] resend ${res.status} for sub ${sub.id}`)
          }
        } catch (err) {
          console.warn(`[notify-trust-subscribers] email failed for sub ${sub.id}:`, err)
        }
      }

      if (sent) {
        alertsSent++
        const { error: updErr } = await admin
          .from('trust_subscriptions')
          .update({ last_notified_score: current, last_notified_at: new Date().toISOString() })
          .eq('id', sub.id)
        if (updErr) {
          console.warn(`[notify-trust-subscribers] dedup update failed for sub ${sub.id}:`, updErr.message)
        }
      }
    }
  }

  return json({
    orgs_scanned: orgIds.length,
    subscribers_considered: subscribersConsidered,
    alerts_sent: alertsSent,
    skipped_no_drop: skippedNoDrop,
    skipped_already_notified: skippedAlreadyNotified,
    dry_run: dryRun,
  })
})
