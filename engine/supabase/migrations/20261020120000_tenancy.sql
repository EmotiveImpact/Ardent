-- Ardent engine: tenancy.
--
-- Every firm on Ardent is an organisation. Every business row carries the
-- organisation's id and row level security keeps each firm sealed off from
-- every other. People reach an organisation through a membership with one of
-- three roles:
--   owner   runs the firm: everything office can do, plus members and settings
--   office  dispatch, customers, jobs, money (Ardent Core)
--   field   engineers and subcontractors on the phone (Ardent Field); they see
--           only the jobs they are assigned to and what those jobs need
--
-- Adapted from Haumea's organisations/profiles/RLS pattern. Two changes: a
-- person can belong to more than one organisation (a subbie working for two
-- firms), and ids are readable prefixed strings (job_..., cus_...) that the
-- phone can mint offline, matching core/src/data/model.ts.

create schema if not exists ardent;
comment on schema ardent is 'Ardent engine internals: helpers used by policies and triggers. Not exposed over the API.';

-- Prefixed random id, e.g. job_3f9c0a...; clients may also supply their own.
create or replace function ardent.new_id(prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select prefix || '_' || replace(gen_random_uuid()::text, '-', '')
$$;

create or replace function ardent.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rows never move between organisations.
create or replace function ardent.lock_org_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- =========================
-- organisations
-- =========================
create table public.organisations (
  id         text primary key default ardent.new_id('org') check (id like 'org\_%'),
  name       text not null check (length(trim(name)) > 0),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- The engine is configured per industry; trades is the first.
  industry   text not null default 'trades',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organisations_updated_at before update on public.organisations
  for each row execute function ardent.set_updated_at();

-- =========================
-- memberships
-- =========================
create table public.memberships (
  id         text primary key default ardent.new_id('mem') check (id like 'mem\_%'),
  org_id     text not null references public.organisations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'office', 'field')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index memberships_user_id on public.memberships(user_id);

create trigger memberships_updated_at before update on public.memberships
  for each row execute function ardent.set_updated_at();
create trigger memberships_lock_org before update on public.memberships
  for each row execute function ardent.lock_org_id();

-- =========================
-- human reference counters (J-1042, Q-311, INV-2207)
-- =========================
create table public.org_counters (
  org_id text not null references public.organisations(id) on delete cascade,
  kind   text not null,
  last   integer not null,
  primary key (org_id, kind)
);

-- Next number for an organisation's job, quote or invoice refs. Numbers start
-- at 1001 so a new firm doesn't open on J-1.
create or replace function ardent.next_number(org text, counter text)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.org_counters as c (org_id, kind, last)
  values (org, counter, 1001)
  on conflict (org_id, kind) do update set last = c.last + 1
  returning last
$$;

-- =========================
-- who is asking
-- =========================
-- security definer so policies can read memberships without recursing into
-- the memberships policies themselves.
create or replace function ardent.role_in(org text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.memberships where org_id = org and user_id = auth.uid()
$$;

create or replace function ardent.is_member(org text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships where org_id = org and user_id = auth.uid())
$$;

-- Owner or office: full access to the firm's records.
create or replace function ardent.is_office(org text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where org_id = org and user_id = auth.uid() and role in ('owner', 'office')
  )
$$;

create or replace function ardent.is_owner(org text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where org_id = org and user_id = auth.uid() and role = 'owner'
  )
$$;

-- =========================
-- sign-up: a new firm and its first owner
-- =========================
create or replace function public.create_organisation(org_name text, org_slug text)
returns public.organisations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  org public.organisations;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  insert into public.organisations (name, slug) values (org_name, org_slug) returning * into org;
  insert into public.memberships (org_id, user_id, role) values (org.id, auth.uid(), 'owner');
  return org;
end;
$$;
