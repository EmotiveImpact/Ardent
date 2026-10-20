-- Ardent engine: who can see and change what.
--
-- Row level security is on for every table. Office (owner or office role)
-- sees and changes everything in their own firm. Field sees only jobs they
-- are on, plus the customer, site, assets and certificates those jobs need,
-- and can only change what an engineer changes on site: job progress, lines,
-- checks, their own time, photos, notes and signatures, and their own
-- operator state. Nobody sees another firm's rows.

-- =========================
-- column guard for field updates
-- =========================
-- Policies decide which rows; this trigger decides which columns. Field users
-- may only change the columns named in the trigger arguments. Office users and
-- server-side work (no signed-in user) pass straight through.
create or replace function ardent.guard_field_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed text;
begin
  if auth.uid() is null or ardent.is_office(new.org_id) then
    return new;
  end if;
  select string_agg(n.key, ', ') into changed
  from jsonb_each(to_jsonb(new)) n
  where n.value is distinct from to_jsonb(old) -> n.key
    and n.key <> 'updated_at'
    and not n.key = any (tg_argv);
  if changed is not null then
    raise exception 'field users cannot change %', changed using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Field moves a job through the day; the office books, invoices and cancels.
create or replace function ardent.guard_field_job_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null or ardent.is_office(new.org_id) or new.status = old.status then
    return new;
  end if;
  if old.status in ('invoiced', 'paid', 'cancelled')
     or new.status not in ('booked', 'en_route', 'on_site', 'paused', 'complete') then
    raise exception 'field users cannot move a job from % to %', old.status, new.status using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger jobs_field_columns before update on public.jobs
  for each row execute function ardent.guard_field_columns('status', 'notes');
create trigger jobs_field_status before update on public.jobs
  for each row execute function ardent.guard_field_job_status();
create trigger operators_field_columns before update on public.operators
  for each row execute function ardent.guard_field_columns('state', 'current_job_id', 'eta_minutes');
create trigger time_entries_field_columns before update on public.time_entries
  for each row execute function ardent.guard_field_columns('ended_at');
create trigger photos_field_columns before update on public.photos
  for each row execute function ardent.guard_field_columns('uri', 'caption', 'uploaded_at');
create trigger notes_field_columns before update on public.notes
  for each row execute function ardent.guard_field_columns('body');

-- =========================
-- row level security
-- =========================
alter table public.organisations enable row level security;
alter table public.memberships enable row level security;
alter table public.org_counters enable row level security;
alter table public.operators enable row level security;
alter table public.operator_registrations enable row level security;
alter table public.customers enable row level security;
alter table public.sites enable row level security;
alter table public.assets enable row level security;
alter table public.jobs enable row level security;
alter table public.job_operators enable row level security;
alter table public.job_lines enable row level security;
alter table public.job_checks enable row level security;
alter table public.time_entries enable row level security;
alter table public.photos enable row level security;
alter table public.notes enable row level security;
alter table public.signatures enable row level security;
alter table public.certificates enable row level security;

-- organisations: members read, owners rename. New firms come through
-- create_organisation().
create policy organisations_select on public.organisations for select to authenticated
  using (ardent.is_member(id));
create policy organisations_update on public.organisations for update to authenticated
  using (ardent.is_owner(id)) with check (ardent.is_owner(id));

-- memberships: everyone in the firm sees who's in it; owners manage it,
-- though never their own row, so a firm can't lose its last owner by accident.
create policy memberships_select on public.memberships for select to authenticated
  using (ardent.is_member(org_id));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (ardent.is_owner(org_id));
create policy memberships_update on public.memberships for update to authenticated
  using (ardent.is_owner(org_id) and user_id <> auth.uid()) with check (ardent.is_owner(org_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (ardent.is_owner(org_id) and user_id <> auth.uid());

-- org_counters: no policies. Only ardent.next_number() touches it.

-- operators: the whole crew is visible to everyone in the firm (Field shows
-- who else is on a job); office manages the crew; field updates their own
-- state through the column guard.
create policy operators_select on public.operators for select to authenticated
  using (ardent.is_member(org_id));
create policy operators_insert on public.operators for insert to authenticated
  with check (ardent.is_office(org_id));
create policy operators_update on public.operators for update to authenticated
  using (ardent.is_office(org_id) or id = ardent.my_operator_id(org_id))
  with check (ardent.is_office(org_id) or id = ardent.my_operator_id(org_id));
create policy operators_delete on public.operators for delete to authenticated
  using (ardent.is_office(org_id));

create policy operator_registrations_select on public.operator_registrations for select to authenticated
  using (ardent.is_member(org_id));
create policy operator_registrations_write on public.operator_registrations for all to authenticated
  using (ardent.is_office(org_id)) with check (ardent.is_office(org_id));

-- customers, sites, assets, certificates: office manages; field reads
-- through their jobs.
create policy customers_select on public.customers for select to authenticated
  using (ardent.is_office(org_id) or ardent.field_sees_customer(id));
create policy customers_write on public.customers for all to authenticated
  using (ardent.is_office(org_id)) with check (ardent.is_office(org_id));

create policy sites_select on public.sites for select to authenticated
  using (ardent.is_office(org_id) or ardent.field_sees_site(id));
create policy sites_write on public.sites for all to authenticated
  using (ardent.is_office(org_id)) with check (ardent.is_office(org_id));

create policy assets_select on public.assets for select to authenticated
  using (ardent.is_office(org_id) or ardent.field_sees_site(site_id));
create policy assets_write on public.assets for all to authenticated
  using (ardent.is_office(org_id)) with check (ardent.is_office(org_id));

create policy certificates_select on public.certificates for select to authenticated
  using (ardent.is_office(org_id) or ardent.field_sees_site(site_id));
create policy certificates_write on public.certificates for all to authenticated
  using (ardent.is_office(org_id)) with check (ardent.is_office(org_id));

-- jobs: office books and manages; field sees and progresses their own.
create policy jobs_select on public.jobs for select to authenticated
  using (ardent.can_see_job(org_id, id));
create policy jobs_insert on public.jobs for insert to authenticated
  with check (ardent.is_office(org_id));
create policy jobs_update on public.jobs for update to authenticated
  using (ardent.can_see_job(org_id, id)) with check (ardent.can_see_job(org_id, id));
create policy jobs_delete on public.jobs for delete to authenticated
  using (ardent.is_office(org_id));

create policy job_operators_select on public.job_operators for select to authenticated
  using (ardent.can_see_job(org_id, job_id));
create policy job_operators_write on public.job_operators for all to authenticated
  using (ardent.is_office(org_id)) with check (ardent.is_office(org_id));

-- lines and checks: field adds and edits them on site until the job is invoiced.
create policy job_lines_select on public.job_lines for select to authenticated
  using (ardent.can_see_job(org_id, job_id));
create policy job_lines_write on public.job_lines for all to authenticated
  using (ardent.is_office(org_id) or ardent.field_can_edit_job(job_id))
  with check (ardent.is_office(org_id) or ardent.field_can_edit_job(job_id));

create policy job_checks_select on public.job_checks for select to authenticated
  using (ardent.can_see_job(org_id, job_id));
create policy job_checks_write on public.job_checks for all to authenticated
  using (ardent.is_office(org_id) or ardent.field_can_edit_job(job_id))
  with check (ardent.is_office(org_id) or ardent.field_can_edit_job(job_id));

-- time: field books their own clock, against one of their jobs or none.
create policy time_entries_select on public.time_entries for select to authenticated
  using (ardent.is_office(org_id) or operator_id = ardent.my_operator_id(org_id));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (
    ardent.is_office(org_id)
    or (operator_id = ardent.my_operator_id(org_id) and (job_id is null or ardent.is_assigned(job_id)))
  );
create policy time_entries_update on public.time_entries for update to authenticated
  using (ardent.is_office(org_id) or operator_id = ardent.my_operator_id(org_id))
  with check (ardent.is_office(org_id) or operator_id = ardent.my_operator_id(org_id));
create policy time_entries_delete on public.time_entries for delete to authenticated
  using (ardent.is_office(org_id));

-- photos, notes, signatures: field adds their own on jobs they are on. Office
-- can tidy up. Signatures are never edited.
create policy photos_select on public.photos for select to authenticated
  using (ardent.can_see_job(org_id, job_id));
create policy photos_insert on public.photos for insert to authenticated
  with check (ardent.is_office(org_id) or (operator_id = ardent.my_operator_id(org_id) and ardent.is_assigned(job_id)));
create policy photos_update on public.photos for update to authenticated
  using (ardent.is_office(org_id) or (operator_id = ardent.my_operator_id(org_id) and ardent.is_assigned(job_id)))
  with check (ardent.is_office(org_id) or (operator_id = ardent.my_operator_id(org_id) and ardent.is_assigned(job_id)));
create policy photos_delete on public.photos for delete to authenticated
  using (ardent.is_office(org_id));

create policy notes_select on public.notes for select to authenticated
  using (ardent.can_see_job(org_id, job_id));
create policy notes_insert on public.notes for insert to authenticated
  with check (ardent.is_office(org_id) or (operator_id = ardent.my_operator_id(org_id) and ardent.is_assigned(job_id)));
create policy notes_update on public.notes for update to authenticated
  using (ardent.is_office(org_id) or (operator_id = ardent.my_operator_id(org_id) and ardent.is_assigned(job_id)))
  with check (ardent.is_office(org_id) or (operator_id = ardent.my_operator_id(org_id) and ardent.is_assigned(job_id)));
create policy notes_delete on public.notes for delete to authenticated
  using (ardent.is_office(org_id));

create policy signatures_select on public.signatures for select to authenticated
  using (ardent.can_see_job(org_id, job_id));
create policy signatures_insert on public.signatures for insert to authenticated
  with check (ardent.is_office(org_id) or (operator_id = ardent.my_operator_id(org_id) and ardent.is_assigned(job_id)));
create policy signatures_delete on public.signatures for delete to authenticated
  using (ardent.is_office(org_id));

-- =========================
-- grants
-- =========================
-- Signed-out visitors get nothing. Signed-in users get table access, which
-- the policies above then narrow to their own firm.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.org_counters from authenticated;
grant execute on function public.create_organisation(text, text) to authenticated;

-- Policies call the ardent helpers as the signed-in user.
revoke all on all functions in schema ardent from public;
grant usage on schema ardent to authenticated;
grant execute on all functions in schema ardent to authenticated;
revoke execute on function ardent.next_number(text, text) from authenticated;
