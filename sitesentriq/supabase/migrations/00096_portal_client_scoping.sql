-- Migration: 00096_portal_client_scoping.sql
-- Description: CRITICAL SECURITY — scope client_admin portal users to ONE client.
--
-- Background (docs/SECURITY_PORTAL_CLIENT_SCOPING.md):
--   The /portal "Client Hub" is served to client_admin users, but RLS scoped
--   them only by organisation_id (= the FM operator's org, shared by ALL that
--   operator's clients). With no client binding, a client_admin for Client A
--   could read every other client's quotes/invoices/properties/jobs in the same
--   org — a cross-tenant IDOR. tenant_user (the /site portal) was correctly
--   isolated per-property (00035); client_admin never got client-level scoping.
--
-- Model: ONE client per portal user — a single profiles.client_id.
--
-- Approach: ADD RESTRICTIVE policies (AND'd on top of the existing permissive
--   org/tenant policies) rather than rewriting them. For a non-client_admin the
--   predicate short-circuits to TRUE (no effect); for a client_admin every read
--   AND write must match their client. This can't disturb staff or tenant_user
--   access. It is FAIL-CLOSED: a client_admin whose client_id is NULL sees
--   nothing — which is correct, and safe here because there are currently ZERO
--   client_admin rows (verified), so no backfill is required. Enforced from the
--   first client_admin ever created.

-- 1. Bind a portal admin to a client.
alter table public.profiles
  add column if not exists client_id uuid references public.clients(id);
create index if not exists idx_profiles_client_id on public.profiles(client_id);

-- 2. Helpers (SECURITY DEFINER, locked search_path per 00058 convention).
create or replace function public.my_client_id()
returns uuid language sql security definer stable set search_path = '' as $$
  select client_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_portal_client()
returns boolean language sql security definer stable set search_path = '' as $$
  select coalesce(
    (select role = 'client_admin' from public.profiles where id = auth.uid()),
    false)
$$;

revoke all on function public.my_client_id() from public, anon;
revoke all on function public.is_portal_client() from public, anon;
grant execute on function public.my_client_id() to authenticated;
grant execute on function public.is_portal_client() to authenticated;

-- 3. RESTRICTIVE policies — a client_admin may only touch rows for THEIR client.
--    `not is_portal_client()` makes the policy a no-op for everyone else.

-- 3a. Tables with a direct client_id ------------------------------------------
create policy "properties_client_admin_scope" on public.properties
  as restrictive for all to authenticated
  using (not public.is_portal_client() or client_id = public.my_client_id())
  with check (not public.is_portal_client() or client_id = public.my_client_id());

create policy "quotes_client_admin_scope" on public.quotes
  as restrictive for all to authenticated
  using (not public.is_portal_client() or client_id = public.my_client_id())
  with check (not public.is_portal_client() or client_id = public.my_client_id());

create policy "invoices_client_admin_scope" on public.invoices
  as restrictive for all to authenticated
  using (not public.is_portal_client() or client_id = public.my_client_id())
  with check (not public.is_portal_client() or client_id = public.my_client_id());

create policy "jobs_client_admin_scope" on public.jobs
  as restrictive for all to authenticated
  using (not public.is_portal_client() or client_id = public.my_client_id())
  with check (not public.is_portal_client() or client_id = public.my_client_id());

create policy "contracts_client_admin_scope" on public.contracts
  as restrictive for all to authenticated
  using (not public.is_portal_client() or client_id = public.my_client_id())
  with check (not public.is_portal_client() or client_id = public.my_client_id());

-- 3b. Tables scoped via their property's client -------------------------------
create policy "compliance_items_client_admin_scope" on public.compliance_items
  as restrictive for all to authenticated
  using (
    not public.is_portal_client()
    or property_id in (select id from public.properties where client_id = public.my_client_id())
  )
  with check (
    not public.is_portal_client()
    or property_id in (select id from public.properties where client_id = public.my_client_id())
  );

create policy "actions_client_admin_scope" on public.actions
  as restrictive for all to authenticated
  using (
    not public.is_portal_client()
    or property_id in (select id from public.properties where client_id = public.my_client_id())
  )
  with check (
    not public.is_portal_client()
    or property_id in (select id from public.properties where client_id = public.my_client_id())
  );

create policy "assets_client_admin_scope" on public.assets
  as restrictive for all to authenticated
  using (
    not public.is_portal_client()
    or property_id in (select id from public.properties where client_id = public.my_client_id())
  )
  with check (
    not public.is_portal_client()
    or property_id in (select id from public.properties where client_id = public.my_client_id())
  );

create policy "documents_client_admin_scope" on public.documents
  as restrictive for all to authenticated
  using (
    not public.is_portal_client()
    or property_id in (select id from public.properties where client_id = public.my_client_id())
  )
  with check (
    not public.is_portal_client()
    or property_id in (select id from public.properties where client_id = public.my_client_id())
  );

-- 3c. Line tables scoped via their parent's client ----------------------------
create policy "quote_lines_client_admin_scope" on public.quote_lines
  as restrictive for all to authenticated
  using (
    not public.is_portal_client()
    or quote_id in (select id from public.quotes where client_id = public.my_client_id())
  )
  with check (
    not public.is_portal_client()
    or quote_id in (select id from public.quotes where client_id = public.my_client_id())
  );

create policy "invoice_lines_client_admin_scope" on public.invoice_lines
  as restrictive for all to authenticated
  using (
    not public.is_portal_client()
    or invoice_id in (select id from public.invoices where client_id = public.my_client_id())
  )
  with check (
    not public.is_portal_client()
    or invoice_id in (select id from public.invoices where client_id = public.my_client_id())
  );

comment on column public.profiles.client_id is
  'For client_admin portal users: the single client they are scoped to (Model 1). NULL for staff. Enforced by the *_client_admin_scope RESTRICTIVE RLS policies.';
