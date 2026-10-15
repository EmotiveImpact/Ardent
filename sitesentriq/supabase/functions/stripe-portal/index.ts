// supabase/functions/stripe-portal/index.ts
//
// Generates a Stripe Billing Portal URL for an authenticated org admin.
// Customers click "Manage subscription" and land on Stripe-hosted UI
// where they can change their card, invoices, plan, or cancel.
//
// Deploy:    supabase functions deploy stripe-portal
//
// Required secrets:
//   STRIPE_SECRET_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Body: { orgId: string, returnUrl: string }
// Returns: { url: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type CallerContext =
  | { kind: 'service_role' }
  | { kind: 'user'; organisation_id: string; role: string }

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
  return jwt === SERVICE_ROLE_KEY && decodeJwtPayload(jwt)?.role === 'service_role'
}

async function resolveCallerContext(req: Request): Promise<CallerContext | Response> {
  const jwt = readBearerToken(req)
  if (!jwt) {
    return json({ error: 'missing_authorization' }, 401)
  }

  if (isServiceRoleJwt(jwt)) {
    return { kind: 'service_role' }
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return json({ error: 'invalid_authorization' }, 401)
  }

  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('organisation_id, role')
    .eq('id', userData.user.id)
    .single()

  if (profileErr || !profile?.organisation_id || !profile.role) {
    return json({ error: 'profile_organisation_not_found' }, 403)
  }

  return {
    kind: 'user',
    organisation_id: String(profile.organisation_id),
    role: String(profile.role),
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!STRIPE_SECRET_KEY) return json({ error: 'Billing not configured' }, 500)

  let body: { orgId?: string; returnUrl?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { orgId, returnUrl } = body
  if (!orgId || !returnUrl) return json({ error: 'Missing orgId or returnUrl' }, 400)

  // Look up the customer ID for this org. We don't auto-create here —
  // if there's no Stripe customer yet, the user needs to start a
  // subscription via Checkout first.
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Server not configured' }, 500)
  }

  const caller = await resolveCallerContext(req)
  if (caller instanceof Response) return caller
  if (caller.kind !== 'service_role') {
    // The portal can cancel subscriptions and change payment methods. Tenant
    // membership alone is not enough; mirror the settings:write route guard.
    if (!['super_admin', 'org_admin'].includes(caller.role)) {
      return json({ error: 'forbidden' }, 403)
    }
    if (orgId !== caller.organisation_id) {
      return json({ error: 'organisation_mismatch' }, 403)
    }
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data, error } = await db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organisation_id', orgId)
    .maybeSingle()

  if (error) {
    console.error('[stripe-portal] subscriptions read failed:', error.message)
    return json({ error: 'Could not look up customer' }, 500)
  }

  const customerId = (data?.stripe_customer_id as string | null) ?? null
  if (!customerId) {
    return json(
      { error: 'No active subscription found. Start a subscription first.' },
      404,
    )
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    return json({ url: session.url }, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Stripe error'
    console.error('[stripe-portal] Stripe error:', msg)
    return json({ error: msg }, 500)
  }
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
