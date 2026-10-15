# Security — access control & exposure

Audit performed via the **security-board** process (CISO + Supabase advisor +
function/RLS analysis + runtime privilege verification) against the LIVE project
`vphjwvleffuwwgbjxups` and the deployed web app. Backend is Postgres + RLS;
the mobile app shares the same backend, so these findings cover both.

## Verdict

**No cross-tenant data exposure found at the data layer.** RLS is comprehensive
and correctly scoped. Two genuinely-exploitable `SECURITY DEFINER` functions and
one storage-listing issue were found and fixed (migrations 00105–00106),
runtime-verified.

## Trust model

- **Auth**: Supabase Auth (JWT). `auth.uid()` is the identity; never trusted from
  a request body.
- **Multi-tenancy**: every tenant table is RLS-scoped to `organisation_id =
  public.organisation_id()` (derived from the caller's `profiles` row). Portal /
  client scoping via `is_portal_client()` + `my_client_id()`; site/tenant scoping
  via `tenant_property_id()` (from `property_contacts`).
- **Roles**: `org_admin`, `manager`, `scheduler`, `finance`, `engineer`,
  `auditor`, `client_admin`, `tenant_user`, `super_admin`. Admin mutations go
  through `SECURITY DEFINER` RPCs that call `_require_org_admin()` (enforces
  `org_admin`/`manager`) and re-check the target is in the caller's org.

## What is enforced (verified)

| Surface | Enforcement | Verified |
|---|---|---|
| Every `public` table | RLS **enabled** | ✅ all 80+ tables |
| Tenant tables | org-scoped policies, **no `USING(true)`/`WITH CHECK(true)`** | ✅ 0 permissive leaks found |
| Admin RPCs (`admin_update_member` etc.) | `_require_org_admin()` + target-org check + last-admin guard | ✅ read function bodies |
| Portal quote decision (`tenant_set_quote_decision`) | scoped by `tenant_property_id()` (IDOR-safe) | ✅ |
| New-org claim (`claim_workspace`) | requires auth + no existing org | ✅ |
| `seed_sample_data` / `create_job_from_maintenance_plan` | self-check caller is admin / org-scoped plan | ✅ |

## Fixed in this audit

1. **Exploitable `SECURITY DEFINER` functions** (migration 00105). Postgres
   grants `EXECUTE` to `PUBLIC` by default, so internal trigger/maintenance
   functions were callable via `/rest/v1/rpc/*`. The real risks:
   - `refresh_engineer_accreditation_statuses()` — a global (all-orgs) `UPDATE`,
     callable by **anon** → cross-org mass write / DoS. **Now backend-only.**
   - `fos_recalculate_quote_totals(uuid)` / `..._purchase_order_totals(uuid)` —
     write a target's totals with no org check, callable by anon/authenticated.
     **Now backend-only.**
   - Plus the trigger / auth / event-trigger helpers (`assign_*`, `handle_new_user`,
     `fos_*`, `rls_auto_enable`) revoked from PUBLIC (triggers still fire).
   - **Runtime proof**: `has_function_privilege('anon'|'authenticated', fn,
     'execute')` is now `false` for all of these; `service_role` retains them.
2. **`avatars` bucket listing** (migration 00106). The public bucket had a broad
   SELECT policy letting any authenticated user **list every org's** avatar paths
   (org-ID enumeration). Scoped SELECT to the caller's own org. Image display is
   unaffected (public-URL endpoint bypasses storage RLS).

## Round 2 — portal scoping + edge-function auth (developer-team hunt)

A second, deeper pass over the client-facing **portal** and the **38 edge
functions** surfaced issues the first round (data-layer focused) did not.

### Fixed — LIVE at the data layer (migration 00107)

- **Portal `timeline_events` cross-tenant read leak (HIGH).** The `/portal`
  Overview renders the activity feed scoped only by `organisation_id` (shared by
  all of an operator's clients), so a `client_admin` saw other clients' quote /
  invoice numbers and property names in event descriptions. 00096 had scoped
  quotes/invoices/jobs/etc. but **omitted** `timeline_events` and `payments`.
  Added fail-closed RESTRICTIVE `for select` policies: portal clients see only
  events for their own `client_id` **or** their own properties; payments scoped
  via the parent invoice's client. Non-portal users short-circuit to `TRUE`
  (unaffected). **Runtime-verified**: policies present, RESTRICTIVE, SELECT,
  correct predicate; zero `client_admin` rows so no user disrupted.

### Fixed + DEPLOYED (edge functions, runtime-verified)

Redeployed via the Supabase CLI with `verify_jwt = true` preserved; the deployed
source was re-fetched and confirmed to contain the fix (sso-jit-provision → v3,
send-email → v7).

- **`sso-jit-provision` org-join via attacker-controlled `body.email`
  (CRITICAL, was LIVE-exploitable — a real `sso_domain_mappings` row exists).** The
  handler pinned `user_id` to the JWT but derived the SSO email (which decides
  *which org and role* the user is provisioned into) from `body.email`. A
  logged-in user with a throwaway account could POST `{email:"x@target.com"}`
  and join the target org with its default role. **Fix**: email + provider +
  user_id now derived **exclusively from the verified JWT**; `body.*` ignored.
- **`send-email` arbitrary-recipient relay (HIGH).** An `org_admin`/`scheduler`
  could send fully-branded mail to any `to` address (spam/phishing on the
  platform's sending reputation). **Fix**: `to` validated; for non-`invite`
  templates the recipient must belong to the caller's org (clients / profiles /
  property_contacts / subcontractors). Invites still reach new addresses.

### Round 3 — the documented follow-ups are now FIXED (deployed / applied)

All four follow-ups from round 2 plus the portal quote item were closed and are
live (edge fns redeployed; migration 00108 applied + verified).

- **Portal quote approval column tampering** — DONE. Migration 00108 adds
  `client_set_quote_decision` (SECURITY DEFINER, status-only, state-guarded,
  client-scoped, fires the operator timeline+notification server-side) and a
  RESTRICTIVE `quotes_client_admin_no_direct_update` policy that blocks any
  direct column UPDATE on quotes by a portal client. Web portal switched to the
  RPC. Verified: function present, policy present, anon has no execute grant.
- **OAuth connect/disconnect role gate** (`quickbooks`/`xero`/`slack-oauth`) —
  DONE. Gated to `org_admin`/`finance`/`super_admin` (Slack also `manager`);
  any-member connect/disconnect is rejected 403.
- **GDPR `request_id` ownership** (`gdpr-delete`/`gdpr-export`) — DONE. A
  body-supplied `request_id` is only honoured if it belongs to the caller's org;
  otherwise it's dropped and a fresh own-org row is created, so no cross-org
  audit-row overwrite / PII bleed.
- **Invoice-push double-billing** (`quickbooks`/`xero-push-invoice`) — DONE.
  Replaced the check-then-act guard with an atomic row-level claim
  (`UPDATE accounting_status='pushing' WHERE … <provider>_invoice_id IS NULL AND
  status<>'pushing'`); the loser matches 0 rows and bails. Also gated push to
  `org_admin`/`finance`/`super_admin`.

### Confirmed-safe in round 3 (reviewed, no change needed)

- **`stripe-webhook`** verifies the `Stripe-Signature` HMAC (`constructEventAsync`)
  before trusting any event — forged payment events rejected.
- **Public functions** (`public-job-eta`, `public-trust-score`, `calendar-feed`,
  `trust-subscribe`) authenticate by unguessable token / HMAC-signed token /
  opt-in slug and scope via the service role — no unauth org data leak.
- **`generate-tender-pack`, `generate-statement-of-compliance`,
  `compute-compliance-scores`** validate a body `organisation_id` against the
  caller's own org (403 on mismatch) — no cross-org export IDOR.
- **`invite-team-member`** is gated to `org_admin`/`super_admin`; `site-invite`
  to `org_admin`/`super_admin`/`scheduler` and only sets a property-contact role
  — no app-privilege escalation.

## Accepted residual risk (by design / platform)

- **`org-branding` public read** — intentional; org logos are embedded by public
  URL in transactional emails. Listing reveals only logo paths.
- **`trust_subscriptions`** has RLS enabled with **no policies** = deny-all for
  API roles; written only by the `trust-subscribe` edge function (service role).
  Locked, not a leak.
- **RLS helper functions** (`organisation_id()` etc.) keep their PUBLIC `EXECUTE`
  grant because RLS policies evaluate them as the querying role; they return
  `NULL` for anon, so the exposure is nil.
- **Leaked-password (HIBP) protection disabled** — requires the Supabase Pro
  plan. Re-enable on upgrade (`Auth → Password security`).
- **`organisations` INSERT** allows any authenticated user to create an org
  (the `claim_workspace` onboarding path) — accepted DoS-via-org-creation lever.
- Dead template tables (`meals`, `meal_ingredients`, `meal_roles`) — RLS-on with
  policies; harmless cruft, slated for removal.

## Re-running the audit

```
get_advisors(project, 'security')            # Supabase linter
# RLS coverage:
select relname, relrowsecurity, (select count(*) from pg_policy p where p.polrelid=c.oid)
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r';
# Over-permissive policies (should be empty):
select * from pg_policies where schemaname='public' and (btrim(qual)='true' or btrim(with_check)='true');
# Function exposure:
select has_function_privilege('anon', 'public.<fn>(...)', 'execute');
```
