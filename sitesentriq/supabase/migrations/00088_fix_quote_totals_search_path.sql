-- 00088_fix_quote_totals_search_path.sql
--
-- Fix: the LIVE `public.fos_recalculate_quote_totals(uuid)` had drifted to the
-- pre-00058 body — `update quotes` / `from quote_lines` UNQUALIFIED — while
-- carrying `set search_path = ''` (applied by the 00058/00064 hardening pass).
-- With an empty search_path, unqualified `quotes`/`quote_lines` resolve to
-- nothing, so the AFTER INSERT/UPDATE/DELETE trigger on `quote_lines` threw
-- `relation "quotes" does not exist` on EVERY quote-line write — breaking real
-- quote-line creation, not just demo seeding.
--
-- This re-asserts the correct 00058 form: schema-qualified table references with
-- the hardened empty search_path PRESERVED (we qualify tables rather than loosen
-- security). Idempotent create-or-replace; safe to re-run.

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

-- The trigger function only PERFORMs the (schema-qualified) recalc helper, so it
-- was never the source of the error. Re-asserted here for completeness and to
-- keep its empty search_path explicit.
create or replace function public.fos_quote_lines_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
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
