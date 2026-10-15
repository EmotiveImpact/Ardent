-- Migration: 00097_job_numbers.sql
-- Feature (V1 backlog #2): human-readable job/task numbers like "H-101".
--
-- Per-organisation sequence so each operator's jobs number from H-101 upward.
-- A counter table + a BEFORE INSERT trigger assign the number atomically (the
-- ON CONFLICT … DO UPDATE … RETURNING is race-safe under concurrent inserts).
-- Existing jobs are backfilled in creation order.

create table if not exists public.org_job_counters (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  -- Holds the LAST issued number for the org.
  next_number bigint not null default 100
);
alter table public.org_job_counters enable row level security;
drop policy if exists org_job_counters_select on public.org_job_counters;
create policy org_job_counters_select on public.org_job_counters
  for select to authenticated using (organisation_id = public.organisation_id());

alter table public.jobs add column if not exists job_number text;

-- Atomically issue the next number for the job's org and stamp it as "H-<n>".
create or replace function public.assign_job_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_num bigint;
begin
  if new.job_number is not null then return new; end if;
  if new.organisation_id is null then return new; end if;
  insert into public.org_job_counters as c (organisation_id, next_number)
    values (new.organisation_id, 101)
  on conflict (organisation_id) do update set next_number = c.next_number + 1
  returning next_number into v_num;
  new.job_number := 'H-' || v_num;
  return new;
end;
$$;

drop trigger if exists trg_assign_job_number on public.jobs;
create trigger trg_assign_job_number
  before insert on public.jobs
  for each row execute function public.assign_job_number();

-- Backfill existing jobs in creation order, per org (first = H-101).
with numbered as (
  select id, 100 + row_number() over (partition by organisation_id order by created_at, id) as n
  from public.jobs
  where organisation_id is not null
)
update public.jobs j set job_number = 'H-' || nb.n
from numbered nb where nb.id = j.id and j.job_number is null;

-- Seed each org's counter to its last issued number so new inserts continue.
insert into public.org_job_counters (organisation_id, next_number)
select organisation_id, 100 + count(*) from public.jobs
where organisation_id is not null
group by organisation_id
on conflict (organisation_id) do update set next_number = excluded.next_number;

create unique index if not exists idx_jobs_org_job_number
  on public.jobs(organisation_id, job_number);
