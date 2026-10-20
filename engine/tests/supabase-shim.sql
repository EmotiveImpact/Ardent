-- The slice of a Supabase database the engine's migrations rely on, so the
-- tests run on plain Postgres with no Docker. Never applied to Supabase itself.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema extensions;
create extension pgcrypto schema extensions;

create table auth.users (
  id                     uuid primary key,
  instance_id            uuid,
  aud                    text,
  role                   text,
  email                  text unique,
  encrypted_password     text,
  email_confirmed_at     timestamptz,
  raw_app_meta_data      jsonb,
  raw_user_meta_data     jsonb,
  confirmation_token     text,
  recovery_token         text,
  email_change_token_new text,
  email_change           text,
  created_at             timestamptz,
  updated_at             timestamptz
);

create table auth.identities (
  id              uuid primary key,
  user_id         uuid references auth.users(id) on delete cascade,
  provider_id     text,
  identity_data   jsonb,
  provider        text,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz
);

-- Same definition as Supabase's.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
