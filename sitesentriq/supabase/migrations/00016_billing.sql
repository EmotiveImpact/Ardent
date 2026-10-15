-- ============================================================
-- Migration 00016: Stripe Billing
-- Adds: subscriptions, billing_events
-- Wave 6 — Builder 6B (Facilities OS)
-- DO NOT RUN automatically; apply via `supabase db push`
-- ============================================================

-- ── 1. subscriptions ────────────────────────────────────────
-- One row per organisation. Mirrored from Stripe via webhook.
-- The `stripe_subscription_id` is unique across the platform; it
-- identifies the live Stripe object. `organisation_id` is also
-- unique because we model "one billing entity per org" for now —
-- if/when we move to multi-subscription orgs we'll drop this.

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  -- Plan slug — mirrors src/lib/billing/plans.ts ids
  plan text NOT NULL DEFAULT 'starter',
  -- Stripe subscription status enum (kept loose: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused')
  status text NOT NULL DEFAULT 'trialing',
  seats integer NOT NULL DEFAULT 1,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  trial_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_organisation_id ON subscriptions(organisation_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Auto-touch updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.touch_subscription_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_subscription_updated_at();

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Org admins (any member, but writes happen only via service role) can READ their org row.
CREATE POLICY "subscriptions_select_own_org" ON subscriptions
  FOR SELECT
  USING (organisation_id = public.organisation_id());

-- Note: no INSERT/UPDATE/DELETE policies = blocked for everyone. The
-- webhook function uses the service role which bypasses RLS.

-- ── 2. billing_events ───────────────────────────────────────
-- Idempotency log for the Stripe webhook. We refuse to process
-- the same `stripe_event_id` twice. `payload` keeps a copy of
-- the event JSON for debugging/audit.

CREATE TABLE IF NOT EXISTS billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  stripe_event_id text NOT NULL UNIQUE,
  type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org_id ON billing_events(organisation_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(type);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Org admins read their org's events (useful for "billing history" tab)
CREATE POLICY "billing_events_select_own_org" ON billing_events
  FOR SELECT
  USING (organisation_id = public.organisation_id());

-- ── 3. seed default trial subscription on org creation ──────
-- When a new org is created, seed a 14-day trial row so the UI
-- has something to show before the user touches Stripe.

CREATE OR REPLACE FUNCTION public.seed_org_trial_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO subscriptions (
    organisation_id, plan, status, seats,
    current_period_start, current_period_end, trial_ends_at
  ) VALUES (
    NEW.id, 'starter', 'trialing', 1,
    now(), now() + interval '14 days', now() + interval '14 days'
  )
  ON CONFLICT (organisation_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organisations_seed_trial ON organisations;
CREATE TRIGGER organisations_seed_trial
  AFTER INSERT ON organisations
  FOR EACH ROW EXECUTE FUNCTION public.seed_org_trial_subscription();
