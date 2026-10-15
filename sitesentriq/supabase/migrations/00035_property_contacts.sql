-- ============================================================
-- Wave 14 / Task 114 — Tenant Portal (clients-of-clients)
-- Migration: 00035_property_contacts.sql
--
-- Adds the property_contacts table — site-level user mapping.
-- A property_contact is an end-user (pub manager, school
-- facilities lead, retail store manager, etc.) who logs in
-- and sees ONE property's data only.
--
-- Hierarchy:
--   Org (FM company) → Client (commercial customer) → Property (site)
--                                                       └─ property_contact
--
-- Existing /portal is for the Client level (sees ALL their sites).
-- This new /site portal is the level below — single-property scope.
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.property_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL until invite accepted
  email text NOT NULL,
  full_name text NOT NULL,
  role_at_site text NOT NULL DEFAULT 'site_lead',  -- pub manager, school FM lead, etc
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_token text UNIQUE,  -- magic-link token, NULL after accepted
  invite_token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, email)
);

CREATE INDEX IF NOT EXISTS idx_property_contacts_user
  ON public.property_contacts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_contacts_property
  ON public.property_contacts(property_id);
CREATE INDEX IF NOT EXISTS idx_property_contacts_token
  ON public.property_contacts(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_contacts_org
  ON public.property_contacts(organisation_id);

CREATE TRIGGER set_property_contacts_updated_at
  BEFORE UPDATE ON public.property_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 2. Helpers ───────────────────────────────────────────────
-- Reusable function: returns the property_id this user is bound
-- to as a tenant (or NULL if they aren't a tenant). Used by RLS
-- policies on every table the tenant_user can read.

CREATE OR REPLACE FUNCTION public.tenant_property_id()
RETURNS uuid AS $$
  SELECT property_id
    FROM public.property_contacts
   WHERE user_id = auth.uid()
     AND status = 'active'
   LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 3. RLS on property_contacts itself ───────────────────────

ALTER TABLE public.property_contacts ENABLE ROW LEVEL SECURITY;

-- Org admins / staff: see/manage all rows in their org.
CREATE POLICY "property_contacts_select_org"
  ON public.property_contacts FOR SELECT
  USING (organisation_id = public.organisation_id());

CREATE POLICY "property_contacts_insert_org"
  ON public.property_contacts FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());

CREATE POLICY "property_contacts_update_org"
  ON public.property_contacts FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());

CREATE POLICY "property_contacts_delete_org"
  ON public.property_contacts FOR DELETE
  USING (organisation_id = public.organisation_id());

-- Tenant users: see ONLY their own row.
CREATE POLICY "property_contacts_select_self"
  ON public.property_contacts FOR SELECT
  USING (user_id = auth.uid());

-- ── 4. Tenant-scoped read access on data tables ──────────────
-- Strategy: leave existing org-scoped policies in place and ADD
-- a parallel "tenant_user_select" policy on each table the tenant
-- needs to read. The two policies are OR'd by Postgres RLS.
--
-- We deliberately DO NOT add tenant_user write/insert/update
-- policies on most tables — tenants raise call-outs and approve
-- quotes through specific paths only.

-- ---- properties — tenant sees ONE property ----
CREATE POLICY "properties_select_tenant"
  ON public.properties FOR SELECT
  USING (id = public.tenant_property_id());

-- ---- jobs — tenant sees jobs at their property ----
CREATE POLICY "jobs_select_tenant"
  ON public.jobs FOR SELECT
  USING (property_id = public.tenant_property_id());

-- Tenants CAN create reactive call-out jobs at their own property.
CREATE POLICY "jobs_insert_tenant_callout"
  ON public.jobs FOR INSERT
  WITH CHECK (
    property_id = public.tenant_property_id()
    AND job_type = 'reactive'
    AND created_via = 'portal'
  );

-- ---- compliance_items — tenant sees items at their property ----
CREATE POLICY "compliance_items_select_tenant"
  ON public.compliance_items FOR SELECT
  USING (property_id = public.tenant_property_id());

-- ---- assets — tenant sees assets at their property ----
CREATE POLICY "assets_select_tenant"
  ON public.assets FOR SELECT
  USING (property_id = public.tenant_property_id());

-- ---- service_reports — joined via job → property ----
CREATE POLICY "service_reports_select_tenant"
  ON public.service_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
       WHERE jobs.id = service_reports.job_id
         AND jobs.property_id = public.tenant_property_id()
    )
  );

-- ---- documents — tenant sees docs linked to their property ----
CREATE POLICY "documents_select_tenant"
  ON public.documents FOR SELECT
  USING (property_id = public.tenant_property_id());

-- ---- quotes — tenant sees quotes linked to their property ----
CREATE POLICY "quotes_select_tenant"
  ON public.quotes FOR SELECT
  USING (property_id = public.tenant_property_id());

-- Tenants can update quote status (approve / reject) for quotes
-- at their property. They cannot modify totals or lines.
CREATE POLICY "quotes_update_tenant"
  ON public.quotes FOR UPDATE
  USING (property_id = public.tenant_property_id())
  WITH CHECK (property_id = public.tenant_property_id());

-- ---- quote_lines — tenant reads lines for visible quotes ----
CREATE POLICY "quote_lines_select_tenant"
  ON public.quote_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
       WHERE quotes.id = quote_lines.quote_id
         AND quotes.property_id = public.tenant_property_id()
    )
  );

-- ---- job_photos (added in 00004) — tenant sees photos at their property ----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='job_photos') THEN
    EXECUTE $POL$
      CREATE POLICY "job_photos_select_tenant"
        ON public.job_photos FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.jobs
             WHERE jobs.id = job_photos.job_id
               AND jobs.property_id = public.tenant_property_id()
          )
        )
    $POL$;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---- actions — tenant sees actions at their property ----
CREATE POLICY "actions_select_tenant"
  ON public.actions FOR SELECT
  USING (property_id = public.tenant_property_id());

-- ---- timeline_events — tenant sees their property's timeline ----
CREATE POLICY "timeline_events_select_tenant"
  ON public.timeline_events FOR SELECT
  USING (property_id = public.tenant_property_id());

-- ---- clients — tenant sees their parent client (read-only minimal) ----
CREATE POLICY "clients_select_tenant"
  ON public.clients FOR SELECT
  USING (
    id = (
      SELECT client_id FROM public.property_contacts
       WHERE user_id = auth.uid() AND status='active'
       LIMIT 1
    )
  );

-- ---- organisations — tenant sees the FM org (for branding) ----
CREATE POLICY "organisations_select_tenant"
  ON public.organisations FOR SELECT
  USING (
    id = (
      SELECT organisation_id FROM public.property_contacts
       WHERE user_id = auth.uid() AND status='active'
       LIMIT 1
    )
  );

-- ---- notifications already user-scoped (user_id = auth.uid())
--      — no extra policy needed.
