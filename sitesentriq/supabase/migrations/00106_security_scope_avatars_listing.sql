-- 00106 — Security: scope the `avatars` bucket SELECT to the caller's own org.
--
-- `avatars` is a PUBLIC bucket, so avatar images render via the public-URL
-- endpoint (which bypasses storage.objects RLS). The old broad "Anyone can view
-- avatars" SELECT policy therefore only enabled cross-org LISTING/enumeration of
-- every org's avatar paths (stored under <org_id>/...). Scope the authenticated
-- SELECT to the caller's own org. Public-URL display is unaffected; own-org
-- list/download still works.
--
-- (The `org-branding` public-read policy is left as a prior accepted decision —
-- org logos are embedded by public URL in transactional emails.)
drop policy if exists "Anyone can view avatars" on storage.objects;

create policy "Avatars readable within own org"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (public.organisation_id())::text
  );
