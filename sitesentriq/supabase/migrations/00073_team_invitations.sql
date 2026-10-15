-- 00073_team_invitations.sql
--
-- Invite-only team join. The customer is the ORGANISATION; the first user
-- (owner) creates it and everyone else JOINS by invitation — they must never
-- create a duplicate org. Until now every signup created a new org, so two
-- people from one company got two fragmented workspaces, and the Settings
-- "invite" was non-functional (it inserted a profile with no auth id and
-- linked to a /auth/signup route that doesn't exist).
--
-- SECURITY: the org-link for an invited user is driven by THIS table (written
-- only by the admin-gated invite-team-member edge function / service role),
-- NOT by signup metadata. signUp() metadata is user-controlled, so trusting a
-- metadata organisation_id would let anyone inject themselves into any org.
-- The trigger matches a pending invitation by the new user's verified email.

-- ── 1. Invitations table ─────────────────────────────────────────────
create table if not exists public.organisation_invitations (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations(id) on delete cascade,
  email               text not null,
  role                text not null default 'engineer'
                        check (role in ('org_admin','manager','scheduler','engineer')),
  status              text not null default 'pending'
                        check (status in ('pending','accepted','revoked')),
  token               text not null unique default encode(gen_random_bytes(16), 'hex'),
  invited_by_user_id  uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '14 days'),
  accepted_at         timestamptz
);

-- One pending invite per (org, email).
create unique index if not exists organisation_invitations_pending_uniq
  on public.organisation_invitations (organisation_id, lower(email))
  where status = 'pending';

create index if not exists organisation_invitations_email_idx
  on public.organisation_invitations (lower(email)) where status = 'pending';

alter table public.organisation_invitations enable row level security;

-- Members may SEE their org's invitations (to render the Settings → People
-- pending list). Writes happen ONLY via the service-role edge function — no
-- INSERT/UPDATE/DELETE policy for authenticated, so users cannot self-invite.
drop policy if exists organisation_invitations_select on public.organisation_invitations;
create policy organisation_invitations_select
  on public.organisation_invitations for select
  to authenticated
  using (organisation_id = public.organisation_id());

comment on table public.organisation_invitations is
  'Pending team invitations. Written only by the admin-gated invite-team-member edge function (service role). handle_new_user matches a pending invite by the new user''s verified email to join them to the org — metadata is NOT trusted for this.';

-- ── 2. Invite-aware handle_new_user ──────────────────────────────────
-- Precedence: invited teammate (table match) → owner (company metadata) →
-- neither (profile only; WorkspaceSetupPending recovers).
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
  v_invite         public.organisation_invitations%rowtype;
  v_role           text := 'org_admin';
  v_link_org       uuid := null;
begin
  -- Secure invited-teammate lookup FIRST (driven by the invitations table).
  select * into v_invite
  from public.organisation_invitations
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if found then
    v_role := v_invite.role;
    v_link_org := v_invite.organisation_id;
  end if;

  insert into public.profiles (id, email, full_name, role, organisation_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    v_role,
    v_link_org
  )
  on conflict (id) do nothing;

  -- Invited teammate → joined existing org; mark accepted and STOP (no new org).
  if v_link_org is not null then
    update public.organisation_invitations
      set status = 'accepted', accepted_at = now()
      where id = v_invite.id;
    return new;
  end if;

  -- Owner path — self-serve company creation from signup metadata.
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
      where id = new.id and organisation_id is null;
    exception
      when others then
        raise warning 'handle_new_user: org auto-provision failed for % : %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated;
