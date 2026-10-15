-- 00048_job_eta_tokens.sql
--
-- Sprint 3 / D2 — Public, unauthenticated ETA tracking links.
--
-- Why this exists:
--   FM customers shouldn't need a login to check "when's my engineer
--   getting here?" Onfleet's killer flow: SMS arrives, customer taps
--   the link, sees a live map + ETA window, no signup. Joblogic and
--   BigChange both make customers create accounts; this is a
--   meaningful differentiator we can ship in a single sprint.
--
-- Security model:
--   - The token is a 32-char URL-safe random string. UUID would also
--     work but URL-safe base64 is shorter (32 → ~24 chars after
--     base64url encoding) and unguessable for the same entropy.
--   - Tokens are scoped to a single job_id and have an expires_at
--     (default 7 days). The public edge function refuses to look up
--     anything past expiry, even if the row is still present.
--   - Tokens carry NO PII themselves. The endpoint returns only:
--     property name (already shared with customer in the call-out),
--     engineer first name (already on the work-order), ETA window,
--     status. NEVER addresses, phone numbers, full names, prices, etc.
--   - We mark each token's last_viewed_at + view_count so abuse stands
--     out (e.g. a leaked token getting hit hundreds of times).
--   - Anonymous users CAN'T list / select these — RLS blocks them.
--     Only the public edge function (service role) reads them.

create table if not exists public.job_eta_tokens (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- The token shown in the public URL. UNIQUE so token → job lookup
  -- is a single index hit; URL-safe characters only.
  token           text not null unique,
  -- Auto-expires 7 days after issue by default. Caller (the share
  -- button on the job detail page) can override.
  expires_at      timestamptz not null default (now() + interval '7 days'),
  -- For abuse detection — leaked tokens stand out as having absurd
  -- view_count or being viewed long after the customer would normally
  -- have stopped checking.
  view_count      integer not null default 0,
  last_viewed_at  timestamptz,
  -- Audit / cleanup metadata.
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists job_eta_tokens_job_id_idx
  on public.job_eta_tokens (job_id);

create index if not exists job_eta_tokens_organisation_id_idx
  on public.job_eta_tokens (organisation_id);

-- ---- RLS ----------------------------------------------------------
-- Read access is limited to the issuing org. Public lookups happen
-- via the public-job-eta edge function using the service role — they
-- DO NOT come through this RLS policy.

alter table public.job_eta_tokens enable row level security;

create policy "job_eta_tokens_select_org"
  on public.job_eta_tokens for select
  using (
    organisation_id in (
      select organisation_id from public.profiles where id = auth.uid()
    )
  );

create policy "job_eta_tokens_insert_org"
  on public.job_eta_tokens for insert
  with check (
    organisation_id in (
      select organisation_id from public.profiles where id = auth.uid()
    )
    and created_by = auth.uid()
  );

create policy "job_eta_tokens_delete_org"
  on public.job_eta_tokens for delete
  using (
    organisation_id in (
      select organisation_id from public.profiles where id = auth.uid()
    )
  );

comment on table public.job_eta_tokens is
  'Public, unauthenticated ETA tracking tokens for customer-facing job ETA links. Sprint 3 / D2. Tokens are short-lived, single-job-scoped, and carry no PII. Public lookups go through public-job-eta edge function; RLS only governs FM team access.';
