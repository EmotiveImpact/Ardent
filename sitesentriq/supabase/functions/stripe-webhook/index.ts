// supabase/functions/stripe-webhook/index.ts
//
// Receives Stripe webhook events and mirrors them into the
// `subscriptions` table. Idempotent via `billing_events.stripe_event_id`.
//
// Deploy:    supabase functions deploy stripe-webhook --no-verify-jwt
//   (must be --no-verify-jwt — Stripe doesn't send a Supabase JWT;
//    we authenticate by verifying the Stripe-Signature header instead.)
//
// Required secrets:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET        (whsec_... from Stripe Dashboard → Developers → Webhooks)
//   SUPABASE_URL                 (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY    (writes bypass RLS)
//
// In the Stripe Dashboard, enable these events on the webhook:
//   - checkout.session.completed
//   - customer.subscription.updated
//   - customer.subscription.deleted
//   - invoice.paid
//   - invoice.payment_failed

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured')
    return new Response('Webhook not configured', { status: 500 })
  }

  const signature = req.headers.get('stripe-signature') ?? ''
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    // Deno requires the async variant — Node's sync version uses crypto.createHmac
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[stripe-webhook] signature verification failed:', msg)
    return new Response(`Webhook signature failed: ${msg}`, { status: 400 })
  }

  const db = admin()

  // ── Idempotency: skip events we've ALREADY processed successfully ──────────
  // The marker is written only AFTER the handler succeeds (below), so its mere
  // presence means "done". Checking it up front lets us short-circuit Stripe's
  // duplicate/redelivered events without re-running the handler.
  try {
    const { data: seen } = await db
      .from('billing_events')
      .select('stripe_event_id')
      .eq('stripe_event_id', event.id)
      .maybeSingle()
    if (seen) {
      return new Response('Already processed', { status: 200 })
    }
  } catch (err) {
    // Non-fatal — fall through and process. Handlers are idempotent, so a
    // missed dedupe at most re-runs idempotent work.
    console.error('[stripe-webhook] idempotency pre-check threw:', err)
  }

  // ── Dispatch FIRST ─────────────────────────────────────────────────────────
  // Handlers are idempotent (subscription upsert, invoice status set), so on a
  // failure we return 500 WITHOUT having written the marker — Stripe retries and
  // the handler genuinely re-runs, instead of being permanently skipped by a
  // marker that was committed before the handler ever succeeded.
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(db, event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(db, event.data.object as Stripe.Subscription)
        break
      case 'invoice.paid':
        await handleInvoicePaid(db, event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(db, event.data.object as Stripe.Invoice)
        break
      default:
        // Unhandled event type — that's fine. We still acknowledge to Stripe.
        console.log(`[stripe-webhook] unhandled event: ${event.type}`)
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler "${event.type}" failed:`, err)
    return new Response('Handler error', { status: 500 })
  }

  // ── Record the event AFTER successful handling (audit + replay skip) ────────
  try {
    const { error: insertErr } = await db
      .from('billing_events')
      .insert({
        stripe_event_id: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
        organisation_id: extractOrgId(event),
      })
    // 23505 = a concurrent delivery already recorded it — harmless, the work is
    // done. Any other error is non-fatal here: the handler already succeeded, so
    // we acknowledge to Stripe rather than force a re-run.
    if (insertErr && (insertErr as { code?: string }).code !== '23505') {
      console.error('[stripe-webhook] billing_events insert failed (handled OK):', insertErr.message)
    }
  } catch (err) {
    console.error('[stripe-webhook] billing_events insert threw (handled OK):', err)
  }

  return new Response('ok', { status: 200 })
})

// ── Handlers ───────────────────────────────────────────────

async function handleCheckoutCompleted(db: SupabaseClient, session: Stripe.Checkout.Session) {
  const orgId = (session.client_reference_id ?? session.metadata?.organisation_id) as string | null
  const subscriptionId = session.subscription as string | null
  const customerId = session.customer as string | null

  if (!orgId) {
    console.warn('[stripe-webhook] checkout.session.completed without orgId — ignoring')
    return
  }
  if (!subscriptionId) {
    console.warn('[stripe-webhook] checkout.session.completed without subscription — ignoring')
    return
  }

  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  await upsertSubscription(db, orgId, customerId, sub, session.metadata?.plan as string | undefined)
}

async function handleSubscriptionChange(db: SupabaseClient, sub: Stripe.Subscription) {
  const orgId =
    (sub.metadata?.organisation_id as string | undefined) ??
    (await orgIdFromCustomer(db, sub.customer as string))
  if (!orgId) {
    console.warn('[stripe-webhook] subscription change without orgId — ignoring')
    return
  }
  await upsertSubscription(db, orgId, sub.customer as string, sub, sub.metadata?.plan as string | undefined)
}

async function handleInvoicePaid(db: SupabaseClient, invoice: Stripe.Invoice) {
  // Mark the org as 'active' on first paid invoice (in case the subscription
  // event hasn't arrived yet). Idempotent by design.
  const customerId = invoice.customer as string | null
  if (!customerId) return
  const orgId = await orgIdFromCustomer(db, customerId)
  if (!orgId) return
  // Only promote from a state that a payment legitimately resolves. Stripe
  // delivers events out of order and bills trailing prorations/one-offs against
  // the same customer after a cancellation — an unqualified update here
  // resurrected cancelled orgs to 'active' indefinitely. Deliberately excludes
  // 'canceled' and 'incomplete_expired'.
  const { error } = await db
    .from('subscriptions')
    .update({ status: 'active' })
    .eq('organisation_id', orgId)
    .in('status', ['past_due', 'unpaid', 'incomplete', 'trialing', 'active'])
  if (error) {
    console.error('[stripe-webhook] paid subscription update failed:', error.message)
    throw error
  }
}

async function handlePaymentFailed(db: SupabaseClient, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string | null
  if (!customerId) return
  const orgId = await orgIdFromCustomer(db, customerId)
  if (!orgId) return

  const { error: updateErr } = await db
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('organisation_id', orgId)
    // A delayed failure for a trailing invoice must not overwrite a later
    // cancellation/deletion event and reopen access as merely past-due.
    .in('status', ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])
  if (updateErr) {
    console.error('[stripe-webhook] past_due subscription update failed:', updateErr.message)
    throw updateErr
  }

  // Notify org admins so they actually do something about it.
  try {
    const { data: admins } = await db
      .from('profiles')
      .select('id')
      .eq('organisation_id', orgId)
      .in('role', ['org_admin', 'super_admin'])

    if (admins && admins.length > 0) {
      const rows = admins.map((a: { id: string }) => ({
        user_id: a.id,
        organisation_id: orgId,
        notification_type: 'invoice_overdue',
        title: 'Payment failed',
        message: 'We could not process your latest billing payment. Please update your card to avoid service interruption.',
        link: '/dashboard/settings/billing',
        read: false,
      }))
      await db.from('notifications').insert(rows)
    }
  } catch (err) {
    // Notifications are best-effort.
    console.warn('[stripe-webhook] failed to write past_due notifications:', err)
  }
}

// ── Shared helpers ─────────────────────────────────────────

async function upsertSubscription(
  db: SupabaseClient,
  orgId: string,
  customerId: string | null,
  sub: Stripe.Subscription,
  planFromMeta?: string,
) {
  const seats =
    Number(sub.metadata?.seats ?? sub.items?.data?.[0]?.quantity ?? 1) || 1
  const plan =
    planFromMeta ??
    (sub.metadata?.plan as string | undefined) ??
    inferPlanFromPrice(sub.items?.data?.[0]?.price?.id ?? null)

  const row = {
    organisation_id: orgId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan: plan ?? 'starter',
    status: sub.status,
    seats,
    current_period_start: tsToIso(sub.current_period_start),
    current_period_end: tsToIso(sub.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    trial_ends_at: tsToIso(sub.trial_end),
  }

  const { error } = await db.from('subscriptions').upsert(row, { onConflict: 'organisation_id' })
  if (error) {
    console.error('[stripe-webhook] subscriptions upsert failed:', error.message)
    throw error
  }
}

function inferPlanFromPrice(priceId: string | null): string | null {
  if (!priceId) return null
  if (priceId === Deno.env.get('STRIPE_PRICE_STARTER')) return 'starter'
  if (priceId === Deno.env.get('STRIPE_PRICE_GROWTH')) return 'growth'
  return null
}

function tsToIso(unix: number | null | undefined): string | null {
  if (!unix) return null
  return new Date(unix * 1000).toISOString()
}

async function orgIdFromCustomer(db: SupabaseClient, customerId: string): Promise<string | null> {
  const { data, error } = await db
    .from('subscriptions')
    .select('organisation_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  // Returning null on a database failure marks the Stripe event handled and
  // permanently suppresses its retry. Only a genuine no-row result is null.
  if (error) {
    console.error('[stripe-webhook] customer organisation lookup failed:', error.message)
    throw error
  }
  return (data?.organisation_id as string | null) ?? null
}

function extractOrgId(event: Stripe.Event): string | null {
  const obj = event.data.object as { metadata?: Record<string, string>; client_reference_id?: string | null }
  return (obj.metadata?.organisation_id ?? obj.client_reference_id) ?? null
}
