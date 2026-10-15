# Codex adversarial review — 2026-08-05

## Executive summary

This pass confirmed and fixed five defect classes: one cross-tenant token-binding
vulnerability, two billing authorization failures, Stripe webhook acknowledgement/data
ordering failures, local-calendar date drift, and an invoice-conversion guard that
discarded its read error. No front-end deployment or Supabase migration was run.
Migration `00126_bind_eta_tokens_to_job_org.sql` must be applied through the normal
release process.

The complete requested verification gate is green: workspace typecheck, lint, 248 web
tests, 19 utils tests, web/marketing builds, design-token budget, mobile TypeScript, and
43 mobile tests. The five edited edge functions also pass `DENO_NO_PACKAGE_JSON=1 deno
check --no-lock`.

## Findings

### F-01 — High — ETA tokens could cross the tenant boundary

**Locations:** `supabase/migrations/00048_job_eta_tokens.sql:69`,
`supabase/functions/public-job-eta/index.ts:155`, and
`supabase/functions/public-job-eta-ics/index.ts:202`.

**Defect:** the INSERT policy checked the caller-supplied `organisation_id` and
`created_by`, but did not require `job_id` to belong to that organisation. Both public
functions then followed `job_id` with a service-role client, bypassing jobs RLS.

**Concrete failure:** an authenticated user in organisation A who has a job UUID from
organisation B inserts `{ organisation_id: A, job_id: B, created_by: self }`, then opens
the generated token. The JSON endpoint returned B's property name, engineer first name,
ETA, and recent coordinates while travelling; the ICS endpoint returned B's visit data.

**Fix:** migration `00126` replaces the INSERT policy with an authenticated,
job-ownership-bound policy. Both public functions additionally filter the service-role
job lookup by the token's `organisation_id`, so pre-existing malformed rows fail closed.

### F-02 — High — Billing endpoints lacked server-side billing authorization

**Locations:** `supabase/functions/stripe-checkout/index.ts:101` and
`supabase/functions/stripe-portal/index.ts:120`.

**Defect:** Checkout treated identity verification as best-effort and trusted the body
`orgId` after an anon/invalid user lookup. Billing Portal checked tenant membership but
not role, despite the returned Stripe session permitting payment-method and subscription
changes.

**Concrete failure:** a browser request carrying the project anon JWT could ask Checkout
to create a session for an arbitrary organisation UUID. Separately, an engineer in a
valid organisation could call Billing Portal with that organisation ID and receive a URL
capable of changing its card or cancelling its subscription.

**Fix:** both functions now require a verified user (or service-role caller), derive the
user's organisation and role from `profiles`, require `super_admin`/`org_admin`, and reject
cross-organisation IDs. Checkout subscription lookup errors now fail closed.

### F-03 — Medium — Stripe webhook marked failed writes as successfully processed

**Location:** `supabase/functions/stripe-webhook/index.ts:164`.

**Defect:** `invoice.paid` and `invoice.payment_failed` awaited Supabase builders but
discarded their returned `error`; the customer-to-organisation lookup did the same. The
handler then returned 200 and wrote the event's permanent idempotency marker. A delayed
payment failure could also overwrite a later `canceled` state with `past_due`.

**Concrete failure:** a transient database failure during `invoice.payment_failed`
leaves the subscription `active`, but Stripe receives 200 and subsequent delivery is
skipped by `billing_events`. Or, `customer.subscription.deleted` arrives before a delayed
invoice failure and the delayed event changes `canceled` to `past_due`.

**Fix:** lookup/update errors now throw into the existing 500 response path so Stripe can
retry. Payment failures update only live/recoverable states and no longer overwrite
terminal cancellation states.

### F-04 — Medium — Local calendar dates were serialized through UTC

**Locations:** `apps/web/src/hooks/use-quotes.ts:390`,
`apps/web/src/hooks/use-statements-of-compliance.ts:57`, plus PO, contract, asset,
compliance, log-book, reporting, time-entry, onboarding, and maintenance date defaults.

**Defect:** date-only values used `toISOString().slice/split`, turning a local calendar
day into a UTC day before writing a Postgres `date` or building a date filter.

**Concrete failure:** at 00:30 BST on 6 August, quote conversion calculated Net 30 in
local time but serialized 5 September local as `2026-09-04`; current-month reporting at
the start of 1 August could select July. The same boundary shifted newly defaulted
purchase-order, contract, asset, log-book, and onboarding dates.

**Fix:** these calendar-day paths now use the existing `toLocalYmd()`/`addDaysIso()`
helpers. Boundary regression tests cover quote due dates and monthly statement selection.

### F-05 — Low — Quote-to-invoice idempotency guard discarded read errors

**Location:** `apps/web/src/hooks/use-quotes.ts:372`.

**Defect:** the existing-invoice lookup ignored `error` and proceeded as though no invoice
existed.

**Concrete failure:** if the guard query times out after an invoice already exists, the
hook attempts another insert and surfaces a misleading unique-constraint failure instead
of the real lookup failure; without the database uniqueness migration this path would
create a duplicate.

**Fix:** the guard now throws its read error before any line fetch or insert. A regression
test verifies no write is attempted.

## Reviewed and clean in this pass

- Mapped all 43 edge-function entry points and `verify_jwt` settings, then inspected the
  service-role/token/billing/push/webhook candidates. No additional confirmed cross-org
  path was found beyond F-01/F-02; accepted ROADMAP §A2 items were not re-reported.
- Scanned all TanStack query-key declarations/invalidation sites. The previously repaired
  `engineers`/`engineer-profiles` collision remains separated; no new cross-shape cache
  collision was confirmed.
- Inspected form-reset effects identified by the reset/effect scan. The previously fixed
  record-ID hydration guards remain in place; no new background-refetch input wipe was
  confirmed.
- Scanned the React/marketing sources for raw HTML injection, eval/string-code execution,
  document writes, and wildcard `postMessage` sends; none were found.
- Checked nested Link/Button candidates. Remaining grep hits are comments, sibling
  controls, or `Button asChild`; no new nested interactive control was confirmed.

## Verification and handoff

- `npm run typecheck:all` — pass
- `npm run lint:all` — pass
- `npm run test:all` — pass (248 web, 19 utils)
- `npm run build:all` — pass
- `npm run check:no-raw-type` — pass (baseline 120)
- `cd apps/mobile && npx tsc --noEmit && npx vitest run` — pass (43 tests)
- Edited edge functions — Deno check pass

Git commits could not be created because the execution sandbox exposes `.git` read-only
(`.git/index.lock: Operation not permitted`). The working-tree changes are preserved.
