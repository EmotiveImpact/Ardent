-- 00125_access_control_repair.sql
--
-- Three access-control gaps found in the code-review sweep:
--
--   1. `public.clients` was the one client-facing table 00096 forgot. A portal
--      client_admin could read EVERY other client of the FM operator, and the
--      org-wide `clients_delete` policy let them delete a rival client's row
--      (cascading its properties/jobs/invoices).
--
--   2. 00096's restrictive policies narrow the ROWS a portal user sees but do
--      not remove the COMMAND. The permissive base policies from 00002 are
--      org-scoped only — no role component — so a portal client_admin could
--      PATCH their own invoice to status 'paid', or DELETE their own overdue
--      compliance_items. The portal UI only ever writes `jobs` (call-outs) and
--      approves quotes through the 00108 SECURITY DEFINER RPC, so every other
--      client-facing table can be made read-only for portal users.
--
--   3. The `field-signatures` storage policies from 00022 were never tightened
--      by 00059. SELECT had no `TO` clause, so it was granted to `public` —
--      which includes `anon`. Signature PNGs (compliance evidence) were
--      world-readable with just the anon key shipped in the browser bundle,
--      and any authenticated user of ANY tenant could overwrite another
--      tenant's signature file.
--
-- Object paths stay `{job_id}/…` — rewriting them to an org prefix would
-- orphan every existing signature — so the policies scope through the job.

-- ── 1. clients: portal users see only their own client row ────────────
drop policy if exists "clients_client_admin_scope" on public.clients;
create policy "clients_client_admin_scope" on public.clients
  as restrictive for all to authenticated
  using (not public.is_portal_client() or id = public.my_client_id())
  with check (not public.is_portal_client() or id = public.my_client_id());

-- ── 2. Portal users are READ-ONLY on client-facing tables ─────────────
-- `jobs` is deliberately absent: raising a call-out inserts one, and the site
-- call-out flow updates callout_metadata. Quote approval goes through the
-- 00108 RPC (SECURITY DEFINER), so it is unaffected by these policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'invoices', 'compliance_items', 'contracts', 'properties'
  ]::text[]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_portal_no_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_portal_no_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_portal_no_delete', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (not public.is_portal_client())',
      t || '_portal_no_insert', t
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (not public.is_portal_client())
         with check (not public.is_portal_client())',
      t || '_portal_no_update', t
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated
         using (not public.is_portal_client())',
      t || '_portal_no_delete', t
    );
  end loop;
end $$;

-- ── 3. field-signatures: authenticated + org-scoped through the job ───
drop policy if exists "field_signatures_read" on storage.objects;
drop policy if exists "field_signatures_insert" on storage.objects;
drop policy if exists "field_signatures_update" on storage.objects;

create policy "field_signatures_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'field-signatures'
    -- uuid guard first so the cast can't error on a malformed path, and so the
    -- lookup uses the jobs PK index rather than a seq scan on j.id::text.
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from public.jobs j
      where j.id = ((storage.foldername(name))[1])::uuid
        and j.organisation_id = public.organisation_id()
    )
  );

create policy "field_signatures_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'field-signatures'
    -- uuid guard first so the cast can't error on a malformed path, and so the
    -- lookup uses the jobs PK index rather than a seq scan on j.id::text.
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from public.jobs j
      where j.id = ((storage.foldername(name))[1])::uuid
        and j.organisation_id = public.organisation_id()
    )
  );

create policy "field_signatures_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'field-signatures'
    -- uuid guard first so the cast can't error on a malformed path, and so the
    -- lookup uses the jobs PK index rather than a seq scan on j.id::text.
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from public.jobs j
      where j.id = ((storage.foldername(name))[1])::uuid
        and j.organisation_id = public.organisation_id()
    )
  );
