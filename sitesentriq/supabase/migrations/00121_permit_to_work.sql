-- Migration: 00121_permit_to_work.sql
-- Description: digital permit-to-work (trust wave W3-T10). Permits with a
--   status machine + issuer role gate, a `requires_permit` flag on jobs, and
--   a FAIL-CLOSED dispatch gate: a flagged job cannot move INTO in_progress
--   without an issued/active permit. Incumbents sell PTW as a paid add-on
--   module; clients expect permits + RAMS + contractor vetting in one system.
--
-- Safety posture (the 00086/PPM lesson, inverted deliberately):
--   * The permit-transition trigger is fail-closed — permits writes are not
--     the job-write path, so strictness is safe.
--   * The JOBS gate no-ops for every unflagged job and every non-in_progress
--     transition; service-role writes bypass (mirrors 00116). The ONLY
--     fail-closed element in the job-write path is the explicit permit check
--     for flagged jobs — that is the feature.
--   * Auto-activation of the issued permit (D3) is nested fail-open so a
--     permits-side bug can never block check-in beyond the intended gate.

-- ── 1. permits ─────────────────────────────────────────────────────────

create table if not exists public.permits (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  permit_type     text not null check (permit_type in
    ('hot_works', 'confined_space', 'working_at_height', 'electrical_isolation',
     'roof_access', 'excavation', 'general')),
  status          text not null default 'requested' check (status in
    ('requested', 'issued', 'active', 'closed', 'cancelled', 'rejected')),
  rams_id         uuid references public.subcontractor_rams(id) on delete set null,
  requested_by    uuid references public.profiles(id) on delete set null,
  issued_by       uuid references public.profiles(id) on delete set null,
  closed_by       uuid references public.profiles(id) on delete set null,
  issued_at       timestamptz,
  valid_from      timestamptz,
  valid_to        timestamptz,
  closed_at       timestamptz,
  conditions      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_permits_job on public.permits(job_id);
create index if not exists idx_permits_property on public.permits(property_id);
create index if not exists idx_permits_org_open
  on public.permits(organisation_id, status)
  where status in ('requested', 'issued', 'active');

drop trigger if exists set_permits_updated_at on public.permits;
create trigger set_permits_updated_at
  before update on public.permits
  for each row execute function public.update_updated_at_column();

alter table public.permits enable row level security;

drop policy if exists permits_select_org on public.permits;
drop policy if exists permits_insert_org on public.permits;
drop policy if exists permits_update_org on public.permits;
drop policy if exists permits_delete_org on public.permits;
create policy permits_select_org on public.permits
  for select to authenticated using (organisation_id = public.organisation_id());
create policy permits_insert_org on public.permits
  for insert to authenticated with check (organisation_id = public.organisation_id());
create policy permits_update_org on public.permits
  for update to authenticated using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
create policy permits_delete_org on public.permits
  for delete to authenticated using (organisation_id = public.organisation_id());

-- ── 2. Permit status machine + issuer role gate ───────────────────────

create or replace function public.fos_validate_permit_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_allowed boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_allowed := case old.status
    when 'requested' then new.status in ('issued', 'rejected', 'cancelled')
    when 'issued' then new.status in ('active', 'closed', 'cancelled')
    when 'active' then new.status in ('closed', 'cancelled')
    else false -- closed / cancelled / rejected are terminal
  end;
  if not v_allowed then
    raise exception 'permit_invalid_transition: % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;

  -- Issuing a permit is a controlled act: org_admin / scheduler only.
  -- Service-role (auth.uid() null) bypasses — e.g. the jobs gate's
  -- auto-activation runs inside a definer context.
  if new.status = 'issued' and auth.uid() is not null then
    select role into v_role from public.profiles where id = auth.uid();
    if v_role not in ('org_admin', 'super_admin', 'scheduler') then
      raise exception 'permit_issue_forbidden: only an admin or scheduler can issue a permit'
        using errcode = 'P0001';
    end if;
    new.issued_by := auth.uid();
    new.issued_at := now();
  elsif new.status = 'issued' then
    new.issued_at := coalesce(new.issued_at, now());
  end if;

  if new.status = 'closed' then
    new.closed_at := now();
    new.closed_by := coalesce(auth.uid(), new.closed_by);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_permits_transition on public.permits;
create trigger trg_permits_transition
  before update of status on public.permits
  for each row execute function public.fos_validate_permit_transition();

-- ── 3. Jobs flag + the PTW gate ────────────────────────────────────────

alter table public.jobs add column if not exists requires_permit boolean not null default false;

create or replace function public.fos_enforce_permit_to_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the transition INTO in_progress of a FLAGGED job is gated.
  if new.status <> 'in_progress' or not new.requires_permit then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if auth.uid() is null then
    return new; -- service-role / system write
  end if;

  -- FAIL-CLOSED by design: this check is the feature.
  if not exists (
    select 1 from public.permits p
    where p.job_id = new.id and p.status in ('issued', 'active')
  ) then
    raise exception 'permit_required: job is flagged permit-to-work and has no issued permit'
      using errcode = 'P0001';
  end if;

  -- D3: auto-activate the issued permit as work starts. Fail-open — a
  -- permits-side bug must never block a check-in that passed the gate.
  begin
    update public.permits set status = 'active'
    where job_id = new.id and status = 'issued';
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_jobs_permit_gate on public.jobs;
create trigger trg_jobs_permit_gate
  before insert or update of status, requires_permit on public.jobs
  for each row execute function public.fos_enforce_permit_to_work();

comment on function public.fos_enforce_permit_to_work() is
  'PTW gate: a job with requires_permit=true cannot enter in_progress without an issued/active permit (fail-closed for flagged jobs only; service-role bypass; auto-activates the issued permit fail-open).';
