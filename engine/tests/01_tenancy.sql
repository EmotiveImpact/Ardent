-- One firm can never see or touch another firm's records.
begin;

-- A second firm, set up server-side.
insert into auth.users (id, email) values ('00000000-0000-4000-b000-000000000001', 'owner@rival.test');
insert into public.organisations (id, name, slug) values ('org_rival', 'Rival Plumbing', 'rival-plumbing');
insert into public.memberships (org_id, user_id, role) values ('org_rival', '00000000-0000-4000-b000-000000000001', 'owner');
insert into public.customers (id, org_id, name) values ('cus_rival', 'org_rival', 'Rival customer');
insert into public.sites (id, org_id, customer_id, line1, town, postcode) values ('sit_rival', 'org_rival', 'cus_rival', '1 Elm St', 'Salford', 'M5 4AA');
insert into public.jobs (id, org_id, title, trade, customer_id, site_id) values ('job_rival', 'org_rival', 'Rival job', 'plumbing', 'cus_rival', 'sit_rival');

select tests.act_as('owner@rival.test');
select tests.eq((select count(*) from public.jobs), 1::bigint, 'rival sees only its own job');
select tests.eq((select count(*) from public.customers where org_id = 'org_demo'), 0::bigint, 'rival sees no demo customers');
select tests.eq((select count(*) from public.operators), 0::bigint, 'rival sees no demo crew');
select tests.eq((select count(*) from public.organisations), 1::bigint, 'rival sees only its own organisation');
select tests.eq((select count(*) from public.memberships), 1::bigint, 'rival sees only its own members');
select tests.eq((select ref from public.jobs), 'J-1001', 'first job in a new firm is J-1001');
select tests.refused($$insert into public.customers (org_id, name) values ('org_demo', 'Sneaky')$$, 'rival cannot add a customer to the demo firm', '42501');
select tests.refused(
  $$insert into public.jobs (org_id, title, trade, customer_id, site_id) values ('org_rival', 'x', 'gas', 'cus_01', 'sit_01')$$,
  'rival cannot book a job against a demo customer', '23503');
select tests.eq(tests.affected($$update public.jobs set title = 'x' where org_id = 'org_demo'$$), 0, 'rival cannot edit demo jobs');
select tests.eq(tests.affected($$delete from public.customers where org_id = 'org_demo'$$), 0, 'rival cannot delete demo customers');
select tests.refused($$update public.customers set org_id = 'org_demo' where id = 'cus_rival'$$, 'a row cannot move to another firm');
select tests.refused($$select * from public.org_counters$$, 'counters are not readable', '42501');
select tests.refused($$select ardent.next_number('org_demo', 'job')$$, 'cannot burn another firm''s job numbers', '42501');

select tests.act_as('dan@demo.ardent.local');
select tests.eq((select count(*) from public.jobs where id = 'job_rival'), 0::bigint, 'demo owner cannot see the rival job');
select tests.eq((select count(*) from public.jobs), 10::bigint, 'demo owner sees all 10 demo jobs');

-- Signed out: nothing at all.
select tests.act_as(null);
select tests.refused($$select * from public.jobs$$, 'signed-out visitors cannot read jobs', '42501');
select tests.refused($$select public.create_organisation('x', 'x')$$, 'signed-out visitors cannot create a firm', '42501');

rollback;

-- Signing up a new firm.
begin;
insert into auth.users (id, email) values ('00000000-0000-4000-b000-000000000002', 'new@firm.test');
select tests.act_as('new@firm.test');
select tests.eq((select count(*) from public.organisations), 0::bigint, 'a new user belongs to no firm');
select tests.eq((select slug from public.create_organisation('Holt & Sons', 'holt-sons')), 'holt-sons', 'create_organisation makes the firm');
select tests.eq((select role from public.memberships), 'owner', 'the creator becomes its owner');
select tests.eq((select count(*) from public.jobs), 0::bigint, 'and sees none of the demo data');
rollback;
