-- 00093_job_messages.sql
--
-- Job chat — messages between the field engineer and the office, scoped to a
-- job. Read by org members; each member inserts their own messages
-- (sender_id = auth.uid()). `from_office` marks office/admin replies vs engineer
-- messages. NOT added to the realtime publication (keeping Disk IO low — see
-- 00091); the mobile chat polls while the screen is open instead.

create table if not exists public.job_messages (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  sender_id       uuid references public.profiles(id),
  sender_name     text,
  body            text not null,
  from_office     boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_job_messages_job_id on public.job_messages(job_id, created_at);

alter table public.job_messages enable row level security;

create policy "job_messages_select_org" on public.job_messages
  for select using (organisation_id = public.organisation_id());

create policy "job_messages_insert_org" on public.job_messages
  for insert with check (
    organisation_id = public.organisation_id()
    and sender_id = auth.uid()
  );
