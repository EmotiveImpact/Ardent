-- 00061_statements_of_compliance_bucket.sql
--
-- Create the statements-of-compliance bucket in a new migration because
-- 00054 may already have run on live. Users only need SELECT to mint signed
-- URLs; edge functions write with the service role.

insert into storage.buckets (id, name, public)
values ('statements-of-compliance', 'statements-of-compliance', false)
on conflict (id) do nothing;

update storage.buckets
set public = false
where id = 'statements-of-compliance';

do $$
begin
  execute 'drop policy if exists "statements_of_compliance_auth_rw" on storage.objects';
  execute 'drop policy if exists "statements_of_compliance_select_org" on storage.objects';

  execute $policy$
    create policy "statements_of_compliance_select_org" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'statements-of-compliance'
        and (storage.foldername(name))[1] in (
          select p.organisation_id::text
          from public.profiles p
          where p.id = auth.uid()
        )
      )
  $policy$;
end $$;
