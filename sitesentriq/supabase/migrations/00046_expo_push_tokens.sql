-- 00046_expo_push_tokens.sql
--
-- Sprint 2A — store Expo push tokens for the mobile app.
--
-- Why a new table (vs a column on profiles):
--   A user can have multiple devices (work iPhone + personal iPad), each
--   with its own Expo push token. A single column would either thrash
--   on the latest device or only notify one of them. A row per token
--   lets the sender fan out to every active device and lets us garbage
--   collect 410-Gone tokens individually.
--
-- The token itself is opaque (Expo issues an `ExponentPushToken[…]`
-- string) so we don't need to validate format here. UNIQUE on token
-- prevents duplicate rows when the same device re-registers.

create table if not exists public.expo_push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  token           text not null unique,
  -- 'ios' | 'android' | 'web' (Expo supports web pushes too) — kept as
  -- text rather than enum so future platforms don't require a migration.
  platform        text,
  -- Optional metadata for diagnostics. App version helps us correlate
  -- a stuck token with a known bad release.
  app_version     text,
  device_name     text,
  created_at      timestamptz not null default now(),
  -- last_used_at is bumped each time we successfully push to this
  -- token. A nightly cron can prune tokens not used in 90 days.
  last_used_at    timestamptz not null default now()
);

create index if not exists expo_push_tokens_user_id_idx
  on public.expo_push_tokens (user_id);

create index if not exists expo_push_tokens_organisation_id_idx
  on public.expo_push_tokens (organisation_id);

-- ---- RLS -----------------------------------------------------------
-- Tokens are private to the user that owns them. Same-org admins do
-- NOT need read access — fan-out happens server-side via the service
-- role, not through the client. This keeps the surface tight: tokens
-- are sensitive (anyone who has one can spoof a notification to that
-- device via Expo's push API if the project isn't using auth).

alter table public.expo_push_tokens enable row level security;

create policy "expo_push_tokens_select_own"
  on public.expo_push_tokens for select
  using (user_id = auth.uid());

create policy "expo_push_tokens_insert_own"
  on public.expo_push_tokens for insert
  with check (user_id = auth.uid());

-- Update is allowed for the owner so the mobile app can bump
-- last_used_at, change platform metadata, or rotate after a re-install.
create policy "expo_push_tokens_update_own"
  on public.expo_push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "expo_push_tokens_delete_own"
  on public.expo_push_tokens for delete
  using (user_id = auth.uid());

-- Enable realtime so the device picks up token revocations from other
-- sessions of the same user (e.g. signed out from web, want to wipe
-- mobile push quietly).
alter publication supabase_realtime add table public.expo_push_tokens;

comment on table public.expo_push_tokens is
  'Expo push tokens for mobile devices. Multi-device per user. Used by send-expo-push edge function. Sprint 2A.';
