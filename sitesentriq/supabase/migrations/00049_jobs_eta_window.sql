-- 00049_jobs_eta_window.sql — Sprint 3 / D3
--
-- Add a customer-facing arrival window to jobs. Two timestamps so the
-- public ETA page (D2) can render "between 14:15 and 14:45" — Amazon's
-- "10 stops away" pattern, applied to FM. A single ETA point creates
-- false precision and erodes trust when the engineer slips by 5 min.
--
-- Both columns are NULLABLE — most jobs won't have a window set until
-- the dispatcher (or auto-derive on travelling) fills it in.

alter table public.jobs
  add column if not exists eta_earliest_at timestamptz,
  add column if not exists eta_latest_at   timestamptz;

-- Sanity constraint: latest must be after earliest. Catches typos
-- like "12:00 → 11:30". Allows both null OR both set.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_eta_window_order'
  ) then
    alter table public.jobs
      add constraint jobs_eta_window_order
        check (
          (eta_earliest_at is null and eta_latest_at is null)
          or (eta_earliest_at is not null and eta_latest_at is not null
              and eta_latest_at >= eta_earliest_at)
        );
  end if;
end $$;

-- Index for the dispatcher view "what's happening in the next 2h" —
-- earliest_at being indexed lets the scheduler order/filter cheaply.
create index if not exists jobs_eta_earliest_at_idx
  on public.jobs (eta_earliest_at)
  where eta_earliest_at is not null;

comment on column public.jobs.eta_earliest_at is
  'Customer-facing earliest arrival timestamp. Rendered in the public-job-eta endpoint as the start of the arrival window. Sprint 3 / D3.';
comment on column public.jobs.eta_latest_at is
  'Customer-facing latest arrival timestamp. Pair with eta_earliest_at to render "between X and Y" on the customer ETA page. Sprint 3 / D3.';
