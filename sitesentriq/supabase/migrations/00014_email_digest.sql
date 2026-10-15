-- ============================================================
-- Migration 00014: Email digest subscriptions, email log, weekly cron
-- Adds:
--   • email_preferences columns on profiles (weekly_digest, daily_alerts)
--   • email_log table (per-recipient send audit trail)
--   • RLS policies (users see their own preferences/logs)
--   • pg_cron schedule running the weekly-digest edge function 07:00 every Mon
-- NOTE: Do NOT run blind. Requires the `pg_cron` and `pg_net`
-- Postgres extensions to be enabled (Supabase: Database > Extensions),
-- and you must replace {{SUPABASE_URL}} and {{SUPABASE_SERVICE_ROLE_KEY}}
-- placeholders with concrete values before applying the cron block.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. email_preferences columns on profiles
-- ─────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists weekly_digest    boolean not null default true,
  add column if not exists daily_alerts     boolean not null default false,
  add column if not exists last_digest_sent_at timestamptz;

comment on column profiles.weekly_digest is
  'When true, receive the Monday 07:00 portfolio compliance digest email.';
comment on column profiles.daily_alerts is
  'When true, receive daily critical-priority alerts (v2 — not yet wired).';
comment on column profiles.last_digest_sent_at is
  'Timestamp of the most recent successful weekly digest send.';

-- ─────────────────────────────────────────────────────────────
-- 2. email_log table — per-recipient send audit trail
-- ─────────────────────────────────────────────────────────────
create table if not exists email_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references profiles(id) on delete set null,
  organisation_id uuid references organisations(id) on delete set null,
  recipient       text not null,
  subject         text,
  template        text not null,           -- 'weekly_digest', 'invite', etc.
  status          text not null
                    check (status in ('sent','failed','skipped')),
  error           text,
  provider_id     text,                    -- Resend message id when available
  created_at      timestamptz not null default now()
);

create index if not exists idx_email_log_user        on email_log(user_id);
create index if not exists idx_email_log_org         on email_log(organisation_id);
create index if not exists idx_email_log_template    on email_log(template);
create index if not exists idx_email_log_created_at  on email_log(created_at desc);

alter table email_log enable row level security;

-- Users may read their own log entries (matched by user_id OR by their email).
drop policy if exists "users read own email log" on email_log;
create policy "users read own email log"
  on email_log
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or recipient = (select email from profiles where id = auth.uid())
  );

-- Org admins can see the whole org's log for auditing/troubleshooting.
drop policy if exists "org admins read org email log" on email_log;
create policy "org admins read org email log"
  on email_log
  for select
  to authenticated
  using (
    organisation_id in (
      select organisation_id from profiles
      where id = auth.uid() and role in ('super_admin','org_admin')
    )
  );

-- Service role bypasses RLS. Edge functions write log rows using the
-- service role key, so no INSERT policy for `authenticated` is needed.

-- ─────────────────────────────────────────────────────────────
-- 3. profiles RLS — make email preference columns updatable by self
-- (Existing profile RLS already allows self-update; nothing extra needed
--  here, but a sanity self-update policy is included for clarity in case
--  the project tightens profile RLS later.)
-- ─────────────────────────────────────────────────────────────
-- (Intentionally no-op — existing 00002_rls_policies.sql covers profiles.)

-- ─────────────────────────────────────────────────────────────
-- 4. pg_cron — Monday 07:00 UTC weekly digest
-- ─────────────────────────────────────────────────────────────
-- Requirements (manual ops checklist before running this block):
--   • Enable extension `pg_cron`   (Supabase: Database > Extensions)
--   • Enable extension `pg_net`    (for net.http_post)
--   • Replace placeholders below with concrete values
--   • Set RESEND_API_KEY in: Project Settings > Edge Functions > Secrets
--
-- Run the following manually after substituting placeholders. It is
-- left as a commented template here so this migration is replay-safe
-- and never silently fails on a project that hasn't enabled pg_cron.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'weekly-digest',
--   '0 7 * * MON',
--   $$
--     select net.http_post(
--       url     := '{{SUPABASE_URL}}/functions/v1/weekly-digest',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer {{SUPABASE_SERVICE_ROLE_KEY}}'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$
-- );
--
-- To unschedule:
--   select cron.unschedule('weekly-digest');
