-- 00056_rls_engineers_subcontractors.sql
--
-- Replace the permissive FOR ALL USING (true) workforce policies from
-- 00003_engineers_subcontractors.sql with tenant-scoped CRUD policies.

alter table public.engineers enable row level security;
alter table public.engineer_accreditations enable row level security;
alter table public.engineer_documents enable row level security;
alter table public.subcontractors enable row level security;
alter table public.subcontractor_documents enable row level security;

-- engineers
drop policy if exists "Org members can manage engineers" on public.engineers;
drop policy if exists engineers_select_org on public.engineers;
drop policy if exists engineers_insert_org on public.engineers;
drop policy if exists engineers_update_org on public.engineers;
drop policy if exists engineers_delete_org on public.engineers;

create policy engineers_select_org on public.engineers
  for select to authenticated
  using (organisation_id = public.organisation_id());

create policy engineers_insert_org on public.engineers
  for insert to authenticated
  with check (organisation_id = public.organisation_id());

create policy engineers_update_org on public.engineers
  for update to authenticated
  using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

create policy engineers_delete_org on public.engineers
  for delete to authenticated
  using (organisation_id = public.organisation_id());

-- engineer_accreditations
drop policy if exists "Org members can manage engineer_accreditations" on public.engineer_accreditations;
drop policy if exists engineer_accreditations_select_org on public.engineer_accreditations;
drop policy if exists engineer_accreditations_insert_org on public.engineer_accreditations;
drop policy if exists engineer_accreditations_update_org on public.engineer_accreditations;
drop policy if exists engineer_accreditations_delete_org on public.engineer_accreditations;

create policy engineer_accreditations_select_org on public.engineer_accreditations
  for select to authenticated
  using (organisation_id = public.organisation_id());

create policy engineer_accreditations_insert_org on public.engineer_accreditations
  for insert to authenticated
  with check (organisation_id = public.organisation_id());

create policy engineer_accreditations_update_org on public.engineer_accreditations
  for update to authenticated
  using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

create policy engineer_accreditations_delete_org on public.engineer_accreditations
  for delete to authenticated
  using (organisation_id = public.organisation_id());

-- engineer_documents
drop policy if exists "Org members can manage engineer_documents" on public.engineer_documents;
drop policy if exists engineer_documents_select_org on public.engineer_documents;
drop policy if exists engineer_documents_insert_org on public.engineer_documents;
drop policy if exists engineer_documents_update_org on public.engineer_documents;
drop policy if exists engineer_documents_delete_org on public.engineer_documents;

create policy engineer_documents_select_org on public.engineer_documents
  for select to authenticated
  using (organisation_id = public.organisation_id());

create policy engineer_documents_insert_org on public.engineer_documents
  for insert to authenticated
  with check (organisation_id = public.organisation_id());

create policy engineer_documents_update_org on public.engineer_documents
  for update to authenticated
  using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

create policy engineer_documents_delete_org on public.engineer_documents
  for delete to authenticated
  using (organisation_id = public.organisation_id());

-- subcontractors
drop policy if exists "Org members can manage subcontractors" on public.subcontractors;
drop policy if exists subcontractors_select_org on public.subcontractors;
drop policy if exists subcontractors_insert_org on public.subcontractors;
drop policy if exists subcontractors_update_org on public.subcontractors;
drop policy if exists subcontractors_delete_org on public.subcontractors;

create policy subcontractors_select_org on public.subcontractors
  for select to authenticated
  using (organisation_id = public.organisation_id());

create policy subcontractors_insert_org on public.subcontractors
  for insert to authenticated
  with check (organisation_id = public.organisation_id());

create policy subcontractors_update_org on public.subcontractors
  for update to authenticated
  using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

create policy subcontractors_delete_org on public.subcontractors
  for delete to authenticated
  using (organisation_id = public.organisation_id());

-- subcontractor_documents
drop policy if exists "Org members can manage subcontractor_documents" on public.subcontractor_documents;
drop policy if exists subcontractor_documents_select_org on public.subcontractor_documents;
drop policy if exists subcontractor_documents_insert_org on public.subcontractor_documents;
drop policy if exists subcontractor_documents_update_org on public.subcontractor_documents;
drop policy if exists subcontractor_documents_delete_org on public.subcontractor_documents;

create policy subcontractor_documents_select_org on public.subcontractor_documents
  for select to authenticated
  using (organisation_id = public.organisation_id());

create policy subcontractor_documents_insert_org on public.subcontractor_documents
  for insert to authenticated
  with check (organisation_id = public.organisation_id());

create policy subcontractor_documents_update_org on public.subcontractor_documents
  for update to authenticated
  using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

create policy subcontractor_documents_delete_org on public.subcontractor_documents
  for delete to authenticated
  using (organisation_id = public.organisation_id());
