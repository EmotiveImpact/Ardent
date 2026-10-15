-- 00091_trim_realtime_publication.sql
--
-- PERF: the `supabase_realtime` publication carried ~17 tables (added in 00040
-- / 00046 / 00084). Realtime continuously polls the WAL and processes every
-- change on published tables — pg_stat_statements showed this was ~75% of the
-- project's total DB time and the dominant Disk IO Budget consumer (the
-- `wal->>... commit_timestamp` reader ran 340k+ times).
--
-- Trim to the HOT operational tables that genuinely need live cross-user
-- updates: jobs, compliance_items, actions, invoices, quotes, timeline_events
-- (notifications is kept too — used by use-realtime-notifications.ts). The cold
-- reference tables below change rarely and now stay fresh via the client's
-- refetch-on-focus + staleTime instead (client map trimmed to match in
-- apps/web/src/hooks/use-realtime-subscriptions.ts).
--
-- Idempotent: DROP TABLE for each, swallowing "not a member" / "missing table".

do $$
declare
  t text;
  cold_tables text[] := array[
    'engineers',
    'clients',
    'properties',
    'assets',
    'subcontractors',
    'maintenance_plans',
    'documents',
    'contracts',
    'purchase_orders',
    'suppliers',
    'expo_push_tokens'
  ];
begin
  foreach t in array cold_tables loop
    begin
      execute format('alter publication supabase_realtime drop table public.%I', t);
    exception
      when others then
        -- not a publication member, or table doesn't exist — nothing to do.
        raise notice 'skip drop %: %', t, sqlerrm;
    end;
  end loop;
end
$$;

-- Confirm membership afterwards:
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
