-- 00069_handle_new_user_search_path_fix.sql
--
-- Fix for 00066: handle_new_user set `search_path = ''`, but inserting into
-- public.organisations fires existing org-insert triggers
-- (auto_seed_report_templates → seed_default_report_templates, and
-- organisations_seed_trial) whose bodies call helper functions UNQUALIFIED.
-- With an empty search_path those calls fail to resolve
-- ("function seed_default_report_templates(uuid) does not exist"), the org
-- insert throws, and 00066's exception handler rolls it back — so a new
-- signup got a profile but no organisation.
--
-- Pin the path to `public, extensions` instead of '' so the downstream
-- trigger chain resolves. Our own statements stay fully schema-qualified,
-- so this is still a fixed (non-mutable) search_path — satisfies the 00058
-- hardening intent.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_name   text;
  v_requested_slug text;
  v_slug           text;
  v_org_id         uuid;
  v_suffix         int := 1;
begin
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
        raise warning 'handle_new_user: org auto-provision failed for % : %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;
