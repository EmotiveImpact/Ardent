-- Migration: 00111_log_books_risk_assessments.sql
-- Description: create the backing tables for the Reports → Log Books and Risk
--   Assessments features. Both routes (apps/web/src/routes/reports/log-books.tsx,
--   risk-assessments.tsx) query/insert these tables, but no migration ever
--   created them — so both pages errored. Columns match the forms exactly.

create table if not exists public.log_book_entries (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  property_id     uuid not null references public.properties(id) on delete cascade,
  log_type        text not null check (log_type in ('inspection','maintenance','incident','visitor')),
  entry           text not null,
  recorded_by     text not null,
  log_date        date not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_log_book_entries_org on public.log_book_entries(organisation_id);
create index if not exists idx_log_book_entries_property on public.log_book_entries(property_id);
alter table public.log_book_entries enable row level security;
drop policy if exists "log_book_entries_rw" on public.log_book_entries;
create policy "log_book_entries_rw" on public.log_book_entries
  for all to authenticated
  using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());

create table if not exists public.risk_assessments (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations(id) on delete cascade,
  property_id      uuid not null references public.properties(id) on delete cascade,
  reference        text not null,
  risk_type        text not null,
  severity         text not null check (severity in ('low','medium','high','critical')),
  status           text not null default 'draft' check (status in ('draft','submitted','approved')),
  assessor         text not null,
  assessment_date  date not null,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_risk_assessments_org on public.risk_assessments(organisation_id);
create index if not exists idx_risk_assessments_property on public.risk_assessments(property_id);
alter table public.risk_assessments enable row level security;
drop policy if exists "risk_assessments_rw" on public.risk_assessments;
create policy "risk_assessments_rw" on public.risk_assessments
  for all to authenticated
  using (organisation_id = public.organisation_id())
  with check (organisation_id = public.organisation_id());
