-- 00044_operational_hardening.sql
--
-- Hardens the commercial operations features added in 00043:
-- - Purchase order line/totals are enforced in Postgres.
-- - Quote totals are kept aligned with markup/tax-aware quote lines.
-- - Maintenance plans can generate scheduled jobs atomically from the DB.
-- - Engineer accreditation status can be refreshed from expiry dates.

-- ── Purchase order totals ───────────────────────────────────
create or replace function public.fos_set_purchase_order_line_totals()
returns trigger
language plpgsql
as $$
declare
  v_subtotal numeric(12,2);
  v_tax numeric(12,2);
begin
  v_subtotal := round(coalesce(new.quantity, 0) * coalesce(new.unit_cost, 0), 2);
  v_tax := round(v_subtotal * (coalesce(new.tax_rate, 0) / 100), 2);

  new.line_subtotal := v_subtotal;
  new.line_tax := v_tax;
  new.line_total := v_subtotal + v_tax;
  return new;
end;
$$;

drop trigger if exists set_purchase_order_line_totals on purchase_order_lines;
create trigger set_purchase_order_line_totals
  before insert or update on purchase_order_lines
  for each row execute function public.fos_set_purchase_order_line_totals();

create or replace function public.fos_recalculate_purchase_order_totals(p_purchase_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update purchase_orders
  set
    subtotal = coalesce((
      select round(sum(line_subtotal), 2)
      from purchase_order_lines
      where purchase_order_id = p_purchase_order_id
    ), 0),
    tax = coalesce((
      select round(sum(line_tax), 2)
      from purchase_order_lines
      where purchase_order_id = p_purchase_order_id
    ), 0),
    total = coalesce((
      select round(sum(line_total), 2)
      from purchase_order_lines
      where purchase_order_id = p_purchase_order_id
    ), 0),
    updated_at = now()
  where id = p_purchase_order_id;
end;
$$;

create or replace function public.fos_purchase_order_lines_after_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fos_recalculate_purchase_order_totals(new.purchase_order_id);
  end if;

  if tg_op = 'UPDATE' and old.purchase_order_id is distinct from new.purchase_order_id then
    perform public.fos_recalculate_purchase_order_totals(old.purchase_order_id);
  end if;

  if tg_op = 'DELETE' then
    perform public.fos_recalculate_purchase_order_totals(old.purchase_order_id);
  end if;

  return null;
end;
$$;

drop trigger if exists recalculate_purchase_order_totals on purchase_order_lines;
create trigger recalculate_purchase_order_totals
  after insert or update or delete on purchase_order_lines
  for each row execute function public.fos_purchase_order_lines_after_change();

-- Backfill existing rows through the same logic.
update purchase_order_lines
set quantity = quantity;

-- ── Quote totals from markup-aware lines ─────────────────────
create or replace function public.fos_set_quote_line_totals()
returns trigger
language plpgsql
as $$
begin
  if new.cost_price is not null and new.unit_price is null then
    new.unit_price := round(new.cost_price * (1 + coalesce(new.markup_percent, 0) / 100), 2);
  end if;

  new.total := round(coalesce(new.quantity, 0) * coalesce(new.unit_price, 0), 2);
  return new;
end;
$$;

drop trigger if exists set_quote_line_totals on quote_lines;
create trigger set_quote_line_totals
  before insert or update on quote_lines
  for each row execute function public.fos_set_quote_line_totals();

create or replace function public.fos_recalculate_quote_totals(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update quotes
  set
    subtotal = coalesce((
      select round(sum(total), 2)
      from quote_lines
      where quote_id = p_quote_id
    ), 0),
    tax = coalesce((
      select round(sum(coalesce(quantity, 0) * coalesce(unit_price, 0) * (coalesce(tax_rate, 20) / 100)), 2)
      from quote_lines
      where quote_id = p_quote_id
    ), 0),
    total = coalesce((
      select round(sum(coalesce(total, 0) + (coalesce(quantity, 0) * coalesce(unit_price, 0) * (coalesce(tax_rate, 20) / 100))), 2)
      from quote_lines
      where quote_id = p_quote_id
    ), 0)
  where id = p_quote_id;
end;
$$;

create or replace function public.fos_quote_lines_after_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.fos_recalculate_quote_totals(new.quote_id);
  end if;

  if tg_op = 'UPDATE' and old.quote_id is distinct from new.quote_id then
    perform public.fos_recalculate_quote_totals(old.quote_id);
  end if;

  if tg_op = 'DELETE' then
    perform public.fos_recalculate_quote_totals(old.quote_id);
  end if;

  return null;
end;
$$;

drop trigger if exists recalculate_quote_totals on quote_lines;
create trigger recalculate_quote_totals
  after insert or update or delete on quote_lines
  for each row execute function public.fos_quote_lines_after_change();

update quote_lines
set quantity = quantity;

-- ── Maintenance job generation ──────────────────────────────
create or replace function public.fos_frequency_interval(p_frequency text)
returns interval
language sql
immutable
as $$
  select case lower(coalesce(p_frequency, ''))
    when 'weekly' then interval '1 week'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'biannual' then interval '6 months'
    when 'six_monthly' then interval '6 months'
    when 'annual' then interval '1 year'
    when 'yearly' then interval '1 year'
    else interval '1 month'
  end
$$;

create or replace function public.create_job_from_maintenance_plan(
  p_plan_id uuid,
  p_target_date date default null
)
returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan maintenance_plans%rowtype;
  v_job jobs%rowtype;
  v_scheduled_date date;
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

  update maintenance_plans
  set next_due = (v_scheduled_date + public.fos_frequency_interval(v_plan.frequency))::date
  where id = v_plan.id;

  return v_job;
end;
$$;

-- ── Engineer accreditation expiry status ────────────────────
create or replace function public.refresh_engineer_accreditation_statuses()
returns void
language sql
security definer
set search_path = public
as $$
  update engineer_accreditations
  set status = case
    when expiry_date is null then 'active'
    when expiry_date < current_date then 'expired'
    when expiry_date <= current_date + interval '30 days' then 'expiring'
    else 'active'
  end;
$$;

select public.refresh_engineer_accreditation_statuses();

notify pgrst, 'reload schema';
