-- 00059_privatize_storage_buckets.sql
--
-- Make legacy public buckets private and replace broad storage.objects
-- policies from 00005 with tenant-scoped policies based on the first path
-- segment being the caller's organisation id.

update storage.buckets
set public = false
where id in (
  'documents',
  'engineer-documents',
  'job-photos',
  'avatars',
  'group-images',
  'org-logos'
);

drop policy if exists "auth_upload" on storage.objects;
drop policy if exists "auth_read" on storage.objects;
drop policy if exists "auth_update" on storage.objects;
drop policy if exists "auth_delete" on storage.objects;
drop policy if exists "public_read" on storage.objects;

do $$
declare
  v_bucket text;
  v_policy text;
begin
  foreach v_bucket in array array[
    'documents',
    'engineer-documents',
    'job-photos',
    'avatars',
    'group-images',
    'org-logos'
  ] loop
    v_policy := replace(v_bucket, '-', '_') || '_tenant_rw';

    execute format('drop policy if exists %I on storage.objects', v_policy);
    execute format(
      'create policy %I on storage.objects
         for all to authenticated
         using (
           bucket_id = %L
           and (storage.foldername(name))[1] in (
             select p.organisation_id::text
             from public.profiles p
             where p.id = auth.uid()
           )
         )
         with check (
           bucket_id = %L
           and (storage.foldername(name))[1] in (
             select p.organisation_id::text
             from public.profiles p
             where p.id = auth.uid()
           )
         )',
      v_policy,
      v_bucket,
      v_bucket
    );
  end loop;
end $$;
