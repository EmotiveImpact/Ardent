-- 00038_maintenance_plans_schedule_mode.sql — Wave 14.2 / hotfix
--
-- The onboarding wizard step 5 (PPM creation) and the standalone
-- /dashboard/maintenance/new form both INSERT schedule_mode and
-- maintenance_type into maintenance_plans, but neither column exists
-- in the live schema. Both forms surface "Could not find the
-- 'schedule_mode' column ... in the schema cache" toasts and fail.
--
-- Adds both columns with sensible defaults so existing rows are valid.

ALTER TABLE maintenance_plans
  ADD COLUMN IF NOT EXISTS schedule_mode text DEFAULT 'fixed'
    CHECK (schedule_mode IN ('fixed', 'rolling'));

ALTER TABLE maintenance_plans
  ADD COLUMN IF NOT EXISTS maintenance_type text DEFAULT 'Service';

COMMENT ON COLUMN maintenance_plans.schedule_mode IS
  'fixed = next_due always = last_completed + frequency (calendar-based). rolling = next_due = today + frequency (rolls forward when completed late).';

COMMENT ON COLUMN maintenance_plans.maintenance_type IS
  'Free-form category label — Service / Inspection / Calibration / Test / Other. Drives the auto-generated job title.';
