# SECURITY — client_admin portal lacks client-level scoping (cross-tenant exposure)

**Severity:** Critical (cross-tenant IDOR — one client can read every other
client's financial data within the same FM organisation)

**Status (updated 2026-06): ✅ RESOLVED — applied to production + verified.**
Migration `00096` is live (11 RESTRICTIVE policies + `profiles.client_id` +
helpers confirmed in the DB), and portal pages now pass `client_id` as
defence-in-depth. Details below are retained for reference.

---

**Earlier status:** Migration written + schema-verified, ready to apply.
- **Model chosen:** Model 1 — one client per user (`profiles.client_id`).
- **Backfill:** none needed — verified the live DB has **0 `client_admin`** rows
  (and 0 `tenant_user`), so the fail-closed RLS locks out nobody; it's enforced
  from the first portal user created.
- **Migration:** `supabase/migrations/00096_portal_client_scoping.sql` — uses
  RESTRICTIVE policies (AND'd on top of existing ones) so it can't disturb staff
  or tenant_user access. Double-checked against the live schema (columns, RLS
  enabled on all 11 tables, no policy-name collisions).
- **Remaining:** apply to prod (awaiting go-ahead), then the optional
  defence-in-depth (portal hooks pass `client_id`) below.

Original analysis follows.

**Found:** cycle-2 adversarial bug hunt (2026-06).

---

## The problem

The `/portal` "Client Hub" is served to `client_admin` users
(`apps/web/src/components/layout/portal-layout.tsx` only redirects `tenant_user`
to `/site`; `client_admin` is the portal's intended audience). Every portal page
fetches data with the **org-wide** staff hooks — `useQuotes`, `useInvoices`,
`useProperties` — none of which add a `client_id` filter. The quote/invoice
**detail** pages select purely `.eq('id', id)`.

The only backstop is RLS, but the quotes/invoices/properties policies
(`supabase/migrations/00002_rls_policies.sql:177-196`) scope by
`organisation_id = public.organisation_id()` **only** — there is no `client_id`
predicate. `public.organisation_id()` returns the caller's
`profiles.organisation_id`, and **`profiles` has no `client_id` column** at all
(`00001_initial_schema.sql:36-47`; confirmed no later migration adds one).

Contrast: `tenant_user` (the `/site` portal) **is** correctly isolated — to a
single property via `public.tenant_property_id()` (`00035_property_contacts.sql`,
`00058`). The developers built per-property isolation for `tenant_user` but built
**no** client-level isolation for `client_admin`.

**Net effect:** a `client_admin` at Client A can visit `/portal/invoices`,
`/portal/quotes`, `/portal/portfolio` — or iterate `/portal/invoices/:id` — and
read (and, via the org-wide UPDATE/DELETE policies, potentially write) **every**
client's quotes, invoices, properties and line-item pricing in the entire FM org.

---

## Why this isn't auto-applied

1. **Data-model decision.** How does a `client_admin` bind to a client?
   - (a) one client per portal user → add `profiles.client_id uuid`, or
   - (b) a user may administer several clients → a `profile_clients` join table.
   Recommendation: **(a)** unless multi-client admins are a real requirement.

2. **Backfill cannot be inferred.** Existing `client_admin` rows have no client
   association anywhere in the schema, so the correct `client_id` for each must
   come from operational knowledge (who is who). Applying the RLS below **before**
   backfill fails closed — unbackfilled `client_admin` users would see nothing
   and be locked out of their own data.

3. **Production access-control change.** Applying RLS to the live project changes
   who can read/write financial data. This needs explicit sign-off and a backfill
   verified first, not a silent `db push`.

---

## Proposed fix (apply AFTER the data-model decision + backfill)

```sql
-- migration: client_admin client-level scoping
-- PREREQUISITE: every client_admin profile must already have client_id set,
-- or that user will (correctly, fail-closed) see no data after this applies.

-- 1. Bind portal admins to a client.
alter table public.profiles add column if not exists client_id uuid references public.clients(id);
create index if not exists idx_profiles_client_id on public.profiles(client_id);

-- 2. Helper: the caller's client_id (null for staff / unbound users).
create or replace function public.client_id()
returns uuid language sql security definer stable set search_path = '' as $$
  select client_id from public.profiles where id = auth.uid()
$$;

-- 3. Helper: is the caller a portal client admin?
create or replace function public.is_client_admin()
returns boolean language sql security definer stable set search_path = '' as $$
  select coalesce((select role = 'client_admin' from public.profiles where id = auth.uid()), false)
$$;

-- 4. Restrict client_admin reads to THEIR client. Staff (is_client_admin()=false)
--    keep the existing org-wide behaviour. Apply WITH CHECK equivalents on
--    UPDATE/DELETE policies too. Repeat the predicate for quotes, quote_lines,
--    invoices, invoice_lines, properties, documents, jobs, compliance_items,
--    actions — every table reachable from the portal.

-- quotes (SELECT) example:
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select using (
  organisation_id = public.organisation_id()
  and (not public.is_client_admin() or client_id = public.client_id())
);

-- invoices (SELECT) example:
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select using (
  organisation_id = public.organisation_id()
  and (not public.is_client_admin() or client_id = public.client_id())
);

-- properties (SELECT) example:
drop policy if exists properties_select on public.properties;
create policy properties_select on public.properties for select using (
  organisation_id = public.organisation_id()
  and (not public.is_client_admin() or client_id = public.client_id())
);

-- NOTE: quote_lines / invoice_lines have no client_id of their own — scope them
-- via their parent (exists (select 1 from quotes q where q.id = quote_id and ...)).
-- Audit the FULL list of portal-reachable tables before applying; missing one
-- leaves the hole open for that table.
```

## Defence-in-depth (client side, safe to ship independently)

Once `profiles.client_id` exists, have the portal hooks pass `client_id`
explicitly (e.g. `useInvoices({ client_id })`, `useProperties(client_id)`) and
have the detail pages assert the fetched record's `client_id` matches the
caller's — so a missing RLS predicate can never silently leak again.
