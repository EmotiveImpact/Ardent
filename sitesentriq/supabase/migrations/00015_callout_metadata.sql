-- ============================================================
-- Phase 5C: Portal "Raise a Call-Out" Workflow
-- Adds metadata to jobs for distinguishing portal-raised reactive
-- call-outs from internally created jobs.
-- ============================================================

-- Track origin of every job: portal | internal | api
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'internal'
    CHECK (created_via IN ('portal', 'internal', 'api'));

-- Track which user raised the job (especially portal call-outs)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id);

-- Optional client_id on jobs so portal call-outs can be filtered per client
-- (jobs are property-scoped today; the client comes through properties.client_id,
-- but a denormalised column makes the saved-view query trivial).
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);

-- Free-form metadata captured from the portal form: category, on-site
-- contact, best access time, photo URLs.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS callout_metadata jsonb;

-- Expected arrival timestamp set by ops after triage
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS expected_arrival_at timestamptz;

-- Indexes for the "Portal call-outs" saved view query and per-client lookups
CREATE INDEX IF NOT EXISTS idx_jobs_callout_portal_status
  ON jobs (is_callout, created_via, status);

CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs (client_id);

CREATE INDEX IF NOT EXISTS idx_jobs_created_by_user_id
  ON jobs (created_by_user_id);

-- Storage bucket for portal call-out uploads (photos attached by the
-- client when raising the call-out). Private bucket — RLS read in app.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('callout-uploads', 'callout-uploads', false)
ON CONFLICT (id) DO NOTHING;
