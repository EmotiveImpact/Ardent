-- ============================================================
-- Migration 00030: SLA Tracking (Wave 10 / Task 105)
-- Adds:
--   - sla_policies                  (per-org response/completion targets)
--   - jobs ALTERS                   (response_target_at, response_at,
--                                    completion_target_at, response_breached,
--                                    completion_breached, sla_policy_id)
--   - seed_default_sla_policies(p_org_id)
--                                   (opt-in seed of 5 sensible UK FM defaults)
--
-- RLS:
--   - org members read their org's policies
--   - org_admin / super_admin manage policies
-- ============================================================

-- ── 1. sla_policies table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS sla_policies (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  applies_to_priority      text,
  -- expected: 'low' | 'medium' | 'high' | 'urgent' | 'critical'
  applies_to_category      text,
  -- nullable; when set, narrows the match further (jobs.category)
  response_minutes         integer NOT NULL,
  completion_minutes       integer NOT NULL,
  business_hours_only      boolean NOT NULL DEFAULT false,
  is_default               boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_org_priority_category
  ON sla_policies (organisation_id, applies_to_priority, applies_to_category);

CREATE INDEX IF NOT EXISTS idx_sla_policies_org_default
  ON sla_policies (organisation_id)
  WHERE is_default = true;

-- ── 2. jobs ALTERS (idempotent) ────────────────────────────

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS response_target_at    timestamptz,
  ADD COLUMN IF NOT EXISTS response_at           timestamptz,
  ADD COLUMN IF NOT EXISTS completion_target_at  timestamptz,
  ADD COLUMN IF NOT EXISTS response_breached     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_breached   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_policy_id         uuid REFERENCES sla_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_response_target ON jobs (response_target_at)
  WHERE response_target_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_completion_target ON jobs (completion_target_at)
  WHERE completion_target_at IS NOT NULL;

-- ── 3. updated_at trigger ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_sla_policy_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sla_policies_touch ON sla_policies;
CREATE TRIGGER sla_policies_touch
  BEFORE UPDATE ON sla_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_sla_policy_updated_at();

-- ── 4. RLS ────────────────────────────────────────────────

ALTER TABLE sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sla_policies_select"
  ON sla_policies FOR SELECT
  USING (organisation_id = public.organisation_id());

CREATE POLICY "sla_policies_insert"
  ON sla_policies FOR INSERT
  WITH CHECK (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('org_admin','super_admin')
    )
  );

CREATE POLICY "sla_policies_update"
  ON sla_policies FOR UPDATE
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('org_admin','super_admin')
    )
  )
  WITH CHECK (organisation_id = public.organisation_id());

CREATE POLICY "sla_policies_delete"
  ON sla_policies FOR DELETE
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid()
         AND role IN ('org_admin','super_admin')
    )
    -- Defensive: prevent deletion of the global "default" policy via API.
    AND is_default = false
  );

-- ── 5. seed_default_sla_policies(p_org_id) helper ─────────
-- NOT auto-invoked. Call from the dashboard (via RPC) when an organisation
-- explicitly wants the starter set of 5 priority-tier policies.

CREATE OR REPLACE FUNCTION public.seed_default_sla_policies(p_org_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  inserted integer;
BEGIN
  WITH ins AS (
    INSERT INTO sla_policies
      (organisation_id, name, applies_to_priority, applies_to_category,
       response_minutes, completion_minutes, business_hours_only, is_default)
    VALUES
      -- Low: 24h response / 72h complete
      (p_org_id, 'Low priority',      'low',      NULL, 1440,  4320, false, false),
      -- Medium: 8h / 48h
      (p_org_id, 'Medium priority',   'medium',   NULL,  480,  2880, false, false),
      -- High: 2h / 24h
      (p_org_id, 'High priority',     'high',     NULL,  120,  1440, false, false),
      -- Urgent: 30min / 8h
      (p_org_id, 'Urgent priority',   'urgent',   NULL,   30,   480, false, false),
      -- Critical: 15min / 4h — also serves as the catch-all default fallback
      (p_org_id, 'Critical priority', 'critical', NULL,   15,   240, false, false),
      -- Catch-all default (no priority match) — Medium-equivalent
      (p_org_id, 'Default fallback',  NULL,       NULL,  480,  2880, false, true)
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO inserted FROM ins;
  RETURN inserted;
END;
$$;
