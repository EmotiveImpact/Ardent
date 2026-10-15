-- Migration: 00095_tenant_quote_decision_state_guard.sql
-- Description: add a state-machine guard to tenant_set_quote_decision so a tenant
-- can only decide a quote that is actually awaiting a decision.
--
-- Background:
--   00074 introduced tenant_set_quote_decision, which sets status to
--   approved/rejected for a quote at the tenant's property — but with NO guard
--   on the quote's CURRENT status. A tenant could therefore flip an already
--   converted / expired / rejected quote back to 'approved' (or 'rejected'),
--   reviving commercially dead quotes and creating inconsistent state (e.g. a
--   quote that already spawned a job showing 'approved' again).
--
-- Fix: only allow the transition from a decidable state (draft/sent).

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
    and property_id = public.tenant_property_id()
    -- Only a quote still awaiting a decision may be approved/rejected. This
    -- blocks reviving converted/expired/already-decided quotes.
    and status in ('draft', 'sent');

  if not found then
    raise exception 'quote not found, not permitted, or not awaiting a decision'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.tenant_set_quote_decision(uuid, text) from public, anon;
grant execute on function public.tenant_set_quote_decision(uuid, text) to authenticated;

comment on function public.tenant_set_quote_decision(uuid, text) is
  'Tenant approve/reject for a quote at their own property. Sets status only, and only from a decidable state (draft/sent). Replaces the over-broad quotes_update_tenant UPDATE policy.';
