// supabase/functions/trust-subscribe/index.ts
//
// TRUST-URL SUBSCRIPTIONS — public "Watch this score" endpoint.
//
// The Vanta-for-FM bet: let an insurer or top client subscribe to an FM
// operator's public Trust URL and get auto-alerted when the score drops
// below a threshold (or a statutory item lapses → the score falls). This
// is the *subscribe / unsubscribe* surface; the actual alert fan-out
// lives in notify-trust-subscribers.
//
// Same privacy stance as public-trust-score: the SLUG is the only auth
// surface, the service role bypasses RLS, and a disabled / missing org
// 404s (we never leak which slugs exist).
//
// ── Subscribe ────────────────────────────────────────────────────────
//   POST /functions/v1/trust-subscribe
//   { slug: string, email: string, threshold?: number | null }
//
//   200 { ok: true, status: 'subscribed' }
//   400 { error: 'invalid_slug' | 'invalid_email' | 'invalid_threshold' | 'invalid_body' }
//   404 { error: 'org_not_found' }   — slug missing OR trust_url_enabled = false
//   500 { error: 'lookup_failed' | 'subscribe_failed' | 'SUPABASE_NOT_CONFIGURED' }
//
//   - threshold is an int 1–100, or null/omitted for "alert on ANY drop".
//   - Upsert on (organisation_id, email): re-subscribing updates the
//     threshold and re-confirms rather than erroring.
//   - Fires a confirmation email (best-effort; a Resend failure does NOT
//     fail the subscription — the row is the source of truth).
//
// ── Unsubscribe ──────────────────────────────────────────────────────
//   GET  /functions/v1/trust-subscribe?unsub=<token>
//   POST /functions/v1/trust-subscribe  { unsubscribe_token: <token> }
//
//   200 { ok: true, status: 'unsubscribed' }   — idempotent: also 200
//       with status 'not_found' when the token matched nothing, so we
//       don't leak token validity and the UI can always show "done".
//
// The trust page honours the unsubscribe link as
//   https://sitesentriq-web.vercel.app/trust/{slug}?unsub={token}
// — the page detects ?unsub= and POSTs { unsubscribe_token } here.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Haumea <notifications@haumea.com>'
const RESEND_URL = 'https://api.resend.com/emails'

// Public web origin the Trust URL is served from. Used to build the
// unsubscribe link in the confirmation email. Override via env if the
// canonical domain changes.
const WEB_ORIGIN = Deno.env.get('TRUST_WEB_ORIGIN') ?? 'https://sitesentriq-web.vercel.app'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Slug rules — must match public-trust-score + the client validator.
const SLUG_RE = /^[a-z0-9-]{3,32}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Brand constants (mirrors send-email) ─────────────────────────────
const BRAND_COLOR = '#e8772e'
const BRAND_DARK = '#0d0d15'
const TEXT_COLOR = '#374151'
const TEXT_MUTED = '#9ca3af'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

interface OrgRow {
  id: string
  name: string
  support_email: string | null
}

function isUsableEmail(value: string | null | undefined): value is string {
  if (!value) return false
  if (/[\r\n<>]/.test(value)) return false
  return EMAIL_RE.test(value)
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Haumea Trust</h1>
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          ${content}
        </td></tr>
        <tr><td style="background-color:#ffffff;padding:24px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:${TEXT_MUTED};text-align:center;">
            Continuous compliance verification &mdash; Haumea Trust
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

/** Best-effort confirmation email. Never throws — the subscription row is
 *  the source of truth, so a Resend hiccup must not fail the request. */
async function sendConfirmationEmail(params: {
  to: string
  orgName: string
  fromAddress: string
  thresholdLabel: string
  trustUrl: string
  unsubUrl: string
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  const { to, orgName, fromAddress, thresholdLabel, trustUrl, unsubUrl } = params
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:18px;color:${BRAND_DARK};">You're now watching ${escapeHtml(orgName)}</h2>
    <p style="margin:0 0 12px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
      You'll get an email alert whenever <strong>${escapeHtml(orgName)}</strong>'s public
      compliance score ${thresholdLabel}.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
      Scores are computed daily and verified independently by Haumea &mdash;
      the organisation cannot edit the underlying numbers.
    </p>
    ${button('View the live score', trustUrl)}
    <p style="margin:24px 0 0;font-size:12px;color:${TEXT_MUTED};line-height:1.6;">
      Don't want these alerts? <a href="${unsubUrl}" style="color:${TEXT_MUTED};">Unsubscribe</a>.
    </p>
  `)
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: `You're watching ${orgName}'s compliance score`,
        html,
      }),
    })
    if (!res.ok) {
      console.warn('[trust-subscribe] confirmation email Resend error:', res.status)
      return false
    }
    return true
  } catch (err) {
    console.warn('[trust-subscribe] confirmation email failed:', err)
    return false
  }
}

async function handleUnsubscribe(
  admin: ReturnType<typeof createClient>,
  token: string,
): Promise<Response> {
  const clean = token.trim()
  // hex tokens only — cheap guard against junk / injection probes.
  if (!clean || !/^[a-f0-9]{8,128}$/i.test(clean)) {
    return json({ ok: true, status: 'not_found' })
  }
  const { data, error } = await admin
    .from('trust_subscriptions')
    .delete()
    .eq('unsubscribe_token', clean)
    .select('id')
  if (error) {
    console.error('[trust-subscribe] unsubscribe delete failed:', error.message)
    return json({ error: 'unsubscribe_failed' }, 500)
  }
  const removed = Array.isArray(data) && data.length > 0
  return json({ ok: true, status: removed ? 'unsubscribed' : 'not_found' })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_NOT_CONFIGURED' }, 500)
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ── GET ?unsub=<token> — one-click unsubscribe from email links. ──
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const token = url.searchParams.get('unsub')
    if (token) return handleUnsubscribe(admin, token)
    return json({ error: 'method_not_allowed' }, 405)
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  let body: { slug?: unknown; email?: unknown; threshold?: unknown; unsubscribe_token?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  // ── POST { unsubscribe_token } — unsubscribe path. ──
  if (typeof body.unsubscribe_token === 'string' && body.unsubscribe_token.length > 0) {
    return handleUnsubscribe(admin, body.unsubscribe_token)
  }

  // ── POST { slug, email, threshold? } — subscribe path. ──
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  if (!slug || !SLUG_RE.test(slug)) {
    return json({ error: 'invalid_slug' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isUsableEmail(email)) {
    return json({ error: 'invalid_email' }, 400)
  }

  // threshold: null/undefined → "any drop"; otherwise int 1–100.
  let threshold: number | null = null
  if (body.threshold !== undefined && body.threshold !== null && body.threshold !== '') {
    const t = Number(body.threshold)
    if (!Number.isFinite(t) || !Number.isInteger(t) || t < 1 || t > 100) {
      return json({ error: 'invalid_threshold' }, 400)
    }
    threshold = t
  }

  // Org lookup — gated on trust_url_enabled, same privacy stance as
  // public-trust-score. Disabled / missing → 404 (never 401/403).
  const { data: orgData, error: orgErr } = await admin
    .from('organisations')
    .select('id, name, support_email')
    .ilike('trust_url_slug', slug)
    .eq('trust_url_enabled', true)
    .maybeSingle()
  if (orgErr) {
    console.error('[trust-subscribe] org lookup failed:', orgErr.message)
    return json({ error: 'lookup_failed' }, 500)
  }
  if (!orgData) {
    return json({ error: 'org_not_found' }, 404)
  }
  const org = orgData as OrgRow

  // Upsert the subscription. ON CONFLICT (organisation_id, email) we
  // refresh the threshold + confirmed flag rather than erroring, so a
  // re-subscribe is a friendly "update my watch" instead of a 409.
  // We deliberately do NOT touch unsubscribe_token on conflict so the
  // existing token in any already-sent email stays valid.
  const { data: upserted, error: upsertErr } = await admin
    .from('trust_subscriptions')
    .upsert(
      {
        organisation_id: org.id,
        email,
        threshold,
        confirmed: true,
      },
      { onConflict: 'organisation_id,email' },
    )
    .select('unsubscribe_token')
    .single()
  if (upsertErr || !upserted) {
    console.error('[trust-subscribe] upsert failed:', upsertErr?.message)
    return json({ error: 'subscribe_failed' }, 500)
  }
  const token = (upserted as { unsubscribe_token: string }).unsubscribe_token

  // Best-effort confirmation email (the FM org's sender identity when
  // they've set a support_email, else the platform default).
  const fromAddress = isUsableEmail(org.support_email)
    ? `${(org.name || 'Haumea Trust').replace(/["<>\r\n]/g, '').trim()} <${org.support_email}>`
    : FROM_EMAIL
  const trustUrl = `${WEB_ORIGIN}/trust/${encodeURIComponent(slug)}`
  const unsubUrl = `${trustUrl}?unsub=${encodeURIComponent(token)}`
  const thresholdLabel =
    threshold === null
      ? 'drops at all'
      : `falls below ${threshold}/100`

  await sendConfirmationEmail({
    to: email,
    orgName: org.name,
    fromAddress,
    thresholdLabel,
    trustUrl,
    unsubUrl,
  })

  // PII-minimal response — never echo the token or org id.
  return json({ ok: true, status: 'subscribed' })
})
