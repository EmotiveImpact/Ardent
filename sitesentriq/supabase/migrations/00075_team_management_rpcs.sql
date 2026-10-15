-- 00075_team_management_rpcs.sql
--
-- Team-management completeness + a privilege-escalation fix.
--
-- BUG (O7, found this loop): the only UPDATE policy on `profiles` is
-- `profiles_update_own` (id = auth.uid()) with NO column restriction — so any
-- user could PATCH their own `role` to `org_admin` and self-escalate. And admin
-- role-change / remove of OTHER members was silently blocked by that same policy
-- (they aren't auth.uid()), so those features never actually worked.
--
-- Fix: a BEFORE UPDATE trigger blocks direct (PostgREST) changes to `role` /
-- `organisation_id` once a user is already in an org. SECURITY DEFINER RPCs and
-- the service role run as the table owner, so the admin_* helpers below remain
-- free to change them. The org-null → first-org assignment path (auth-context
-- fallback) is still allowed; tightening that fully is tracked as O8.

-- ── 1. Block self-escalation on the direct path ─────────────────────
-- IMPORTANT: SECURITY INVOKER (the default) — NOT definer. The trigger must see
-- the real effective role: `current_user` is 'authenticated' on a direct
-- PostgREST update (block), and the table owner inside the SECURITY DEFINER
-- admin_* RPCs (allow). A DEFINER trigger would force current_user to the owner
-- always and never block.
create or replace function public.profiles_block_privilege_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and old.organisation_id is not null
     and (new.role is distinct from old.role
          or new.organisation_id is distinct from old.organisation_id)
  then
    raise exception 'role and organisation cannot be changed directly'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_block_privilege_change_trg on public.profiles;
create trigger profiles_block_privilege_change_trg
  before update on public.profiles
  for each row execute function public.profiles_block_privilege_change();

-- ── helper: assert the caller is an admin and return their org ──────
create or replace function public._require_org_admin()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_role text;
begin
  select organisation_id, role into v_org, v_role
  from public.profiles where id = auth.uid();
  if v_org is null or v_role not in ('org_admin', 'manager') then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- ── 2. Admin updates a member's name + role ─────────────────────────
create or replace function public.admin_update_member(
  p_user_id uuid, p_full_name text, p_role text
) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_caller_org uuid := public._require_org_admin();
  v_target_org uuid;
  v_target_role text;
  v_admin_count int;
begin
  if p_role not in ('org_admin', 'manager', 'scheduler', 'engineer') then
    raise exception 'invalid role %', p_role using errcode = '22023';
  end if;
  select organisation_id, role into v_target_org, v_target_role
  from public.profiles where id = p_user_id;
  if v_target_org is distinct from v_caller_org then
    raise exception 'member not in your organisation' using errcode = '42501';
  end if;
  -- Last-admin guard: never demote the final org_admin.
  if v_target_role = 'org_admin' and p_role <> 'org_admin' then
    select count(*) into v_admin_count
    from public.profiles where organisation_id = v_caller_org and role = 'org_admin';
    if v_admin_count <= 1 then
      raise exception 'cannot demote the last admin' using errcode = '42501';
    end if;
  end if;
  update public.profiles
  set full_name = coalesce(nullif(trim(p_full_name), ''), full_name), role = p_role
  where id = p_user_id;
end;
$$;

-- ── 3. Admin removes a member (revokes org access) ──────────────────
create or replace function public.admin_remove_member(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_caller_org uuid := public._require_org_admin();
  v_target_org uuid;
  v_target_role text;
  v_admin_count int;
begin
  if p_user_id = auth.uid() then
    raise exception 'you cannot remove yourself' using errcode = '42501';
  end if;
  select organisation_id, role into v_target_org, v_target_role
  from public.profiles where id = p_user_id;
  if v_target_org is distinct from v_caller_org then
    raise exception 'member not in your organisation' using errcode = '42501';
  end if;
  if v_target_role = 'org_admin' then
    select count(*) into v_admin_count
    from public.profiles where organisation_id = v_caller_org and role = 'org_admin';
    if v_admin_count <= 1 then
      raise exception 'cannot remove the last admin' using errcode = '42501';
    end if;
  end if;
  -- Revoke access by detaching from the org (non-destructive; the auth account
  -- survives and can be re-invited). Full account deletion is an edge-fn follow-up.
  update public.profiles set organisation_id = null where id = p_user_id;
end;
$$;

-- ── 4. Admin revokes a pending invitation ───────────────────────────
create or replace function public.admin_revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_caller_org uuid := public._require_org_admin();
  v_inv_org uuid;
begin
  select organisation_id into v_inv_org
  from public.organisation_invitations where id = p_invitation_id;
  if v_inv_org is distinct from v_caller_org then
    raise exception 'invitation not in your organisation' using errcode = '42501';
  end if;
  update public.organisation_invitations
  set status = 'revoked'
  where id = p_invitation_id and status = 'pending';
end;
$$;

-- ── grants: authenticated may call; internals locked to the owner ───
revoke all on function public._require_org_admin() from public, anon, authenticated;
revoke all on function public.admin_update_member(uuid, text, text) from public, anon;
revoke all on function public.admin_remove_member(uuid) from public, anon;
revoke all on function public.admin_revoke_invitation(uuid) from public, anon;
grant execute on function public.admin_update_member(uuid, text, text) to authenticated;
grant execute on function public.admin_remove_member(uuid) to authenticated;
grant execute on function public.admin_revoke_invitation(uuid) to authenticated;
