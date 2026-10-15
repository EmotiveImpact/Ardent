-- 00064_auxiliary_functions_search_path.sql
--
-- Harden the remaining 22 helper / trigger functions with an empty
-- search_path. These are SECURITY INVOKER (lower risk than the
-- SECURITY DEFINER set covered in 00058) but the advisor still
-- flags them as `function_search_path_mutable` best-practice WARNs.
--
-- Closes the remaining WARN-level lints from the Supabase security
-- advisor for the function-search-path category.

do $$
declare
  rec record;
  fns text[] := array[
    'public.apply_stock_movement()',
    'public.auto_seed_report_templates_for_new_org()',
    'public.certificate_org_prefix(p_org_id uuid)',
    'public.certificate_type_prefix(p_type text)',
    'public.fos_frequency_interval(p_frequency text)',
    'public.fos_purchase_order_lines_after_change()',
    'public.fos_quote_lines_after_change()',
    'public.fos_set_purchase_order_line_totals()',
    'public.fos_set_quote_line_totals()',
    'public.gen_certificate_number(p_org_id uuid, p_type text)',
    'public.pct_change(current_v numeric, previous_v numeric)',
    'public.seed_default_report_templates(p_org_id uuid)',
    'public.seed_default_sla_policies(p_org_id uuid)',
    'public.seed_default_stock_items(p_org_id uuid)',
    'public.time_entries_compute_duration()',
    'public.time_entries_prevent_overlap()',
    'public.touch_gdpr_request_updated_at()',
    'public.touch_sla_policy_updated_at()',
    'public.touch_slack_updated_at()',
    'public.touch_stock_updated_at()',
    'public.touch_subscription_updated_at()',
    'public.update_updated_at_column()'
  ];
  fn text;
begin
  foreach fn in array fns loop
    begin
      execute format('alter function %s set search_path = ''''', fn);
    exception
      when undefined_function then
        raise notice 'function % does not exist, skipped', fn;
      when others then
        raise notice 'failed to alter function %: %', fn, sqlerrm;
    end;
  end loop;
end $$;
