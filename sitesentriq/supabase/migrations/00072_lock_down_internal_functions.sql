-- 00072_lock_down_internal_functions.sql
--
-- Security advisor cleanup: several SECURITY DEFINER functions that are
-- ONLY ever invoked by triggers or pg_cron were still EXECUTE-able by the
-- anon / authenticated roles via PostgREST (/rest/v1/rpc/<fn>). They have no
-- business being part of the public API surface. Revoke EXECUTE from anon +
-- authenticated.
--
-- SAFE because:
--   • Trigger functions are executed by the trigger mechanism, which does NOT
--     check the firing role's EXECUTE privilege — revoking it does not affect
--     trigger firing (signup, org-seed, trial-seed all keep working).
--   • Cron functions run as the postgres role (which retains EXECUTE).
--
-- DELIBERATELY NOT TOUCHED: organisation_id(), tenant_property_id() and the
-- other RLS-helper functions — RLS USING/CHECK expressions are evaluated as
-- the querying role, so `authenticated` genuinely needs EXECUTE on those.
-- Also left: fos_recalculate_*, create_job_from_maintenance_plan,
-- seed_sample_data — these may be intentional app RPCs.

do $$
declare
  fn text;
  sigs text[] := array[
    'public.refresh_compliance_statuses()',
    'public.refresh_engineer_accreditation_statuses()',
    'public.call_edge_function(text, jsonb)',
    'public.handle_new_user()',
    'public.auto_seed_report_templates_for_new_org()',
    'public.seed_default_report_templates(uuid)',
    'public.seed_org_trial_subscription()'
  ];
begin
  foreach fn in array sigs loop
    begin
      execute format('revoke execute on function %s from anon, authenticated', fn);
    exception when undefined_function then
      raise notice 'skip (not found): %', fn;
    end;
  end loop;
end $$;
