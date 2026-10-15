-- ============================================================
-- Auto-Assignment Rules Migration (Builder 8D)
-- Adds rules, log, and engineer location/capacity columns.
-- DO NOT run automatically — apply via supabase migration up.
-- ============================================================

-- =========================
-- 1. engineers — add location, free-form skills, capacity
-- =========================
ALTER TABLE engineers ADD COLUMN IF NOT EXISTS home_postcode TEXT;
ALTER TABLE engineers ADD COLUMN IF NOT EXISTS home_latitude NUMERIC;
ALTER TABLE engineers ADD COLUMN IF NOT EXISTS home_longitude NUMERIC;
ALTER TABLE engineers ADD COLUMN IF NOT EXISTS weekly_capacity_hours INT NOT NULL DEFAULT 40;
-- skills column already exists on engineers (text[]); guarded for older dumps.
ALTER TABLE engineers ADD COLUMN IF NOT EXISTS skills TEXT[];

-- =========================
-- 2. auto_assignment_rules
-- =========================
CREATE TABLE IF NOT EXISTS auto_assignment_rules (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id          UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name                     TEXT NOT NULL,
  category                 TEXT,
  required_accreditations  TEXT[] NOT NULL DEFAULT '{}',
  max_distance_km          INT NOT NULL DEFAULT 80,
  prefer_familiar          BOOLEAN NOT NULL DEFAULT TRUE,
  weight_overrides         JSONB,
  enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id       UUID REFERENCES profiles(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_assignment_rules_org
  ON auto_assignment_rules(organisation_id);
CREATE INDEX IF NOT EXISTS idx_auto_assignment_rules_category
  ON auto_assignment_rules(category);

CREATE TRIGGER set_auto_assignment_rules_updated_at
  BEFORE UPDATE ON auto_assignment_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- 3. auto_assignment_log
-- =========================
CREATE TABLE IF NOT EXISTS auto_assignment_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id              UUID REFERENCES jobs(id) ON DELETE SET NULL,
  mode                TEXT NOT NULL CHECK (mode IN ('suggest','apply')),
  top_engineer_id     UUID REFERENCES engineers(id) ON DELETE SET NULL,
  top_score           INT,
  breakdown           JSONB,
  applied             BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id  UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_assignment_log_org
  ON auto_assignment_log(organisation_id);
CREATE INDEX IF NOT EXISTS idx_auto_assignment_log_job
  ON auto_assignment_log(job_id);
CREATE INDEX IF NOT EXISTS idx_auto_assignment_log_created
  ON auto_assignment_log(created_at);

-- =========================
-- 4. organisation-level toggles (lightweight settings)
-- =========================
CREATE TABLE IF NOT EXISTS auto_assignment_settings (
  organisation_id            UUID PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  auto_assign_on_create      BOOLEAN NOT NULL DEFAULT FALSE,
  notify_on_auto_assign      BOOLEAN NOT NULL DEFAULT TRUE,
  confidence_threshold       INT NOT NULL DEFAULT 70 CHECK (confidence_threshold BETWEEN 30 AND 90),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_auto_assignment_settings_updated_at
  BEFORE UPDATE ON auto_assignment_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- 5. RLS
-- =========================
ALTER TABLE auto_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_assignment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_assignment_settings ENABLE ROW LEVEL SECURITY;

-- Org members may read rules; only org_admins (and super_admins) may write.
CREATE POLICY "auto_assignment_rules_read"
  ON auto_assignment_rules FOR SELECT USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "auto_assignment_rules_write"
  ON auto_assignment_rules FOR ALL USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles
       WHERE id = auth.uid() AND role IN ('org_admin','super_admin')
    )
  );

CREATE POLICY "auto_assignment_log_read"
  ON auto_assignment_log FOR SELECT USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles WHERE id = auth.uid()
    )
  );

-- The edge function uses service role and bypasses RLS for inserts.
CREATE POLICY "auto_assignment_log_write"
  ON auto_assignment_log FOR INSERT WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "auto_assignment_settings_read"
  ON auto_assignment_settings FOR SELECT USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "auto_assignment_settings_write"
  ON auto_assignment_settings FOR ALL USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles
       WHERE id = auth.uid() AND role IN ('org_admin','super_admin')
    )
  );
