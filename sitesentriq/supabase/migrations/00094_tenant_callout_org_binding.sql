-- Migration: 00094_tenant_callout_org_binding.sql
-- Description: SECURITY FIX — bind organisation_id on the tenant call-out INSERT
-- policy so a portal tenant can't inject a job into another organisation.
--
-- Background:
--   00035 added `jobs_insert_tenant_callout`, letting a /site tenant raise a
--   reactive call-out. Its WITH CHECK constrained only property_id (= the
--   tenant's property), job_type and created_via — NOT organisation_id. Since
--   jobs.organisation_id is NOT NULL with no default and no trigger sets it, the
--   value is fully client-supplied on a direct PostgREST INSERT. A tenant could
--   therefore supply ANY organisation_id (while pointing property_id at their
--   own property), injecting a job into a victim org's pipeline/notifications.
--   RLS — not the web client — is the real trust boundary, so we fix it here.
--
-- Fix: require organisation_id to equal the property's own organisation_id.

DROP POLICY IF EXISTS "jobs_insert_tenant_callout" ON public.jobs;

CREATE POLICY "jobs_insert_tenant_callout"
  ON public.jobs FOR INSERT
  WITH CHECK (
    property_id = public.tenant_property_id()
    AND job_type = 'reactive'
    AND created_via = 'portal'
    -- Bind the org to the property's own org so it can't be spoofed.
    AND organisation_id = (
      SELECT p.organisation_id FROM public.properties p WHERE p.id = property_id
    )
  );
