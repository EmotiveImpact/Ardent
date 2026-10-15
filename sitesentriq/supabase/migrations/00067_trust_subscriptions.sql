-- 00067_trust_subscriptions.sql
--
-- Strategic Trio #1 — Trust-URL subscriptions. An insurer or top client
-- "Watches" an FM operator's public compliance score and is alerted when it
-- drops below a threshold (or at all). All access is via service-role edge
-- functions (trust-subscribe / notify-trust-subscribers); the slug is the only
-- auth surface, exactly like compliance_score_snapshots public reads. RLS on
-- with no public policies.

create table if not exists public.trust_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id) on delete cascade,
  email               text not null,
  -- null = "alert on ANY drop"; otherwise an int 1–100 threshold.
  threshold           int,
  unsubscribe_token   text not null unique default encode(gen_random_bytes(16), 'hex'),
  confirmed           boolean not null default true,
  last_notified_score int,
  last_notified_at    timestamptz,
  created_at          timestamptz not null default now(),
  unique (organisation_id, email)
);

create index if not exists trust_subscriptions_org_idx
  on public.trust_subscriptions (organisation_id);

alter table public.trust_subscriptions enable row level security;

comment on table public.trust_subscriptions is
  'Public Trust URL watchers. An insurer/client subscribes via the trust-subscribe edge function and is alerted by notify-trust-subscribers when the org compliance score drops. All access is service-role; RLS on with no public policies.';
