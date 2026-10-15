-- Migration: 00110_ppm_generation_repair.sql
-- Description: repair the PPM job-generation subsystem as ONE coordinated change.
--
-- Root cause: 00086 re-created create_job_from_maintenance_plan with
--   `set search_path to ''` but UNQUALIFIED table refs (maintenance_plans, jobs)
--   and %rowtype decls — under empty search_path these don't resolve, so the RPC
--   ALWAYS threw and the app silently fell back to a non-atomic JS path. This
--   migration fixes that AND the latent bugs the working RPC exposes:
--   * rolling mode was a no-op (last_completed never written);
--   * no idempotency (single + bulk paths double-created);
--   * fos_frequency_interval had no 'daily' arm (daily plans advanced a month).
--
-- Rolling vs fixed model (now correct):
--   * FIXED  — generation advances next_due (scheduled_date + interval); completion
--              only records last_completed.
--   * ROLLING — generation does NOT advance next_due; completion sets
--              last_completed AND rolls next_due = completed + interval (a late
--              visit pushes the whole cadence out). next_due never moves backwards.

-- 1. fos_frequency_interval — add the missing 'daily' arm. (Postgres `date +
--    interval` already clamps month-ends, e.g. Jan 31 + 1 month = Feb 28.)
create or replace function public.fos_frequency_interval(p_frequency text)
returns interval
language sql
immutable
as $$
  select case lower(coalesce(p_frequency, ''))
    when 'daily' then interval '1 day'
    when 'weekly' then interval '1 week'
    when 'fortnightly' then interval '2 weeks'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'biannual' then interval '6 months'
    when 'six_monthly' then interval '6 months'
    when 'annual' then interval '1 year'
    when 'yearly' then interval '1 year'
    else interval '1 month'
  end
$$;

-- 2. Idempotency backstop — at most ONE non-cancelled job per (plan, date).
--    No existing duplicates (verified before ship). Catches concurrent single +
--    bulk generation regardless of which date-math path ran.
create unique index if not exists idx_jobs_ppm_plan_date
  on public.jobs (maintenance_plan_id, scheduled_date)
  where maintenance_plan_id is not null and status <> 'cancelled';

-- 3. Re-create the generator: schema-qualified (fixes the throw), idempotent
--    (returns an existing job instead of duplicating), and rolling-aware.
create or replace function public.create_job_from_maintenance_plan(p_plan_id uuid, p_target_date date default null::date)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.maintenance_plans%rowtype;
  v_job public.jobs%rowtype;
  v_scheduled_date date;
begin
  select * into v_plan
  from public.maintenance_plans
  where id = p_plan_id
    and organisation_id = public.organisation_id()
  for update;

  if not found then
    raise exception 'Maintenance plan not found';
  end if;

  v_scheduled_date := coalesce(p_target_date, v_plan.next_due, v_plan.starts_at, current_date);

  -- Idempotent: if a non-cancelled job already exists for this plan + date,
  -- return it rather than minting a duplicate (and don't advance next_due again).
  select * into v_job
  from public.jobs
  where maintenance_plan_id = v_plan.id
    and scheduled_date = v_scheduled_date
    and status <> 'cancelled'
  limit 1;
  if found then
    return v_job;
  end if;

  insert into public.jobs (
    property_id, organisation_id, maintenance_plan_id, title, description,
    status, priority, job_type, scheduled_date, routine_check_type
  )
  values (
    v_plan.property_id, v_plan.organisation_id, v_plan.id,
    v_plan.name || ' - Scheduled Visit', v_plan.description,
    'scheduled', 'medium', 'ppm', v_scheduled_date, v_plan.maintenance_type
  )
  returning * into v_job;

  -- FIXED advances next_due here (planned cadence). ROLLING advances on
  -- COMPLETION (trigger below) so a late visit pushes the cadence out — leave
  -- next_due in place; the open visit blocks re-generation via the idempotency
  -- check until it's completed.
  if coalesce(v_plan.schedule_mode, 'fixed') <> 'rolling' then
    update public.maintenance_plans
    set next_due = (v_scheduled_date + public.fos_frequency_interval(v_plan.frequency))::date
    where id = v_plan.id;
  end if;

  return v_job;
end;
$function$;

-- 4. On job completion: write last_completed, and for ROLLING plans roll next_due
--    forward from the completion date (never backwards).
create or replace function public.fos_ppm_after_complete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.maintenance_plans%rowtype;
  v_completed date;
begin
  if new.maintenance_plan_id is not null
     and new.status = 'completed'
     and new.status is distinct from old.status then
    v_completed := coalesce(new.completed_date, current_date);
    select * into v_plan from public.maintenance_plans where id = new.maintenance_plan_id for update;
    if found then
      update public.maintenance_plans
      set last_completed = v_completed,
          next_due = case
            when coalesce(v_plan.schedule_mode, 'fixed') = 'rolling'
              then greatest(
                coalesce(v_plan.next_due, v_completed),
                (v_completed + public.fos_frequency_interval(v_plan.frequency))::date
              )
            else v_plan.next_due
          end
      where id = v_plan.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ppm_after_complete on public.jobs;
create trigger trg_ppm_after_complete
  after update of status on public.jobs
  for each row
  execute function public.fos_ppm_after_complete();

-- Hygiene: these are internal (RPC + trigger). Keep create_job callable by
-- authenticated (the app invokes it); the trigger fn isn't called directly.
revoke all on function public.fos_ppm_after_complete() from public, anon, authenticated;
