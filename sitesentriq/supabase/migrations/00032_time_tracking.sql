-- ============================================================
-- Migration 00032: Time Tracking on Jobs
-- Wave 12 — Task 107 — Builder 12A (Time Tracking)
--
-- Engineer hours split into billable / travel / on-site / admin / break.
-- Drives invoice line items + utilisation reporting.
--
-- Adds:
--   * time_entries           — per-engineer per-job tracked time
--   * engineers ALTER        — default_billable_rate (£/hr fallback)
--   * trigger compute_dur    — auto-populate duration_minutes when
--                              ended_at is set
--   * trigger no_overlap     — only one running entry per engineer at a time
--   * RLS                    — org members read; engineers write own;
--                              org_admins update/delete any in org
--
-- DO NOT run automatically — applied via Supabase management API by builder.
-- ============================================================

-- ── 1. engineers ALTER (idempotent) ───────────────────────────
alter table engineers add column if not exists default_billable_rate numeric;

-- ── 2. time_entries table ─────────────────────────────────────
create table if not exists time_entries (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references organisations(id) on delete cascade,
  job_id              uuid not null references jobs(id) on delete cascade,
  -- engineer_id maps to profiles(id) — same convention as field_events.
  engineer_id         uuid not null references profiles(id) on delete cascade,
  kind                text not null check (kind in ('travel', 'on_site', 'admin', 'break')),
  started_at          timestamptz not null,
  ended_at            timestamptz,
  duration_minutes    integer,
  billable            boolean not null default true,
  rate_per_hour       numeric,
  notes               text,
  -- Marked when an invoice line item is generated from this entry.
  billed_invoice_id   uuid references invoices(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_time_entries_engineer_started
  on time_entries(engineer_id, started_at desc);
create index if not exists idx_time_entries_job_started
  on time_entries(job_id, started_at);
create index if not exists idx_time_entries_org_started
  on time_entries(organisation_id, started_at desc);
create index if not exists idx_time_entries_running
  on time_entries(engineer_id) where ended_at is null;
create index if not exists idx_time_entries_unbilled
  on time_entries(job_id) where billed_invoice_id is null and billable = true;

-- ── 3. trigger: compute duration_minutes when ended_at set ────
create or replace function public.time_entries_compute_duration()
returns trigger
language plpgsql
as $$
begin
  if new.ended_at is not null and new.started_at is not null then
    new.duration_minutes := greatest(
      0,
      cast(extract(epoch from (new.ended_at - new.started_at)) / 60 as integer)
    );
  else
    new.duration_minutes := null;
  end if;
  -- Break entries are never billable.
  if new.kind = 'break' then
    new.billable := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_time_entries_duration on time_entries;
create trigger trg_time_entries_duration
  before insert or update on time_entries
  for each row execute function public.time_entries_compute_duration();

-- ── 4. trigger: prevent overlapping running entries per engineer ─
create or replace function public.time_entries_prevent_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.ended_at is null then
    if exists (
      select 1 from time_entries
       where engineer_id = new.engineer_id
         and ended_at is null
         and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      raise exception 'engineer already has a running time entry — stop it first'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_time_entries_no_overlap on time_entries;
create trigger trg_time_entries_no_overlap
  before insert or update on time_entries
  for each row execute function public.time_entries_prevent_overlap();

-- ── 5. RLS ────────────────────────────────────────────────────
alter table time_entries enable row level security;

-- Org members may read every entry in their org.
drop policy if exists "time_entries_select_org" on time_entries;
create policy "time_entries_select_org" on time_entries
  for select
  using (organisation_id = public.organisation_id());

-- Engineers may insert entries for themselves only.
drop policy if exists "time_entries_insert_engineer" on time_entries;
create policy "time_entries_insert_engineer" on time_entries
  for insert
  with check (
    organisation_id = public.organisation_id()
    and engineer_id = auth.uid()
  );

-- Engineers may update / delete their own entries.
drop policy if exists "time_entries_update_engineer" on time_entries;
create policy "time_entries_update_engineer" on time_entries
  for update
  using (
    organisation_id = public.organisation_id()
    and engineer_id = auth.uid()
  )
  with check (
    organisation_id = public.organisation_id()
    and engineer_id = auth.uid()
  );

drop policy if exists "time_entries_delete_engineer" on time_entries;
create policy "time_entries_delete_engineer" on time_entries
  for delete
  using (
    organisation_id = public.organisation_id()
    and engineer_id = auth.uid()
  );

-- Org admins / super_admins may update/delete any entry in their org
-- (e.g. retroactive correction or marking entries billed).
drop policy if exists "time_entries_admin_all" on time_entries;
create policy "time_entries_admin_all" on time_entries
  for all
  using (
    organisation_id = public.organisation_id()
    and exists (
      select 1 from profiles
       where id = auth.uid()
         and role in ('org_admin', 'super_admin')
    )
  )
  with check (
    organisation_id = public.organisation_id()
    and exists (
      select 1 from profiles
       where id = auth.uid()
         and role in ('org_admin', 'super_admin')
    )
  );
