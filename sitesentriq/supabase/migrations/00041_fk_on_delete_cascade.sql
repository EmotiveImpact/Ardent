-- 00041_fk_on_delete_cascade.sql
--
-- Most foreign keys in the original schema were created without explicit
-- ON DELETE rules, defaulting to RESTRICT — so deleting an asset (or
-- property, client, job, etc.) silently fails with messages like:
--   "update or delete on table 'assets' violates foreign key constraint
--    'compliance_items_asset_id_fkey' on table 'compliance_items'"
--
-- This migration sets sensible cascade rules for every parent → child
-- relationship in the operational graph.
--
-- Rules of thumb:
--   CASCADE   when the child cannot meaningfully exist without the
--             parent (compliance_item without an asset, action attached
--             to a deleted job, etc.).
--   SET NULL  when the child should outlive the parent for audit /
--             history reasons but the link is no longer valid.
--
-- Constraints already configured correctly (CASCADE / SET NULL) are
-- left alone.

begin;

-- ── assets ──────────────────────────────────────────────────────
-- Delete an asset → drop everything strictly attached to it.
alter table public.compliance_items
  drop constraint if exists compliance_items_asset_id_fkey,
  add  constraint compliance_items_asset_id_fkey
    foreign key (asset_id) references public.assets(id) on delete cascade;

alter table public.documents
  drop constraint if exists documents_asset_id_fkey,
  add  constraint documents_asset_id_fkey
    foreign key (asset_id) references public.assets(id) on delete cascade;

alter table public.maintenance_plans
  drop constraint if exists maintenance_plans_asset_id_fkey,
  add  constraint maintenance_plans_asset_id_fkey
    foreign key (asset_id) references public.assets(id) on delete cascade;

alter table public.actions
  drop constraint if exists actions_asset_id_fkey,
  add  constraint actions_asset_id_fkey
    foreign key (asset_id) references public.assets(id) on delete set null;

-- ── properties ──────────────────────────────────────────────────
-- Delete a property → drop everything physically located there.
alter table public.assets
  drop constraint if exists assets_property_id_fkey,
  add  constraint assets_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete cascade;

alter table public.compliance_items
  drop constraint if exists compliance_items_property_id_fkey,
  add  constraint compliance_items_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete cascade;

alter table public.documents
  drop constraint if exists documents_property_id_fkey,
  add  constraint documents_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete cascade;

alter table public.maintenance_plans
  drop constraint if exists maintenance_plans_property_id_fkey,
  add  constraint maintenance_plans_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete cascade;

alter table public.jobs
  drop constraint if exists jobs_property_id_fkey,
  add  constraint jobs_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete cascade;

alter table public.actions
  drop constraint if exists actions_property_id_fkey,
  add  constraint actions_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete cascade;

alter table public.quotes
  drop constraint if exists quotes_property_id_fkey,
  add  constraint quotes_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete set null;

alter table public.invoices
  drop constraint if exists invoices_property_id_fkey,
  add  constraint invoices_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete set null;

alter table public.timeline_events
  drop constraint if exists timeline_events_property_id_fkey,
  add  constraint timeline_events_property_id_fkey
    foreign key (property_id) references public.properties(id) on delete cascade;

-- ── clients ─────────────────────────────────────────────────────
-- Most client-owned objects (properties, contracts, property_contacts)
-- already have ON DELETE CASCADE. Tighten the remaining stragglers.
alter table public.invoices
  drop constraint if exists invoices_client_id_fkey,
  add  constraint invoices_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete cascade;

alter table public.quotes
  drop constraint if exists quotes_client_id_fkey,
  add  constraint quotes_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete cascade;

alter table public.jobs
  drop constraint if exists jobs_client_id_fkey,
  add  constraint jobs_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete cascade;

alter table public.contracts
  drop constraint if exists contracts_client_id_fkey,
  add  constraint contracts_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete cascade;

alter table public.timeline_events
  drop constraint if exists timeline_events_client_id_fkey,
  add  constraint timeline_events_client_id_fkey
    foreign key (client_id) references public.clients(id) on delete cascade;

-- ── jobs ────────────────────────────────────────────────────────
-- Job-owned children: actions / documents / reports / quotes / events.
alter table public.actions
  drop constraint if exists actions_job_id_fkey,
  add  constraint actions_job_id_fkey
    foreign key (job_id) references public.jobs(id) on delete set null;

alter table public.documents
  drop constraint if exists documents_job_id_fkey,
  add  constraint documents_job_id_fkey
    foreign key (job_id) references public.jobs(id) on delete cascade;

alter table public.quotes
  drop constraint if exists quotes_job_id_fkey,
  add  constraint quotes_job_id_fkey
    foreign key (job_id) references public.jobs(id) on delete set null;

alter table public.service_reports
  drop constraint if exists service_reports_job_id_fkey,
  add  constraint service_reports_job_id_fkey
    foreign key (job_id) references public.jobs(id) on delete cascade;

alter table public.timeline_events
  drop constraint if exists timeline_events_job_id_fkey,
  add  constraint timeline_events_job_id_fkey
    foreign key (job_id) references public.jobs(id) on delete cascade;

-- ── compliance_items ────────────────────────────────────────────
-- Jobs scheduled FOR a compliance item should clear the link when
-- compliance item is deleted (the job may already be done / billable).
alter table public.jobs
  drop constraint if exists jobs_compliance_item_id_fkey,
  add  constraint jobs_compliance_item_id_fkey
    foreign key (compliance_item_id) references public.compliance_items(id) on delete set null;

-- ── maintenance_plans ───────────────────────────────────────────
alter table public.jobs
  drop constraint if exists jobs_maintenance_plan_id_fkey,
  add  constraint jobs_maintenance_plan_id_fkey
    foreign key (maintenance_plan_id) references public.maintenance_plans(id) on delete set null;

-- ── invoices / quotes ───────────────────────────────────────────
alter table public.payments
  drop constraint if exists payments_invoice_id_fkey,
  add  constraint payments_invoice_id_fkey
    foreign key (invoice_id) references public.invoices(id) on delete cascade;

alter table public.invoices
  drop constraint if exists invoices_quote_id_fkey,
  add  constraint invoices_quote_id_fkey
    foreign key (quote_id) references public.quotes(id) on delete set null;

-- ── engineers ───────────────────────────────────────────────────
-- Job's engineer_record_id should NULL when an engineer is removed
-- (job retains its history, just loses the assignment).
alter table public.jobs
  drop constraint if exists jobs_engineer_record_id_fkey,
  add  constraint jobs_engineer_record_id_fkey
    foreign key (engineer_record_id) references public.engineers(id) on delete set null;

commit;
