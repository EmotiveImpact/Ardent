-- ============================================================
-- Migration 00028: Slack Integration (Wave 9 / Builder 9C)
-- Adds:
--   - slack_connections        (one per organisation)
--   - slack_notification_settings (per type per org — 14 rows)
--   - slack_post_log           (audit trail of every Slack post attempt)
--
-- All writes go through the `slack-oauth` and `slack-post-notification`
-- Edge Functions which use the service role key (bypasses RLS).
-- Client policies are read-only against the org scope.
-- ============================================================

-- ── 1. Slack connections ────────────────────────────────────

CREATE TABLE IF NOT EXISTS slack_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL UNIQUE REFERENCES organisations(id) ON DELETE CASCADE,
  slack_team_id text NOT NULL,
  slack_team_name text,
  bot_user_id text,
  access_token text NOT NULL,
  scope text,
  incoming_webhook_url text,
  incoming_webhook_channel text,
  incoming_webhook_channel_id text,
  connected_by_user_id uuid REFERENCES auth.users(id),
  connected_at timestamptz DEFAULT now(),
  last_posted_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slack_connections_org ON slack_connections(organisation_id);

ALTER TABLE slack_connections ENABLE ROW LEVEL SECURITY;

-- Org members can read their own connection. Service role does the writes.
CREATE POLICY "slack_connections_select" ON slack_connections FOR SELECT
  USING (organisation_id = public.organisation_id());

-- ── 2. Per-type notification settings ───────────────────────
-- One row per (org, notification_type). 14 rows seeded automatically
-- when an org first connects (handled in the slack-oauth edge function).

CREATE TABLE IF NOT EXISTS slack_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  -- matches NOTIFICATION_TYPES from src/lib/constants.ts:
  --   compliance_due, compliance_overdue, visit_booked, visit_reminder,
  --   report_uploaded, quote_awaiting_approval, quote_approved, quote_rejected,
  --   invoice_due_soon, invoice_overdue, certificate_expiring, action_overdue,
  --   job_completed, document_uploaded
  enabled boolean NOT NULL DEFAULT true,
  custom_channel text, -- optional override (e.g. "#compliance-alerts")
  severity_threshold text NOT NULL DEFAULT 'info',
  -- 'info' | 'warning' | 'critical' — events with severity below this threshold are skipped
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organisation_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_slack_settings_org ON slack_notification_settings(organisation_id);
CREATE INDEX IF NOT EXISTS idx_slack_settings_type ON slack_notification_settings(notification_type);

ALTER TABLE slack_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_settings_select" ON slack_notification_settings FOR SELECT
  USING (organisation_id = public.organisation_id());

-- Org admins can update their own settings (toggles, channel overrides, thresholds).
CREATE POLICY "slack_settings_update" ON slack_notification_settings FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());

-- ── 3. Post log (audit trail) ───────────────────────────────

CREATE TABLE IF NOT EXISTS slack_post_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  notification_type text,
  status text NOT NULL, -- 'sent' | 'failed' | 'skipped'
  error text,
  slack_message_ts text,
  channel text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slack_log_org ON slack_post_log(organisation_id);
CREATE INDEX IF NOT EXISTS idx_slack_log_created ON slack_post_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slack_log_type ON slack_post_log(notification_type);

ALTER TABLE slack_post_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_post_log_select" ON slack_post_log FOR SELECT
  USING (organisation_id = public.organisation_id());

-- ── 4. Updated_at triggers ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_slack_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS slack_connections_touch ON slack_connections;
CREATE TRIGGER slack_connections_touch
  BEFORE UPDATE ON slack_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_slack_updated_at();

DROP TRIGGER IF EXISTS slack_settings_touch ON slack_notification_settings;
CREATE TRIGGER slack_settings_touch
  BEFORE UPDATE ON slack_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_slack_updated_at();
