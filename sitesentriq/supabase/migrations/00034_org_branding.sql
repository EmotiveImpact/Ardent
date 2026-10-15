-- =============================================================================
-- 00034_org_branding.sql — White-label per-org branding (Wave 12 / Task 109)
-- =============================================================================
-- Adds branding columns to `organisations` so each FM company can show
-- their own logo, accent colour, support contact, and welcome message in
-- the client portal that THEIR customers see. Gated behind the Growth plan
-- (enforced in the UI for now — no server check yet).
--
-- A public storage bucket `org-branding` holds the uploaded logos so they
-- can be loaded by clients in the portal without a signed URL.

-- Branding columns on organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS logo_url               TEXT,
  ADD COLUMN IF NOT EXISTS accent_color           TEXT,
  ADD COLUMN IF NOT EXISTS accent_color_dark      TEXT,
  ADD COLUMN IF NOT EXISTS support_email          TEXT,
  ADD COLUMN IF NOT EXISTS support_phone          TEXT,
  ADD COLUMN IF NOT EXISTS portal_welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS portal_terms_url       TEXT,
  ADD COLUMN IF NOT EXISTS branding_enabled       BOOLEAN NOT NULL DEFAULT FALSE;

-- Validate hex colours (6-char #rrggbb form). NULL is allowed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_accent_color_format'
  ) THEN
    ALTER TABLE organisations
      ADD CONSTRAINT organisations_accent_color_format
      CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9a-fA-F]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_accent_color_dark_format'
  ) THEN
    ALTER TABLE organisations
      ADD CONSTRAINT organisations_accent_color_dark_format
      CHECK (accent_color_dark IS NULL OR accent_color_dark ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END$$;

COMMENT ON COLUMN organisations.logo_url IS 'Public URL to the org logo in the org-branding bucket (Wave 12).';
COMMENT ON COLUMN organisations.accent_color IS 'Hex colour used for primary CTAs in the client portal.';
COMMENT ON COLUMN organisations.accent_color_dark IS 'Hex colour used for hover/active state of accent.';
COMMENT ON COLUMN organisations.branding_enabled IS 'When false the portal falls back to the default Haumea branding.';

-- Public storage bucket for org logos. Public so the client portal can
-- read them without needing a signed URL on every page load.
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-branding', 'org-branding', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for the bucket — org members read their own; org_admins write.
-- The org id is encoded as the FIRST path segment in the storage key
-- (e.g. `<org-id>/logo-2026-04-26.png`), so we can derive ownership.

DROP POLICY IF EXISTS org_branding_public_read ON storage.objects;
CREATE POLICY org_branding_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'org-branding');

DROP POLICY IF EXISTS org_branding_admin_insert ON storage.objects;
CREATE POLICY org_branding_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-branding'
    AND (storage.foldername(name))[1] IN (
      SELECT organisation_id::text FROM profiles
      WHERE id = auth.uid()
        AND role IN ('org_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS org_branding_admin_update ON storage.objects;
CREATE POLICY org_branding_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-branding'
    AND (storage.foldername(name))[1] IN (
      SELECT organisation_id::text FROM profiles
      WHERE id = auth.uid()
        AND role IN ('org_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS org_branding_admin_delete ON storage.objects;
CREATE POLICY org_branding_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-branding'
    AND (storage.foldername(name))[1] IN (
      SELECT organisation_id::text FROM profiles
      WHERE id = auth.uid()
        AND role IN ('org_admin', 'super_admin')
    )
  );
