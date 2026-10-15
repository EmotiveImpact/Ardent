-- ============================================================
-- Engineers & Subcontractors Migration
-- Workforce management tables + job enhancements
-- ============================================================

-- =========================
-- 1. engineers
-- =========================
CREATE TABLE IF NOT EXISTS engineers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  profile_id UUID,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  trade TEXT,
  skills TEXT[],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_engineers_updated_at
  BEFORE UPDATE ON engineers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- 2. engineer_accreditations
-- =========================
CREATE TABLE IF NOT EXISTS engineer_accreditations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id UUID NOT NULL REFERENCES engineers(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL,
  accreditation_type TEXT NOT NULL,
  registration_number TEXT,
  issue_date DATE,
  expiry_date DATE,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'valid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_engineer_accreditations_updated_at
  BEFORE UPDATE ON engineer_accreditations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- 3. engineer_documents
-- =========================
CREATE TABLE IF NOT EXISTS engineer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engineer_id UUID NOT NULL REFERENCES engineers(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  expiry_date DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- 4. subcontractors
-- =========================
CREATE TABLE IF NOT EXISTS subcontractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  trade TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'suspended')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_subcontractors_updated_at
  BEFORE UPDATE ON subcontractors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================
-- 5. subcontractor_documents
-- =========================
CREATE TABLE IF NOT EXISTS subcontractor_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id UUID NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  expiry_date DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================
-- 6. Extend jobs table
-- =========================
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('pass', 'fail', 'incomplete', 'n_a'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_callout BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS engineer_record_id UUID REFERENCES engineers(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS subcontractor_id UUID REFERENCES subcontractors(id);

-- =========================
-- 7. Row Level Security
-- =========================
ALTER TABLE engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineer_accreditations ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage engineers" ON engineers FOR ALL USING (true);
CREATE POLICY "Org members can manage engineer_accreditations" ON engineer_accreditations FOR ALL USING (true);
CREATE POLICY "Org members can manage engineer_documents" ON engineer_documents FOR ALL USING (true);
CREATE POLICY "Org members can manage subcontractors" ON subcontractors FOR ALL USING (true);
CREATE POLICY "Org members can manage subcontractor_documents" ON subcontractor_documents FOR ALL USING (true);

-- =========================
-- 8. Indexes
-- =========================
CREATE INDEX IF NOT EXISTS idx_engineers_org ON engineers(organisation_id);
CREATE INDEX IF NOT EXISTS idx_engineer_accreditations_engineer ON engineer_accreditations(engineer_id);
CREATE INDEX IF NOT EXISTS idx_engineer_documents_engineer ON engineer_documents(engineer_id);
CREATE INDEX IF NOT EXISTS idx_subcontractors_org ON subcontractors(organisation_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_documents_sub ON subcontractor_documents(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_jobs_engineer_record ON jobs(engineer_record_id);
CREATE INDEX IF NOT EXISTS idx_jobs_subcontractor ON jobs(subcontractor_id);
