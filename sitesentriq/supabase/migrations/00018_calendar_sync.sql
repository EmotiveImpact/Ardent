-- ============================================================
-- Calendar Sync (Wave 7A)
-- iCal subscription tokens + Google Calendar OAuth tokens.
-- DO NOT run automatically — apply during a coordinated cutover.
-- ============================================================

-- =========================
-- google_calendar_tokens
-- One row per user — stores Google OAuth refresh + cached access tokens.
-- =========================
create table if not exists google_calendar_tokens (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid references organisations(id),
  refresh_token   text not null,
  access_token    text,
  expires_at      timestamptz,
  calendar_id     text not null default 'primary',
  scope           text,
  connected_at    timestamptz not null default now(),
  last_synced_at  timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_google_calendar_tokens_org
  on google_calendar_tokens(organisation_id);

create trigger set_google_calendar_tokens_updated_at
  before update on google_calendar_tokens
  for each row execute function update_updated_at_column();

alter table google_calendar_tokens enable row level security;

-- Users can read/delete only their own row.
create policy "users read own google calendar tokens"
  on google_calendar_tokens for select
  using (auth.uid() = user_id);

create policy "users delete own google calendar tokens"
  on google_calendar_tokens for delete
  using (auth.uid() = user_id);

-- All writes are funnelled through the edge function (service-role).
-- No insert/update policies for end users.

-- =========================
-- calendar_feed_tokens
-- Signed bearer tokens that grant read-only access to the iCal feed.
-- token_hash is sha256(token) — the raw token is shown to the user once.
-- =========================
create table if not exists calendar_feed_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token_hash  text not null unique,
  label       text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

create index if not exists idx_calendar_feed_tokens_user
  on calendar_feed_tokens(user_id);

alter table calendar_feed_tokens enable row level security;

-- Users see only their own (active) tokens.
create policy "users read own calendar feed tokens"
  on calendar_feed_tokens for select
  using (auth.uid() = user_id);

create policy "users insert own calendar feed tokens"
  on calendar_feed_tokens for insert
  with check (auth.uid() = user_id);

create policy "users delete own calendar feed tokens"
  on calendar_feed_tokens for delete
  using (auth.uid() = user_id);

-- Allow the user to revoke (soft delete) by updating revoked_at.
create policy "users revoke own calendar feed tokens"
  on calendar_feed_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
