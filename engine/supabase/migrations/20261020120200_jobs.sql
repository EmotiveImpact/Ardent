-- Ardent engine: jobs and what happens on them.
--
-- A job is booked by the office in Ardent Core and worked by the crew in
-- Ardent Field. The nested Job shape in core/src/data/model.ts (lines, checks,
-- operatorIds) is stored here as child tables so the phone can add a line or
-- pass a check without rewriting the whole job.

-- A job's site must belong to the job's customer.
alter table public.sites add constraint sites_org_customer_id unique (org_id, customer_id, id);

-- =========================
-- jobs
-- =========================
create table public.jobs (
  id          text primary key default ardent.new_id('job') check (id like 'job\_%'),
  org_id      text not null references public.organisations(id) on delete cascade,
  ref         text not null, -- J-1042, set on insert
  title       text not null,
  trade       text not null check (ardent.is_trade_list(array[trade])),
  status      text not null default 'enquiry' check (status in (
                'enquiry', 'quoted', 'booked', 'en_route', 'on_site', 'paused',
                'complete', 'invoiced', 'paid', 'cancelled')),
  priority    text not null default 'normal' check (priority in ('emergency', 'high', 'normal', 'low')),
  customer_id text not null,
  site_id     text not null,
  asset_id    text,
  -- Booked window. Empty until the job is booked.
  starts_at   timestamptz,
  ends_at     timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, ref),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  foreign key (org_id, customer_id) references public.customers(org_id, id),
  foreign key (org_id, customer_id, site_id) references public.sites(org_id, customer_id, id),
  foreign key (org_id, asset_id) references public.assets(org_id, id) on delete set null (asset_id)
);

create index jobs_org_starts on public.jobs(org_id, starts_at);
create index jobs_org_status on public.jobs(org_id, status);
create index jobs_site on public.jobs(site_id);
create index jobs_customer on public.jobs(customer_id);

create or replace function ardent.set_job_ref()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ref is null then
    new.ref := 'J-' || ardent.next_number(new.org_id, 'job');
  end if;
  return new;
end;
$$;

create trigger jobs_ref before insert on public.jobs for each row execute function ardent.set_job_ref();
create trigger jobs_updated_at before update on public.jobs for each row execute function ardent.set_updated_at();

alter table public.operators
  add foreign key (org_id, current_job_id) references public.jobs(org_id, id) on delete set null (current_job_id);

-- =========================
-- job_operators: who is on the job
-- =========================
create table public.job_operators (
  org_id      text not null,
  job_id      text not null,
  operator_id text not null,
  created_at  timestamptz not null default now(),
  primary key (job_id, operator_id),
  foreign key (org_id, job_id) references public.jobs(org_id, id) on delete cascade,
  foreign key (org_id, operator_id) references public.operators(org_id, id) on delete cascade
);

create index job_operators_operator on public.job_operators(operator_id);

-- Is the signed-in person on the crew for this job?
create or replace function ardent.is_assigned(job text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.job_operators jo
    join public.operators o on o.org_id = jo.org_id and o.id = jo.operator_id
    join public.memberships m on m.org_id = o.org_id and m.user_id = o.user_id
    where jo.job_id = job and o.user_id = auth.uid()
  )
$$;

create or replace function ardent.can_see_job(org text, job text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ardent.is_office(org) or ardent.is_assigned(job)
$$;

-- Field can still add lines and checks until the job is invoiced.
create or replace function ardent.field_can_edit_job(job text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ardent.is_assigned(job)
     and exists (select 1 from public.jobs where id = job and status not in ('invoiced', 'paid', 'cancelled'))
$$;

-- Field sees a customer, site or asset only through a job they are on.
create or replace function ardent.field_sees_site(site text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.jobs j where j.site_id = site and ardent.is_assigned(j.id))
$$;

create or replace function ardent.field_sees_customer(customer text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.jobs j where j.customer_id = customer and ardent.is_assigned(j.id))
$$;

-- =========================
-- job_lines: labour, materials, call-outs
-- =========================
create table public.job_lines (
  id          text primary key default ardent.new_id('li') check (id like 'li\_%'),
  org_id      text not null,
  job_id      text not null,
  kind        text not null check (kind in ('labour', 'material', 'callout', 'other')),
  description text not null,
  quantity    numeric(10, 2) not null check (quantity > 0),
  unit_price  integer not null, -- pence, before VAT
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (org_id, job_id) references public.jobs(org_id, id) on delete cascade
);

create index job_lines_job on public.job_lines(job_id, position);

create trigger job_lines_updated_at before update on public.job_lines for each row execute function ardent.set_updated_at();

-- =========================
-- job_checks: compliance gates
-- =========================
create table public.job_checks (
  id         text primary key default ardent.new_id('chk') check (id like 'chk\_%'),
  org_id     text not null,
  job_id     text not null,
  key        text not null check (key in ('rams', 'permit', 'registration', 'gas_tightness', 'eicr', 'photos', 'signature')),
  label      text not null,
  state      text not null default 'pending' check (state in ('pass', 'fail', 'pending', 'n/a')),
  detail     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, key),
  foreign key (org_id, job_id) references public.jobs(org_id, id) on delete cascade
);

create trigger job_checks_updated_at before update on public.job_checks for each row execute function ardent.set_updated_at();

-- =========================
-- time_entries: travel, labour, admin
-- =========================
create table public.time_entries (
  id          text primary key default ardent.new_id('tim') check (id like 'tim\_%'),
  org_id      text not null references public.organisations(id) on delete cascade,
  operator_id text not null,
  job_id      text,
  kind        text not null check (kind in ('travel', 'labour', 'admin')),
  started_at  timestamptz not null,
  ended_at    timestamptz, -- empty while the clock is running
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  foreign key (org_id, operator_id) references public.operators(org_id, id) on delete cascade,
  foreign key (org_id, job_id) references public.jobs(org_id, id) on delete cascade
);

create index time_entries_job on public.time_entries(job_id);
create index time_entries_operator on public.time_entries(operator_id, started_at);

create trigger time_entries_updated_at before update on public.time_entries for each row execute function ardent.set_updated_at();

-- =========================
-- photos: evidence from site
-- =========================
-- uri is a local file on the phone until the upload lands, then the storage
-- path. Storage buckets come with the offline photo work.
create table public.photos (
  id          text primary key default ardent.new_id('pho') check (id like 'pho\_%'),
  org_id      text not null,
  job_id      text not null,
  operator_id text not null,
  stage       text not null check (stage in ('before', 'during', 'after')),
  uri         text not null,
  caption     text,
  taken_at    timestamptz not null,
  uploaded_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (org_id, job_id) references public.jobs(org_id, id) on delete cascade,
  foreign key (org_id, operator_id) references public.operators(org_id, id)
);

create index photos_job on public.photos(job_id, taken_at);

create trigger photos_updated_at before update on public.photos for each row execute function ardent.set_updated_at();

-- =========================
-- notes
-- =========================
create table public.notes (
  id          text primary key default ardent.new_id('not') check (id like 'not\_%'),
  org_id      text not null,
  job_id      text not null,
  operator_id text, -- empty for notes written in the office
  body        text not null check (length(trim(body)) > 0),
  at          timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (org_id, job_id) references public.jobs(org_id, id) on delete cascade,
  foreign key (org_id, operator_id) references public.operators(org_id, id)
);

create index notes_job on public.notes(job_id, at);

create trigger notes_updated_at before update on public.notes for each row execute function ardent.set_updated_at();

-- =========================
-- signatures: customer sign-off on the phone
-- =========================
create table public.signatures (
  id          text primary key default ardent.new_id('sig') check (id like 'sig\_%'),
  org_id      text not null,
  job_id      text not null,
  operator_id text not null,
  signed_by   text not null,
  svg         text not null, -- SVG path data of the strokes
  at          timestamptz not null,
  created_at  timestamptz not null default now(),
  foreign key (org_id, job_id) references public.jobs(org_id, id) on delete cascade,
  foreign key (org_id, operator_id) references public.operators(org_id, id)
);

create index signatures_job on public.signatures(job_id);

-- =========================
-- certificates: CP12, EICR and friends
-- =========================
-- valid / due_soon / overdue / draft is worked out from the dates when read,
-- so it never goes stale: no issued_on means draft.
create table public.certificates (
  id         text primary key default ardent.new_id('cer') check (id like 'cer\_%'),
  org_id     text not null,
  kind       text not null check (kind in ('CP12', 'EICR', 'PAT', 'BS5839', 'Boiler service', 'Unvented')),
  site_id    text not null,
  job_id     text,
  asset_id   text,
  issued_on  date,
  expires_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, site_id) references public.sites(org_id, id) on delete cascade,
  foreign key (org_id, job_id) references public.jobs(org_id, id) on delete set null (job_id),
  foreign key (org_id, asset_id) references public.assets(org_id, id) on delete set null (asset_id)
);

create index certificates_org_expires on public.certificates(org_id, expires_on);
create index certificates_site on public.certificates(site_id);

create trigger certificates_updated_at before update on public.certificates for each row execute function ardent.set_updated_at();

create trigger jobs_lock_org before update on public.jobs for each row execute function ardent.lock_org_id();
create trigger job_lines_lock_org before update on public.job_lines for each row execute function ardent.lock_org_id();
create trigger job_checks_lock_org before update on public.job_checks for each row execute function ardent.lock_org_id();
create trigger time_entries_lock_org before update on public.time_entries for each row execute function ardent.lock_org_id();
create trigger photos_lock_org before update on public.photos for each row execute function ardent.lock_org_id();
create trigger notes_lock_org before update on public.notes for each row execute function ardent.lock_org_id();
create trigger certificates_lock_org before update on public.certificates for each row execute function ardent.lock_org_id();
