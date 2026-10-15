-- Migration: 00115_dashboard_widget_prefs.sql
-- Description: per-user dashboard widget layout (show/hide + order), DB-backed
--   (trust wave W1-T4). Competitive research: user-composable dashboards are
--   paywalled or absent across the CMMS category — we ship them in core.
--
-- Shape mirrors 00112_notification_preferences: own-row RLS, jsonb payload.
-- layout = ordered array of { "key": text, "hidden": bool }. Users with no row
-- (everyone, initially) get the registry default — mergeLayout() client-side
-- appends unknown/missing keys, so NO backfill is needed now or when new
-- widgets ship later.

create table if not exists public.dashboard_widget_prefs (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  layout          jsonb not null default '[]'::jsonb,
  updated_at      timestamptz not null default now()
);

alter table public.dashboard_widget_prefs enable row level security;

-- Own-row only — no org-wide reader is needed (unlike notification_prefs,
-- nothing dispatches on another user's dashboard layout).
drop policy if exists "dashboard_widget_prefs_own" on public.dashboard_widget_prefs;
create policy "dashboard_widget_prefs_own" on public.dashboard_widget_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.dashboard_widget_prefs is
  'Per-user dashboard widget layout: jsonb array of {key, hidden} in display order. Own-row RLS; absent row = registry default.';
