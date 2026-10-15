-- Job Photos table for before/after/issue/general photos attached to jobs
CREATE TABLE IF NOT EXISTS job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  caption text,
  photo_type text NOT NULL DEFAULT 'general' CHECK (photo_type IN ('before', 'after', 'issue', 'general')),
  uploaded_by uuid REFERENCES profiles(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- Index on job_id for fast lookups
CREATE INDEX idx_job_photos_job_id ON job_photos(job_id);

-- RLS policies (org-scoped)
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view job photos in their organisation"
  ON job_photos FOR SELECT
  USING (organisation_id IN (
    SELECT organisation_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert job photos in their organisation"
  ON job_photos FOR INSERT
  WITH CHECK (organisation_id IN (
    SELECT organisation_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete job photos in their organisation"
  ON job_photos FOR DELETE
  USING (organisation_id IN (
    SELECT organisation_id FROM profiles WHERE id = auth.uid()
  ));
