-- Migration: 00126_bind_eta_tokens_to_job_org.sql
-- Prevent an authenticated user from pairing their organisation_id with a job
-- owned by another tenant. The public ETA functions read through the service
-- role, so an unbound token could otherwise cross the jobs RLS boundary.

drop policy if exists "job_eta_tokens_insert_org" on public.job_eta_tokens;

create policy "job_eta_tokens_insert_org"
  on public.job_eta_tokens for insert
  to authenticated
  with check (
    organisation_id = public.organisation_id()
    and created_by = auth.uid()
    and exists (
      select 1
      from public.jobs j
      where j.id = job_eta_tokens.job_id
        and j.organisation_id = job_eta_tokens.organisation_id
    )
  );

comment on policy "job_eta_tokens_insert_org" on public.job_eta_tokens is
  'Issuers may create ETA tokens only for jobs owned by their current organisation.';
