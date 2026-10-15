-- 00058_security_definer_search_path.sql
--
-- Harden every public-schema SECURITY DEFINER function with an empty
-- search_path. Bodies that previously relied on public/realtime being in the
-- path are re-declared with schema-qualified references before the ALTERs.

create or replace function public.organisation_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organisation_id
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'org_admin'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.seed_org_trial_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (
    organisation_id,
    plan,
    status,
    seats,
    current_period_start,
    current_period_end,
    trial_ends_at
  ) values (
    new.id,
    'starter',
    'trialing',
    1,
    now(),
    now() + interval '14 days',
    now() + interval '14 days'
  )
  on conflict (organisation_id) do nothing;
  return new;
end;
$$;

create or replace function public.tenant_property_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pc.property_id
  from public.property_contacts pc
  where pc.user_id = auth.uid()
    and pc.status = 'active'
  limit 1
$$;

create or replace function public.fos_broadcast_org_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_id uuid;
begin
  if tg_op = 'DELETE' then
    org_id := nullif(to_jsonb(old)->>'organisation_id', '')::uuid;
  else
    org_id := nullif(to_jsonb(new)->>'organisation_id', '')::uuid;
  end if;

  if org_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'org:' || org_id::text || ':changes',
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );

  return null;
end;
$$;

create or replace function public.fos_recalculate_purchase_order_totals(
  p_purchase_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.purchase_orders
  set
    subtotal = coalesce((
      select round(sum(pol.line_subtotal), 2)
      from public.purchase_order_lines pol
      where pol.purchase_order_id = p_purchase_order_id
    ), 0),
    tax = coalesce((
      select round(sum(pol.line_tax), 2)
      from public.purchase_order_lines pol
      where pol.purchase_order_id = p_purchase_order_id
    ), 0),
    total = coalesce((
      select round(sum(pol.line_total), 2)
      from public.purchase_order_lines pol
      where pol.purchase_order_id = p_purchase_order_id
    ), 0),
    updated_at = now()
  where id = p_purchase_order_id;
end;
$$;

create or replace function public.fos_recalculate_quote_totals(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quotes
  set
    subtotal = coalesce((
      select round(sum(ql.total), 2)
      from public.quote_lines ql
      where ql.quote_id = p_quote_id
    ), 0),
    tax = coalesce((
      select round(sum(coalesce(ql.quantity, 0) * coalesce(ql.unit_price, 0) * (coalesce(ql.tax_rate, 20) / 100)), 2)
      from public.quote_lines ql
      where ql.quote_id = p_quote_id
    ), 0),
    total = coalesce((
      select round(sum(coalesce(ql.total, 0) + (coalesce(ql.quantity, 0) * coalesce(ql.unit_price, 0) * (coalesce(ql.tax_rate, 20) / 100))), 2)
      from public.quote_lines ql
      where ql.quote_id = p_quote_id
    ), 0)
  where id = p_quote_id;
end;
$$;

create or replace function public.create_job_from_maintenance_plan(
  p_plan_id uuid,
  p_target_date date default null
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.jobs (
    property_id,
    organisation_id,
    maintenance_plan_id,
    title,
    description,
    status,
    priority,
    job_type,
    scheduled_date,
    routine_check_type
  )
  values (
    v_plan.property_id,
    v_plan.organisation_id,
    v_plan.id,
    v_plan.name || ' - Scheduled Visit',
    v_plan.description,
    'scheduled',
    'medium',
    'ppm',
    v_scheduled_date,
    v_plan.maintenance_type
  )
  returning * into v_job;

  update public.maintenance_plans
  set next_due = (v_scheduled_date + public.fos_frequency_interval(v_plan.frequency))::date
  where id = v_plan.id;

  return v_job;
end;
$$;

create or replace function public.refresh_engineer_accreditation_statuses()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.engineer_accreditations
  set status = case
    when expiry_date is null then 'active'
    when expiry_date < current_date then 'expired'
    when expiry_date <= current_date + interval '30 days' then 'expiring'
    else 'active'
  end;
$$;

create or replace function public.create_maintenance_plans_from_contract(
  p_contract_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  insert into public.maintenance_plans (
    property_id,
    asset_id,
    organisation_id,
    contract_id,
    name,
    description,
    maintenance_category,
    maintenance_type,
    frequency,
    schedule_mode,
    starts_at,
    next_due,
    is_active
  )
  select
    t.property_id,
    t.asset_id,
    t.organisation_id,
    t.contract_id,
    t.name,
    t.description,
    'routine',
    t.maintenance_type,
    t.frequency,
    t.schedule_mode,
    t.starts_at,
    t.starts_at,
    true
  from public.contract_routine_templates t
  where t.contract_id = p_contract_id
    and t.organisation_id = public.organisation_id()
    and not exists (
      select 1
      from public.maintenance_plans mp
      where mp.contract_id = t.contract_id
        and mp.property_id = t.property_id
        and coalesce(mp.asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(t.asset_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and lower(mp.name) = lower(t.name)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.record_engineer_location(
  p_engineer_id uuid,
  p_current_job_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_metres integer default null,
  p_movement_status text default 'travelling',
  p_eta_at timestamptz default null
)
returns public.engineer_locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_location public.engineer_locations%rowtype;
begin
  select e.organisation_id into v_org
  from public.engineers e
  where e.id = p_engineer_id
    and e.organisation_id = public.organisation_id();

  if v_org is null then
    raise exception 'Engineer not found';
  end if;

  insert into public.engineer_locations (
    organisation_id,
    engineer_id,
    current_job_id,
    latitude,
    longitude,
    accuracy_metres,
    movement_status,
    eta_at
  )
  values (
    v_org,
    p_engineer_id,
    p_current_job_id,
    p_latitude,
    p_longitude,
    p_accuracy_metres,
    p_movement_status,
    p_eta_at
  )
  returning * into v_location;

  return v_location;
end;
$$;

alter function public.organisation_id() set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.seed_org_trial_subscription() set search_path = '';
alter function public.seed_sample_data(uuid) set search_path = '';
alter function public.tenant_property_id() set search_path = '';
alter function public.fos_broadcast_org_table_change() set search_path = '';
alter function public.fos_recalculate_purchase_order_totals(uuid) set search_path = '';
alter function public.fos_recalculate_quote_totals(uuid) set search_path = '';
alter function public.create_job_from_maintenance_plan(uuid, date) set search_path = '';
alter function public.refresh_engineer_accreditation_statuses() set search_path = '';
alter function public.create_maintenance_plans_from_contract(uuid) set search_path = '';
alter function public.record_engineer_location(uuid, uuid, numeric, numeric, integer, text, timestamptz) set search_path = '';
