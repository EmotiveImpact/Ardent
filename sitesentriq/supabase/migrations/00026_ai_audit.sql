-- ============================================================
-- Migration 00026: AI audit log + per-org usage quotas
-- Wave 9 — Builder 9A (Facilities OS)
-- DO NOT RUN automatically; apply via `supabase db push`
-- ============================================================
--
-- This migration introduces:
--
--   1. `ai_audit_log` — append-only record of every LLM call the
--      app makes on a user's behalf. Captures the prompt, the raw
--      response, token counts, latency, and the feature that
--      triggered the call. Used by:
--        - the AI suggester UI (links a compliance row to its
--          original suggestion via `ai_audit_log_id` in metadata)
--        - the (future) Wave-10 "AI usage" settings page that will
--          surface monthly token spend per organisation
--
--   2. `ai_usage_quotas` — per-org monthly soft cap so a noisy
--      tenant cannot blow through the Anthropic budget on the
--      shared API key. The edge function checks `current_month_used`
--      against `monthly_limit` before calling Anthropic and increments
--      after a successful response.
--
--   3. A small jsonb metadata column on `compliance_items` so the
--      detail page can show the "AI assisted" chip + tooltip without
--      schema migrations every time we add a new AI-touched field.
--
-- All tables are RLS-bound. Service-role writes (via the edge
-- function) bypass RLS as usual.
-- ============================================================

-- ── 1. ai_audit_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- Stable feature identifier — e.g. 'compliance-suggest'. Future
  -- AI features (Wave 10+) reuse this same table with their own
  -- feature key.
  feature         text NOT NULL,
  -- Anthropic model id, recorded so future tuning can A/B compare.
  -- e.g. 'claude-haiku-4-5-20251001'.
  model           text NOT NULL,
  -- Raw text we sent (system + user concatenated for inspection).
  prompt          text NOT NULL,
  -- Raw text we received. Null if the call errored before a body.
  response        text,
  tokens_input    int,
  tokens_output   int,
  latency_ms      int,
  -- Populated when Anthropic returned an error or we couldn't
  -- parse the response — null on a clean success.
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_log_org_created
  ON ai_audit_log (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_user_created
  ON ai_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_feature
  ON ai_audit_log (feature);

ALTER TABLE ai_audit_log ENABLE ROW LEVEL SECURITY;

-- Org admins / super_admins / auditors can read every row in
-- their org. Used by the future "AI usage" settings page.
CREATE POLICY "ai_audit_log_select_admin"
  ON ai_audit_log
  FOR SELECT
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin', 'auditor')
    )
  );

-- Any user can read their own audit entries — needed for the
-- detail-page tooltip that shows "your AI suggestion was X".
CREATE POLICY "ai_audit_log_select_own"
  ON ai_audit_log
  FOR SELECT
  USING (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies — only the service role
-- (edge function) writes. Append-only.

-- ── 2. ai_usage_quotas ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_quotas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  feature             text NOT NULL,
  -- Monthly cap on number of AI calls per org per feature.
  -- Default 1 000 is generous for the compliance-suggester case
  -- (typical org will create <50 compliance items per month).
  monthly_limit       int NOT NULL DEFAULT 1000,
  current_month_used  int NOT NULL DEFAULT 0,
  -- When the rolling counter was last reset to 0 (start of month).
  reset_at            timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_quotas_org_feature
  ON ai_usage_quotas (organisation_id, feature);

ALTER TABLE ai_usage_quotas ENABLE ROW LEVEL SECURITY;

-- Admins / auditors can read their org's quota row.
CREATE POLICY "ai_usage_quotas_select_admin"
  ON ai_usage_quotas
  FOR SELECT
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin', 'auditor')
    )
  );

-- No INSERT / UPDATE / DELETE policies — service role manages
-- counters from the edge function.

CREATE TRIGGER set_ai_usage_quotas_updated_at
  BEFORE UPDATE ON ai_usage_quotas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 3. compliance_items.metadata ────────────────────────────
-- Generic jsonb bag so we can flag AI-suggested rows + link back
-- to their `ai_audit_log` entry without one column per AI feature.
-- Existing readers ignore the field; the detail page checks for
--   metadata->>'is_ai_suggested' = 'true'
-- and renders the "AI assisted" chip.
ALTER TABLE compliance_items
  ADD COLUMN IF NOT EXISTS metadata jsonb;

CREATE INDEX IF NOT EXISTS idx_compliance_items_metadata
  ON compliance_items USING gin (metadata);

COMMENT ON COLUMN compliance_items.metadata IS
  'Free-form jsonb. Reserved keys: is_ai_suggested (bool), ai_audit_log_id (uuid → ai_audit_log.id), ai_confidence (number), ai_reasoning (text).';

COMMENT ON TABLE ai_audit_log IS
  'Append-only LLM call log. Written by edge functions via service role. Read by the dashboard tooltip on AI-suggested rows and the future AI-usage settings page.';

COMMENT ON TABLE ai_usage_quotas IS
  'Per-org monthly cap on LLM calls. Counters are bumped + reset by the AI edge functions; the UI surfaces monthly_limit / current_month_used.';
