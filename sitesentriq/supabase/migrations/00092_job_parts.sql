-- 00092_job_parts.sql
--
-- Parts / materials used on a job (mobile field engineer logs what they fitted).
-- Free-text description + quantity (+ optional unit cost). Deliberately NOT
-- linked to stock_items (stock schema is out of scope) and NOT added to the
-- realtime publication (keeping Disk IO low — see 00091).
--
-- RLS mirrors time_entries: org-scoped reads, engineer writes their own rows.

create table if not exists public.job_parts (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  description     text not null,
  quantity        numeric not null default 1,
  unit_cost       numeric,
  added_by        uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

create index if not exists idx_job_parts_job_id on public.job_parts(job_id);

alter table public.job_parts enable row level security;

create policy "job_parts_select_org" on public.job_parts
  for select using (organisation_id = public.organisation_id());

create policy "job_parts_insert_engineer" on public.job_parts
  for insert with check (
    organisation_id = public.organisation_id()
    and added_by = auth.uid()
  );

create policy "job_parts_update_engineer" on public.job_parts
  for update using (
    organisation_id = public.organisation_id()
    and added_by = auth.uid()
  ) with check (
    organisation_id = public.organisation_id()
    and added_by = auth.uid()
  );

create policy "job_parts_delete_engineer" on public.job_parts
  for delete using (
    organisation_id = public.organisation_id()
    and added_by = auth.uid()
  );
