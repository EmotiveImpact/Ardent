-- Migration: 00122_trust_wave_hardening.sql
-- Description: post-review hardening for the trust+compliance wave (board
--   session, 2026-06-10). Three independent fixes:
--   1. Clamp SLA met-times so a client-supplied/backdated completion can't
--      erase a real breach (and its service credit).
--   2. Index contracts for the SLA-stamp trigger's per-insert lookup.
--   3. DB-enforce the permit-to-work flag: only admin/scheduler may CLEAR
--      requires_permit, closing the "flip the flag + start the job" bypass.
-- All schema-qualified under search_path = '' (house style). New file — the
-- 00114–00121 originals are already applied and must not be edited.

-- ── 1. Clamp SLA met-times to [created_at, now()] ──────────────────────
-- fos_stamp_job_sla_met previously stamped sla_fix_met_at from the raw,
-- client-supplied completed_date. A completion backdated before the target
-- (offline replay, manual data entry) silently turned a fix BREACH into a
-- "met", zeroing the service credit in sla_contract_period_summary. Clamp so
-- a met-time can never predate the job's creation nor exceed now().

create or replace function public.fos_stamp_job_sla_met()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.arrived_at is not null and old.sla_response_met_at is null and new.sla_response_met_at is null then
    new.sla_response_met_at := least(greatest(new.arrived_at, new.created_at), now());
  end if;
  if new.status = 'completed' and old.sla_fix_met_at is null and new.sla_fix_met_at is null then
    new.sla_fix_met_at := least(
      greatest(coalesce(new.completed_date::timestamptz, now()), new.created_at),
      now()
    );
  end if;
  return new;
end;
$$;

-- ── 2. Index contracts for the SLA-stamp lookup ────────────────────────
-- fos_stamp_job_sla runs on EVERY job insert and filters contracts by
-- (organisation_id, client_id, status). contracts had only its PK → a
-- sequential scan on the hottest write path.

create index if not exists idx_contracts_org_client_status
  on public.contracts (organisation_id, client_id, status);

-- ── 3. Protect the permit-to-work flag ─────────────────────────────────
-- The permit gate (00121) only bites when jobs.requires_permit is true. The
-- column had no protection, so any org member could `update jobs set
-- requires_permit = false, status = 'in_progress'` and walk straight past the
-- gate in one statement. Clearing the flag is now an admin/scheduler act,
-- matching the client-side control on the permits panel. Setting it (false →
-- true, the safe direction) stays open. Service-role/system writes bypass.

create or replace function public.fos_protect_requires_permit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if old.requires_permit = true and new.requires_permit = false and auth.uid() is not null then
    select role into v_role from public.profiles where id = auth.uid();
    if v_role not in ('org_admin', 'super_admin', 'scheduler') then
      raise exception 'requires_permit_clear_forbidden: only an admin or scheduler can remove the permit-to-work requirement'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jobs_protect_requires_permit on public.jobs;
create trigger trg_jobs_protect_requires_permit
  before update of requires_permit on public.jobs
  for each row execute function public.fos_protect_requires_permit();

comment on function public.fos_protect_requires_permit() is
  'Blocks non-admin/scheduler from clearing jobs.requires_permit (the permit-to-work gate flag), closing the flip-the-flag bypass. Setting it true and service-role writes are unaffected.';
