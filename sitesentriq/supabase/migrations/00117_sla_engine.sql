-- Migration: 00117_sla_engine.sql
-- Description: SLA engine (trust wave W2-T6). Per-contract response/fix
--   targets by priority, stamped onto jobs at creation (immutable evidence),
--   met-times stamped from field activity, and a per-contract period summary
--   with service-credit maths (the QFM capability absent in the mid-market).
--
-- Design (plan D2): a BEFORE INSERT trigger is the only thing that covers all
-- five job-creation paths (web, mobile, portal callout, PPM RPC, auto-assign).
-- The trigger is SECURITY DEFINER (a portal tenant has no RLS read on
-- contracts) and FAIL-OPEN — an SLA lookup bug must never block job creation
-- (the 00086/PPM failure mode must not repeat). Everything schema-qualified
-- under search_path=''.

-- ── 1. Per-contract SLA policies ───────────────────────────────────────

create table if not exists public.contract_sla_policies (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations(id) on delete cascade,
  contract_id       uuid not null references public.contracts(id) on delete cascade,
  priority          text not null check (priority in ('low', 'medium', 'high', 'urgent')),
  response_minutes  integer not null check (response_minutes > 0),
  fix_minutes       integer not null check (fix_minutes > 0),
  credit_per_breach numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (contract_id, priority)
);

create index if not exists idx_contract_sla_policies_contract on public.contract_sla_policies(contract_id);

drop trigger if exists set_contract_sla_policies_updated_at on public.contract_sla_policies;
create trigger set_contract_sla_policies_updated_at
  before update on public.contract_sla_policies
  for each row execute function public.update_updated_at_column();

alter table public.contract_sla_policies enable row level security;

drop policy if exists contract_sla_select_org on public.contract_sla_policies;
drop policy if exists contract_sla_insert_org on public.contract_sla_policies;
drop policy if exists contract_sla_update_org on public.contract_sla_policies;
drop policy if exists contract_sla_delete_org on public.contract_sla_policies;
create policy contract_sla_select_org on public.contract_sla_policies
  for select to authenticated using (organisation_id = public.organisation_id());
create policy contract_sla_insert_org on public.contract_sla_policies
  for insert to authenticated with check (organisation_id = public.organisation_id());
create policy contract_sla_update_org on public.contract_sla_policies
  for update to authenticated using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
create policy contract_sla_delete_org on public.contract_sla_policies
  for delete to authenticated using (organisation_id = public.organisation_id());

-- ── 2. Job SLA columns ─────────────────────────────────────────────────

alter table public.jobs add column if not exists sla_contract_id uuid references public.contracts(id) on delete set null;
alter table public.jobs add column if not exists target_response_at timestamptz;
alter table public.jobs add column if not exists target_fix_at timestamptz;
alter table public.jobs add column if not exists sla_response_met_at timestamptz;
alter table public.jobs add column if not exists sla_fix_met_at timestamptz;

-- "Jobs at breach risk" is a single partial-index scan, not a 3-way join.
create index if not exists idx_jobs_sla_open
  on public.jobs (target_fix_at)
  where target_fix_at is not null and sla_fix_met_at is null;

-- ── 3. Stamp targets at creation (fail-open, covers ALL creation paths) ─

create or replace function public.fos_stamp_job_sla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_contract uuid;
  v_policy public.contract_sla_policies%rowtype;
begin
  begin
    -- Resolve the client: the job's own, else the property's.
    v_client := new.client_id;
    if v_client is null and new.property_id is not null then
      select client_id into v_client from public.properties where id = new.property_id;
    end if;
    if v_client is null then
      return new;
    end if;

    -- The active contract covering today; deterministic tie-break.
    select c.id into v_contract
    from public.contracts c
    where c.organisation_id = new.organisation_id
      and c.client_id = v_client
      and c.status = 'active'
      and (c.start_date is null or c.start_date <= current_date)
      and (c.end_date is null or c.end_date >= current_date)
    order by c.start_date desc nulls last, c.created_at desc
    limit 1;
    if v_contract is null then
      return new;
    end if;

    select * into v_policy
    from public.contract_sla_policies p
    where p.contract_id = v_contract and p.priority = coalesce(new.priority, 'medium');
    if not found then
      return new;
    end if;

    new.sla_contract_id := v_contract;
    new.target_response_at := now() + make_interval(mins => v_policy.response_minutes);
    new.target_fix_at := now() + make_interval(mins => v_policy.fix_minutes);
  exception when others then
    -- FAIL-OPEN: SLA stamping must never block job creation.
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_jobs_stamp_sla on public.jobs;
create trigger trg_jobs_stamp_sla
  before insert on public.jobs
  for each row execute function public.fos_stamp_job_sla();

-- ── 4. Stamp met-times from job activity ───────────────────────────────
-- Pure NEW/OLD math — SECURITY INVOKER, no table reads.

create or replace function public.fos_stamp_job_sla_met()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.arrived_at is not null and old.sla_response_met_at is null and new.sla_response_met_at is null then
    new.sla_response_met_at := new.arrived_at;
  end if;
  if new.status = 'completed' and old.sla_fix_met_at is null and new.sla_fix_met_at is null then
    new.sla_fix_met_at := coalesce(new.completed_date::timestamptz, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jobs_stamp_sla_met on public.jobs;
create trigger trg_jobs_stamp_sla_met
  before update on public.jobs
  for each row execute function public.fos_stamp_job_sla_met();

-- Field events are response evidence too: 'arrived' today, 'qr_checkin'
-- (proof-of-presence, W2-T8) when it ships. SECURITY DEFINER because the
-- engineer's RLS may allow inserting the event but we still want the job
-- stamped; fail-open like the insert trigger.
create or replace function public.fos_field_event_sla_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.event_type in ('arrived', 'qr_checkin') then
      update public.jobs
      set sla_response_met_at = coalesce(sla_response_met_at, new.created_at, now())
      where id = new.job_id;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_field_events_sla_evidence on public.field_events;
create trigger trg_field_events_sla_evidence
  after insert on public.field_events
  for each row execute function public.fos_field_event_sla_evidence();

-- ── 5. Period summary with service-credit maths ────────────────────────
-- SECURITY INVOKER: the caller's org RLS scopes the rows.
-- breach = met late, OR not yet met and the target has passed.

create or replace function public.sla_contract_period_summary(
  p_contract_id uuid,
  p_from date,
  p_to date
) returns table (
  jobs_total int,
  response_breaches int,
  fix_breaches int,
  credits numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::int as jobs_total,
    count(*) filter (
      where j.target_response_at is not null and (
        coalesce(j.sla_response_met_at, case when now() > j.target_response_at then 'infinity'::timestamptz end)
          > j.target_response_at
      )
    )::int as response_breaches,
    count(*) filter (
      where j.target_fix_at is not null and (
        coalesce(j.sla_fix_met_at, case when now() > j.target_fix_at then 'infinity'::timestamptz end)
          > j.target_fix_at
      )
    )::int as fix_breaches,
    coalesce(sum(
      case when j.target_fix_at is not null and (
        coalesce(j.sla_fix_met_at, case when now() > j.target_fix_at then 'infinity'::timestamptz end)
          > j.target_fix_at
      ) then coalesce(p.credit_per_breach, 0) else 0 end
    ), 0) as credits
  from public.jobs j
  left join public.contract_sla_policies p
    on p.contract_id = j.sla_contract_id and p.priority = j.priority
  where j.sla_contract_id = p_contract_id
    and j.created_at >= p_from
    and j.created_at < (p_to + 1)
    and j.status <> 'cancelled';
$$;

revoke all on function public.sla_contract_period_summary(uuid, date, date) from public, anon;
grant execute on function public.sla_contract_period_summary(uuid, date, date) to authenticated;

comment on function public.fos_stamp_job_sla() is
  'Stamps sla_contract_id + target_response_at/target_fix_at at job creation from the matching active contract policy. SECURITY DEFINER (portal tenants cannot read contracts), FAIL-OPEN (never blocks job creation).';
