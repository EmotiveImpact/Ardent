-- 00105 — Security: lock down internal SECURITY DEFINER functions.
--
-- Supabase's security advisor flagged a set of SECURITY DEFINER functions as
-- executable by anon/authenticated via /rest/v1/rpc/*. Postgres grants EXECUTE
-- to PUBLIC by default, so the API roles inherited it. The genuinely exploitable
-- ones were:
--   • refresh_engineer_accreditation_statuses()  — a global (all-orgs) UPDATE,
--     callable by anon → cross-org mass write / DoS.
--   • fos_recalculate_quote_totals(uuid) / fos_recalculate_purchase_order_totals(uuid)
--     — write a target's totals with no org check, callable by anon/authenticated.
-- The rest are trigger / auth / event-trigger functions never meant to be called
-- directly. Triggers still fire after this revoke — Postgres trigger execution
-- does NOT require the inserting role to hold EXECUTE on the trigger function.
--
-- Verified the client + edge code calls NONE of these via .rpc() except
-- seed_sample_data / create_job_from_maintenance_plan (authenticated flows only,
-- kept). These functions are NOT used by RLS policies, so there is no RLS break.
-- Runtime-verified with has_function_privilege(): anon/authenticated EXECUTE = false.

-- A) Internal trigger / maintenance functions — revoke from PUBLIC (and the API
--    roles), grant only to service_role (backend/cron paths).
do $mig$
declare fn text;
begin
  foreach fn in array array[
    'public.refresh_engineer_accreditation_statuses()',
    'public.fos_recalculate_quote_totals(uuid)',
    'public.fos_recalculate_purchase_order_totals(uuid)',
    'public.fos_quote_lines_after_change()',
    'public.fos_broadcast_org_table_change()',
    'public.assign_job_number()',
    'public.assign_property_number()',
    'public.handle_new_user()',
    'public.rls_auto_enable()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $mig$;

-- C) Auth-required RPCs that were anon-reachable via PUBLIC. Keep authenticated +
--    service_role (the app calls them only from authenticated onboarding /
--    maintenance flows); drop public/anon.
do $mig$
declare fn text;
begin
  foreach fn in array array[
    'public.create_job_from_maintenance_plan(uuid, date)',
    'public.seed_sample_data(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $mig$;

-- NOTE (intentionally NOT changed): the RLS helper functions organisation_id(),
-- is_portal_client(), my_client_id(), tenant_property_id() keep their PUBLIC
-- grant. RLS policies evaluate them as the *querying* role, so revoking would
-- risk an app-wide RLS break; they return NULL for anon, so the exposure is nil.
