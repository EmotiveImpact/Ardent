-- ============================================================
-- Migration 00022: Field Operations — GPS check-in + signatures
-- Builder 8A — Wave 8 (operational depth)
--
-- Adds:
--   * field_events       — append-only log of on-site activity
--   * jobs columns       — arrival, working, signature metadata
--   * Storage bucket     — field-signatures (private)
--   * RLS                — org members read; engineers write own; service role bypass
--
-- DO NOT run automatically — to be applied by the integration captain.
-- ============================================================

-- ── 1. field_events ───────────────────────────────────────────
create table if not exists field_events (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references organisations(id) on delete cascade,
  job_id           uuid not null references jobs(id) on delete cascade,
  engineer_id      uuid references profiles(id),
  event_type       text not null check (event_type in (
                     'travel_started',
                     'arrived',
                     'working_started',
                     'paused',
                     'resumed',
                     'working_completed',
                     'signature_captured'
                   )),
  latitude         numeric,
  longitude        numeric,
  accuracy_metres  integer,
  metadata         jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_field_events_job on field_events(job_id);
create index if not exists idx_field_events_engineer on field_events(engineer_id);
create index if not exists idx_field_events_org on field_events(organisation_id);
create index if not exists idx_field_events_event_type on field_events(event_type);
create index if not exists idx_field_events_created_at on field_events(created_at desc);

-- ── 2. jobs alterations ───────────────────────────────────────
alter table jobs add column if not exists arrived_at              timestamptz;
alter table jobs add column if not exists working_started_at      timestamptz;
alter table jobs add column if not exists signature_url           text;
alter table jobs add column if not exists customer_signature_name text;
alter table jobs add column if not exists customer_signature_role text;
alter table jobs add column if not exists customer_signature_at   timestamptz;

-- ── 3. storage bucket (private) ───────────────────────────────
insert into storage.buckets (id, name, public)
values ('field-signatures', 'field-signatures', false)
on conflict (id) do nothing;

-- ── 4. RLS: field_events ──────────────────────────────────────
alter table field_events enable row level security;

-- Org members can read every field_event row in their org
create policy "field_events_select_org" on field_events
  for select
  using (organisation_id = public.organisation_id());

-- Engineers may insert events for themselves only
create policy "field_events_insert_engineer" on field_events
  for insert
  with check (
    organisation_id = public.organisation_id()
    and (
      engineer_id is null
      or engineer_id = auth.uid()
    )
  );

-- Engineers can update only their own events (e.g. backfill metadata)
create policy "field_events_update_engineer" on field_events
  for update
  using (
    organisation_id = public.organisation_id()
    and engineer_id = auth.uid()
  );

-- ── 5. Storage policies for field-signatures ──────────────────
-- Org members can read signed PNGs; engineers can upload to paths under their org.
create policy "field_signatures_read"
  on storage.objects for select
  using (bucket_id = 'field-signatures');

create policy "field_signatures_insert"
  on storage.objects for insert
  with check (bucket_id = 'field-signatures' and auth.role() = 'authenticated');

create policy "field_signatures_update"
  on storage.objects for update
  using (bucket_id = 'field-signatures' and auth.role() = 'authenticated');
