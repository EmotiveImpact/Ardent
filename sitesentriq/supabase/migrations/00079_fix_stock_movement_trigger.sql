-- 00079_fix_stock_movement_trigger.sql
--
-- apply_stock_movement() had TWO bugs:
--   1. It inserts into notifications using `link_url`, but the column is `link`
--      (00001) — the insert throws, and since it runs INSIDE the stock-movement
--      trigger, it aborts the stock movement itself.
--   2. The 00058 hardening set `search_path TO ''` but the body references
--      stock_items / notifications / profiles UNQUALIFIED → "relation does not
--      exist" (same class as the org-creation trigger chain). So every stock
--      movement has been failing.
--
-- Fix: schema-qualify all refs + use the real `link` column. Keep the locked
-- empty search_path.

create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  new_qty   integer;
  reorder   integer;
  prev_qty  integer;
  item_name text;
  org_id    uuid;
begin
  update public.stock_items
     set current_qty = greatest(0, current_qty + new.quantity),
         updated_at  = now()
   where id = new.stock_item_id
   returning current_qty, reorder_point, name, organisation_id
        into new_qty, reorder, item_name, org_id;

  prev_qty := new_qty - new.quantity;

  if new_qty is not null
     and reorder is not null
     and new_qty <= reorder
     and prev_qty > reorder then
    insert into public.notifications (
      user_id, organisation_id, notification_type, title, message, link, read
    )
    select
      p.id,
      org_id,
      'compliance_due',
      'Stock low: ' || item_name,
      item_name || ' is at ' || new_qty || ' (reorder point ' || reorder || ').',
      '/dashboard/stock/' || new.stock_item_id::text,
      false
    from public.profiles p
    where p.organisation_id = org_id
      and p.role in ('org_admin', 'super_admin');
  end if;

  return new;
end;
$function$;
