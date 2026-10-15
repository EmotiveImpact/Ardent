-- ============================================================
-- Migration 00020: SSO (Microsoft Entra + Google Workspace)
-- Wave 7 — Builder 7C (Facilities OS)
-- DO NOT RUN automatically; apply via `supabase db push`
-- ============================================================
--
-- Adds:
--   * sso_domain_mappings — maps an email domain to an organisation
--                            so that JIT-provisioned SSO users land
--                            in the right tenant with the right role.
--   * sso_provisioning_log — audit trail of every SSO sign-in attempt
--                             (provisioned / already_member / blocked
--                              / no_mapping / error).
--
-- Identity providers themselves (Azure / Google) are configured in
-- Supabase Dashboard → Authentication → Providers. This migration
-- only stores mapping + audit data.
-- ============================================================

-- ── 1. sso_domain_mappings ──────────────────────────────────
-- One row per (organisation, domain). A domain can be remapped by
-- disabling the old row (`disabled_at IS NOT NULL`) and inserting a
-- new one — hence the partial unique index instead of a plain UNIQUE.

CREATE TABLE IF NOT EXISTS sso_domain_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- Always stored lowercase (enforced by CHECK + an INSERT-side helper).
  domain text NOT NULL CHECK (domain = lower(domain)),
  -- One of the role enum values: org_admin / scheduler / finance /
  -- engineer / client_admin / auditor. We don't want JIT users to be
  -- able to land as super_admin, so app code must validate this too.
  default_role text NOT NULL DEFAULT 'engineer',
  auto_provision boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

-- Active domains must be globally unique (no two orgs can claim the
-- same domain). Disabled rows are ignored so you can re-claim later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sso_domain_mappings_domain_active
  ON sso_domain_mappings (domain)
  WHERE disabled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sso_domain_mappings_organisation_id
  ON sso_domain_mappings (organisation_id);

ALTER TABLE sso_domain_mappings ENABLE ROW LEVEL SECURITY;

-- Org admins read their own org's mappings.
CREATE POLICY "sso_domain_mappings_select_own_org" ON sso_domain_mappings
  FOR SELECT
  USING (organisation_id = public.organisation_id());

-- Org admins (settings:write capable roles) write their org's mappings.
-- The role gate is enforced in the app; here we only enforce tenant
-- isolation. The check uses the role column on profiles.
CREATE POLICY "sso_domain_mappings_insert_own_org" ON sso_domain_mappings
  FOR INSERT
  WITH CHECK (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin')
    )
  );

CREATE POLICY "sso_domain_mappings_update_own_org" ON sso_domain_mappings
  FOR UPDATE
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin')
    )
  );

CREATE POLICY "sso_domain_mappings_delete_own_org" ON sso_domain_mappings
  FOR DELETE
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin')
    )
  );

-- ── 2. sso_provisioning_log ─────────────────────────────────
-- Append-only audit log. Written by the `sso-jit-provision` edge
-- function via the service role (bypasses RLS); read by org admins
-- (scoped to their tenant via org_id).

CREATE TABLE IF NOT EXISTS sso_provisioning_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  domain text NOT NULL,
  org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  -- 'azure' | 'google' (kept loose to avoid migration churn if more
  -- providers are added later)
  provider text NOT NULL,
  -- 'provisioned' = profile created/updated with org+role
  -- 'already_member' = user already had org+role, no-op
  -- 'blocked' = mapping found but auto_provision=false
  -- 'no_mapping' = no domain mapping; user routed to onboarding
  -- 'error' = unexpected failure (see error_message)
  action text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sso_provisioning_log_org_id
  ON sso_provisioning_log (org_id);
CREATE INDEX IF NOT EXISTS idx_sso_provisioning_log_created_at
  ON sso_provisioning_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sso_provisioning_log_domain
  ON sso_provisioning_log (domain);

ALTER TABLE sso_provisioning_log ENABLE ROW LEVEL SECURITY;

-- Org admins read their org's log entries (for the "Recent SSO
-- activity" card on the admin settings page).
CREATE POLICY "sso_provisioning_log_select_own_org" ON sso_provisioning_log
  FOR SELECT
  USING (
    org_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin')
    )
  );

-- No INSERT/UPDATE/DELETE policies = blocked for everyone except the
-- service role (used by the edge function).
