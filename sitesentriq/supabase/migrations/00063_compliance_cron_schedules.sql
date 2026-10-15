-- 00063_compliance_cron_schedules.sql
--
-- Activate the previously-documentation-only cron schedules for the
-- Compliance Score (nightly recompute) and Statement of Compliance
-- (monthly PDF generation + email). The schedules were referenced in
-- the comments of 00051 / 00054 but never actually created.
--
-- Required Supabase extensions: pg_cron + pg_net (both available on
-- all paid + free Supabase tiers but not enabled by default). Vault
-- is used to fetch the service-role JWT without storing it in the
-- cron table in plaintext.
--
-- ONE-TIME SETUP (post-migration, do this in the Supabase SQL Editor
-- OR via the supabase-mcp execute_sql tool):
--
--   select vault.create_secret(
--     '<your-service-role-jwt>',
--     'service_role_jwt'
--   );
--
-- Find the JWT at: Supabase Dashboard → Settings → API → service_role.
-- Without this secret, the cron will run but the HTTP POST to the
-- edge function will fail with 401 unauthorized.

-- ── 1. Enable extensions ─────────────────────────────────
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ── 2. Helper function — calls a Supabase Edge Function as service role
-- Encapsulates the auth + URL pattern so the cron commands stay tidy.
-- SECURITY DEFINER + locked search_path; only the postgres role can
-- run it via cron.
create or replace function public.call_edge_function(
  fn_name text,
  body jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt text;
  v_url text;
  v_request_id bigint;
begin
  -- Fetch service-role JWT from vault. If the secret doesn't exist
  -- yet, raise a clear error rather than silently 401-ing.
  select decrypted_secret into v_jwt
  from vault.decrypted_secrets
  where name = 'service_role_jwt'
  limit 1;

  if v_jwt is null then
    raise exception 'vault secret "service_role_jwt" not found. Run: select vault.create_secret(''<JWT>'', ''service_role_jwt'');';
  end if;

  -- Project URL is derived from the project ref (Supabase hosts at
  -- https://<ref>.supabase.co). We hardcode the ref here since it's
  -- not sensitive and changes only on project move.
  v_url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/' || fn_name;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', concat('Bearer ', v_jwt)
    ),
    body := body
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.call_edge_function(text, jsonb) from public;
grant execute on function public.call_edge_function(text, jsonb) to postgres;

-- ── 3. Schedule the compliance score recompute — every night at 02:00 UTC
-- The compute-compliance-scores function with an empty body triggers
-- the all-orgs sweep path (service-role JWT required).
do $$
begin
  -- Drop if already exists (defensive — first apply has no impact).
  perform cron.unschedule('compliance-score-nightly');
exception
  when others then null;
end $$;

select cron.schedule(
  'compliance-score-nightly',
  '0 2 * * *',  -- 02:00 UTC daily
  $$select public.call_edge_function('compute-compliance-scores', '{}'::jsonb);$$
);

-- ── 4. Schedule the monthly Statement of Compliance — 1st of the month at 06:00 UTC
-- The generate-statement-of-compliance function with an empty body
-- triggers all-orgs generation for the previous calendar month.
do $$
begin
  perform cron.unschedule('statement-of-compliance-monthly');
exception
  when others then null;
end $$;

select cron.schedule(
  'statement-of-compliance-monthly',
  '0 6 1 * *',  -- 06:00 UTC on the 1st of every month
  $$select public.call_edge_function('generate-statement-of-compliance', '{}'::jsonb);$$
);

-- ── 5. (Optional, defence-in-depth) — also schedule the engineer
-- accreditation status refresh nightly so expired/expiring statuses
-- flip without waiting for the next compliance score recompute.
do $$
begin
  perform cron.unschedule('engineer-accreditations-nightly');
exception
  when others then null;
end $$;

select cron.schedule(
  'engineer-accreditations-nightly',
  '30 1 * * *',  -- 01:30 UTC daily (30 min before compliance score)
  $$select public.refresh_engineer_accreditation_statuses();$$
);

comment on function public.call_edge_function(text, jsonb) is
  'Cron helper. Fetches service_role_jwt from vault and POSTs to the named edge function. Restricted to postgres role.';
