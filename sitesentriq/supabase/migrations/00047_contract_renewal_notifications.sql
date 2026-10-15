-- 00047_contract_renewal_notifications.sql
--
-- Sprint 2 / C5 — Dedup table for the notify-renewals cron.
--
-- Why this table:
--   The renewal-watch cron runs daily. Without dedup it would spam the
--   FM team and the org's support_email every single day for every
--   contract in the 60-30 day window. We track which (contract,
--   threshold_days) pairs have already been alerted so the next run
--   skips them.
--
-- Lifecycle:
--   - INSERT happens inside the notify-renewals edge function, after
--     a notification + email has been sent for a (contract, threshold)
--     pair.
--   - Rows are never deleted. If a contract is renewed (status →
--     'renewed') the cron skips it via the contracts.status filter,
--     not via dedup row removal — the audit trail is more valuable
--     than the table size.
--   - When a contract's term is extended (end_date pushed out), it
--     naturally falls out of the cron's window until the new end
--     date approaches. The dedup rows for the old crossings stay
--     and harmlessly never match again.

create table if not exists public.contract_renewal_notifications (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.contracts(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- 0 / 7 / 30 / 60 — see THRESHOLDS in the edge function. Stored as
  -- a smallint rather than enum so the cron can introduce new
  -- thresholds (e.g. 14-day) without a migration.
  threshold_days  smallint not null,
  sent_at         timestamptz not null default now(),
  -- One row per (contract, threshold) pair — the dedup primary key.
  unique (contract_id, threshold_days)
);

create index if not exists contract_renewal_notifications_org_id_idx
  on public.contract_renewal_notifications (organisation_id);

-- ---- RLS ----------------------------------------------------------
-- Read-only to the contract's owning org. Inserts come from the
-- service role inside the cron, so no insert policy is needed.

alter table public.contract_renewal_notifications enable row level security;

create policy "contract_renewal_notifications_select_org"
  on public.contract_renewal_notifications for select
  using (
    organisation_id in (
      select organisation_id from public.profiles where id = auth.uid()
    )
  );

comment on table public.contract_renewal_notifications is
  'Dedup table for the notify-renewals cron. One row per (contract, threshold_days) pair after the alert is sent. Sprint 2 / C5.';
