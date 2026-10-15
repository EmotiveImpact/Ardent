-- ============================================================
-- Migration 00010: Client Feedback Features
-- Adds: SLA priorities, job tasks, notes, travel records,
--        favourites, knowledge base, archives, quote types,
--        routine check types
-- ============================================================

-- ── 1. Jobs table enhancements ──────────────────────────────

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS time_end time;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sla_priority text DEFAULT 'p3';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type text DEFAULT 'reactive';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_out_of_hours boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS routine_check_type text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ── 2. Job Tasks (sub-entity within Jobs) ───────────────────

CREATE TABLE IF NOT EXISTS job_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  description text,
  outcome text,
  visit_details text,
  is_out_of_hours boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_tasks_job_id ON job_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_job_tasks_org_id ON job_tasks(organisation_id);

ALTER TABLE job_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_tasks_select" ON job_tasks FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "job_tasks_insert" ON job_tasks FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "job_tasks_update" ON job_tasks FOR UPDATE
  USING (organisation_id = public.organisation_id());
CREATE POLICY "job_tasks_delete" ON job_tasks FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ── 3. Notes (per-entity notes with user attribution) ───────

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  content text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  user_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_property ON notes(property_id);
CREATE INDEX IF NOT EXISTS idx_notes_asset ON notes(asset_id);
CREATE INDEX IF NOT EXISTS idx_notes_job ON notes(job_id);
CREATE INDEX IF NOT EXISTS idx_notes_client ON notes(client_id);
CREATE INDEX IF NOT EXISTS idx_notes_org ON notes(organisation_id);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select" ON notes FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "notes_insert" ON notes FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "notes_update" ON notes FOR UPDATE
  USING (organisation_id = public.organisation_id());
CREATE POLICY "notes_delete" ON notes FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ── 4. Quotes: add quote_type ───────────────────────────────

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_type text DEFAULT 'reactive';

-- ── 5. Travel Records ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS travel_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id uuid NOT NULL REFERENCES engineers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  from_postcode text,
  to_postcode text,
  distance_miles numeric,
  travel_time_mins integer,
  travel_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_engineer ON travel_records(engineer_id);
CREATE INDEX IF NOT EXISTS idx_travel_org ON travel_records(organisation_id);

ALTER TABLE travel_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "travel_select" ON travel_records FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "travel_insert" ON travel_records FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "travel_update" ON travel_records FOR UPDATE
  USING (organisation_id = public.organisation_id());
CREATE POLICY "travel_delete" ON travel_records FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ── 6. Favourites ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS favourites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_favourites_user ON favourites(user_id);
CREATE INDEX IF NOT EXISTS idx_favourites_org ON favourites(organisation_id);

ALTER TABLE favourites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favourites_select" ON favourites FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "favourites_insert" ON favourites FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "favourites_delete" ON favourites FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ── 7. Knowledge Base ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS kb_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  title text NOT NULL,
  content text NOT NULL,
  category text,
  tags text[],
  author_id uuid REFERENCES auth.users(id),
  author_name text,
  is_published boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_org ON kb_articles(organisation_id);
CREATE INDEX IF NOT EXISTS idx_kb_category ON kb_articles(category);

ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_select" ON kb_articles FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "kb_insert" ON kb_articles FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "kb_update" ON kb_articles FOR UPDATE
  USING (organisation_id = public.organisation_id());
CREATE POLICY "kb_delete" ON kb_articles FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ── 8. Archive support on clients & properties ──────────────

ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived_at timestamptz;
