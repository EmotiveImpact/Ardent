-- 00074_tenant_quote_decision_rpc.sql
--
-- O4 fix: the `quotes_update_tenant` policy (00035) only constrained
-- `property_id`, not which COLUMNS a tenant could change — so a tenant_user
-- could PATCH /quotes?id=... and alter `total`, `status`, or any column on a
-- quote at their property, not just approve/reject.
--
-- Replace the broad UPDATE policy with a narrow SECURITY DEFINER RPC that only
-- ever sets status to approved/rejected, scoped to the caller's tenant
-- property. Tenants can no longer write arbitrary quote columns.

create or replace function public.tenant_set_quote_decision(p_quote_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision %', p_decision using errcode = '22023';
  end if;

  update public.quotes
  set status = p_decision
  where id = p_quote_id
    and property_id = public.tenant_property_id();

  if not found then
    raise exception 'quote not found or not permitted' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.tenant_set_quote_decision(uuid, text) from public, anon;
grant execute on function public.tenant_set_quote_decision(uuid, text) to authenticated;

comment on function public.tenant_set_quote_decision(uuid, text) is
  'Tenant approve/reject for a quote at their own property. Sets status only — replaces the over-broad quotes_update_tenant UPDATE policy so tenants cannot tamper with totals/lines.';

-- Remove the column-unrestricted tenant UPDATE path.
drop policy if exists "quotes_update_tenant" on public.quotes;
