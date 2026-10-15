-- Migration: 00103_cert_completions.sql
-- Feature (V1 backlog #9): engineer-completable compliance certificate forms
-- (Fire alarm, Emergency lighting, Fire extinguisher, Access control, …).
-- One row per completed form, linked to a job and (optionally) an asset; the
-- field answers live in a jsonb keyed by the in-app template definition.

create table if not exists public.cert_completions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  cert_type text not null,
  answers jsonb not null default '{}'::jsonb,
  outcome text check (outcome in ('pass', 'fail', 'remedial', 'n_a')),
  notes text,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_cert_completions_job on public.cert_completions(job_id);
create index if not exists idx_cert_completions_asset on public.cert_completions(asset_id);

alter table public.cert_completions enable row level security;

-- Read: anyone in the org. Mirrors the org-scoped select pattern.
drop policy if exists cert_completions_select on public.cert_completions;
create policy cert_completions_select on public.cert_completions
  for select to authenticated using (organisation_id = public.organisation_id());

-- Write: the engineer who completed it, within their org (mirrors time_entries).
drop policy if exists cert_completions_insert on public.cert_completions;
create policy cert_completions_insert on public.cert_completions
  for insert to authenticated
  with check (organisation_id = public.organisation_id() and completed_by = auth.uid());

drop policy if exists cert_completions_update on public.cert_completions;
create policy cert_completions_update on public.cert_completions
  for update to authenticated
  using (organisation_id = public.organisation_id() and completed_by = auth.uid());
