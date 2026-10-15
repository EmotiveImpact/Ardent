-- ============================================================
-- Migration 00027: Custom Report Builder (Wave 9B)
-- Adds: report_templates, report_runs, report_schedules tables
--       + RLS, indexes, default-template seed function
-- ============================================================

-- ── 1. report_templates ─────────────────────────────────────
-- A saved query definition. `is_org_wide` flips between personal
-- (visible only to creator) and shared (any member of the org).

CREATE TABLE IF NOT EXISTS report_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  dataset             text NOT NULL,           -- e.g. 'jobs', 'compliance_items', 'invoices'
  definition          jsonb NOT NULL DEFAULT '{}'::jsonb,
                                               -- shape: { filters: [...], columns: [...], sort: [...], group: [...] }
  is_org_wide         boolean NOT NULL DEFAULT false,
  is_system           boolean NOT NULL DEFAULT false,   -- pre-built templates
  created_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_org   ON report_templates(organisation_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_owner ON report_templates(created_by_user_id);

CREATE TRIGGER set_report_templates_updated_at
  BEFORE UPDATE ON report_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

-- Personal templates → only owner can see.
-- Org-wide templates → everyone in the org.
-- System templates are seeded with is_org_wide=true.
CREATE POLICY "report_templates_select" ON report_templates FOR SELECT
  USING (
    organisation_id = public.organisation_id()
    AND (is_org_wide OR created_by_user_id = auth.uid())
  );

CREATE POLICY "report_templates_insert" ON report_templates FOR INSERT
  WITH CHECK (
    organisation_id = public.organisation_id()
    AND (created_by_user_id = auth.uid() OR created_by_user_id IS NULL)
  );

CREATE POLICY "report_templates_update" ON report_templates FOR UPDATE
  USING (
    organisation_id = public.organisation_id()
    AND (created_by_user_id = auth.uid() OR is_org_wide)
    AND is_system = false
  );

CREATE POLICY "report_templates_delete" ON report_templates FOR DELETE
  USING (
    organisation_id = public.organisation_id()
    AND created_by_user_id = auth.uid()
    AND is_system = false
  );

-- ── 2. report_runs ──────────────────────────────────────────
-- Audit log of every report execution.

CREATE TABLE IF NOT EXISTS report_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES report_templates(id) ON DELETE SET NULL,
  run_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  format          text NOT NULL CHECK (format IN ('json','csv','pdf','html')),
  row_count       integer DEFAULT 0,
  latency_ms      integer DEFAULT 0,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_runs_org      ON report_runs(organisation_id);
CREATE INDEX IF NOT EXISTS idx_report_runs_template ON report_runs(template_id);

ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_runs_select" ON report_runs FOR SELECT
  USING (organisation_id = public.organisation_id());

CREATE POLICY "report_runs_insert" ON report_runs FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());

-- ── 3. report_schedules ─────────────────────────────────────
-- Cron-driven scheduled exports. The actual execution is wired
-- up in ops via pg_cron + an edge function wrapper — this table
-- is purely the configuration store.

CREATE TABLE IF NOT EXISTS report_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  template_id     uuid NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  frequency       text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  cron            text,                            -- canonical 5-field cron (computed from frequency)
  format          text NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','pdf','html')),
  recipients      text[] NOT NULL DEFAULT '{}',    -- list of email addresses
  enabled         boolean NOT NULL DEFAULT true,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_org      ON report_schedules(organisation_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_template ON report_schedules(template_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON report_schedules(next_run_at) WHERE enabled = true;

CREATE TRIGGER set_report_schedules_updated_at
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_schedules_select" ON report_schedules FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "report_schedules_insert" ON report_schedules FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "report_schedules_update" ON report_schedules FOR UPDATE
  USING (organisation_id = public.organisation_id());
CREATE POLICY "report_schedules_delete" ON report_schedules FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ── 4. Default template seed function ───────────────────────
-- Inserts the 5 pre-built system templates for a given org.
-- Idempotent: skips if a template with the same (org, name, is_system=true)
-- already exists.

CREATE OR REPLACE FUNCTION seed_default_report_templates(p_org_id uuid)
RETURNS void AS $$
DECLARE
  templates jsonb := '[
    {
      "name": "Compliance overdue by client",
      "description": "Every compliance item past its next-due date, grouped by client.",
      "dataset": "compliance_items",
      "definition": {
        "filters": [
          { "field": "status", "operator": "equals", "value": "overdue" }
        ],
        "columns": [
          "name", "compliance_type", "next_due", "status", "property_id"
        ],
        "sort": [
          { "field": "next_due", "direction": "asc" }
        ],
        "group": ["property_id"]
      }
    },
    {
      "name": "Engineer utilisation last 30 days",
      "description": "Jobs completed by engineer in the last 30 days.",
      "dataset": "jobs",
      "definition": {
        "filters": [
          { "field": "status", "operator": "equals", "value": "completed" },
          { "field": "completed_date", "operator": "after", "value": "now-30d" }
        ],
        "columns": [
          "title", "scheduled_date", "completed_date", "status", "priority"
        ],
        "sort": [
          { "field": "completed_date", "direction": "desc" }
        ],
        "group": []
      }
    },
    {
      "name": "Invoice ageing report",
      "description": "Outstanding invoices ordered by due date — oldest first.",
      "dataset": "invoices",
      "definition": {
        "filters": [
          { "field": "status", "operator": "in", "value": "sent,overdue,partially_paid" }
        ],
        "columns": [
          "invoice_number", "client_id", "total", "due_date", "status"
        ],
        "sort": [
          { "field": "due_date", "direction": "asc" }
        ],
        "group": []
      }
    },
    {
      "name": "Job completion rate by category",
      "description": "All jobs in the last 90 days with their completion status.",
      "dataset": "jobs",
      "definition": {
        "filters": [
          { "field": "scheduled_date", "operator": "after", "value": "now-90d" }
        ],
        "columns": [
          "title", "status", "priority", "scheduled_date", "completed_date"
        ],
        "sort": [
          { "field": "scheduled_date", "direction": "desc" }
        ],
        "group": ["status"]
      }
    },
    {
      "name": "PPM due in next 30 days",
      "description": "Maintenance plans with next-due date inside the next 30 days.",
      "dataset": "maintenance_plans",
      "definition": {
        "filters": [
          { "field": "is_active", "operator": "equals", "value": "true" },
          { "field": "next_due", "operator": "before", "value": "now+30d" }
        ],
        "columns": [
          "name", "frequency", "next_due", "last_completed", "is_active"
        ],
        "sort": [
          { "field": "next_due", "direction": "asc" }
        ],
        "group": []
      }
    }
  ]'::jsonb;
  t jsonb;
BEGIN
  FOR t IN SELECT * FROM jsonb_array_elements(templates) LOOP
    INSERT INTO report_templates
      (organisation_id, name, description, dataset, definition, is_org_wide, is_system, created_by_user_id)
    SELECT
      p_org_id,
      t->>'name',
      t->>'description',
      t->>'dataset',
      t->'definition',
      true,
      true,
      NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM report_templates
      WHERE organisation_id = p_org_id
        AND name = t->>'name'
        AND is_system = true
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── 5. Seed defaults for every existing organisation ────────

DO $$
DECLARE
  org_record record;
BEGIN
  FOR org_record IN SELECT id FROM organisations LOOP
    PERFORM seed_default_report_templates(org_record.id);
  END LOOP;
END;
$$;

-- ── 6. Optional: auto-seed on new org creation ──────────────

CREATE OR REPLACE FUNCTION auto_seed_report_templates_for_new_org()
RETURNS trigger AS $$
BEGIN
  PERFORM seed_default_report_templates(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_seed_report_templates ON organisations;
CREATE TRIGGER auto_seed_report_templates
  AFTER INSERT ON organisations
  FOR EACH ROW EXECUTE FUNCTION auto_seed_report_templates_for_new_org();
