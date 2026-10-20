-- Test helpers: act as a signed-in user, and assert.
create schema tests;

-- Become a user for the rest of the transaction. Pass null to sign out.
create function tests.act_as(email text) returns void language plpgsql as $$
declare
  uid uuid;
begin
  reset role;
  if email is null then
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    return;
  end if;
  select id into uid from auth.users u where u.email = act_as.email;
  if uid is null then raise exception 'no test user %', email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

create function tests.eq(actual anyelement, expected anyelement, what text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', what, expected, actual;
  end if;
  raise notice 'ok  %', what;
end;
$$;

-- Run a statement and expect it to be refused. Matches on SQLSTATE when given.
create function tests.refused(stmt text, what text, code text default null) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if code is not null and sqlstate <> code then
      raise exception 'FAIL %: expected error %, got % (%)', what, code, sqlstate, sqlerrm;
    end if;
    raise notice 'ok  % (refused: %)', what, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: statement was allowed', what;
end;
$$;

-- How many rows a statement touched, for updates RLS silently filters out.
create function tests.affected(stmt text) returns integer language plpgsql as $$
declare
  n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;
