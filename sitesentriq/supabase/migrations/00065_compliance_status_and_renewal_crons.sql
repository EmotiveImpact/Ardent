-- 00065_compliance_status_and_renewal_crons.sql
--
-- Two gaps surfaced by the board audit (2026-05-29):
--
-- 1. NOTHING ever transitioned compliance_items.status to 'overdue' /
--    'due_soon' when next_due passed. Status was only ever set at seed,
--    insert, or manual edit. compute-compliance-scores READS status to
--    compute the org score but never SETS it — so the whole "Needs
--    Attention" / continuous-compliance value prop silently never fired.
--    A compliance item due yesterday stayed 'compliant' forever.
--
-- 2. notify-renewals and weekly-digest edge functions were fully built
--    but never scheduled (00063 only scheduled the score + statement +
--    accreditation jobs), so contract-renewal reminders and the weekly
--    digest never went out in production.
--
-- This migration adds a date-driven status refresh function + schedules
-- it nightly BEFORE the score recompute, and schedules the two missing
-- crons. Reuses public.call_edge_function (00063) + the service_role_jwt
-- vault secret already in place.

-- ── 1. Date-driven compliance status refresh ────────────────────────
-- Flips status based on next_due using a 30-day "due soon" window (the
-- design-system "Due Soon" tier). Leaves 'non_compliant' untouched —
-- that is a manual failed-inspection state, not date-driven, and must
-- only clear on re-inspection. Rows with a null next_due are skipped.
-- updated_at is only bumped on an actual status change so we don't churn
-- the table or fire spurious realtime updates every night.
create or replace function public.refresh_compliance_statuses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  with recomputed as (
    select
      id,
      case
        when next_due < now() then 'overdue'
        when next_due <= now() + interval '30 days' then 'due_soon'
        else 'compliant'
      end as new_status
    from public.compliance_items
    where next_due is not null
      and status <> 'non_compliant'
  )
  update public.compliance_items ci
  set status = r.new_status,
      updated_at = now()
  from recomputed r
  where ci.id = r.id
    and ci.status <> r.new_status;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.refresh_compliance_statuses() from public;
grant execute on function public.refresh_compliance_statuses() to postgres;

comment on function public.refresh_compliance_statuses() is
  'Nightly cron: flips compliance_items.status to overdue/due_soon/compliant based on next_due (30-day due-soon window). Leaves non_compliant (manual) untouched. Returns count of rows changed.';

-- Index to keep the nightly sweep cheap as the table grows.
create index if not exists idx_compliance_items_next_due
  on public.compliance_items (next_due)
  where next_due is not null;

-- ── 2. Schedule the status refresh — nightly at 01:45 UTC ────────────
-- Runs 15 min BEFORE compute-compliance-scores (02:00) so the score is
-- computed from freshly-flipped statuses.
do $$
begin
  perform cron.unschedule('compliance-status-refresh-nightly');
exception
  when others then null;
end $$;

select cron.schedule(
  'compliance-status-refresh-nightly',
  '45 1 * * *',  -- 01:45 UTC daily
  $$select public.refresh_compliance_statuses();$$
);

-- ── 3. Schedule contract-renewal reminders — daily at 07:00 UTC ──────
-- Empty body = real all-orgs run. The function dedups via
-- contract_renewal_notifications, so a daily cadence is safe (it only
-- emails on the 60/30/7/0-day threshold days).
do $$
begin
  perform cron.unschedule('notify-renewals-daily');
exception
  when others then null;
end $$;

select cron.schedule(
  'notify-renewals-daily',
  '0 7 * * *',  -- 07:00 UTC daily
  $$select public.call_edge_function('notify-renewals', '{}'::jsonb);$$
);

-- ── 4. Schedule the weekly digest — Mondays at 07:30 UTC ─────────────
-- Empty body = sweep all orgs (weekly-digest enumerates organisations
-- when no specific recipient/org is supplied).
do $$
begin
  perform cron.unschedule('weekly-digest-monday');
exception
  when others then null;
end $$;

select cron.schedule(
  'weekly-digest-monday',
  '30 7 * * 1',  -- 07:30 UTC every Monday
  $$select public.call_edge_function('weekly-digest', '{}'::jsonb);$$
);
