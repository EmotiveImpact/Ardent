-- Migration: 00124_custom_fields.sql
-- Description: per-org custom fields (roadmap B — kills the "can't add my own
--   fields / the data model is rigid" complaint, a 6-of-7 CMMS grievance).
--
-- Model: a definitions table (org defines fields per entity) + a `custom_fields`
-- jsonb column on each target entity holding the values keyed by field_key.
-- jsonb (not EAV) keeps reads single-row and avoids join fan-out; values are
-- small and entity-scoped. RLS on the definitions table is the org 4-policy
-- house pattern; the values live inside the entity row so they inherit the
-- entity's existing RLS.

create table if not exists public.custom_field_definitions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  entity          text not null check (entity in
    ('client', 'property', 'asset', 'job', 'subcontractor', 'contract')),
  field_key       text not null,
  label           text not null,
  field_type      text not null default 'text' check (field_type in
    ('text', 'number', 'date', 'select', 'boolean')),
  options         jsonb,  -- for field_type='select': ["Option A","Option B"]
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, entity, field_key)
);

create index if not exists idx_custom_field_defs_org_entity
  on public.custom_field_definitions (organisation_id, entity)
  where is_active = true;

drop trigger if exists set_custom_field_defs_updated_at on public.custom_field_definitions;
create trigger set_custom_field_defs_updated_at
  before update on public.custom_field_definitions
  for each row execute function public.update_updated_at_column();

alter table public.custom_field_definitions enable row level security;

drop policy if exists custom_field_defs_select_org on public.custom_field_definitions;
drop policy if exists custom_field_defs_insert_org on public.custom_field_definitions;
drop policy if exists custom_field_defs_update_org on public.custom_field_definitions;
drop policy if exists custom_field_defs_delete_org on public.custom_field_definitions;
create policy custom_field_defs_select_org on public.custom_field_definitions
  for select to authenticated using (organisation_id = public.organisation_id());
create policy custom_field_defs_insert_org on public.custom_field_definitions
  for insert to authenticated with check (organisation_id = public.organisation_id());
create policy custom_field_defs_update_org on public.custom_field_definitions
  for update to authenticated using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
create policy custom_field_defs_delete_org on public.custom_field_definitions
  for delete to authenticated using (organisation_id = public.organisation_id());

-- Value columns (values inherit each entity's existing RLS).
alter table public.clients        add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.properties     add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.assets         add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.jobs           add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.subcontractors add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.contracts      add column if not exists custom_fields jsonb not null default '{}'::jsonb;

comment on table public.custom_field_definitions is
  'Per-org custom field schema by entity (00124). Values live in each entity row''s custom_fields jsonb, keyed by field_key.';
