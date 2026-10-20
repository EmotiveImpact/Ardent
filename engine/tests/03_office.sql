-- The office books work and it lands on the engineer's phone.
begin;
select tests.act_as('jo@demo.ardent.local');

select tests.eq((select count(*) from public.jobs), 10::bigint, 'Jo in the office sees every job');
select tests.eq((select count(*) from public.time_entries), 0::bigint, 'and every time entry');

insert into public.customers (id, org_id, name, kind, phone) values ('cus_new', 'org_demo', 'Priya Shah', 'homeowner', '07700 900777');
insert into public.sites (id, org_id, customer_id, line1, town, postcode) values ('sit_new', 'org_demo', 'cus_new', '3 Fog Lane', 'Didsbury', 'M20 6AJ');
insert into public.assets (org_id, site_id, name, category, location, make, model) values ('org_demo', 'sit_new', 'Boiler', 'boiler', 'Kitchen cupboard', 'Vaillant', 'ecoTEC plus 832');
insert into public.jobs (id, org_id, title, trade, status, customer_id, site_id, starts_at, ends_at)
  values ('job_new', 'org_demo', 'Boiler service', 'gas', 'booked', 'cus_new', 'sit_new', '2026-10-21T09:00:00Z', '2026-10-21T10:00:00Z');
select tests.eq((select ref from public.jobs where id = 'job_new'), 'J-1053', 'new jobs carry on from the last ref');
insert into public.job_operators (org_id, job_id, operator_id) values ('org_demo', 'job_new', 'opr_02');
select tests.refused(
  $$insert into public.jobs (org_id, title, trade, customer_id, site_id) values ('org_demo', 'x', 'gas', 'cus_01', 'sit_02')$$,
  'a job''s site must belong to its customer', '23503');
select tests.refused($$insert into public.memberships (org_id, user_id, role) values ('org_demo', '00000000-0000-4000-a000-000000000004', 'owner')$$, 'office cannot hand out roles', '42501');

-- Kofi picks it up on his phone, with the customer, site and boiler.
select tests.act_as('kofi@demo.ardent.local');
select tests.eq((select title from public.jobs where id = 'job_new'), 'Boiler service', 'Kofi sees the job Jo booked');
select tests.eq((select name from public.customers where id = 'cus_new'), 'Priya Shah', 'and its customer');
select tests.eq((select model from public.assets where site_id = 'sit_new'), 'ecoTEC plus 832', 'and the boiler at the site');
select tests.eq(tests.affected($$update public.jobs set status = 'complete' where id = 'job_new'$$), 1, 'Kofi completes it');

select tests.act_as('jo@demo.ardent.local');
select tests.eq((select status from public.jobs where id = 'job_new'), 'complete', 'Jo sees it complete');
select tests.eq(tests.affected($$update public.jobs set status = 'invoiced' where id = 'job_new'$$), 1, 'and moves it on to invoiced');
rollback;

begin;
select tests.act_as('dan@demo.ardent.local');
select tests.eq(tests.affected($$update public.memberships set role = 'office' where user_id = '00000000-0000-4000-a000-000000000003'$$), 1, 'the owner changes a member''s role');
select tests.eq(tests.affected($$delete from public.memberships where user_id = auth.uid()$$), 0, 'the owner cannot remove themselves');
select tests.eq(tests.affected($$update public.memberships set role = 'field' where user_id = auth.uid()$$), 0, 'or demote themselves');
select tests.eq(tests.affected($$update public.organisations set name = 'Mercer Group'$$), 1, 'the owner renames the firm');
select tests.act_as('jo@demo.ardent.local');
select tests.eq(tests.affected($$update public.organisations set name = 'Jo''s firm'$$), 0, 'office cannot rename the firm');
rollback;

-- Someone who leaves the firm loses access straight away, even though their
-- crew record and job history stay.
begin;
delete from public.memberships where user_id = '00000000-0000-4000-a000-000000000003';
select tests.act_as('kofi@demo.ardent.local');
select tests.eq((select count(*) from public.jobs), 0::bigint, 'a removed engineer sees no jobs');
select tests.eq((select count(*) from public.customers), 0::bigint, 'or customers');
select tests.eq(tests.affected($$update public.operators set state = 'on_call' where id = 'opr_02'$$), 0, 'and cannot update his old crew record');
rollback;
