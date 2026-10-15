-- ============================================================
-- Facilities OS - Initial Schema Migration
-- Multi-tenant compliance, service operations & billing platform
-- ============================================================

-- =========================
-- updated_at trigger function
-- =========================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================
-- 1. organisations
-- =========================
create table organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  logo_url   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_organisations_updated_at
  before update on organisations
  for each row execute function update_updated_at_column();

-- =========================
-- 2. profiles (extends auth.users)
-- =========================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid references organisations(id),
  email           text not null,
  full_name       text,
  role            text not null default 'engineer'
                    check (role in ('super_admin','org_admin','scheduler','finance','engineer','client_admin','auditor')),
  avatar_url      text,
  phone           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_profiles_organisation_id on profiles(organisation_id);

create trigger set_profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at_column();

-- =========================
-- 3. clients
-- =========================
create table clients (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  name            text not null,
  contact_email   text,
  contact_phone   text,
  address         text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_clients_organisation_id on clients(organisation_id);

create trigger set_clients_updated_at
  before update on clients
  for each row execute function update_updated_at_column();

-- =========================
-- 4. properties
-- =========================
create table properties (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  organisation_id   uuid not null references organisations(id),
  name              text not null,
  address           text not null,
  site_type         text,
  operating_hours   text,
  access_notes      text,
  emergency_details text,
  latitude          numeric,
  longitude         numeric,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_properties_organisation_id on properties(organisation_id);
create index idx_properties_client_id on properties(client_id);

create trigger set_properties_updated_at
  before update on properties
  for each row execute function update_updated_at_column();

-- =========================
-- 5. areas
-- =========================
create table areas (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  name        text not null,
  floor       text,
  description text
);

-- =========================
-- 6. assets
-- =========================
create table assets (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references properties(id),
  area_id         uuid references areas(id),
  organisation_id uuid not null references organisations(id),
  name            text not null,
  category        text not null,
  make            text,
  model           text,
  serial_number   text,
  install_date    date,
  status          text not null default 'active'
                    check (status in ('active','inactive','decommissioned')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_assets_organisation_id on assets(organisation_id);
create index idx_assets_property_id on assets(property_id);

create trigger set_assets_updated_at
  before update on assets
  for each row execute function update_updated_at_column();

-- =========================
-- 7. compliance_items
-- =========================
create table compliance_items (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references properties(id),
  asset_id        uuid references assets(id),
  organisation_id uuid not null references organisations(id),
  name            text not null,
  compliance_type text not null,
  frequency       text not null
                    check (frequency in ('daily','weekly','monthly','quarterly','six_monthly','annual')),
  last_completed  timestamptz,
  next_due        timestamptz,
  status          text not null default 'compliant'
                    check (status in ('compliant','due_soon','overdue','non_compliant')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_compliance_items_organisation_id on compliance_items(organisation_id);
create index idx_compliance_items_property_id on compliance_items(property_id);
create index idx_compliance_items_status on compliance_items(status);
create index idx_compliance_items_next_due on compliance_items(next_due);

create trigger set_compliance_items_updated_at
  before update on compliance_items
  for each row execute function update_updated_at_column();

-- =========================
-- 8. maintenance_plans
-- =========================
create table maintenance_plans (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references properties(id),
  asset_id        uuid references assets(id),
  organisation_id uuid not null references organisations(id),
  name            text not null,
  description     text,
  frequency       text not null
                    check (frequency in ('daily','weekly','monthly','quarterly','six_monthly','annual')),
  last_completed  timestamptz,
  next_due        timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_maintenance_plans_organisation_id on maintenance_plans(organisation_id);
create index idx_maintenance_plans_next_due on maintenance_plans(next_due);

create trigger set_maintenance_plans_updated_at
  before update on maintenance_plans
  for each row execute function update_updated_at_column();

-- =========================
-- 9. jobs
-- =========================
create table jobs (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references properties(id),
  organisation_id     uuid not null references organisations(id),
  maintenance_plan_id uuid references maintenance_plans(id),
  compliance_item_id  uuid references compliance_items(id),
  title               text not null,
  description         text,
  status              text not null default 'scheduled'
                        check (status in ('scheduled','in_progress','completed','failed_access','follow_up_required','cancelled')),
  priority            text not null default 'medium'
                        check (priority in ('low','medium','high','urgent')),
  scheduled_date      timestamptz,
  completed_date      timestamptz,
  time_window         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_jobs_organisation_id on jobs(organisation_id);
create index idx_jobs_property_id on jobs(property_id);
create index idx_jobs_status on jobs(status);
create index idx_jobs_scheduled_date on jobs(scheduled_date);

create trigger set_jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at_column();

-- =========================
-- 10. engineer_assignments
-- =========================
create table engineer_assignments (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references jobs(id) on delete cascade,
  engineer_id uuid not null references profiles(id),
  assigned_at timestamptz not null default now(),
  notes       text
);

-- =========================
-- 11. service_reports
-- =========================
create table service_reports (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references jobs(id),
  organisation_id uuid not null references organisations(id),
  engineer_id     uuid references profiles(id),
  notes           text,
  outcome         text,
  checklist       jsonb,
  signature_url   text,
  submitted_at    timestamptz not null default now()
);

-- =========================
-- 12. documents
-- =========================
create table documents (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  property_id     uuid references properties(id),
  asset_id        uuid references assets(id),
  job_id          uuid references jobs(id),
  name            text not null,
  file_url        text not null,
  file_size       bigint,
  mime_type       text,
  document_type   text,
  tags            text[],
  expiry_date     date,
  uploaded_by     uuid references profiles(id),
  uploaded_at     timestamptz not null default now()
);

create index idx_documents_organisation_id on documents(organisation_id);
create index idx_documents_property_id on documents(property_id);

-- =========================
-- 13. actions
-- =========================
create table actions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  property_id     uuid references properties(id),
  job_id          uuid references jobs(id),
  asset_id        uuid references assets(id),
  title           text not null,
  description     text,
  status          text not null default 'open'
                    check (status in ('open','in_progress','completed','cancelled')),
  priority        text not null default 'medium'
                    check (priority in ('low','medium','high','urgent')),
  due_date        date,
  assigned_to     uuid references profiles(id),
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_actions_updated_at
  before update on actions
  for each row execute function update_updated_at_column();

-- =========================
-- 14. quotes
-- =========================
create table quotes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  client_id       uuid not null references clients(id),
  property_id     uuid references properties(id),
  job_id          uuid references jobs(id),
  quote_number    text not null,
  status          text not null default 'draft'
                    check (status in ('draft','sent','approved','rejected','expired')),
  subtotal        numeric(12,2) not null default 0,
  tax             numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  valid_until     date,
  notes           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_quotes_organisation_id on quotes(organisation_id);
create index idx_quotes_client_id on quotes(client_id);
create index idx_quotes_status on quotes(status);

create trigger set_quotes_updated_at
  before update on quotes
  for each row execute function update_updated_at_column();

-- =========================
-- 15. quote_lines
-- =========================
create table quote_lines (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references quotes(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(12,2) not null,
  total       numeric(12,2) not null,
  sort_order  int not null default 0
);

-- =========================
-- 16. invoices
-- =========================
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  client_id       uuid not null references clients(id),
  quote_id        uuid references quotes(id),
  property_id     uuid references properties(id),
  invoice_number  text not null,
  status          text not null default 'draft'
                    check (status in ('draft','sent','paid','overdue','cancelled','partially_paid')),
  subtotal        numeric(12,2) not null default 0,
  tax             numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  due_date        date,
  paid_date       date,
  notes           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_invoices_organisation_id on invoices(organisation_id);
create index idx_invoices_client_id on invoices(client_id);
create index idx_invoices_status on invoices(status);

create trigger set_invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at_column();

-- =========================
-- 17. invoice_lines
-- =========================
create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(12,2) not null,
  total       numeric(12,2) not null,
  sort_order  int not null default 0
);

-- =========================
-- 18. payments
-- =========================
create table payments (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references invoices(id),
  organisation_id uuid not null references organisations(id),
  amount          numeric(12,2) not null,
  payment_method  text,
  reference       text,
  paid_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- =========================
-- 19. contracts
-- =========================
create table contracts (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references organisations(id),
  client_id            uuid not null references clients(id),
  title                text not null,
  start_date           date,
  end_date             date,
  value                numeric(12,2),
  services_included    text,
  frequency_commitment text,
  sla_notes            text,
  status               text not null default 'active'
                         check (status in ('draft','active','expired','cancelled')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger set_contracts_updated_at
  before update on contracts
  for each row execute function update_updated_at_column();

-- =========================
-- 20. timeline_events
-- =========================
create table timeline_events (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  property_id     uuid references properties(id),
  client_id       uuid references clients(id),
  job_id          uuid references jobs(id),
  event_type      text not null,
  description     text not null,
  metadata        jsonb,
  user_id         uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create index idx_timeline_events_organisation_id on timeline_events(organisation_id);
create index idx_timeline_events_property_id on timeline_events(property_id);
create index idx_timeline_events_created_at on timeline_events(created_at);

-- =========================
-- 21. notifications
-- =========================
create table notifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id),
  organisation_id   uuid not null references organisations(id),
  title             text not null,
  message           text not null,
  read              boolean not null default false,
  notification_type text not null,
  link              text,
  created_at        timestamptz not null default now()
);

create index idx_notifications_user_id on notifications(user_id);
create index idx_notifications_read on notifications(read);
