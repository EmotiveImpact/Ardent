-- Migration: 00109_callout_uploads_storage_policy.sql
-- Description: add the missing storage RLS policy for the private `callout-uploads`
--   bucket so portal call-out PHOTO uploads work.
--
-- Background:
--   The portal "raise a call-out" flow uploads photos to callout-uploads under
--   `{client_id}/{job_id}/...` (apps/web/src/routes/portal/raise-call-out.tsx).
--   The bucket was created private (00015) but 00059 only added tenant policies
--   for documents/job-photos/avatars/etc — NOT callout-uploads. With RLS on
--   storage.objects and no matching policy, EVERY upload/read on the bucket was
--   denied, so portal call-out photos silently failed.
--
-- Scoping (path's first segment is the client_id):
--   * a portal client (is_portal_client) may only touch THEIR OWN client folder
--     (my_client_id) — NOT other clients in the shared operator org;
--   * internal staff (not is_portal_client) may touch any folder for a client in
--     their own organisation, so ops can view/triage the photos.

create policy "callout_uploads_rw" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'callout-uploads'
    and (
      (storage.foldername(name))[1] = public.my_client_id()::text
      or (
        not public.is_portal_client()
        and (storage.foldername(name))[1] in (
          select c.id::text from public.clients c
          where c.organisation_id = public.organisation_id()
        )
      )
    )
  )
  with check (
    bucket_id = 'callout-uploads'
    and (
      (storage.foldername(name))[1] = public.my_client_id()::text
      or (
        not public.is_portal_client()
        and (storage.foldername(name))[1] in (
          select c.id::text from public.clients c
          where c.organisation_id = public.organisation_id()
        )
      )
    )
  );
