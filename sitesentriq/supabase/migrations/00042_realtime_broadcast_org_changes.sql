-- 00042_realtime_broadcast_org_changes.sql
--
-- Wave 17 realtime hardening.
--
-- Postgres Changes is useful as a simple fallback, but org-filtered DELETE
-- events are not reliable enough for this app's "another browser updates
-- immediately" requirement. Supabase recommends Broadcast for scalable,
-- secure database-change fanout. This migration adds one private channel per
-- organisation:
--
--   org:<organisation_id>:changes
--
-- Every operational INSERT / UPDATE / DELETE emits on that topic. The client
-- subscribes once from DashboardLayout and invalidates/patches TanStack Query
-- caches from the payload.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'fos_org_broadcast_receive'
  ) then
    create policy "fos_org_broadcast_receive"
    on realtime.messages
    for select
    to authenticated
    using (
      realtime.messages.extension = 'broadcast'
      and (select realtime.topic()) = 'org:' || public.organisation_id()::text || ':changes'
    );
  end if;
end
$$;

create or replace function public.fos_broadcast_org_table_change()
returns trigger
security definer
set search_path = public, realtime
language plpgsql
as $$
declare
  org_id uuid;
begin
  if TG_OP = 'DELETE' then
    org_id := nullif(to_jsonb(OLD)->>'organisation_id', '')::uuid;
  else
    org_id := nullif(to_jsonb(NEW)->>'organisation_id', '')::uuid;
  end if;

  if org_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'org:' || org_id::text || ':changes',
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );

  return null;
end;
$$;

do $$
declare
  t text;
  broadcast_tables text[] := array[
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
  foreach t in array broadcast_tables loop
    begin
      execute format('alter table public.%I replica identity full', t);
      execute format('drop trigger if exists fos_broadcast_org_table_change on public.%I', t);
      execute format(
        'create trigger fos_broadcast_org_table_change
         after insert or update or delete on public.%I
         for each row execute function public.fos_broadcast_org_table_change()',
        t
      );
    exception
      when undefined_table then
        raise notice 'skipping realtime broadcast trigger for missing table %', t;
    end;
  end loop;
end
$$;
