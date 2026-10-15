-- 00045_workflow_expansion.sql
--
-- Workflow expansion for commercial operations:
-- - supplier catalogue items for fast PO line entry
-- - PO send/approve/receive audit timestamps and supplier email target
-- - quote revision history
-- - contract routine templates and contract-to-routine generation RPC
-- - engineer location helper RPC for field/mobile capture

-- ── Purchase order workflow fields ──────────────────────────
alter table purchase_orders add column if not exists supplier_email text;
alter table purchase_orders add column if not exists supplier_reference text;
alter table purchase_orders add column if not exists sent_at timestamptz;
alter table purchase_orders add column if not exists approved_at timestamptz;
alter table purchase_orders add column if not exists received_at timestamptz;
alter table purchase_orders add column if not exists cancelled_at timestamptz;
alter table purchase_orders add column if not exists emailed_to text;
alter table purchase_orders add column if not exists last_emailed_at timestamptz;

-- ── Supplier catalogue items ────────────────────────────────
create table if not exists supplier_items (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references organisations(id) on delete cascade,
  supplier_id       uuid not null references suppliers(id) on delete cascade,
  sku               text,
  name              text not null,
  description       text,
  unit_cost         numeric(12,2) not null default 0,
  tax_rate          numeric(7,2) not null default 20,
  unit              text not null default 'each',
  status            text not null default 'active' check (status in ('active', 'inactive')),
  last_used_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists set_supplier_items_updated_at on supplier_items;
create trigger set_supplier_items_updated_at
  before update on supplier_items
  for each row execute function update_updated_at_column();

create index if not exists idx_supplier_items_org_supplier
  on supplier_items(organisation_id, supplier_id, status, name);

create unique index if not exists idx_supplier_items_supplier_sku_unique
  on supplier_items(supplier_id, lower(sku))
  where sku is not null;

alter table supplier_items enable row level security;

drop policy if exists supplier_items_select_org on supplier_items;
create policy supplier_items_select_org on supplier_items
  for select using (organisation_id = public.organisation_id());

drop policy if exists supplier_items_insert_org on supplier_items;
create policy supplier_items_insert_org on supplier_items
  for insert with check (organisation_id = public.organisation_id());

drop policy if exists supplier_items_update_org on supplier_items;
create policy supplier_items_update_org on supplier_items
  for update using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

drop policy if exists supplier_items_delete_org on supplier_items;
create policy supplier_items_delete_org on supplier_items
  for delete using (organisation_id = public.organisation_id());

-- ── Quote revision history ──────────────────────────────────
create table if not exists quote_revisions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  quote_id        uuid not null references quotes(id) on delete cascade,
  revision_number integer not null,
  reason          text,
  status_snapshot text,
  total_snapshot  numeric(12,2),
  payload         jsonb not null default '{}'::jsonb,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create unique index if not exists idx_quote_revisions_quote_revision
  on quote_revisions(quote_id, revision_number);
create index if not exists idx_quote_revisions_org_created
  on quote_revisions(organisation_id, created_at desc);

alter table quote_revisions enable row level security;

drop policy if exists quote_revisions_select_org on quote_revisions;
create policy quote_revisions_select_org on quote_revisions
  for select using (organisation_id = public.organisation_id());

drop policy if exists quote_revisions_insert_org on quote_revisions;
create policy quote_revisions_insert_org on quote_revisions
  for insert with check (organisation_id = public.organisation_id());

-- ── Contract routine templates ──────────────────────────────
create table if not exists contract_routine_templates (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references organisations(id) on delete cascade,
  contract_id           uuid not null references contracts(id) on delete cascade,
  property_id           uuid not null references properties(id) on delete cascade,
  asset_id              uuid references assets(id) on delete set null,
  name                  text not null,
  maintenance_type      text not null,
  frequency             text not null,
  schedule_mode         text not null default 'fixed' check (schedule_mode in ('fixed', 'rolling')),
  starts_at             date not null default current_date,
  description           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists set_contract_routine_templates_updated_at on contract_routine_templates;
create trigger set_contract_routine_templates_updated_at
  before update on contract_routine_templates
  for each row execute function update_updated_at_column();

create index if not exists idx_contract_routine_templates_contract
  on contract_routine_templates(contract_id, property_id);

alter table contract_routine_templates enable row level security;

drop policy if exists contract_routine_templates_select_org on contract_routine_templates;
create policy contract_routine_templates_select_org on contract_routine_templates
  for select using (organisation_id = public.organisation_id());

drop policy if exists contract_routine_templates_insert_org on contract_routine_templates;
create policy contract_routine_templates_insert_org on contract_routine_templates
  for insert with check (organisation_id = public.organisation_id());

drop policy if exists contract_routine_templates_update_org on contract_routine_templates;
create policy contract_routine_templates_update_org on contract_routine_templates
  for update using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

drop policy if exists contract_routine_templates_delete_org on contract_routine_templates;
create policy contract_routine_templates_delete_org on contract_routine_templates
  for delete using (organisation_id = public.organisation_id());

create or replace function public.create_maintenance_plans_from_contract(p_contract_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into maintenance_plans (
    property_id,
    asset_id,
    organisation_id,
    contract_id,
    name,
    description,
    maintenance_category,
    maintenance_type,
    frequency,
    schedule_mode,
    starts_at,
    next_due,
    is_active
  )
  select
    t.property_id,
    t.asset_id,
    t.organisation_id,
    t.contract_id,
    t.name,
    t.description,
    'routine',
    t.maintenance_type,
    t.frequency,
    t.schedule_mode,
    t.starts_at,
    t.starts_at,
    true
  from contract_routine_templates t
  where t.contract_id = p_contract_id
    and t.organisation_id = public.organisation_id()
    and not exists (
      select 1
      from maintenance_plans mp
      where mp.contract_id = t.contract_id
        and mp.property_id = t.property_id
        and coalesce(mp.asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(t.asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and lower(mp.name) = lower(t.name)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── Engineer location capture helper ────────────────────────
create or replace function public.record_engineer_location(
  p_engineer_id uuid,
  p_current_job_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_metres integer default null,
  p_movement_status text default 'travelling',
  p_eta_at timestamptz default null
)
returns engineer_locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_location engineer_locations%rowtype;
begin
  select organisation_id into v_org
  from engineers
  where id = p_engineer_id
    and organisation_id = public.organisation_id();

  if v_org is null then
    raise exception 'Engineer not found';
  end if;

  insert into engineer_locations (
    organisation_id,
    engineer_id,
    current_job_id,
    latitude,
    longitude,
    accuracy_metres,
    movement_status,
    eta_at
  )
  values (
    v_org,
    p_engineer_id,
    p_current_job_id,
    p_latitude,
    p_longitude,
    p_accuracy_metres,
    p_movement_status,
    p_eta_at
  )
  returning * into v_location;

  return v_location;
end;
$$;

notify pgrst, 'reload schema';
