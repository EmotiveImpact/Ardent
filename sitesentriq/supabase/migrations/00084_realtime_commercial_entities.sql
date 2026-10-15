-- 00084_realtime_commercial_entities.sql
--
-- Feature (iter 16): extend live cross-client refresh to three core commercial
-- entities that were missing it — contracts, purchase_orders, suppliers. The
-- realtime layer (use-realtime-subscriptions.ts) drives both an instant broadcast
-- path (the fos_broadcast_org_table_change trigger) and a postgres_changes
-- fallback (the supabase_realtime publication). These three tables had NEITHER,
-- so when one user created/edited a contract/PO/supplier, other users' lists
-- didn't update until a manual refresh.
--
-- Mirror the exact pattern already on jobs/invoices/quotes/etc.: add the broadcast
-- trigger + add the table to the publication. (All three have organisation_id, so
-- the trigger's org scoping + the client's organisation_id=eq filter both apply.)

create trigger fos_broadcast_org_table_change
  after insert or delete or update on public.contracts
  for each row execute function public.fos_broadcast_org_table_change();

create trigger fos_broadcast_org_table_change
  after insert or delete or update on public.purchase_orders
  for each row execute function public.fos_broadcast_org_table_change();

create trigger fos_broadcast_org_table_change
  after insert or delete or update on public.suppliers
  for each row execute function public.fos_broadcast_org_table_change();

alter publication supabase_realtime add table public.contracts;
alter publication supabase_realtime add table public.purchase_orders;
alter publication supabase_realtime add table public.suppliers;
