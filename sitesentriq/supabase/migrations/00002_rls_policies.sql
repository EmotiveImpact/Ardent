-- Migration: 00002_rls_policies.sql
-- Description: Enable Row Level Security on all tables and create tenant-isolation policies
-- All data access is scoped to the user's organisation via public.organisation_id()

-- =============================================================================
-- 1. Helper function: get current user's organisation_id from profiles
-- =============================================================================

CREATE OR REPLACE FUNCTION public.organisation_id()
RETURNS uuid AS $$
  SELECT organisation_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- 2. Enable RLS on ALL tables
-- =============================================================================

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Organisations — users can only see their own organisation
-- =============================================================================

CREATE POLICY "organisations_select_own"
  ON public.organisations FOR SELECT
  USING (id = public.organisation_id());

CREATE POLICY "organisations_update_own"
  ON public.organisations FOR UPDATE
  USING (id = public.organisation_id())
  WITH CHECK (id = public.organisation_id());

-- =============================================================================
-- 4. Profiles — users can see profiles in their org, update only their own
-- =============================================================================

CREATE POLICY "profiles_select_same_org"
  ON public.profiles FOR SELECT
  USING (organisation_id = public.organisation_id());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =============================================================================
-- 5. Standard org-scoped tables (have organisation_id column directly)
--    Tables: clients, properties, assets, compliance_items, maintenance_plans,
--            jobs, service_reports, documents, actions, quotes, invoices,
--            payments, contracts, timeline_events
-- =============================================================================

-- ---- clients ----
CREATE POLICY "clients_select" ON public.clients FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "clients_insert" ON public.clients FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "clients_update" ON public.clients FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "clients_delete" ON public.clients FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- properties ----
CREATE POLICY "properties_select" ON public.properties FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "properties_insert" ON public.properties FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "properties_update" ON public.properties FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "properties_delete" ON public.properties FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- assets ----
CREATE POLICY "assets_select" ON public.assets FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "assets_insert" ON public.assets FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "assets_update" ON public.assets FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "assets_delete" ON public.assets FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- compliance_items ----
CREATE POLICY "compliance_items_select" ON public.compliance_items FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "compliance_items_insert" ON public.compliance_items FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "compliance_items_update" ON public.compliance_items FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "compliance_items_delete" ON public.compliance_items FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- maintenance_plans ----
CREATE POLICY "maintenance_plans_select" ON public.maintenance_plans FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "maintenance_plans_insert" ON public.maintenance_plans FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "maintenance_plans_update" ON public.maintenance_plans FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "maintenance_plans_delete" ON public.maintenance_plans FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- jobs ----
CREATE POLICY "jobs_select" ON public.jobs FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "jobs_insert" ON public.jobs FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "jobs_update" ON public.jobs FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "jobs_delete" ON public.jobs FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- service_reports ----
CREATE POLICY "service_reports_select" ON public.service_reports FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "service_reports_insert" ON public.service_reports FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "service_reports_update" ON public.service_reports FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "service_reports_delete" ON public.service_reports FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- documents ----
CREATE POLICY "documents_select" ON public.documents FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "documents_insert" ON public.documents FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "documents_update" ON public.documents FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "documents_delete" ON public.documents FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- actions ----
CREATE POLICY "actions_select" ON public.actions FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "actions_insert" ON public.actions FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "actions_update" ON public.actions FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "actions_delete" ON public.actions FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- quotes ----
CREATE POLICY "quotes_select" ON public.quotes FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- invoices ----
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "invoices_delete" ON public.invoices FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- payments ----
CREATE POLICY "payments_select" ON public.payments FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "payments_insert" ON public.payments FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "payments_update" ON public.payments FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "payments_delete" ON public.payments FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- contracts ----
CREATE POLICY "contracts_select" ON public.contracts FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "contracts_insert" ON public.contracts FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "contracts_update" ON public.contracts FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "contracts_delete" ON public.contracts FOR DELETE
  USING (organisation_id = public.organisation_id());

-- ---- timeline_events ----
CREATE POLICY "timeline_events_select" ON public.timeline_events FOR SELECT
  USING (organisation_id = public.organisation_id());
CREATE POLICY "timeline_events_insert" ON public.timeline_events FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "timeline_events_update" ON public.timeline_events FOR UPDATE
  USING (organisation_id = public.organisation_id())
  WITH CHECK (organisation_id = public.organisation_id());
CREATE POLICY "timeline_events_delete" ON public.timeline_events FOR DELETE
  USING (organisation_id = public.organisation_id());

-- =============================================================================
-- 6. Special cases — tables without direct organisation_id (join-based access)
-- =============================================================================

-- ---- areas (access via properties.organisation_id) ----
CREATE POLICY "areas_select" ON public.areas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE properties.id = areas.property_id
        AND properties.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "areas_insert" ON public.areas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE properties.id = areas.property_id
        AND properties.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "areas_update" ON public.areas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE properties.id = areas.property_id
        AND properties.organisation_id = public.organisation_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE properties.id = areas.property_id
        AND properties.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "areas_delete" ON public.areas FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties
      WHERE properties.id = areas.property_id
        AND properties.organisation_id = public.organisation_id()
    )
  );

-- ---- engineer_assignments (access via jobs.organisation_id) ----
CREATE POLICY "engineer_assignments_select" ON public.engineer_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = engineer_assignments.job_id
        AND jobs.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "engineer_assignments_insert" ON public.engineer_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = engineer_assignments.job_id
        AND jobs.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "engineer_assignments_update" ON public.engineer_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = engineer_assignments.job_id
        AND jobs.organisation_id = public.organisation_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = engineer_assignments.job_id
        AND jobs.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "engineer_assignments_delete" ON public.engineer_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = engineer_assignments.job_id
        AND jobs.organisation_id = public.organisation_id()
    )
  );

-- ---- quote_lines (access via quotes.organisation_id) ----
CREATE POLICY "quote_lines_select" ON public.quote_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "quote_lines_insert" ON public.quote_lines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "quote_lines_update" ON public.quote_lines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organisation_id = public.organisation_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "quote_lines_delete" ON public.quote_lines FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes
      WHERE quotes.id = quote_lines.quote_id
        AND quotes.organisation_id = public.organisation_id()
    )
  );

-- ---- invoice_lines (access via invoices.organisation_id) ----
CREATE POLICY "invoice_lines_select" ON public.invoice_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_lines.invoice_id
        AND invoices.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "invoice_lines_insert" ON public.invoice_lines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_lines.invoice_id
        AND invoices.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "invoice_lines_update" ON public.invoice_lines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_lines.invoice_id
        AND invoices.organisation_id = public.organisation_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_lines.invoice_id
        AND invoices.organisation_id = public.organisation_id()
    )
  );
CREATE POLICY "invoice_lines_delete" ON public.invoice_lines FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices
      WHERE invoices.id = invoice_lines.invoice_id
        AND invoices.organisation_id = public.organisation_id()
    )
  );

-- =============================================================================
-- 7. Notifications — user-scoped (users see/update only their own)
-- =============================================================================

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT
  WITH CHECK (organisation_id = public.organisation_id());

CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE
  USING (user_id = auth.uid());
