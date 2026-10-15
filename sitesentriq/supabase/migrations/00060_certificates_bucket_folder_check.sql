-- 00060_certificates_bucket_folder_check.sql
--
-- Replace certificates_auth_rw with an org-folder scoped policy. Certificate
-- objects are written as certificates/<org_id>/<cert_id>.*.

update storage.buckets
set public = false
where id = 'certificates';

do $$
begin
  execute 'drop policy if exists "certificates_auth_rw" on storage.objects';

  execute $policy$
    create policy "certificates_auth_rw" on storage.objects
      for all to authenticated
      using (
        bucket_id = 'certificates'
        and (storage.foldername(name))[1] in (
          select p.organisation_id::text
          from public.profiles p
          where p.id = auth.uid()
        )
      )
      with check (
        bucket_id = 'certificates'
        and (storage.foldername(name))[1] in (
          select p.organisation_id::text
          from public.profiles p
          where p.id = auth.uid()
        )
      )
  $policy$;
end $$;
