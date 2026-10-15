-- 00078_block_all_direct_privilege_changes.sql
--
-- O8 fix, part 2 of 2. Now that the web client claims its first workspace via
-- the claim_workspace RPC (00077) instead of a direct write, remove the
-- `old.organisation_id is not null` exception so the guard blocks ALL direct
-- (authenticated/anon) changes to role / organisation_id — including the
-- org-less → existing-org self-join vector. SECURITY DEFINER paths
-- (handle_new_user, claim_workspace, admin_* RPCs) run as the owner and are
-- unaffected.

create or replace function public.profiles_block_privilege_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role is distinct from old.role
          or new.organisation_id is distinct from old.organisation_id)
  then
    raise exception 'role and organisation cannot be changed directly'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
