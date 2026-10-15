-- 00077_claim_workspace_rpc.sql
--
-- O8 fix, part 1 of 2. The auth-context boot fallback created an org + set
-- profiles.organisation_id/role via DIRECT authenticated writes. To close the
-- org-less self-join vector we must block direct org/role writes entirely — but
-- the fallback needs a safe server-side path first. claim_workspace is that
-- path: an ORG-LESS caller creates a NEW org (collision-safe slug) and becomes
-- its org_admin. It can never join an EXISTING org, so it can't be abused to
-- jump into someone else's workspace.
--
-- Part 2 (00078) tightens the trigger to block all direct org/role changes,
-- and is applied AFTER the web client is switched to this RPC.

create or replace function public.claim_workspace(p_company_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing uuid;
  v_base     text;
  v_slug     text;
  v_suffix   int := 1;
  v_org_id   uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select organisation_id into v_existing from public.profiles where id = v_uid;
  if v_existing is not null then
    raise exception 'already in a workspace' using errcode = '42501';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'company name required' using errcode = '22023';
  end if;

  -- Collision-safe slug derived from slug-or-name (acme, acme-2, ...).
  v_base := regexp_replace(lower(coalesce(nullif(trim(p_slug), ''), trim(p_company_name))), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'workspace'; end if;
  v_slug := v_base;
  while exists (select 1 from public.organisations where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix::text;
  end loop;

  insert into public.organisations (name, slug)
  values (trim(p_company_name), v_slug)
  returning id into v_org_id;

  update public.profiles
  set organisation_id = v_org_id, role = 'org_admin'
  where id = v_uid and organisation_id is null;

  return v_org_id;
end;
$$;

revoke all on function public.claim_workspace(text, text) from public, anon;
grant execute on function public.claim_workspace(text, text) to authenticated;

comment on function public.claim_workspace(text, text) is
  'Org-less caller creates their FIRST workspace (becomes org_admin). Never joins an existing org. Replaces the auth-context direct-write fallback so all direct org/role writes can be blocked (00078).';
