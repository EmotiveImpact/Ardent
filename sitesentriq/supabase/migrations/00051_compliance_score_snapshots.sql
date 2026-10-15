-- 00051_compliance_score_snapshots.sql
--
-- Strategic 1 — "Continuous Compliance Score" foundational slice.
--
-- Why this table:
--   A UK FM buyer's #1 question is "is my building compliant?". Today
--   every FM tool answers with red/amber/green per-item. Vanta proved
--   that compressing this into a single number that goes up creates a
--   category. This table stores ONE score per organisation per day, so
--   that:
--     * the dashboard hero can render today's score + delta-vs-yesterday
--     * future "Trust URL" pages can render a public sparkline
--     * future monthly Statement-of-Compliance PDFs can quote a single
--       number for the period
--
-- Lifecycle:
--   - INSERTed by the compute-compliance-scores edge function (run via
--     pg_cron, daily). UPSERT on (organisation_id, snapshot_date) so
--     re-runs in the same day are idempotent (e.g. the dashboard
--     "Recompute now" link).
--   - Rows are never deleted. Score history is the product.
--   - The breakdown jsonb captures the four sub-metrics so we can
--     change weights / add metrics without re-migrating.

create table if not exists public.compliance_score_snapshots (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- Date in UK FM operational terms (ops cares about "today's score",
  -- not "the score at 02:00 UTC"). Stored as `date` (no timezone) and
  -- the cron writes the UK-civil-day value.
  snapshot_date   date not null,
  -- 0–100 inclusive. Smallint keeps the table compact for years of
  -- daily snapshots × thousands of orgs.
  score           smallint not null check (score between 0 and 100),
  -- { compliance: number, ppm_on_time: number, pass_rate: number,
  --   action_health: number, weights?: {...}, version?: number }
  -- jsonb so we can evolve the breakdown shape without a migration.
  breakdown       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),

  -- One snapshot per (org, day). Lets the cron UPSERT with no dedup
  -- table, and lets the read-hook key its query by (org, date).
  unique (organisation_id, snapshot_date)
);

-- The hot read pattern is "give me the last 1–2 (or 30, for the
-- sparkline) snapshots for THIS org" — descending by date.
create index if not exists compliance_score_snapshots_org_date_idx
  on public.compliance_score_snapshots (organisation_id, snapshot_date desc);

-- ---- RLS ----------------------------------------------------------
-- Read-only to org members. INSERTs / UPDATEs / DELETEs come from the
-- service role inside the cron edge function, so no client-facing
-- mutation policies are needed.

alter table public.compliance_score_snapshots enable row level security;

create policy "compliance_score_snapshots_select_org"
  on public.compliance_score_snapshots for select
  using (
    organisation_id in (
      select organisation_id from public.profiles where id = auth.uid()
    )
  );

comment on table public.compliance_score_snapshots is
  'Continuous Compliance Score — one daily snapshot per organisation. Computed by the compute-compliance-scores edge function (pg_cron daily). Powers the dashboard hero tile, future public Trust URL, and monthly Statement-of-Compliance PDF. Strategic 1.';
