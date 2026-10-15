-- Migration: 00112_notification_preferences.sql
-- Description: persist per-user notification preferences server-side so the
--   Settings → Notifications toggles actually take effect. They previously wrote
--   only to localStorage, which nothing read (audit: STUB).
--
-- Shape: one row per user; `prefs` is a jsonb map of category-key → { inApp, email }
--   (keys: compliance_due / visit_reminders / invoice_reminders / overdue_actions
--   / quote_approvals). Absent key/row = enabled (the dispatch paths default-allow).

create table if not exists public.notification_preferences (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  prefs           jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_own" on public.notification_preferences;
create policy "notification_preferences_own" on public.notification_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The dispatch gating (createNotification) reads OTHER users' prefs to decide
-- whether to insert a notification for them — that runs as the acting user, so it
-- needs read access to any row. Expose a SECURITY DEFINER reader scoped to the
-- caller's org rather than opening the table's RLS.
create or replace function public.notification_prefs_for(p_user_ids uuid[])
returns table (user_id uuid, prefs jsonb)
language sql
security definer
set search_path = ''
as $$
  select np.user_id, np.prefs
  from public.notification_preferences np
  join public.profiles p on p.id = np.user_id
  where np.user_id = any(p_user_ids)
    and p.organisation_id = public.organisation_id()
$$;

revoke all on function public.notification_prefs_for(uuid[]) from public, anon;
grant execute on function public.notification_prefs_for(uuid[]) to authenticated;
