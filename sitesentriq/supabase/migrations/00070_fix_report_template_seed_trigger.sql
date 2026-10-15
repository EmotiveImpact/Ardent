-- 00070_fix_report_template_seed_trigger.sql
--
-- PRE-EXISTING PRODUCTION BUG (surfaced by the org-provisioning E2E):
-- the 00058 search_path hardening set auto_seed_report_templates_for_new_org()
-- to `search_path TO ''` but left its internal call to
-- seed_default_report_templates(NEW.id) UNQUALIFIED. Under an empty search_path
-- that name can't resolve ("function seed_default_report_templates(uuid) does
-- not exist"), so the AFTER INSERT trigger on organisations throws — meaning
-- EVERY new organisation insert has been failing since 00058 (new-org signup,
-- client-side org creation, admin org creation alike).
--
-- Fix: schema-qualify the call. Keep the locked empty search_path.

create or replace function public.auto_seed_report_templates_for_new_org()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  perform public.seed_default_report_templates(new.id);
  return new;
end;
$$;
