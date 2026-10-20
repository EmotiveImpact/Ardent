-- Field users (engineers and subbies on the phone) see their own jobs and
-- change only what an engineer changes on site.
begin;
select tests.act_as('kofi@demo.ardent.local');

select tests.eq((select array_agg(id order by id) from public.jobs), array['job_1036', 'job_1045'], 'Kofi sees only the jobs he is on');
select tests.eq((select array_agg(id order by id) from public.customers), array['cus_04', 'cus_05'], 'and only those jobs'' customers');
select tests.eq((select array_agg(id order by id) from public.sites), array['sit_04', 'sit_05'], 'and only those jobs'' sites');
select tests.eq((select count(*) from public.certificates where site_id not in ('sit_04', 'sit_05')), 0::bigint, 'certificates only for his sites');
select tests.eq((select count(*) from public.job_lines where job_id = 'job_1042'), 0::bigint, 'no lines from other people''s jobs');
select tests.eq((select count(*) from public.operators), 4::bigint, 'the whole crew is visible');

-- Working the job.
select tests.eq(tests.affected($$update public.jobs set status = 'on_site' where id = 'job_1045'$$), 1, 'Kofi marks his job on site');
select tests.eq(tests.affected($$update public.jobs set notes = 'Board in garage' where id = 'job_1045'$$), 1, 'and adds job notes');
select tests.refused($$update public.jobs set status = 'invoiced' where id = 'job_1045'$$, 'field cannot invoice', '42501');
select tests.refused($$update public.jobs set status = 'complete' where id = 'job_1036'$$, 'field cannot reopen an invoiced job', '42501');
select tests.refused($$update public.jobs set title = 'Free work' where id = 'job_1045'$$, 'field cannot retitle a job', '42501');
select tests.refused($$update public.jobs set starts_at = now() where id = 'job_1045'$$, 'field cannot rebook a job', '42501');
select tests.eq(tests.affected($$update public.jobs set status = 'on_site' where id = 'job_1042'$$), 0, 'field cannot touch someone else''s job');
select tests.refused($$insert into public.jobs (org_id, title, trade, customer_id, site_id) values ('org_demo', 'x', 'gas', 'cus_04', 'sit_04')$$, 'field cannot book jobs', '42501');
select tests.refused($$insert into public.customers (org_id, name) values ('org_demo', 'x')$$, 'field cannot add customers', '42501');

-- Lines and checks on site.
insert into public.job_lines (org_id, job_id, kind, description, quantity, unit_price) values ('org_demo', 'job_1045', 'material', '2x RCBO 32A', 2, 1850);
select tests.eq((select count(*) from public.job_lines where job_id = 'job_1045'), 3::bigint, 'Kofi logs materials on his job');
select tests.refused($$insert into public.job_lines (org_id, job_id, kind, description, quantity, unit_price) values ('org_demo', 'job_1036', 'labour', 'x', 1, 100)$$, 'no new lines once a job is invoiced', '42501');
select tests.refused($$insert into public.job_lines (org_id, job_id, kind, description, quantity, unit_price) values ('org_demo', 'job_1042', 'labour', 'x', 1, 100)$$, 'no lines on someone else''s job', '42501');
select tests.eq(tests.affected($$update public.job_checks set state = 'pass', detail = 'Signed 10:04' where job_id = 'job_1045' and key = 'rams'$$), 1, 'Kofi passes a check');

-- His own operator record.
select tests.eq(tests.affected($$update public.operators set state = 'on_site', current_job_id = 'job_1045', eta_minutes = null where id = 'opr_02'$$), 1, 'Kofi sets his own state');
select tests.refused($$update public.operators set van = 'STOLEN' where id = 'opr_02'$$, 'but not his van', '42501');
select tests.eq(tests.affected($$update public.operators set state = 'off_shift' where id = 'opr_03'$$), 0, 'or anyone else''s state');

-- Time, notes, photos, signatures.
insert into public.time_entries (id, org_id, operator_id, job_id, kind, started_at) values ('tim_t1', 'org_demo', 'opr_02', 'job_1045', 'labour', now());
select tests.eq(tests.affected($$update public.time_entries set ended_at = now() + interval '1 hour' where id = 'tim_t1'$$), 1, 'Kofi stops his clock');
select tests.refused($$update public.time_entries set started_at = now() - interval '9 hours' where id = 'tim_t1'$$, 'but cannot pad it', '42501');
select tests.refused($$insert into public.time_entries (org_id, operator_id, job_id, kind, started_at) values ('org_demo', 'opr_03', null, 'admin', now())$$, 'or book time for Ryan', '42501');
insert into public.notes (org_id, job_id, operator_id, body) values ('org_demo', 'job_1045', 'opr_02', 'Old board had no RCD');
insert into public.photos (org_id, job_id, operator_id, stage, uri, taken_at) values ('org_demo', 'job_1045', 'opr_02', 'before', 'file:///board.jpg', now());
insert into public.signatures (org_id, job_id, operator_id, signed_by, svg, at) values ('org_demo', 'job_1045', 'opr_02', 'Imran Haq', 'M0 0 L10 10', now());
select tests.eq((select count(*) from public.notes where job_id = 'job_1045'), 1::bigint, 'Kofi adds a note');
select tests.eq((select count(*) from public.photos where job_id = 'job_1045'), 1::bigint, 'and a photo');
select tests.eq((select count(*) from public.signatures where job_id = 'job_1045'), 1::bigint, 'and the customer''s signature');
select tests.refused($$insert into public.notes (org_id, job_id, operator_id, body) values ('org_demo', 'job_1042', 'opr_02', 'x')$$, 'no notes on someone else''s job', '42501');
select tests.refused($$insert into public.notes (org_id, job_id, operator_id, body) values ('org_demo', 'job_1045', 'opr_03', 'x')$$, 'no notes in Ryan''s name', '42501');
select tests.eq(tests.affected($$delete from public.signatures$$), 0, 'field cannot delete signatures');

rollback;

begin;
select tests.act_as('tom@demo.ardent.local');
select tests.eq((select array_agg(id) from public.jobs), array['job_1049'], 'Tom the subbie sees only his one job');
select tests.eq((select array_agg(name) from public.customers), array['Brindle Street Dental'], 'and only that customer');
rollback;
