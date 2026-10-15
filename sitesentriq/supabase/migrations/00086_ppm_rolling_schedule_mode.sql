-- 00086_ppm_rolling_schedule_mode.sql
--
-- QA fix. The maintenance-plan form offers Fixed vs Rolling schedule modes with
-- distinct descriptions ("rolling recalculates from the completion date"), but
-- both create_job_from_maintenance_plan and the JS fallback always advanced
-- next_due from the planned schedule (the Fixed behaviour) — so choosing Rolling
-- silently did nothing.
--
-- Honour it: a ROLLING plan rolls next_due forward from the last ACTUAL completion
-- (so a late visit pushes the whole cadence out); a FIXED plan keeps advancing from
-- the planned schedule. (The client fallback in use-maintenance.ts mirrors this.)

create or replace function public.create_job_from_maintenance_plan(p_plan_id uuid, p_target_date date default null::date)
 returns jobs
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_plan maintenance_plans%rowtype;
  v_job jobs%rowtype;
  v_scheduled_date date;
  v_from date;
begin
  select * into v_plan
  from maintenance_plans
  where id = p_plan_id
    and organisation_id = public.organisation_id()
  for update;

  if not found then
    raise exception 'Maintenance plan not found';
  end if;

  v_scheduled_date := coalesce(p_target_date, v_plan.next_due, v_plan.starts_at, current_date);

  insert into jobs (
    property_id, organisation_id, maintenance_plan_id, title, description,
    status, priority, job_type, scheduled_date, routine_check_type
  )
  values (
    v_plan.property_id, v_plan.organisation_id, v_plan.id,
    v_plan.name || ' - Scheduled Visit', v_plan.description,
    'scheduled', 'medium', 'ppm', v_scheduled_date, v_plan.maintenance_type
  )
  returning * into v_job;

  -- Rolling: recalc from the last actual completion; Fixed: from the schedule.
  v_from := case
    when v_plan.schedule_mode = 'rolling' and v_plan.last_completed is not null
      then v_plan.last_completed
    else v_scheduled_date
  end;

  update maintenance_plans
  set next_due = (v_from + public.fos_frequency_interval(v_plan.frequency))::date
  where id = v_plan.id;

  return v_job;
end;
$function$;
