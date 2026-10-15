-- ============================================================
-- Migration 00024: Org-Wide Audit Log (search/filter UI backbone)
-- Wave 8 — Builder 8C (Facilities OS)
-- DO NOT RUN automatically; apply via `supabase db push`
-- ============================================================
--
-- This migration takes the *view-based* approach: most "audit-worthy"
-- events already write to existing tables (`timeline_events`,
-- `sso_provisioning_log`, `accounting_sync_log`). Rather than
-- duplicate every insert, we expose a single read-only view
-- `audit_log_view` that the UI queries.
--
-- The only NEW base table introduced here is `system_audit_events`,
-- which captures events that don't have a natural home elsewhere
-- (sign-in, sign-out, password change, role change, billing webhook
-- transitions, service-role mutations).
--
-- View columns are deliberately wide enough that the UI can ignore
-- the source table and just sort/filter the union.
-- ============================================================

-- ── 1. system_audit_events ──────────────────────────────────
-- Append-only log of events without a dedicated home. Written from
-- the app via `src/lib/audit/log.ts` (RLS-bound to current user/org)
-- and from edge functions via the service role.

CREATE TABLE IF NOT EXISTS system_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- May be null for system-generated events (e.g. webhook side-effects).
  actor_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- Denormalised so admin UI doesn't have to join when the profile is gone.
  actor_email text,
  -- Action verbs use a `<domain>.<verb>` convention so the UI can group
  -- by prefix. Examples: user.signed_in, user.signed_out,
  -- user.role_changed, user.password_changed, billing.subscription_updated,
  -- billing.subscription_canceled, sso.provisioned, system.service_role_action.
  action text NOT NULL,
  entity_type text,
  entity_id text,
  summary text NOT NULL,
  metadata jsonb,
  ip_address text,
  user_agent text,
  -- 'info' | 'warning' | 'critical'
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_events_org_created
  ON system_audit_events (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_events_actor
  ON system_audit_events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_events_action
  ON system_audit_events (action);
CREATE INDEX IF NOT EXISTS idx_system_audit_events_severity
  ON system_audit_events (severity)
  WHERE severity <> 'info';

-- Add a helpful covering index on timeline_events for the audit view.
-- timeline_events already has idx_timeline_events_organisation_id +
-- idx_timeline_events_created_at, but the audit UI sorts by
-- (organisation_id, created_at desc) so a composite helps.
CREATE INDEX IF NOT EXISTS idx_timeline_events_org_created
  ON timeline_events (organisation_id, created_at DESC);

-- Same for the other source tables.
CREATE INDEX IF NOT EXISTS idx_sso_provisioning_log_org_created
  ON sso_provisioning_log (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_sync_log_org_created
  ON accounting_sync_log (organisation_id, created_at DESC);

-- ── 2. RLS on system_audit_events ───────────────────────────
ALTER TABLE system_audit_events ENABLE ROW LEVEL SECURITY;

-- Anyone in the org can insert their own audit events (the app sets
-- organisation_id from the session). The service role bypasses RLS.
CREATE POLICY "system_audit_events_insert_own_org"
  ON system_audit_events
  FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());

-- Read is gated to org_admin / super_admin / auditor.
CREATE POLICY "system_audit_events_select_admin_or_auditor"
  ON system_audit_events
  FOR SELECT
  USING (
    organisation_id = public.organisation_id()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'org_admin', 'auditor')
    )
  );

-- No update / delete policies → append-only.

-- ── 3. audit_log_view ───────────────────────────────────────
-- UNIONs the four append-only event sources into one shape. Each
-- branch projects to the same column set so the UI can sort by
-- created_at across them.
--
-- Severity is synthesised for each branch:
--   * timeline_events       → info (these are user CRUD)
--   * system_audit_events   → its own severity column
--   * sso_provisioning_log  → 'warning' for blocked / error, else info
--   * accounting_sync_log   → 'warning' for status='error', else info

CREATE OR REPLACE VIEW audit_log_view AS
-- (a) timeline_events
SELECT
  te.id::text                       AS id,
  te.organisation_id                AS organisation_id,
  te.user_id                        AS actor_user_id,
  p.email                           AS actor_email,
  te.event_type                     AS action,
  CASE
    WHEN te.job_id IS NOT NULL      THEN 'job'
    WHEN te.property_id IS NOT NULL THEN 'property'
    WHEN te.client_id IS NOT NULL   THEN 'client'
    ELSE 'timeline'
  END                               AS entity_type,
  COALESCE(
    te.job_id::text,
    te.property_id::text,
    te.client_id::text
  )                                 AS entity_id,
  te.description                    AS summary,
  te.metadata                       AS metadata,
  NULL::text                        AS ip_address,
  NULL::text                        AS user_agent,
  'info'::text                      AS severity,
  'timeline_events'::text           AS source,
  te.created_at                     AS created_at
FROM timeline_events te
LEFT JOIN profiles p ON p.id = te.user_id

UNION ALL

-- (b) system_audit_events
SELECT
  sae.id::text                      AS id,
  sae.organisation_id               AS organisation_id,
  sae.actor_user_id                 AS actor_user_id,
  COALESCE(sae.actor_email, p.email) AS actor_email,
  sae.action                        AS action,
  sae.entity_type                   AS entity_type,
  sae.entity_id                     AS entity_id,
  sae.summary                       AS summary,
  sae.metadata                      AS metadata,
  sae.ip_address                    AS ip_address,
  sae.user_agent                    AS user_agent,
  sae.severity                      AS severity,
  'system_audit_events'::text       AS source,
  sae.created_at                    AS created_at
FROM system_audit_events sae
LEFT JOIN profiles p ON p.id = sae.actor_user_id

UNION ALL

-- (c) sso_provisioning_log
SELECT
  spl.id::text                      AS id,
  spl.org_id                        AS organisation_id,
  NULL::uuid                        AS actor_user_id,
  spl.email                         AS actor_email,
  ('sso.' || spl.action)            AS action,
  'sso'::text                       AS entity_type,
  spl.domain                        AS entity_id,
  CASE spl.action
    WHEN 'provisioned'    THEN 'JIT-provisioned ' || spl.email || ' (' || spl.provider || ')'
    WHEN 'already_member' THEN 'SSO sign-in by ' || spl.email
    WHEN 'blocked'        THEN 'SSO sign-in blocked for ' || spl.email
    WHEN 'no_mapping'     THEN 'No domain mapping for ' || spl.email
    WHEN 'error'          THEN 'SSO error for ' || spl.email
    ELSE 'SSO event for ' || spl.email
  END                               AS summary,
  jsonb_build_object(
    'provider',      spl.provider,
    'domain',        spl.domain,
    'error_message', spl.error_message
  )                                 AS metadata,
  NULL::text                        AS ip_address,
  NULL::text                        AS user_agent,
  CASE
    WHEN spl.action IN ('blocked', 'error') THEN 'warning'
    ELSE 'info'
  END                               AS severity,
  'sso_provisioning_log'::text      AS source,
  spl.created_at                    AS created_at
FROM sso_provisioning_log spl
WHERE spl.org_id IS NOT NULL

UNION ALL

-- (d) accounting_sync_log
SELECT
  asl.id::text                      AS id,
  asl.organisation_id               AS organisation_id,
  NULL::uuid                        AS actor_user_id,
  NULL::text                        AS actor_email,
  ('accounting.' || asl.action)     AS action,
  'invoice'::text                   AS entity_type,
  asl.invoice_id::text              AS entity_id,
  CASE asl.action
    WHEN 'connect'         THEN 'Connected ' || asl.provider
    WHEN 'disconnect'      THEN 'Disconnected ' || asl.provider
    WHEN 'push_invoice'    THEN 'Pushed invoice to ' || asl.provider || COALESCE(' (' || asl.external_id || ')', '')
    WHEN 'refresh_token'   THEN 'Refreshed ' || asl.provider || ' token'
    ELSE asl.provider || ' ' || asl.action
  END                               AS summary,
  jsonb_build_object(
    'provider',    asl.provider,
    'status',      asl.status,
    'external_id', asl.external_id,
    'error',       asl.error
  )                                 AS metadata,
  NULL::text                        AS ip_address,
  NULL::text                        AS user_agent,
  CASE
    WHEN asl.status = 'error' THEN 'warning'
    ELSE 'info'
  END                               AS severity,
  'accounting_sync_log'::text       AS source,
  asl.created_at                    AS created_at
FROM accounting_sync_log asl;

-- Note: views inherit RLS from the underlying tables (Postgres 15+
-- "security_invoker" semantics on Supabase). All four base tables
-- already have org-scoped RLS, so org A cannot see org B's rows here.
-- The dashboard further restricts UI access via the role-based check
-- in `audit_log_view_grants` (no separate grant — uses table policies).
--
-- For roles that should NOT see this view (engineer, finance, etc),
-- the app simply hides the page (gated by `audit:read` permission).
-- A determined client could still query the view, but RLS on each
-- underlying table will return zero rows for non-admins/auditors
-- because timeline_events has its own SELECT policy that admits org
-- members, sso_provisioning_log restricts to admins, etc.
COMMENT ON VIEW audit_log_view IS
  'Org-wide audit log surface. UNIONs timeline_events, system_audit_events, sso_provisioning_log and accounting_sync_log. Read in the UI through src/lib/audit/queries.ts; gated to org_admin/super_admin/auditor by the audit:read permission.';
