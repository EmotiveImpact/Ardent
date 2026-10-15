-- 00066_handle_new_user_org_provision.sql
--
-- Board audit Wave B: move organisation creation from the client (auth-context.tsx,
-- which races a 5s timeout and could orphan a confirmed user with no org) into the
-- handle_new_user trigger, so it happens atomically + server-trusted at signup.
--
-- Self-serve org-admin signups carry company_name + company_slug in
-- raw_user_meta_data (set by register.tsx). For those we provision the org and
-- link organisation_id. Invited users (no company metadata) are left untouched —
-- they join an existing org via the invite flow and must NOT get a brand-new org.
--
-- CRITICAL: org provisioning is wrapped in an exception handler. A trigger that
-- RAISES would fail the entire auth.users INSERT and block signup outright —
-- strictly worse than the orphan problem. On any failure we warn and return,
-- leaving the client-side fallback + the WorkspaceSetupPending retry screen to
-- recover. SECURITY DEFINER + empty search_path per the 00058 hardening.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_name   text;
  v_requested_slug text;
  v_slug           text;
  v_org_id         uuid;
  v_suffix         int := 1;
begin
  -- Always create the profile row first (idempotent).
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'org_admin'
  )
  on conflict (id) do nothing;

  v_company_name   := nullif(trim(new.raw_user_meta_data->>'company_name'), '');
  v_requested_slug := nullif(trim(new.raw_user_meta_data->>'company_slug'), '');

  if v_company_name is not null and v_requested_slug is not null then
    begin
      -- Collision-safe slug: acme, acme-2, acme-3, ... (deterministic, unlike
      -- the old client-side Date.now() suffix which broke the marketed URL).
      v_slug := v_requested_slug;
      while exists (select 1 from public.organisations where slug = v_slug) loop
        v_suffix := v_suffix + 1;
        v_slug := v_requested_slug || '-' || v_suffix::text;
      end loop;

      insert into public.organisations (name, slug)
      values (v_company_name, v_slug)
      returning id into v_org_id;

      update public.profiles
      set organisation_id = v_org_id
      where id = new.id
        and organisation_id is null;
    exception
      when others then
        -- Never block signup on org provisioning.
        raise warning 'handle_new_user: org auto-provision failed for % : %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'On auth signup: creates the profile row and, for self-serve org-admin signups (company metadata present), atomically provisions the organisation with a collision-safe slug and links organisation_id. Org provisioning is exception-safe so it can never block signup.';
