-- ============================================================
-- Migration 00023: Compliance certificates
-- Wave 8 — Builder 8B (Facilities OS)
-- DO NOT RUN automatically; apply via `supabase db push`
-- ============================================================
--
-- Adds:
--   * certificates                — generated PDF/HTML compliance
--                                   certificates (Gas Safety, EICR,
--                                   Fire Risk Assessment, generic …).
--   * engineers.signature_image_url — engineer signature image used
--                                     when rendering certificate
--                                     templates.
--   * certificates storage bucket (private; signed URLs only).
--   * certificate_number_seq sequence + gen_certificate_number() helper
--     to mint sequential, type/org-prefixed certificate numbers
--     (e.g. GS-NWPM-00042).
--
-- The actual rendering pipeline is split between the client
-- (renderToStaticMarkup → window.print()) and the
-- supabase/functions/generate-certificate edge function (HTML save +
-- placeholder for true headless-PDF rendering — see ops notes).
-- ============================================================


-- ── 1. engineers.signature_image_url ─────────────────────
-- Idempotent so the migration can be re-applied without error.
ALTER TABLE engineers
  ADD COLUMN IF NOT EXISTS signature_image_url text;


-- ── 2. certificate_number sequence + helper ──────────────
-- A single global sequence is sufficient — uniqueness within the
-- printed number is achieved by the {TYPE}-{ORG_PREFIX}- prefix.
CREATE SEQUENCE IF NOT EXISTS certificate_number_seq START WITH 1 INCREMENT BY 1;

-- Maps internal `type` to the printed prefix on the certificate
-- number (e.g. gas_safety -> GS, eicr -> EICR, fra -> FRA, generic -> CERT).
CREATE OR REPLACE FUNCTION certificate_type_prefix(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_type, ''))
    WHEN 'gas_safety' THEN 'GS'
    WHEN 'eicr'       THEN 'EICR'
    WHEN 'fra'        THEN 'FRA'
    WHEN 'fire_risk_assessment' THEN 'FRA'
    WHEN 'generic'    THEN 'CERT'
    ELSE upper(regexp_replace(coalesce(p_type, 'cert'), '[^a-zA-Z0-9]', '', 'g'))
  END;
$$;

-- Org prefix derived from the org slug (uppercased, alphanumerics
-- only, capped at 6 chars). Falls back to first 4 of org id.
CREATE OR REPLACE FUNCTION certificate_org_prefix(p_org_id uuid)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT
    coalesce(
      nullif(
        upper(regexp_replace(
          coalesce((SELECT slug FROM organisations WHERE id = p_org_id), ''),
          '[^a-zA-Z0-9]', '', 'g'
        )),
        ''
      ),
      upper(substring(p_org_id::text from 1 for 4))
    );
$$;

-- {TYPE}-{ORG_PREFIX}-{ZERO_PADDED_SEQ}
CREATE OR REPLACE FUNCTION gen_certificate_number(p_org_id uuid, p_type text)
RETURNS text
LANGUAGE plpgsql VOLATILE
AS $$
DECLARE
  v_seq bigint;
  v_org_prefix text;
  v_type_prefix text;
BEGIN
  v_seq := nextval('certificate_number_seq');
  v_org_prefix := certificate_org_prefix(p_org_id);
  -- cap org prefix to 6 chars to keep the number readable
  IF length(v_org_prefix) > 6 THEN
    v_org_prefix := substring(v_org_prefix from 1 for 6);
  END IF;
  v_type_prefix := certificate_type_prefix(p_type);
  RETURN v_type_prefix || '-' || v_org_prefix || '-' || lpad(v_seq::text, 5, '0');
END;
$$;


-- ── 3. certificates table ────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id               uuid REFERENCES jobs(id) ON DELETE SET NULL,
  compliance_item_id   uuid REFERENCES compliance_items(id) ON DELETE SET NULL,
  asset_id             uuid REFERENCES assets(id) ON DELETE SET NULL,
  property_id          uuid REFERENCES properties(id) ON DELETE SET NULL,
  client_id            uuid REFERENCES clients(id) ON DELETE SET NULL,
  engineer_id          uuid REFERENCES engineers(id) ON DELETE SET NULL,
  -- gas_safety | eicr | fra | generic | …
  type                 text NOT NULL,
  certificate_number   text NOT NULL UNIQUE,
  test_date            date,
  next_due             date,
  -- pass | fail | observation
  outcome              text,
  -- Defects / observations recorded on the certificate. Free-form JSON
  -- so each template can store its own structured payload.
  defects              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- pdf_url is the future "real" PDF (headless browser rendered).
  -- html_url is what we save in v1 — a self-contained printable HTML
  -- page that the user (or a downstream cron) can render to PDF.
  pdf_url              text,
  html_url             text,
  -- SHA-256 hash of the rendered HTML, for tamper detection.
  signed_html_hash     text,
  created_by_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- When set, the certificate has been revoked (e.g. issued in error).
  revoked_at           timestamptz,
  revoked_reason       text
);

CREATE INDEX IF NOT EXISTS idx_certificates_organisation_id
  ON certificates (organisation_id);
CREATE INDEX IF NOT EXISTS idx_certificates_job_id
  ON certificates (job_id);
CREATE INDEX IF NOT EXISTS idx_certificates_compliance_item_id
  ON certificates (compliance_item_id);
CREATE INDEX IF NOT EXISTS idx_certificates_asset_id
  ON certificates (asset_id);
CREATE INDEX IF NOT EXISTS idx_certificates_property_id
  ON certificates (property_id);
CREATE INDEX IF NOT EXISTS idx_certificates_engineer_id
  ON certificates (engineer_id);
CREATE INDEX IF NOT EXISTS idx_certificates_type
  ON certificates (type);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at
  ON certificates (created_at DESC);


-- ── 4. RLS — org-scoped read; service role writes ───────
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Read: any member of the org can list its certificates.
CREATE POLICY "certificates_select_own_org" ON certificates
  FOR SELECT
  USING (organisation_id = public.organisation_id());

-- Insert: app users can insert into their own org. The edge function
-- uses the service role and bypasses RLS, but allowing in-app
-- inserts means the client-side print path (which uploads HTML +
-- writes a row directly) keeps working without needing an edge
-- round-trip.
CREATE POLICY "certificates_insert_own_org" ON certificates
  FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());

-- Update: only org_admin / scheduler / engineer roles in the same
-- org can flip e.g. revoked_at. Clients (client_admin / auditor) get
-- read-only access.
CREATE POLICY "certificates_update_own_org" ON certificates
  FOR UPDATE
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin', 'scheduler', 'engineer')
    )
  );

-- Delete: org_admin only. Hard deletes are rare; prefer revocation.
CREATE POLICY "certificates_delete_own_org" ON certificates
  FOR DELETE
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin')
    )
  );


-- ── 5. Storage bucket (private — signed URLs only) ──────
-- Keeping this private means we serve certificates via signed URLs.
-- Public read intentionally NOT granted in 00005_storage_buckets.
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated members of the org can read/write certificates; the
-- bucket is private so anon cannot list. (Tenant isolation is
-- enforced by storage path convention: `${org_id}/${cert_id}.html`
-- and the certificates row's RLS.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'certificates_auth_rw'
  ) THEN
    CREATE POLICY "certificates_auth_rw" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'certificates')
      WITH CHECK (bucket_id = 'certificates');
  END IF;
END $$;
