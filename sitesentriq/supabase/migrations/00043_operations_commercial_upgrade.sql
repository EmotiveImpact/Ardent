-- 00043_operations_commercial_upgrade.sql
--
-- Commercial + operations upgrade:
-- - Purchase orders and maintained suppliers
-- - Client-level billing fields and unique property references
-- - Routine maintenance hierarchy tied to contracts/takeover dates
-- - Revisit job status and quote type/markup support
-- - Engineer tracker location table
-- - Defensive schedule_mode cache reload for live PostgREST/Supabase

-- ── Client / property hierarchy ─────────────────────────────
alter table clients add column if not exists client_code text;
alter table clients add column if not exists billing_email text;
alter table clients add column if not exists billing_address text;
alter table clients add column if not exists billing_terms text;
alter table clients add column if not exists tax_number text;

create unique index if not exists idx_clients_org_client_code
  on clients(organisation_id, client_code)
  where client_code is not null;

alter table properties add column if not exists property_code text;
alter table properties add column if not exists region text;
alter table properties add column if not exists takeover_date date;

create unique index if not exists idx_properties_org_property_code
  on properties(organisation_id, property_code)
  where property_code is not null;

-- ── Maintenance schema alignment / routine maintenance ───────
alter table maintenance_plans
  add column if not exists schedule_mode text default 'fixed';

alter table maintenance_plans
  drop constraint if exists maintenance_plans_schedule_mode_check;

alter table maintenance_plans
  add constraint maintenance_plans_schedule_mode_check
  check (schedule_mode in ('fixed', 'rolling'));

alter table maintenance_plans
  add column if not exists maintenance_type text default 'Service';

alter table maintenance_plans
  add column if not exists maintenance_category text not null default 'routine'
  check (maintenance_category in ('routine', 'reactive', 'statutory', 'other'));

alter table maintenance_plans
  add column if not exists starts_at date;

alter table maintenance_plans
  add column if not exists contract_id uuid references contracts(id) on delete set null;

create index if not exists idx_maintenance_plans_contract_id
  on maintenance_plans(contract_id);

comment on column maintenance_plans.schedule_mode is
  'fixed = contract calendar cadence; rolling = next_due rolls from completion date.';

comment on column maintenance_plans.maintenance_category is
  'Routine Maintenance is the default category for contracted recurring PPM routines.';

-- ── Jobs: Follow Up becomes Revisit ──────────────────────────
update jobs set status = 'revisit' where status = 'follow_up_required';

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs
  add constraint jobs_status_check
  check (status in (
    'scheduled',
    'due',
    'in_progress',
    'completed',
    'incomplete',
    'failed_access',
    'revisit',
    'cancelled',
    'pending'
  ));

alter table jobs drop constraint if exists jobs_outcome_check;
alter table jobs
  add constraint jobs_outcome_check
  check (outcome is null or outcome in ('pass', 'fail', 'incomplete', 'n_a', 'revisit'));

-- ── Quotes: service/defect split + markup pricing ───────────
update quotes set quote_type = 'service_quote' where quote_type = 'service';
update quotes set quote_type = 'defect_quote' where quote_type = 'reactive' or quote_type is null;

alter table quotes drop constraint if exists quotes_quote_type_check;
alter table quotes
  add constraint quotes_quote_type_check
  check (quote_type in ('service_quote', 'defect_quote'));

alter table quotes drop constraint if exists quotes_status_check;
alter table quotes
  add constraint quotes_status_check
  check (status in ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted'));

alter table quote_lines add column if not exists cost_price numeric(12,2);
alter table quote_lines add column if not exists markup_percent numeric(7,2) not null default 0;
alter table quote_lines add column if not exists tax_rate numeric(7,2) not null default 20;

update quote_lines
set cost_price = unit_price
where cost_price is null;

-- ── Suppliers and Purchase Orders ────────────────────────────
create table if not exists suppliers (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  name             text not null,
  account_number   text,
  contact_email    text,
  contact_phone    text,
  website          text,
  default_tax_rate numeric(7,2) not null default 20,
  payment_terms    text,
  status           text not null default 'active' check (status in ('active', 'inactive')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists set_suppliers_updated_at on suppliers;
create trigger set_suppliers_updated_at
  before update on suppliers
  for each row execute function update_updated_at_column();

create index if not exists idx_suppliers_org_name on suppliers(organisation_id, name);
create unique index if not exists idx_suppliers_org_name_unique
  on suppliers(organisation_id, lower(name));

create table if not exists purchase_orders (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  supplier_id      uuid not null references suppliers(id),
  property_id      uuid references properties(id) on delete set null,
  job_id           uuid references jobs(id) on delete set null,
  quote_id         uuid references quotes(id) on delete set null,
  po_number        text not null,
  status           text not null default 'draft'
                   check (status in ('draft', 'sent', 'approved', 'received', 'cancelled')),
  order_date       date not null default current_date,
  expected_date    date,
  subtotal         numeric(12,2) not null default 0,
  tax              numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  delivery_address text,
  notes            text,
  created_by       uuid references profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists set_purchase_orders_updated_at on purchase_orders;
create trigger set_purchase_orders_updated_at
  before update on purchase_orders
  for each row execute function update_updated_at_column();

create unique index if not exists idx_purchase_orders_org_number
  on purchase_orders(organisation_id, po_number);
create index if not exists idx_purchase_orders_org_status
  on purchase_orders(organisation_id, status);
create index if not exists idx_purchase_orders_supplier
  on purchase_orders(supplier_id);
create index if not exists idx_purchase_orders_job
  on purchase_orders(job_id);

create table if not exists purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  description       text not null,
  sku               text,
  quantity          numeric(10,2) not null default 1,
  unit_cost         numeric(12,2) not null default 0,
  tax_rate          numeric(7,2) not null default 20,
  line_subtotal     numeric(12,2) not null default 0,
  line_tax          numeric(12,2) not null default 0,
  line_total        numeric(12,2) not null default 0,
  sort_order        int not null default 0
);

create index if not exists idx_purchase_order_lines_po
  on purchase_order_lines(purchase_order_id);

alter table suppliers enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_lines enable row level security;

drop policy if exists suppliers_select_org on suppliers;
create policy suppliers_select_org on suppliers
  for select using (organisation_id = public.organisation_id());

drop policy if exists suppliers_insert_org on suppliers;
create policy suppliers_insert_org on suppliers
  for insert with check (organisation_id = public.organisation_id());

drop policy if exists suppliers_update_org on suppliers;
create policy suppliers_update_org on suppliers
  for update using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

drop policy if exists suppliers_delete_org on suppliers;
create policy suppliers_delete_org on suppliers
  for delete using (organisation_id = public.organisation_id());

drop policy if exists purchase_orders_select_org on purchase_orders;
create policy purchase_orders_select_org on purchase_orders
  for select using (organisation_id = public.organisation_id());

drop policy if exists purchase_orders_insert_org on purchase_orders;
create policy purchase_orders_insert_org on purchase_orders
  for insert with check (organisation_id = public.organisation_id());

drop policy if exists purchase_orders_update_org on purchase_orders;
create policy purchase_orders_update_org on purchase_orders
  for update using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

drop policy if exists purchase_orders_delete_org on purchase_orders;
create policy purchase_orders_delete_org on purchase_orders
  for delete using (organisation_id = public.organisation_id());

drop policy if exists purchase_order_lines_select_org on purchase_order_lines;
create policy purchase_order_lines_select_org on purchase_order_lines
  for select using (
    exists (
      select 1 from purchase_orders
      where purchase_orders.id = purchase_order_lines.purchase_order_id
        and purchase_orders.organisation_id = public.organisation_id()
    )
  );

drop policy if exists purchase_order_lines_insert_org on purchase_order_lines;
create policy purchase_order_lines_insert_org on purchase_order_lines
  for insert with check (
    exists (
      select 1 from purchase_orders
      where purchase_orders.id = purchase_order_lines.purchase_order_id
        and purchase_orders.organisation_id = public.organisation_id()
    )
  );

drop policy if exists purchase_order_lines_update_org on purchase_order_lines;
create policy purchase_order_lines_update_org on purchase_order_lines
  for update using (
    exists (
      select 1 from purchase_orders
      where purchase_orders.id = purchase_order_lines.purchase_order_id
        and purchase_orders.organisation_id = public.organisation_id()
    )
  );

drop policy if exists purchase_order_lines_delete_org on purchase_order_lines;
create policy purchase_order_lines_delete_org on purchase_order_lines
  for delete using (
    exists (
      select 1 from purchase_orders
      where purchase_orders.id = purchase_order_lines.purchase_order_id
        and purchase_orders.organisation_id = public.organisation_id()
    )
  );

-- ── Engineer tracker live location support ───────────────────
alter table engineer_accreditations add column if not exists qqi_level text;
alter table engineer_accreditations add column if not exists issuing_body text;

create table if not exists engineer_locations (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  engineer_id      uuid not null references engineers(id) on delete cascade,
  current_job_id   uuid references jobs(id) on delete set null,
  latitude         numeric,
  longitude        numeric,
  accuracy_metres  integer,
  movement_status  text not null default 'available'
                   check (movement_status in ('available', 'travelling', 'on_site', 'offline')),
  eta_at           timestamptz,
  recorded_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create index if not exists idx_engineer_locations_latest
  on engineer_locations(organisation_id, engineer_id, recorded_at desc);
create index if not exists idx_engineer_locations_job
  on engineer_locations(current_job_id);

alter table engineer_locations enable row level security;

drop policy if exists engineer_locations_select_org on engineer_locations;
create policy engineer_locations_select_org on engineer_locations
  for select using (organisation_id = public.organisation_id());

drop policy if exists engineer_locations_insert_self_or_admin on engineer_locations;
create policy engineer_locations_insert_self_or_admin on engineer_locations
  for insert with check (
    organisation_id = public.organisation_id()
    and (
      exists (
        select 1 from engineers
        where engineers.id = engineer_locations.engineer_id
          and engineers.profile_id = auth.uid()
      )
      or exists (
        select 1 from profiles
        where profiles.id = auth.uid()
          and profiles.role in ('org_admin', 'super_admin', 'scheduler')
      )
    )
  );

-- Force PostgREST/Supabase to reload the schema cache after this migration.
notify pgrst, 'reload schema';
