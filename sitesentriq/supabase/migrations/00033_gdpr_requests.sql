-- =============================================================================
-- 00033_gdpr_requests.sql — GDPR Data Export + Right-to-be-Forgotten (Wave 12 / Task 108)
-- =============================================================================
-- UK GDPR + Data Protection Act 2018 require any SaaS holding personal data to
-- support (a) Subject Access Request / data portability and (b) erasure.
-- This table records every export and delete request for auditability.

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id       UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  requested_by_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  request_type          TEXT NOT NULL CHECK (request_type IN ('export', 'delete')),
  -- For self-requests, subject_user_id == requested_by_user_id.
  -- For non-user data subjects (e.g. a former engineer not in auth.users),
  -- subject_user_id is null and subject_email is set.
  subject_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject_email         TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  -- Signed URL set when an export ZIP/JSON is uploaded to storage.
  download_url          TEXT,
  completed_at          TIMESTAMPTZ,
  failure_reason        TEXT,
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_requests_org ON gdpr_requests(organisation_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_subject ON gdpr_requests(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_requester ON gdpr_requests(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status ON gdpr_requests(status);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_created_at ON gdpr_requests(created_at DESC);

-- Auto-update `updated_at` on row mutation.
CREATE OR REPLACE FUNCTION touch_gdpr_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gdpr_requests_touch_updated_at ON gdpr_requests;
CREATE TRIGGER gdpr_requests_touch_updated_at
  BEFORE UPDATE ON gdpr_requests
  FOR EACH ROW
  EXECUTE FUNCTION touch_gdpr_request_updated_at();

ALTER TABLE gdpr_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own requests; org_admin / super_admin can read all
-- requests in their org.
DROP POLICY IF EXISTS gdpr_requests_select ON gdpr_requests;
CREATE POLICY gdpr_requests_select ON gdpr_requests
  FOR SELECT
  USING (
    requested_by_user_id = auth.uid()
    OR subject_user_id = auth.uid()
    OR organisation_id IN (
      SELECT organisation_id FROM profiles
      WHERE id = auth.uid() AND role IN ('org_admin', 'super_admin')
    )
  );

-- Any authenticated org member can request their own export / delete; admins
-- can also request on behalf of subjects in their org. The CHECK enforces
-- the same-org invariant at write time.
DROP POLICY IF EXISTS gdpr_requests_insert ON gdpr_requests;
CREATE POLICY gdpr_requests_insert ON gdpr_requests
  FOR INSERT
  WITH CHECK (
    organisation_id IN (
      SELECT organisation_id FROM profiles WHERE id = auth.uid()
    )
    AND (
      -- Self-request (any role)
      (requested_by_user_id = auth.uid() AND (subject_user_id = auth.uid() OR subject_user_id IS NULL))
      OR
      -- Admin-on-behalf
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('org_admin', 'super_admin')
      )
    )
  );

-- Only the requester or an org admin can update (e.g. cancel a pending one).
DROP POLICY IF EXISTS gdpr_requests_update ON gdpr_requests;
CREATE POLICY gdpr_requests_update ON gdpr_requests
  FOR UPDATE
  USING (
    requested_by_user_id = auth.uid()
    OR organisation_id IN (
      SELECT organisation_id FROM profiles
      WHERE id = auth.uid() AND role IN ('org_admin', 'super_admin')
    )
  );

COMMENT ON TABLE gdpr_requests IS
  'GDPR Subject Access Request (export) and Right-to-be-Forgotten (delete) audit trail. Wave 12 / Task 108.';
COMMENT ON COLUMN gdpr_requests.subject_user_id IS
  'auth.users id of the data subject. Null when the subject is a non-auth person (e.g. ex-engineer record by email).';
COMMENT ON COLUMN gdpr_requests.download_url IS
  'Signed URL (7 day TTL) to the export blob in the gdpr-exports bucket. Set when status=completed for export requests.';
