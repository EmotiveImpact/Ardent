-- =============================================================================
-- 00031_import_runs.sql — Bulk CSV import audit trail (Wave 11 / Task 106)
-- =============================================================================
-- Records every bulk-import attempt for auditability + the "X imported lifetime"
-- stat surfaced on the entity-pick step of the import wizard.

CREATE TABLE IF NOT EXISTS import_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL CHECK (entity_type IN (
                        'clients', 'properties', 'assets', 'engineers', 'compliance_items'
                      )),
  started_by_user_id  UUID REFERENCES auth.users(id),
  source_filename     TEXT,
  total_rows          INT NOT NULL DEFAULT 0,
  inserted_rows       INT NOT NULL DEFAULT 0,
  skipped_rows        INT NOT NULL DEFAULT 0,
  error_rows          INT NOT NULL DEFAULT 0,
  errors_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'failed')),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_import_runs_org ON import_runs(organisation_id);
CREATE INDEX IF NOT EXISTS idx_import_runs_org_entity ON import_runs(organisation_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_import_runs_started_at ON import_runs(started_at DESC);

ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;

-- Org members can read import runs for their org
DROP POLICY IF EXISTS import_runs_select ON import_runs;
CREATE POLICY import_runs_select ON import_runs
  FOR SELECT
  USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only org_admins / super_admins can insert
DROP POLICY IF EXISTS import_runs_insert ON import_runs;
CREATE POLICY import_runs_insert ON import_runs
  FOR INSERT
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM profiles
      WHERE id = auth.uid() AND role IN ('org_admin', 'super_admin')
    )
  );

-- Same admins can update (to mark completed/failed)
DROP POLICY IF EXISTS import_runs_update ON import_runs;
CREATE POLICY import_runs_update ON import_runs
  FOR UPDATE
  USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles
      WHERE id = auth.uid() AND role IN ('org_admin', 'super_admin')
    )
  );

COMMENT ON TABLE import_runs IS 'Audit trail for bulk CSV imports (Wave 11 / Task 106).';
