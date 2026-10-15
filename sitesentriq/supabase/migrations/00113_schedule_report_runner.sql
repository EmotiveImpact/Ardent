-- Migration: 00113_schedule_report_runner.sql
-- Description: schedule the run-scheduled-reports executor via pg_cron so saved
--   report schedules actually run + get emailed (previously write-only: STUB).
--
-- Requires (already installed): the pg_cron + pg_net extensions, and a Vault
-- secret named 'service_role_key' holding the project's service-role JWT. The
-- secret is created OUT OF BAND (secrets must never be committed):
--   select vault.create_secret('<service-role-jwt>', 'service_role_key', '…');
-- The cron reads it from Vault at runtime, so NO secret is stored in this file.
--
-- Already applied to the live project. cron.schedule upserts by name, so this is
-- idempotent.

select cron.schedule(
  'run-scheduled-reports',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/run-scheduled-reports',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
