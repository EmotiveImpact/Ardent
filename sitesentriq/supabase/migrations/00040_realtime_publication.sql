-- 00040_realtime_publication.sql
--
-- Wave 17 perf — wire the Supabase Realtime publication.
--
-- The `supabase_realtime` publication shipped EMPTY (zero tables), which
-- means every `.on('postgres_changes', ...)` subscription in the React
-- code has been silently no-op'ing since day one. Symptom: colleagues'
-- changes never appeared until the user manually refreshed.
--
-- Adding every table we want push-invalidations for. The TanStack Query
-- invalidation map lives in src/hooks/use-realtime-subscriptions.ts and
-- subscribes per-tenant via `organisation_id=eq.<orgId>` filter, so the
-- publication is the only server-side piece needed.
--
-- Replica identity stays at the default (PK-only) — we only need the
-- "this row changed" signal to invalidate a TanStack query. We don't
-- inspect old/new row payloads anywhere except `actions` updates
-- (use-realtime-subscriptions.ts ~L92), and for UPDATE events the
-- new-row payload always includes all columns regardless of replica
-- identity.

-- Idempotent: ADD TABLE for each, swallowing "duplicate_object" errors
-- if a table is already a publication member. Postgres doesn't support
-- ALTER PUBLICATION ... DROP TABLE IF EXISTS, so we can't pre-clean —
-- exception handling is the cleanest path.
do $$
declare
  t text;
  publication_tables text[] := array[
    'jobs',
    'compliance_items',
    'actions',
    'invoices',
    'quotes',
    'engineers',
    'clients',
    'properties',
    'assets',
    'subcontractors',
    'maintenance_plans',
    'documents',
    'timeline_events'
  ];
begin
  foreach t in array publication_tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then
        -- Already a publication member; nothing to do.
        null;
      when undefined_table then
        -- Table doesn't exist yet (defensive — every entry above does);
        -- skip rather than fail the whole migration.
        raise notice 'skipping %: table not found', t;
    end;
  end loop;
end
$$;

-- Sanity check — query this after applying to confirm membership.
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename;
