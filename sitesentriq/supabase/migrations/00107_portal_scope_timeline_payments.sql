-- Migration: 00107_portal_scope_timeline_payments.sql
-- Description: SECURITY — extend the 00096 client_admin portal scoping to two
--   tables that were omitted: timeline_events and payments.
--
-- Background:
--   00096 added RESTRICTIVE per-client policies to properties/quotes/invoices/
--   jobs/contracts/compliance_items/actions/assets/documents/quote_lines/
--   invoice_lines, but NOT timeline_events or payments. Both are scoped only by
--   organisation_id (00002), which is shared by every client of an FM operator.
--
--   * timeline_events — ACTIVE LEAK: the /portal Overview renders <Timeline />
--     unfiltered, so a client_admin saw the operator's whole org activity feed,
--     including other clients' quote/invoice numbers and property names in the
--     event descriptions. This closes it.
--   * payments — LATENT: today the portal only reads payments embedded under an
--     invoice (already client-scoped by the parent), but a direct select would
--     leak every client's payment amounts. Closed for defence-in-depth.
--
-- Approach: same fail-closed RESTRICTIVE pattern as 00096 —
--   `not is_portal_client()` short-circuits to TRUE for staff/tenant_user, so
--   their access is untouched; a client_admin is constrained to their client.
--   SELECT-only (the leak is a read; insert paths are internal and unaffected).
--   Safe to apply with zero client_admin rows (verified in 00096).

-- timeline_events: match either a direct client_id, or an event on one of the
-- client's properties (many events carry only property_id). Events with neither
-- (e.g. another client's, or org-wide with null client_id + null property_id)
-- are hidden from portal clients — correct and fail-closed.
create policy "timeline_events_client_admin_read_scope" on public.timeline_events
  as restrictive for select to authenticated
  using (
    not public.is_portal_client()
    or client_id = public.my_client_id()
    or property_id in (
      select id from public.properties where client_id = public.my_client_id()
    )
  );

-- payments: scope via the parent invoice's client.
create policy "payments_client_admin_read_scope" on public.payments
  as restrictive for select to authenticated
  using (
    not public.is_portal_client()
    or invoice_id in (
      select id from public.invoices where client_id = public.my_client_id()
    )
  );
