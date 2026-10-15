-- 00085_role_set_consistency.sql
--
-- QA wave (cycle 2) HIGH fix. The org-assignable role set was inconsistent across
-- four layers, producing two real bugs:
--   * `manager` was offered in the invite UI + allowed by organisation_invitations
--     + admin_update_member, but it is NOT a valid profiles.role (the CHECK is
--     super_admin/org_admin/scheduler/finance/engineer/client_admin/auditor) and
--     the frontend permission map has no `manager` key → an invited/edited
--     "manager" is locked out of the entire app (AccessDenied everywhere).
--   * Conversely `finance`/`client_admin`/`auditor` are valid profiles roles the
--     edit dropdown offers, but admin_update_member REJECTED them → "invalid role"
--     and the edit silently failed.
--
-- Canonical truth = profiles.role. The org-ASSIGNABLE subset (super_admin is a
-- platform-level role, never assigned via invite/edit) is:
--   org_admin, scheduler, finance, engineer, client_admin, auditor
-- Make organisation_invitations + admin_update_member match it exactly.

alter table public.organisation_invitations drop constraint if exists organisation_invitations_role_check;
alter table public.organisation_invitations
  add constraint organisation_invitations_role_check
  check (role in ('org_admin', 'scheduler', 'finance', 'engineer', 'client_admin', 'auditor'));

create or replace function public.admin_update_member(p_user_id uuid, p_full_name text, p_role text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare v_caller_org uuid := public._require_org_admin(); v_target_org uuid; v_target_role text; v_admin_count int;
begin
  -- Real assignable role set (matches profiles.role minus the platform-level super_admin).
  if p_role not in ('org_admin', 'scheduler', 'finance', 'engineer', 'client_admin', 'auditor') then
    raise exception 'invalid role %', p_role using errcode = '22023';
  end if;
  select organisation_id, role into v_target_org, v_target_role from public.profiles where id = p_user_id;
  if v_target_org is distinct from v_caller_org then
    raise exception 'member not in your organisation' using errcode = '42501';
  end if;
  if v_target_role = 'org_admin' and p_role <> 'org_admin' then
    select count(*) into v_admin_count from public.profiles where organisation_id = v_caller_org and role = 'org_admin';
    if v_admin_count <= 1 then raise exception 'cannot demote the last admin' using errcode = '42501'; end if;
  end if;
  update public.profiles set full_name = coalesce(nullif(trim(p_full_name), ''), full_name), role = p_role where id = p_user_id;
end;
$function$;
