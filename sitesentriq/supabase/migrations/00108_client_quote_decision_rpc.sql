-- Migration: 00108_client_quote_decision_rpc.sql
-- Description: give client_admin portal users a status-only quote decision RPC
--   and REMOVE their ability to UPDATE quote columns directly.
--
-- Background:
--   00096 scoped client_admin to their own client via a RESTRICTIVE `for all`
--   policy (quotes_client_admin_scope: client_id = my_client_id()). "for all"
--   includes UPDATE, and RLS is row-level not column-level — so a client_admin
--   could PATCH ANY column on their own quotes (total, tax, valid_until, …) and
--   then "approve" a quote at a tampered total. The portal UI only sends status,
--   but the API surface allowed arbitrary column writes.
--
--   The tenant portal already solved this (00074/00095): tenant_set_quote_decision
--   sets status only, state-guarded, and the broad tenant UPDATE policy was
--   dropped. This migration does the equivalent for client_admin.
--
-- Safe to apply: there are currently ZERO client_admin rows, so no live portal
-- user is affected; this is enforced from the first client_admin ever created.

-- 1. Status-only, state-guarded decision RPC scoped to the caller's client.
create or replace function public.client_set_quote_decision(p_quote_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_quote record;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision %', p_decision using errcode = '22023';
  end if;

  update public.quotes
  set status = p_decision
  where id = p_quote_id
    and client_id = public.my_client_id()
    -- Only a quote still awaiting a decision may be approved/rejected — blocks
    -- reviving converted/expired/already-decided quotes.
    and status in ('draft', 'sent')
  returning id, organisation_id, property_id, client_id, quote_number, created_by
  into v_quote;

  if not found then
    raise exception 'quote not found, not permitted, or not awaiting a decision'
      using errcode = '42501';
  end if;

  -- Operator-visible side effects, fired SERVER-SIDE (reliable; doesn't depend
  -- on the portal client having insert privileges). Mirrors useUpdateQuote.
  insert into public.timeline_events (organisation_id, property_id, client_id, event_type, description)
  values (
    v_quote.organisation_id,
    v_quote.property_id,
    v_quote.client_id,
    'quote_' || p_decision,
    'Quote ' || coalesce(v_quote.quote_number, v_quote.id::text) || ' ' || p_decision || ' by client'
  );

  if v_quote.created_by is not null then
    insert into public.notifications (user_id, organisation_id, title, message, notification_type, link)
    values (
      v_quote.created_by,
      v_quote.organisation_id,
      'Quote ' || p_decision,
      'Quote ' || coalesce(v_quote.quote_number, v_quote.id::text) || ' was ' || p_decision || ' by the client.',
      'quote_' || p_decision,
      '/dashboard/quotes/' || v_quote.id::text
    );
  end if;
end;
$$;

revoke all on function public.client_set_quote_decision(uuid, text) from public, anon;
grant execute on function public.client_set_quote_decision(uuid, text) to authenticated;

comment on function public.client_set_quote_decision(uuid, text) is
  'Client-admin approve/reject for a quote belonging to their own client. Sets status only, and only from a decidable state (draft/sent). Replaces the over-broad client_admin UPDATE on quotes.';

-- 2. Block client_admin from any DIRECT column UPDATE on quotes (they must use
--    the RPC above, which is SECURITY DEFINER and bypasses this policy). The
--    predicate is a no-op for everyone else: internal staff (not is_portal_client)
--    keep their UPDATE; this AND's on top of quotes_client_admin_scope.
create policy "quotes_client_admin_no_direct_update" on public.quotes
  as restrictive for update to authenticated
  using (not public.is_portal_client())
  with check (not public.is_portal_client());
