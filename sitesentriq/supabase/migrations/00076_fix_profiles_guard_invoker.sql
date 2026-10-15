-- 00076_fix_profiles_guard_invoker.sql
--
-- Fix for 00075: profiles_block_privilege_change() was created SECURITY DEFINER,
-- which forces current_user to the function owner (postgres) for EVERY call —
-- so the `current_user in ('authenticated','anon')` guard never matched and a
-- direct PostgREST update could still self-escalate role to org_admin.
--
-- Recreate it as SECURITY INVOKER so current_user reflects the real effective
-- role: 'authenticated' on the direct path (block), the table owner inside the
-- SECURITY DEFINER admin_* RPCs (allow).

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
