-- Migration: 00102_property_numbers.sql
-- Feature (V1 backlog #7): auto per-org property numbers like "P-123".
-- A client is billed once at client level (billing fields already live on
-- clients and are inherited by its properties), but each property carries its
-- own identifier. Same race-safe per-org counter pattern as job numbers (00097).

create table if not exists public.org_property_counters (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  next_number bigint not null default 100
);
alter table public.org_property_counters enable row level security;
drop policy if exists org_property_counters_select on public.org_property_counters;
create policy org_property_counters_select on public.org_property_counters
  for select to authenticated using (organisation_id = public.organisation_id());

alter table public.properties add column if not exists property_number text;

create or replace function public.assign_property_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_num bigint;
begin
  if new.property_number is not null then return new; end if;
  if new.organisation_id is null then return new; end if;
  insert into public.org_property_counters as c (organisation_id, next_number)
    values (new.organisation_id, 101)
  on conflict (organisation_id) do update set next_number = c.next_number + 1
  returning next_number into v_num;
  new.property_number := 'P-' || v_num;
  return new;
end;
$$;

drop trigger if exists trg_assign_property_number on public.properties;
create trigger trg_assign_property_number
  before insert on public.properties
  for each row execute function public.assign_property_number();

with numbered as (
  select id, 100 + row_number() over (partition by organisation_id order by created_at, id) as n
  from public.properties
  where organisation_id is not null
)
update public.properties p set property_number = 'P-' || nb.n
from numbered nb where nb.id = p.id and p.property_number is null;

insert into public.org_property_counters (organisation_id, next_number)
select organisation_id, 100 + count(*) from public.properties
where organisation_id is not null
group by organisation_id
on conflict (organisation_id) do update set next_number = excluded.next_number;

create unique index if not exists idx_properties_org_property_number
  on public.properties(organisation_id, property_number);
