-- Migration: 00123_sfg20_alignment.sql
-- Description: SFG20 alignment layer on maintenance plans (roadmap B — the last
--   P1 moat piece). SFG20 is the UK industry-standard library of maintenance
--   task schedules; "our PPM is SFG20-aligned" is a credibility marker that
--   wins UK FM tenders.
--
-- Scope (honest): SFG20's task CONTENT is licensed and its Facilities-iQ API
-- needs a Digital Partner Programme key. This migration ships the STRUCTURE to
-- record alignment — the operator (who holds an SFG20 licence) tags a plan with
-- its SFG20 schedule reference and review date. The live auto-update sync
-- (pull schedule definitions + change notifications via the API) drops into
-- these columns once a partner key exists. No copyrighted SFG20 content is
-- embedded here.

alter table public.maintenance_plans
  add column if not exists sfg20_aligned boolean not null default false;

alter table public.maintenance_plans
  -- The operator's SFG20 schedule reference, e.g. "30.01" / "HVAC-13". Free
  -- text — we don't bundle SFG20's (licensed) code→title library.
  add column if not exists sfg20_schedule_ref text;

alter table public.maintenance_plans
  -- When the plan was last checked against the current SFG20 standard. Powers a
  -- future "SFG20 review due" prompt once change notifications are wired.
  add column if not exists sfg20_last_reviewed date;

-- Find aligned plans quickly for the org-level "X of Y SFG20-aligned" marker.
create index if not exists idx_maintenance_plans_sfg20
  on public.maintenance_plans (organisation_id)
  where sfg20_aligned = true;

comment on column public.maintenance_plans.sfg20_schedule_ref is
  'Operator-entered SFG20 schedule reference (the operator holds the SFG20 licence; no SFG20 content is stored by us). Live API sync is a future enhancement.';
