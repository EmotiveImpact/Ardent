// supabase/functions/stripe-checkout/index.ts
//
// Creates a Stripe Checkout Session for a Facilities OS organisation.
// Deploy with:    supabase functions deploy stripe-checkout
//
// Required secrets (Supabase Dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY
//   STRIPE_PRICE_STARTER         (price ID for the £49/seat plan)
//   STRIPE_PRICE_GROWTH          (price ID for the £99/seat plan)
//   SUPABASE_SERVICE_ROLE_KEY    (for reading/writing the subscriptions row)
//   SUPABASE_URL                 (auto-set in Supabase by default)
//
// Body: { planId: 'starter' | 'growth', seats: number, orgId: string, returnUrl: string }
// Returns: { url: string } where the client should redirect.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const STRIPE_PRICE_STARTER = Deno.env.get('STRIPE_PRICE_STARTER') ?? ''
const STRIPE_PRICE_GROWTH = Deno.env.get('STRIPE_PRICE_GROWTH') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function priceFor(planId: string): string | null {
  if (planId === 'starter') return STRIPE_PRICE_STARTER || null
  if (planId === 'growth') return STRIPE_PRICE_GROWTH || null
  return null
}

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

function isServiceRoleJwt(jwt: string): boolean {
  // The gateway verifies the signature; checking the claim keeps key rotation
  // from breaking legitimate server-to-server calls.
  return decodeJwtPayload(jwt)?.role === 'service_role'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (!STRIPE_SECRET_KEY) {
    console.error('[stripe-checkout] STRIPE_SECRET_KEY not configured')
    return json({ error: 'Billing not configured' }, 500)
  }

  // ── Parse + validate input ─────────────────────────────────
  let body: { planId?: string; seats?: number; orgId?: string; returnUrl?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { planId, seats, orgId, returnUrl } = body
  if (!planId || !orgId || !returnUrl) {
    return json({ error: 'Missing planId, orgId, or returnUrl' }, 400)
  }
  const seatCount = Math.max(1, Math.min(50, Number(seats) || 1))

  const priceId = priceFor(planId)
  if (!priceId) {
    return json({ error: `No Stripe price configured for plan "${planId}"` }, 400)
  }

  // returnUrl is reflected into success_url/cancel_url — only allow http(s) so a
  // javascript:/data: URL can't be reflected back to the browser.
  if (!/^https?:\/\//i.test(String(returnUrl))) {
    return json({ error: 'Invalid returnUrl' }, 400)
  }

  // ── Verify auth + authorise billing access ─────────────────
  // The marketing site hands off to registration; Checkout is invoked only
  // from the authenticated billing settings page. The old best-effort lookup
  // let an anon-key request fall through and bind a session to any body orgId.
  let requestedByUserId: string | null = null
  const token = readBearerToken(req)
  if (!token) return json({ error: 'missing_authorization' }, 401)
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Server not configured' }, 500)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  if (!isServiceRoleJwt(token)) {
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'invalid_authorization' }, 401)

    requestedByUserId = userData.user.id
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('organisation_id, role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profileErr || !profile?.organisation_id || !profile.role) {
      return json({ error: 'profile_organisation_not_found' }, 403)
    }
    if (!['super_admin', 'org_admin'].includes(String(profile.role))) {
      return json({ error: 'forbidden' }, 403)
    }
    if (String(profile.organisation_id) !== orgId) {
      return json({ error: 'organisation_mismatch' }, 403)
    }
  }

  // ── Look up an existing customer id for this org ───────────
  let stripeCustomerId: string | null = null
  const { data: subscription, error: subscriptionErr } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organisation_id', orgId)
    .maybeSingle()
  if (subscriptionErr) {
    console.error('[stripe-checkout] subscription lookup failed:', subscriptionErr.message)
    return json({ error: 'Could not look up customer' }, 500)
  }
  stripeCustomerId = (subscription?.stripe_customer_id as string | null) ?? null

  // ── Create the Checkout Session ────────────────────────────
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: seatCount }],
      client_reference_id: orgId,
      customer: stripeCustomerId ?? undefined,
      // Card-up-front: force card capture even though a trial is attached.
      // Stripe defaults to 'if_required' when a trial exists (which would
      // let a user start the trial with NO card on file); 'always' enforces
      // the "card required up front" model — the trial auto-converts to paid
      // at day 14 on the captured card.
      payment_method_collection: 'always',
      // 14-day trial — matches marketing copy.
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          plan: planId,
          seats: String(seatCount),
          organisation_id: orgId,
          requested_by_user_id: requestedByUserId ?? '',
        },
      },
      metadata: {
        plan: planId,
        seats: String(seatCount),
        organisation_id: orgId,
        requested_by_user_id: requestedByUserId ?? '',
      },
      // Return both success and cancel to the same URL — the page can
      // read query params to show toast / state.
      success_url: `${returnUrl}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}?billing=cancelled`,
      allow_promotion_codes: true,
    })

    return json({ url: session.url }, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Stripe error'
    console.error('[stripe-checkout] Stripe error:', msg)
    return json({ error: msg }, 500)
  }
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
