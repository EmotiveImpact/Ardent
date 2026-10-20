-- Ardent engine: the firm's standing records.
--
-- customers -> sites -> assets is Haumea's clients -> properties -> assets
-- hierarchy, simplified for domestic and small commercial trade work: no
-- areas table (an asset just says where it is, e.g. "Loft"), and a site is an
-- address rather than a managed building.
--
-- Every child row repeats org_id and points at its parent through
-- (org_id, parent_id), so a row can never reference another firm's record.

-- Trades the engine knows about. A superset of Trade in core/src/data/model.ts,
-- covering the regulated trades Ardent targets.
create or replace function ardent.is_trade_list(ts text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select ts <@ array['gas', 'electrical', 'plumbing', 'heating', 'roofing', 'carpentry', 'fire', 'lifts', 'hvac', 'general']
$$;

-- =========================
-- operators: the crew
-- =========================
-- A tradesperson working for the firm, whether owner, employee or subbie.
-- Linked to a sign-in through user_id once they have the Field app; the office
-- can add crew before they ever log in.
create table public.operators (
  id             text primary key default ardent.new_id('opr') check (id like 'opr\_%'),
  org_id         text not null references public.organisations(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  name           text not null,
  initials       text not null check (length(initials) between 1 and 3),
  role           text not null default 'operator' check (role in ('owner', 'operator', 'subcontractor')),
  trades         text[] not null default '{}' check (ardent.is_trade_list(trades)),
  van            text,
  phone          text,
  -- What they are doing right now. Field sets it; Core reads it.
  state          text not null default 'off_shift'
                   check (state in ('on_call', 'en_route', 'on_site', 'workshop', 'delayed', 'off_shift')),
  current_job_id text, -- foreign key added with jobs
  eta_minutes    integer check (eta_minutes >= 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, user_id)
);

create trigger operators_updated_at before update on public.operators
  for each row execute function ardent.set_updated_at();

-- Gas Safe, NICEIC and similar registrations.
create table public.operator_registrations (
  id          text primary key default ardent.new_id('reg') check (id like 'reg\_%'),
  org_id      text not null,
  operator_id text not null,
  body        text not null,
  number      text not null,
  expires     date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (org_id, operator_id) references public.operators(org_id, id) on delete cascade
);

create index operator_registrations_operator on public.operator_registrations(operator_id);

create trigger operator_registrations_updated_at before update on public.operator_registrations
  for each row execute function ardent.set_updated_at();

-- The signed-in person's crew record in an organisation, if they have one.
-- Needs a live membership too, so removing someone from the firm cuts them
-- off even while their crew record stays for the history.
create or replace function ardent.my_operator_id(org text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.operators o
  join public.memberships m on m.org_id = o.org_id and m.user_id = o.user_id
  where o.org_id = org and o.user_id = auth.uid()
$$;

-- =========================
-- customers
-- =========================
create table public.customers (
  id         text primary key default ardent.new_id('cus') check (id like 'cus\_%'),
  org_id     text not null references public.organisations(id) on delete cascade,
  name       text not null,
  kind       text not null default 'homeowner'
               check (kind in ('homeowner', 'landlord', 'letting_agent', 'business')),
  phone      text,
  email      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

create index customers_org on public.customers(org_id);

create trigger customers_updated_at before update on public.customers
  for each row execute function ardent.set_updated_at();

-- =========================
-- sites: where the work happens
-- =========================
create table public.sites (
  id           text primary key default ardent.new_id('sit') check (id like 'sit\_%'),
  org_id       text not null,
  customer_id  text not null,
  line1        text not null,
  line2        text,
  town         text not null,
  postcode     text not null,
  access_notes text,
  latitude     double precision check (latitude between -90 and 90),
  longitude    double precision check (longitude between -180 and 180),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, customer_id) references public.customers(org_id, id) on delete cascade
);

create index sites_org on public.sites(org_id);
create index sites_customer on public.sites(customer_id);

create trigger sites_updated_at before update on public.sites
  for each row execute function ardent.set_updated_at();

-- =========================
-- assets: what is installed at a site
-- =========================
-- Boilers, consumer units, alarm panels, lifts. Service history hangs off
-- these once jobs record which asset they touched.
create table public.assets (
  id            text primary key default ardent.new_id('ast') check (id like 'ast\_%'),
  org_id        text not null,
  site_id       text not null,
  name          text not null,
  category      text not null, -- boiler, consumer_unit, fire_panel, lift, cylinder ...
  location      text,          -- Loft, Kitchen cupboard, Plant room
  make          text,
  model         text,
  serial_number text,
  installed_on  date,
  status        text not null default 'active' check (status in ('active', 'inactive', 'removed')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, site_id) references public.sites(org_id, id) on delete cascade
);

create index assets_site on public.assets(site_id);

create trigger assets_updated_at before update on public.assets
  for each row execute function ardent.set_updated_at();

-- org_id never changes on any of these.
create trigger operators_lock_org before update on public.operators for each row execute function ardent.lock_org_id();
create trigger operator_registrations_lock_org before update on public.operator_registrations for each row execute function ardent.lock_org_id();
create trigger customers_lock_org before update on public.customers for each row execute function ardent.lock_org_id();
create trigger sites_lock_org before update on public.sites for each row execute function ardent.lock_org_id();
create trigger assets_lock_org before update on public.assets for each row execute function ardent.lock_org_id();
