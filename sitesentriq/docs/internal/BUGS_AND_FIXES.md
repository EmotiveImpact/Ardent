# Bugs & Fixes — running ledger

The maintained record of bugs found, fixes shipped, and what's still open. The
`/loop` stability task references and updates this file each iteration. Newest
work at the top of each section.

**Core stability (last verified: 2026-08-05 — Codex review pass):** web build ✓ ·
marketing build ✓ · tsc 0 errors across web/marketing/mobile/packages · lint 0 errors ·
**248/248 web tests** · **19/19 utils tests** · **43/43 mobile tests** ·
`check:no-raw-type` at baseline. App version `0.28.2`. 43 edge functions deployed;
migrations through **00126** live. **Backend and front-end both deployed.**

> **Environment note (2026-08-05):** the repo's engine floor is `^20.19.0 || >=22.13.0`.
> The machine default is now Node **v22.22.3**, which is fine. The older
> "use Volta's 22.12.0" workaround is **obsolete** — 22.12.0 is now *below* the floor.
> `node_modules` was found completely empty during this sweep (nothing could build);
> `npm install` at the workspace root fixes it.

> **Pre-existing, accepted:** 10 edge functions fail `deno check` under strict mode with
> `TS2345 SupabaseClient<any,"public",any>` vs `SupabaseClient<unknown,never,…>`. This is
> the known supabase-js generics class, not a defect — they deploy and run fine. Do not
> re-report. (Note: run `deno check` with `DENO_NO_PACKAGE_JSON=1`, otherwise a populated
> root `node_modules` makes Deno try to resolve npm deps from it and every check fails
> with a misleading "Could not find a matching package" error.)

### Codex review pass — 2026-08-05 → `0.28.2`
Second adversarial pass, run through Codex with `docs/internal/CODEX_REVIEW_PROMPT.md`.
Each finding independently re-verified before applying (commit `a3bfa62`, migration
**00126**). Codex's own write-up: `docs/internal/CODEX_REVIEW_REPORT.md`.

- **🔴 ETA tokens could cross the tenant boundary** (HIGH) — `00048`'s INSERT policy bound
  `organisation_id` + `created_by` but never required `job_id` to belong to that org, and
  `public-job-eta` / `public-job-eta-ics` then follow `job_id` with a **service-role**
  client (bypassing jobs RLS). A user in org A holding a job UUID from org B could insert
  `{organisation_id: A, job_id: B}` and read B's property name, engineer first name, ETA
  window and live coordinates. Fixed: 00126 adds a job-ownership `EXISTS` check to the
  policy; both functions also `.eq('organisation_id', t.organisation_id)` on the
  service-role lookup so **existing** malformed rows fail closed. Verified live in
  `pg_policies`.
- **🔴 Billing endpoints had no server-side authorization** — `stripe-checkout` treated
  identity as best-effort: an anon/invalid user lookup fell through and it trusted the
  body `orgId`, so an anon-key request could open a Checkout session against any org.
  `stripe-portal` verified tenant membership but **not role**, so any engineer could get a
  portal URL that changes the card or cancels the subscription. Fixed: both require a
  verified user (or service_role), derive org+role from `profiles`, and require
  `super_admin`/`org_admin`. Checked that this mirrors the existing `settings:write`
  route guard and that the only caller is the authenticated settings/billing page (the
  marketing app never invokes them — it only mentions them in a comment), so no legitimate
  caller is locked out. **Not runtime-provable here:** `STRIPE_SECRET_KEY` is unset, so
  the config check returns 500 before auth is reached — which also means this was *latent*
  rather than live, and arms the moment billing is configured.
- **🟠 `stripe-webhook` marked failed writes as processed** — `invoice.paid` and
  `invoice.payment_failed` awaited the Supabase builders but discarded the returned
  `error` (as did the customer→org lookup), then returned 200 **and** wrote the permanent
  `billing_events` idempotency marker. A transient DB failure therefore left the
  subscription stale while Stripe treated the event as delivered and skipped redelivery.
  Fixed: errors throw into the existing 500 retry path. Separately, a late
  `payment_failed` could overwrite a terminal `canceled` with `past_due` — now restricted
  to live/recoverable states.
- **🟠 More UTC day-key drift** (same systemic class as 0.28.1) — quote→invoice Net-30 due
  date, monthly statement `derivePeriodRange`, plus PO / contract / asset / compliance /
  log-book / onboarding / time-entry / maintenance date defaults. At 00:30 BST a Net 30
  serialised a day early; monthly reporting at the start of 1 Aug could select July.
  Fixed: `toLocalYmd()` / local-constructed `Date`s.
- **🟡 Quote→invoice idempotency guard discarded its read error** — the existing-invoice
  lookup ignored `error` and proceeded as if none existed, so a timed-out guard query led
  to a second insert and a misleading unique-constraint violation masking the real fault.
  Fixed: throws the read error before any insert. Regression test asserts no write.

### Access-control repair + correctness/a11y sweep — 2026-08-05 → `0.28.1`
Two adversarial review agents (web, backend) run in parallel; every finding confirmed by
reading the code before fixing. Migration **00125** + 5 edge functions redeployed
(`0d2892f`), then the a11y pass (`fb373c3`). Newest first.

- **🔴 `run-scheduled-reports` had NO caller authorization** (CRITICAL) — straight from
  `serve()` to a service-role cross-org sweep. `verify_jwt` only proves a validly-signed
  *project* JWT, which the **anon key in the browser bundle** satisfies, as does any
  logged-in engineer/tenant_user. Any caller could run every org's due schedules with RLS
  bypassed and email the reports out, and repeat calls burned `next_run_at` forward,
  suppressing legitimate runs. Fixed: `jwtRole(req) !== 'service_role' → 403`, matching
  `notify-renewals`/`weekly-digest`. **Runtime-verified:** anon POST → handler `403`.
- **🔴 `field-signatures` bucket world-readable + cross-tenant writable** (CRITICAL) —
  00022's SELECT policy had no `TO` clause → granted to `public`, which includes `anon`;
  00059 privatised six buckets and missed this one. INSERT/UPDATE only required
  `authenticated`, so any tenant could overwrite another tenant's signature PNG (tampering
  with compliance evidence). Fixed in 00125: `to authenticated` + org-scoped through the
  job. Object paths stay `{job_id}/…` — an org-prefix rewrite would orphan every existing
  file. **Verified:** policy roles `{public}` → `{authenticated}`.
- **🔴 `public.clients` omitted from portal scoping** (CRITICAL) — 00096 §3a covered
  properties/quotes/invoices/jobs/contracts but not `clients` itself, which still carried
  only the org-wide 00002 policies. A `client_admin` could `GET /rest/v1/clients` for
  every other client of the operator, and `clients_delete` let them cascade-delete a
  rival. Fixed in 00125.
- **🔴 Portal client_admin had full write on financial + compliance records** (CRITICAL) —
  00096's policies are `as restrictive`, which narrows *rows* but does not remove the
  *command*; the permissive 00002 base policies are org-scoped with no role component. A
  portal user could `PATCH` their own invoice to `paid` or `DELETE` their overdue
  `compliance_items`. Fixed in 00125: portal users read-only on clients/invoices/
  compliance_items/contracts/properties. `jobs` deliberately excluded (call-outs write
  there); quote approval already goes via the 00108 SECURITY DEFINER RPC.
- **🟠 `run-report` declared a per-dataset permission and never checked it** — RLS is
  org-scoped but not role-scoped, so an engineer could POST `{dataset:'invoices'}` for the
  org's financials or `engineers` for the staff roster with emails. The builder UI hid
  them; the function didn't. Fixed: role→permission check before the query.
  **Verified `403`.**
- **🟠 `calendar-feed` failed OPEN on a missing token row** — `if (dbToken?.revoked_at)`
  let a *missing* row fall through and serve the feed. Users hold a DELETE policy on their
  own token rows and the row cascades on auth-user deletion, so offboarding removed the
  only revocation record while the year-long HMAC token kept working. Fixed:
  `if (!dbToken || dbToken.revoked_at) → 401`.
- **🟠 `stripe-webhook` resurrected cancelled subscriptions** — `handleInvoicePaid` did an
  unqualified `update {status:'active'}` for the org. A trailing proration or an
  out-of-order event after cancellation flipped the org back to active indefinitely.
  Fixed: only promote from `past_due/unpaid/incomplete/trialing/active`.
- **🟠 `site-accept-invite` broke past 200 auth users** — `listUsers({page:1,perPage:200})`
  with no pagination; any tenant sorting outside page 1 hit a hard 500 and could never
  accept their invite. A silent onboarding failure that grows with tenancy. Fixed: pages
  through.
- **🟠 `run-scheduled-reports` advanced the schedule past FAILED runs** — a transient
  run-report error only logged, then fell through to the `next_run_at` advance, silently
  consuming that period (the customer's report just never arrived). It also returned
  `{ok:true}` with a `ran` count that included failures. Fixed: `continue` on failure,
  plus a `failed` counter in the response.
- **🔴 `['engineers']` query key shared by three queries over two tables** (web) —
  `use-engineers.ts` selects the `engineers` table; `jobs/[id].tsx` and `scheduler/` select
  `profiles where role='engineer'`. With `staleTime 60s` + IndexedDB persistence, whichever
  page loaded first poisoned the other: the job assign dropdown rendered
  "undefined (undefined)" and submitted an `engineers.id` into
  `engineer_assignments.engineer_id` (FK → `profiles`), failing the insert. Fixed: the two
  profiles queries moved to `['engineer-profiles']`.
- **🟠 Dashboard "Today's Jobs" tile counted almost nothing** — `.eq('scheduled_date', day)`
  against a `timestamptz` column matches only rows at exactly UTC midnight. Same bug
  already fixed in `scheduler/` and `use-todays-visits`. Fixed: local `[today, tomorrow)`.
- **🟠 Annual schedule dropped every 31 Dec job** — `.lte('scheduled_date','YYYY-12-31')`
  resolves to 31 Dec 00:00, so timed jobs on the last day fell out of `completedJobMap`,
  rendered as overdue, and "generate missing visits" re-created them as duplicates. Fixed:
  half-open `.lt(year+1-01-01)`.
- **🟠 Portal promised a 15-min SLA it never applied** — the banner matched the *Critical*
  policy, but the insert downgrades `critical → urgent` (there is no `critical` in the
  `jobs.priority` CHECK), so the SLA engine tracked it at 30 min. Contractual/SLA-reporting
  exposure. Fixed: the banner quotes the *effective* stored priority.
- **🟠 Six edit forms wiped in-progress input on any background refetch** — clients/assets/
  subcontractors/settings-organisation/suppliers/reports-builder hydrated via
  `useEffect([record, reset])`. Structural sharing only holds identity while the payload is
  byte-identical, so any refetch returning a changed `updated_at` fired `reset()` over the
  user's typing. Fixed: hydrate keyed on record **id** (the pattern `jobs/[id].tsx` already
  used).
- **🟠 `toISOString()` UTC day-keys** (timezone bug class, see below) — `use-insights` ×3,
  `portal/index`, `portal/visits`, `compliance/[id]`, `use-invoices` (`paid_date` on a
  `date` column), `dashboard-kpi-hero-row`. East of UTC these showed today's visits as
  overdue and booked payments to the prior accounting day. Fixed: `toLocalYmd`.
- **🟡 KPI deltas pinned to 0% on a legitimately-zero baseline** — `sparkline[0] || current`
  treats a real `0` as "no data" and substitutes the current value, so 0 → 12 overdue items
  reported **"0% change"** on exactly the regression the tile exists to surface.
  `pctChange` already handled `previous===0` correctly; the `||` defeated it. Fixed: `??`.
- **🟡 Report-builder preview race** — the cleanup cleared the debounce timer but never
  cancelled an in-flight `runReport`, so a slow earlier run could resolve last and paint
  its rows under the new dataset's headers, with no loading indicator. Fixed: `cancelled`
  flag guarding both setters.
- **🟡 Per-org query key omitted the org** — `use-subcontractor-compliance` used
  `[KEY,'requirements']` while filtering by `organisation_id`. Latent (sign-out calls
  `queryClient.clear()`) but persisted to IndexedDB for 24h and would bite the moment an
  org-switcher or impersonation lands. Fixed.
- **🟡 47 nested `<a><button>` controls** (a11y) — `<Link><Button>` produced nested
  interactive elements. **Measured, not assumed:** a 48th "hit" was inside a JSDoc comment;
  all 47 inner buttons were inert (no `onPress`/`onClick`/`type=submit`/`disabled`), so the
  handoff's "skip if it has behaviour" set was empty. The browser does **not** hoist the
  button out of the anchor, and this is a client-rendered SPA — so there was no DOM
  restructuring and no hydration mismatch; React's `validateDOMNesting` warning is dev-only
  and stripped from production. The real cost was **two tab stops per visual control**
  (`role=link` containing `role=button`) and a click firing both the button handler and the
  anchor navigation. Fixed: 44 via `<Button asChild><Link/></Button>` (Slot support the
  component already had), 3 native styling-only buttons folded into their `Link` with
  `inline-flex`.

### Trust & Compliance wave — board review + hardening — 2026-06-10 → `0.28.0`
The wave (Waves 1–3, migrations 00114–00121) was reviewed by a 4-agent board
(security/RLS, backend, web, mobile). Confirmed bugs were fixed in migration **00122**
+ edge/web/mobile patches (commit `5672823`), all re-verified. Newest first.

- **🔴 Permit-to-work gate bypassable by flipping `requires_permit` off** (HIGH, board) —
  the gate (00121) only fires when `requires_permit=true`; any org member could
  `update jobs set requires_permit=false, status='in_progress'` in one statement and
  defeat it. Fixed: `fos_protect_requires_permit` trigger (00122) — clearing the flag now
  needs org_admin/super_admin/scheduler (raises `requires_permit_clear_forbidden`).
- **🟠 QR proof-of-presence double-write** (Confirmed, mobile) — `recordQrCheckin` did
  `insert; on error → enqueue`; a lost-response insert wrote TWO `qr_checkin` events
  (different server vs queued PK → no dedupe), duplicating SLA attendance evidence. Fixed:
  stamp the row PK client-side once so the online insert + any queued replay share an id
  and the queue's 23505 dedupe converges them (qr.ts).
- **🟠 SLA `sla_fix_met_at` backdating erases breach credits** (Likely, backend) — the
  met-stamp trusted a client-supplied `completed_date`; a backdated completion froze a
  past "met" time and silently zeroed the breach + its service credit. Fixed: 00122 clamps
  the stamp to `[created_at, now()]`.
- **🟡 Double success toast** on every subcontractor-assign / permit-flag toggle — the
  panel passed a local `onSuccess` toast on top of `useUpdateJob`'s generic one (both fire
  in TanStack v5). Fixed: panels drop the local success toast; the hook owns the message
  (and humanises the permit-gate error codes).
- **🟡 Dashboard customise draft reset mid-edit** — the seeding effect depended on
  `savedLayout`, so a background refetch (window refocus) overwrote in-progress reordering.
  Fixed: seed only on the open transition.
- **🟡 Stale-`pushing` retry false-positive** — `!updatedAt` was treated as "stale", so a
  fresh in-flight push could offer a Retry (double-push risk). Fixed: unknown timestamp ≠
  stale.
- **Perf**: added `idx_contracts_org_client_status` (00122) — the SLA stamp trigger ran a
  `contracts` seq-scan on every job INSERT.
- **Board "confirmed-safe"** (no change needed): anon PostgREST returns zero rows on the
  new tables/buckets; the subbie token function binds every read/write to the token's own
  org/job; the building-pack 403 + per-property org derivation hold; `record_failed_access`
  is correctly INVOKER-scoped; trigger firing order on `jobs` is correct and none return
  NULL. A few residual hardening items (subbie upload size cap, `complete`-action replay
  ordering, provider-side invoice idempotency key) were logged + the cheap ones fixed; the
  invoice idempotency key was deliberately deferred (commercial decision).

### Security-board hardening + PPM repair + feature delivery — 2026-06-09→10 → `0.27.0`

### Security-board hardening + PPM repair + feature delivery — 2026-06-09→10 → `0.27.0`
A multi-disciplinary security-board audit (Phase-0 surface map → intended access matrix →
parallel specialist agents → runtime-verified fixes), a coordinated repair of the PPM
job-generation subsystem, several adversarial bug-hunt waves, and three customer features —
all on top of the `0.26.0` wave. Migrations **00105–00113** applied to the live project;
web + edge deploys runtime-verified. Newest first.

- **🔴 PPM job-generation subsystem repaired as one unit (00110)** — root cause: the
  `create_job_from_maintenance_plan` SECURITY DEFINER fn ran under `set search_path = ''`
  with UNqualified table refs, so it ALWAYS raised "relation does not exist" — PPM
  generation was 100% dead. Re-created schema-qualified (`public.maintenance_plans` /
  `public.jobs` / `%rowtype`) + idempotent (returns the existing non-cancelled job for a
  (plan, date)); FIXED schedules advance `next_due` on generation, ROLLING do not; added
  `daily`/`fortnightly` to `fos_frequency_interval`; partial unique index
  `idx_jobs_ppm_plan_date` prevents duplicate PPM jobs; completion trigger
  `trg_ppm_after_complete` sets `last_completed` and rolls `next_due` from the actual
  completion for rolling plans. Verified end-to-end with a rolled-back transactional test
  (monthly rolling job completed 2026-06-15 → next_due 2026-07-15, last_completed set).
- **🔴 Security-board CRITICAL/HIGH closed + runtime-verified** — `sso-jit-provision`
  trusted `body.email` (account-takeover vector); the `send-email` relay + several portal
  RLS paths leaked across the org/portal boundary. Fixed server-side (identity derived from
  the session, never the body), redeployed, and verified `401`/`403` against the live
  endpoints. Plus the 5 documented exploit follow-ups: GDPR `request_id`, OAuth role gates,
  invoice-push idempotency, portal quote column-tampering (00108 status-only decision RPC +
  block `client_admin` direct column writes), across 7 edge functions (08f2110, 8af48d6).
- **Security DEFINER lockdown + portal/tenant scoping (00105–00109, 00111)** —
  00105 revokes on exploitable SECURITY DEFINER fns; 00106 scopes the avatars listing;
  00107 portal-scopes `timeline_events` + `payments` RLS; 00109 callout-uploads storage
  policy; 00111 adds the real `log_book_entries` + `risk_assessments` backing tables with
  org-scoped RLS (the UI had been built against non-existent tables).
- **Two regressions from our OWN security work — caught + fixed.** (1) Portal quotes LIST
  broke after 00108 tightened quote writes → re-allowed the read path under portal scope.
  (2) The PO→supplier email started failing because the `send-email` org-guard had no
  supplier probe → added one. Both verified live. *Lesson: every tightening migration needs
  a same-session re-test of the read/adjacent paths it touches.*
- **Adversarial bug-hunt waves (Workflow-orchestrated).** Wave 1 — 8 verified functional
  bugs (edge/web/mobile, 2fdcd69); wave 2 — 13 verified (803edd9); a feature-health audit
  that found 5 broken features incl. 2 regressions (00e837a); plus PPM date month-overflow
  (`Jan 31 + 1mo` clamping) + a bulk-delete hidden-row data-loss bug (e2a00a2). Earlier in
  the wave: a 21-bug fix sweep (919cb04) + a second stale-data/scoping/date-correctness
  sweep (df5ccaf). Agents were rate-limited at 6 concurrent → reduced to 3 broader agents.
- **Feature: notification preferences persisted + every channel gated (00112).** New
  `notification_preferences(user_id, prefs jsonb)` table (own-row RLS) + an org-scoped
  SECURITY DEFINER reader `notification_prefs_for()`. Settings now persists to the DB (was
  localStorage). In-app + Slack + push dispatch filter to the allowed set; the EMAIL channel
  is gated too — `recipientOptedOutOfEmail()` skips a send only when an INTERNAL user turned
  off that category's email (external client/supplier recipients + any lookup failure
  default to SENDING). Verified the reader join via a rolled-back transactional test
  (1c2b207, c690c3b).
- **Feature: scheduled-report executor wired (00113).** Saved report schedules were
  write-only (a STUB) — nothing ran them. New `run-scheduled-reports` service-role edge
  function finds due schedules → invokes `run-report` (now org-scoped via an optional
  `organisation_id` body param) → emails CSV/HTML via Resend → advances `next_run_at`
  (daily/weekly/monthly, month-clamped) + `last_run_at`. Driven by a pg_cron job every 15
  min that reads the service-role key from Vault (no secret committed). Runtime-verified
  `{ok:true,due:0,ran:0,sent:0}` (c0fe4d1). The builder's ScheduleModal now lists active
  schedules + fixed a duplicate-template-on-save bug.
- **Feature: engineer field data surfaced on web + canonical mobile signatures (5eab01e).**
  Web job detail now shows the engineer's notes + parts/materials (qty · unit cost · line
  total + subtotal). Mobile `saveSignature` now uploads to the `field-signatures` bucket and
  stores the OBJECT PATH (online + offline-queued), re-signed on read via `createSignedUrl`;
  `job-completion-email` signs raw object paths too.


Closed the items deferred from the 10-cycle sweep, then ran a Workflow-orchestrated
convergence audit (8 specialist agents + adversarial verifiers, ~1.6M tokens) and
fixed everything it confirmed. A second convergence pass was run to confirm clean.
- **Portal site-switcher now filters** Visits/Documents/Invoices/Quotes (added
  property_id to the invoice/quote filters + wired usePortalProperty).
- **Rolling PPM schedule_mode honoured** — rolling plans roll next_due from the last
  actual completion (JS fallback + RPC, migration **00086**).
- **🔴 Site-surface tenant file downloads** (HIGH) — tenant_users could read the rows
  but not the private files. New **sign-tenant-file** edge function re-checks the
  record under the caller's tenant RLS and signs with the service role (no broad
  storage grant). site/visits downloads rewired.
- **🔴 PO quick-drawer** (HIGH) — the DEFAULT New-PO path never sent organisation_id →
  every insert failed. Injects org + created_by; verified live.
- **🔴 Mobile offline queue** (HIGH) — only drained on a live reconnect, never on
  launch/foreground → offline field work made before a relaunch never synced. Added
  a mount + AppState-foreground drain.
- **Capacity heatmap** matched workload by the wrong id space (engineers.id vs the
  profiles.id assignments key) → all engineers showed 0. Now matches via profile_id.
- **Report builder** dataset-change corrupted a saved template (kept old dataset, wrote
  new empty definition) → now detaches so Save creates a new report.
- **Signature pad** wiped the drawing on spurious window resizes → guarded.
- **FormSelect** snapped to the first option when the value wasn't listed (mis-showed
  e.g. a super_admin role) → renders the actual value.
- LOW: job-completion notification empty-uuid guard; useJobs base-fallback error object;
  useDeleteJobPhoto signed-URL path (orphaned storage).

### Convergence pass 2 — 2026-06-05 (a second 13-agent adversarial sweep)
Re-ran the convergence Workflow on the now-fixed code. None of pass-1's findings
recurred (they stayed fixed); the second pass surfaced a fresh batch, all fixed:
- **Field Mode showed FUTURE jobs as "today's work"** (MED). useJobs' date filter
  is a lower bound (`.gte scheduled_date`) only, and the field page never re-filtered
  to the same calendar day, yet the UI frames the list as today and exposes
  swipe/tap-Complete — so a future visit could be completed early (minting certs +
  emailing the client). Now clips `myJobs` to `[today, tomorrow)` (epoch-compared,
  robust to timestamptz/ISO format differences).
- **Mobile `signOut()` left the offline write queue intact** (MED). On a shared
  field device the next engineer's session would replay the previous engineer's
  queued writes — RLS-rejected forever cross-org, or misattributed same-org. Now
  `clearOfflineQueue()` runs before the session ends.
- **Quote-pipeline conversion rate excluded `converted`** (LOW). Converting a quote
  sets `status='converted'` (the best outcome) but it was dropped from the numerator
  while still counted in the denominator → understated. Numerator is now
  `approved + converted`; the funnel shows Converted + Expired.
- **Portal dashboard KPIs ignored the site switcher** (LOW). Only the map honoured
  it; the KPI cards / compliance bar / upcoming-visits ran portfolio-wide. Now
  jobs/invoices/compliance-items filter by `property_id`, with properties-count and
  the compliance breakdown narrowed client-side (those two hooks take no property arg).
- **Portal Compliance page** kept an independent local dropdown that ignored the
  header switcher (LOW) → now bound to the global `usePortalProperty` switcher.
- **Add-payment modal** prefilled a stale balance after a partial payment (one-time
  `useState` init, component never remounts) (LOW) → re-syncs on open / amount change.
- **Report-builder "Group by"** drop zone was persisted but never applied (silent
  no-op) (LOW) → realised as clustering (grouped dims become leading ORDER BY keys)
  in both the client preview translator and the `run-report` edge fn (redeployed v3).
- **Sidebar active-item** used bare `startsWith`, so `/dashboard/scheduler` also lit
  up the sibling `/dashboard/schedule` item (LOW) → boundary-aware (exact or `path/`).

### Convergence pass 3 — 2026-06-05 (16-agent sweep — found a HIGH + a self-regression)
- **🔴 Pull-from-time-entries didn't bill the pulled time** (HIGH, revenue). Inserting
  invoice_lines never recomputed the invoice HEADER totals (no DB rollup trigger),
  and every consumer (footer, PDF, Amount Due/Mark Paid, reminder email) reads the
  stored header — so pulled billable time showed as a line yet was never charged (and
  the time entries were flagged billed). Now recomputes + persists subtotal/tax/total
  (preserving the effective VAT rate) and invalidates the list.
- **Portal Invoices vanished when a site was selected** (MED, REGRESSION from pass 2).
  Invoices are account-level and never carry `property_id`; `.eq('property_id')`
  excludes NULLs → every invoice hidden under a selected site. Reverted invoice
  property-filtering on the portal list + the dashboard Open-Invoices KPI. (Quotes ARE
  property-scoped — their form sets property_id — so quote filtering stays.) Lesson:
  only filter by a column that's actually populated.
- **Asset edit/new: property change kept a stale area_id** (MED) → saved the asset
  against an area from the OLD property (hidden entirely when the new property had no
  areas). Now clears area_id on a real property switch (ref-guarded against hydration).
- **Subcontractors had no Edit UI** (MED) — `useUpdateSubcontractor` was wired to
  nothing; the only "edit" was delete+recreate. Added `subcontractors/:id/edit` page +
  route + an Edit button on the detail header.
- **Invoice PDF hardcoded "VAT (20%)"** (MED) beside the real tax amount → wrong label
  on any non-20% invoice. Now derives the rate from subtotal/tax like the on-screen view.
- **Mobile push token always threw** (MED) — `getExpoPushTokenAsync()` with no
  projectId throws `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID`, silently killing push. Now
  resolves projectId from Constants and skips gracefully when absent. Delivery needs
  `eas init` → logged in **docs/internal/BLOCKERS.md** (new).
- LOW: Slack/Xero/QuickBooks "not configured" banners used the undefined `status-warning`
  token → now `status-due-soon`. Site-portal quote approve/reject double-toasted on
  error (page catch + mutation onError) → page no longer toasts.

### Convergence pass 4 — 2026-06-05 (15-agent sweep)
- **🔴 Signature pad double-applied devicePixelRatio** (HIGH). setupCanvas does
  `ctx.scale(dpr)` AND getCanvasPoint multiplied by `canvas.width/rect.width`(=dpr),
  so ink landed at dpr× the finger position — garbled/off-canvas on every HiDPI touch
  device, i.e. exactly where customers sign off completed jobs. Now divides the backing
  store by dpr so pointer coords map into the already-scaled CSS-pixel space.
- **GDPR self-delete never signed out** (MED). The success copy promised "you will be
  signed out shortly" but nothing did → the user stayed on a half-anonymised, still-
  authenticated session until JWT expiry. Now signs out after the message renders.
- **Bulk "mark Paid" skipped reconciliation** (MED). The invoices-list bulk status
  action only patched `status='paid'`, bypassing the payments-row + paid_date write
  (Total Paid £0, full balance still outstanding). Removed Paid from the bulk options —
  it's only reachable via the reconciling single-invoice Mark-Paid button.
- **Reminder email billed the gross total** (MED) — ignored recorded partial payments
  (which don't change status). Now sends the outstanding balance (email + preview).
- **Mobile "Submit & check out" swallowed GPS failures** (MED). The location lookup had
  no catch → on GPS failure the report saved, the job stayed in_progress, and the
  engineer got NO feedback (believed it complete). Now alerts + points at the standalone
  Check Out button to retry.
- LOW: portal compliance bar could exceed 100% for >200-item portfolios (uncapped stats
  vs `.limit(200)` items) → denominator is now the breakdown sum. site raise-callout
  fanned out as `visit_booked` not `callout_raised`. Analytics compliance pie coloured
  by post-filter index (a dropped zero status shifted every colour) → colours by name.
  FUNNEL_COLORS had 4 colours for 6 pipeline stages → extended to 6. Advanced-reports
  date inputs that did nothing on the Compliance Type tab → hidden there.

### Convergence pass 5 — 2026-06-05 (14-agent sweep; counts 8→4→7→6→5)
- **🔴 Pull-from-time billed entries even when the line insert failed** (HIGH). handlePull
  awaited the invoice handler then unconditionally `markBilled.mutate`, but the handler
  swallowed errors (toast + bare return) so the await always resolved → on a partial
  failure the entries flipped to billed against an invoice with none of the lines and
  vanished from the unbilled pool (no UI to recover). The handler now THROWS on failure
  and handlePull only marks billed on success (modal stays open to retry).
- **Advanced Reports end-date off-by-one** (MED). `.lte('scheduled_date', date_to)` with
  a date-only string vs a timestamptz column dropped every job after 00:00 on the end
  day (incl. today by default). Extended to end-of-day.
- **Dead "Profile" menu item** in the /site (MED) and /portal (LOW) layouts (no onAction,
  no profile route for those surfaces) → removed (a profile page would be a separate
  feature; a no-op button is worse than none).
- LOW: analytics "Unpaid/Outstanding" cards were overdue-only ageing data → relabelled
  "Overdue Invoices/Amount". Property inline Site-Manager couldn't be cleared (`|| undefined`
  dropped from PATCH) → `|| null`. BulkActionBar `hideUndoIn` was a no-op
  (`setPending(p=>p)`) → `setPending(null)`. Sidebar section-header active-state used bare
  `startsWith` (prefix collision) → boundary-aware.

### Convergence pass 6 — 2026-06-05 (16-agent sweep; counts 8→4→7→6→5→7)
- **🔴 CSV import inserted ZERO rows** for clients, properties AND assets (HIGH ×3). The
  import handlers passed the mapped CSV row to the create mutation without
  `organisation_id` (NOT NULL + RLS WITH CHECK), so every row was rejected and the
  import silently no-op'd. All three now inject `organisation_id` from auth.
- **🔴 QuickBooks "Save Settings" never persisted** (HIGH). `quickbooks_connections` had
  RLS with only a SELECT policy → the client `.update()` matched zero rows, returned no
  error, showed a false success toast, reverted on reload. **Xero** had the identical
  gap (MED). Migration **00087** adds org-scoped FOR UPDATE policies (mirroring
  slack_notification_settings); the hooks now `.select()` + throw on a zero-row update.
- **Jobs "Overdue"/"Due this week" views included finished jobs** (MED) — classified
  purely by date. Now exclude completed/cancelled (outstanding-work semantics).
- LOW: Jobs "My open" view ignored `assignee:'me'` (showed all open jobs org-wide) →
  now matches engineer_assignments to the current user. Add-payment overpayment guard
  was skipped at a 0 balance (could overpay a settled invoice) → applies at 0 too.
  Report-builder default preview showed raw FK UUIDs + a duplicate relation column →
  defaults to the dataset's field keys.

### Convergence pass 7 — 2026-06-06 (10-agent sweep; counts 8→4→7→6→5→7→**1** — converging)
- **Compliance "Scheduled Visits" showed completed past visits as Overdue** (MED).
  `getVisitStatus` only returned overdue/upcoming (date vs today) and never `completed`,
  so on a fully-compliant item every past auto-generated visit (the schedule is seeded
  from `last_completed`) rendered as a red Overdue chip. Now marks visits on/before
  `last_completed` as Completed (green); genuinely-missed past visits stay Overdue.

### Convergence pass 8 — 2026-06-06 (11-agent sweep; counts …7→1→2 — stabilising low)
- **completed_date not stamped on non-signature completion** (MED). Marking a job done
  via the status dropdown / field-mode Complete / web action bar passed only
  `{status:'completed'}`; `useUpdateJob` never stamped `completed_date` (only the
  signature flow did), so Completed Date stayed "-" and every completed_date reader
  (service-history order, MTTR, open-jobs sparkline) was wrong. Now stamps it on
  transition to completed (and clears it if moved back out — guarded so unrelated
  patches never touch it). Native mobile already set it.
- **Report-builder `between` upper bound off-by-one** (MED). A date-only upper bound vs
  a timestamptz column excluded the whole end day. Extended to end-of-day (mirrors the
  use-advanced-reports fix).
- LOW: report-builder CSV/PDF exports used raw field keys (`property_id`) as headers
  instead of the human labels shown in the preview → now use `DatasetField.label`.

### Convergence pass 10 — 2026-06-06 (FINAL — **0 verified bugs**, loop is dry)
Counts across the 10 genuine passes: **8 → 4 → 7 → 6 → 5 → 7 → 1 → 2 → 2 → 0**. Pass 10
returned zero confirmed bugs (the convergence signal) plus 2 minor LOWs, both fixed:
- compliance schedule generator ignored the **'daily'** frequency (fell back to a 30-day
  cadence) → added `daily: 1` to FREQUENCY_DAYS.
- portal Visits **"Past"** tab listed visits oldest-first → now most-recent-first.
~45 confirmed functionality bugs fixed across the 10 passes (≈10 HIGH/critical), each
adversarially verified, gate-green, committed, and deployed. No HIGH/critical findings
after pass 6. **The convergence loop is complete.**

### Convergence pass 9 — 2026-06-06 (11-agent sweep; counts …1→2→2 — polish-level steady state)
- **Bulk "Completed" didn't stamp completed_date** (MED, follow-on to pass 8). The Jobs
  bulk status action bypasses `useUpdateJob`, so bulk-completed jobs kept a NULL
  completed_date. `performStatusChange` is now table-aware: for jobs it stamps
  completed_date on complete and clears it on move-out (undo snapshot covers it).
- LOW: assets register ignored `?property_id=` (the property "Assets" tile showed the
  whole portfolio) → now reads the param and filters. Report-builder same-zone drag
  reorder was off-by-one on left→right drops (item landed one slot too far) → target
  index decremented when from < to.

### Failure-class review — 2026-06-06 (36-agent crash/break-focused sweep)
After the functionality convergence reached zero, a sharper review hunting only
crash/failure-class bugs (boot/auth, routing/lazy, critical writes, null-deref, async,
prod/config, edge fns, mobile) found 3, all fixed:
- **🔴 PublicRoute infinite spinner** (HIGH). If a session exists but the profile lookup
  times out (auth context sets profile=null + loading=false permanently), `/login` etc.
  spun forever with no recovery (the sibling gates have escape hatches; this one didn't).
  Added a bounded grace period after which the public page renders so the user can retry.
- **Assets edit/new area dropdown** (MED) — the `areas` query had no rejection handler, so
  a failed query left the field spinning forever. Added a 2nd `then` handler (the
  PostgREST builder is a thenable without `.catch`).
- **Mobile signature save** (MED) — `saveSignature().then()` had no rejection handler (can
  reject on the offline AsyncStorage path) → silent failure. Now alerts.

## 🧑‍💻 Dev-team QA loop (10-cycle functionality sweep)
Operator directive: a parallel "developer team" hunts FUNCTIONALITY/UX errors
(broken flows, validation, async/state, navigation, formatting) each cycle, then
debug+fix → verify → deploy. Distinct from the data-layer audits above.

### Cycles 2–10 — 2026-06-05 (run as one batch) — ~30 functionality bugs fixed
Ran ~8 parallel specialists across every flow (settings/auth · portal/site · jobs/
scheduler/maintenance/field · quotes/invoices/PO/payments · compliance/docs/reports ·
shared components · mobile screens), plus a verification wave. The app was broadly
sound; fixed every real defect found (4 commit batches). Highlights:

**HIGH (fully broken flows):**
- **Role-set inconsistency (lockout).** `manager` was offered in the invite UI + DB +
  RPC but isn't a valid profiles.role and has no permission map → invited managers were
  AccessDenied everywhere; conversely the edit-role RPC rejected finance/client_admin/
  auditor. Migration **00085** + UI lists + invite edge fn (v3) aligned to the real
  assignable set (org_admin/scheduler/finance/engineer/client_admin/auditor).
- **Password reset was a dead end** — recovery email → /login bounced the session into
  the app with no set-password screen. Added a `/reset-password` route + screen.
- **Quote→Invoice dropped tax + never wrote subtotal** → converted invoices showed
  "Subtotal £0 · VAT (NaN%)". Both convert call sites now pass tax; hook persists subtotal.
- **New-Job "Suggest engineer" silently dropped the pick** → now assigns it.
- **Report builder broken**: engineers dataset used phantom `engineer_type`/`is_active`
  (→ whole report 400'd) → real `trade`/`status`; relation columns printed raw UUIDs →
  `cellDisplay` shows the embed; actions/quote enums stale; the seeded "PPM due in 30d"
  template pointed at an unregistered `maintenance_plans` dataset → registered it.
- **MOBILE "Today" tab permanently empty** (`scheduled_date === today` timestamp-vs-date
  never matched) → date-part compare. **MOBILE auto-assigned jobs invisible** (engineer_
  assignments.engineer_id can be a profile OR engineers id; mobile matched only one) →
  matches both.

**MED:** invoice ageing counted not-yet-due/cancelled as overdue; scheduler availability
counts used `.eq` on a timestamptz (missed timed jobs); auto-assign "Assign top" assigned
#1 on every row → each row assigns its own engineer; portal compliance cards ignored the
property filter; profile/org saves didn't refresh the auth context (stale topbar) →
`refreshProfile()`; quote approve/reject notification silently died (created_by unset).

**LOW:** maintenance `daily` advanced a month; add-payment had no overpayment guard;
Xero/QB breadcrumb path; undefined `status-due` token; portal dead "Internal View" link +
map-click no-op; mobile jobs filter/badge stale status sets.

**Verified live:** profile-phone write; role migration applied; build/lint/tests green
across web + mobile. **Documented follow-ups (not yet fixed):** site (`tenant_user`)
surface document/service-report downloads 403 — needs a scoped tenant-storage solution
(storage RLS for property_contacts or a signing edge fn), deferred rather than ship an
unverified broad storage policy; portal site-switcher still doesn't filter visits/docs/
invoices/quotes; rolling-vs-fixed PPM `schedule_mode` is not yet honoured; orphaned portal
invoice/quote detail pages lack inbound links; super_admin edit-role select placeholder.

### Cycle 1/10 — 2026-06-05
Dispatched 3 specialists (forms/CRUD · async/state/nav · lists/filter/format).
Codebase came back largely clean; fixed every real defect found:
- **🔴 HIGH — Scheduler job links 404'd.** `scheduler/index.tsx:312` linked
  `/jobs/:id` but the route is `/dashboard/jobs/:id` → every job-title click hit the
  NotFound catch-all. Fixed the path.
- **MED — Adding a note didn't refresh the list.** `use-notes.ts` invalidated a
  fully-specified key `['notes', property_id, asset_id, …]` where unset FKs come back
  as `null`, but the query keys them `undefined`; TanStack v5 treats null≠undefined
  so the active query never matched. Switched to the `['notes']` prefix.
- **MED — Profile phone silently discarded.** `settings/profile.tsx` rendered+validated
  a phone field but never hydrated it and saved only `full_name` — yet `profiles.phone`
  is a real column. Now hydrates `profile.phone` + persists it (added `phone` to the
  `UserProfile` type). Verified live: the phone write persists.
- **LOW — Property CRUD left the status-portfolio list stale.** Property mutations
  invalidated `['properties']` but not `['properties_with_status']` (the map/grid +
  portal portfolio key). Added it to all 4 mutations.
- **LOW — Invoice "VAT (20%)" label hardcoded.** Now derives the rate from the stored
  tax/subtotal (matches the iter-11 fix that made the amount non-hardcoded).
- Deferred (low/needs-investigation): user-edit role dropdown missing some options;
  contract `value` has no input; routine-template `biannual` vs `six_monthly` (on a
  possibly-absent table); accreditation days-left off-by-one in negative-UTC (n/a for
  en-GB). Will revisit in later cycles.
**Nine correctness surfaces swept: (1) web write schema (iter 9); (2) cross-tenant
isolation/RLS (iter 10); (3) money-math (iter 11); (4) FK on-delete (iter 12); (5)
MOBILE writes (iter 13); (6) EDGE-FUNCTION writes (iter 14); (7) read-side embeds
(iter 15); (8) realtime/cache (iter 16); (9) FRONTEND route/role/tenant access control
(iter 18).** Codebase clean by construction (`noUnusedLocals` on; no disabled tests).

> **Remaining work is blocked on operator inputs:** O1 + card-up-front billing
> (Stripe `sk_test_` key), custom-domain email (Resend DNS for sitesentriq.com),
> HIBP leaked-password protection (Supabase Pro plan — flag is plan-gated). Drop in
> a key to unblock.

---

## 🔴 Open bugs (prioritised)

| # | Sev | Area | Issue | Exploitable now? |
|---|-----|------|-------|------------------|
| O1 | HIGH | billing | `stripe-checkout` trusts `orgId` from the request body + accepts anonymous calls → a caller could write a subscription onto another org via the webhook. | **No** — billing not wired (no `STRIPE_*` secrets; fn returns "Billing not configured"). Fix while wiring card-up-front. |

_O2–O10 + N1–N8 + C1–C17 fixed (see below). Only O1 (billing, not exploitable
until Stripe wired) remains._

---

## ✅ Fixed (this loop)

### Loop iter 18 — 2026-06-05 — frontend route access-control audit (a fresh lens)
Audited every React-Router route as a (route × role × tenant-surface) matrix —
the one surface the data-layer (RLS) audits hadn't covered. **Confirmed solid:**
all sensitive routes — settings/org/billing/team/users/integrations/SLA/branding/
GDPR-export/import/audit-log — are correctly `RoleRoute`-gated to org_admin/super_admin
(engineer/auditor/scheduler/finance get AccessDenied); `/site/*` is correctly
`tenant_user`-only; public/token routes leak nothing. One real gap:
- **C17 (MED) — surface isolation: the dashboard ↔ portal boundary leaked both ways.**
  `/dashboard/*` only redirected admins to onboarding — it never bounced EXTERNAL
  tenant roles, so a `client_admin` could deep-link the internal staff dashboard
  (its read-perms cover compliance/properties/invoices/etc.); and `/portal/*` was
  auth-only (`ProtectedRoute`), so ANY authed user incl. internal staff could load
  the customer portal. Data was already RLS-scoped (no cross-tenant read, no extra
  write), so it was wrong-surface chrome/info-presentation bleed, not a breach.
  **Fixed** by enforcing the app's own canonical landing mapping
  (`public-route.tsx`/`auth/invite.tsx`: `tenant_user → /site`, `client_admin →
  /portal`, staff → `/dashboard`) at BOTH layout boundaries — `DashboardLayout`
  now redirects tenant_user→/site & client_admin→/portal; `PortalLayout` redirects
  any non-`client_admin` out — mirroring the existing correct `SiteLayout` guard.
  (Lower-sev F3 archives / F4 knowledge-base / F5 field-route findings are now
  staff-only as a side-effect of this fix; their remaining intra-staff gating was
  left as-is to avoid over-restricting legitimate staff — KB writes stay org-scoped
  per RLS by design. `ProtectedRoute.allowedRoles` was also confirmed dead code.)

### Loop iter 16 — 2026-06-05 — realtime/cache audit (clean) + extended live coverage
Audited the last correctness surface: Supabase Realtime + TanStack Query cache
invalidation. **Verified CLEAN:** the broadcast trigger (`fos_broadcast_org_table_change`)
publishes to `org:<id>:changes` — an exact match with the client's subscribe topic;
the INSERT/UPDATE/DELETE event names align; and all 13 live tables are in BOTH the
`supabase_realtime` publication (postgres_changes fallback) AND the broadcast trigger.
Mutation invalidations use prefix-keyed `['entity']` keys so local writes refresh too.
- **Feature — extended live cross-client refresh to 3 commercial entities.** `contracts`,
  `purchase_orders`, and `suppliers` were missing realtime entirely (no broadcast
  trigger, not in the publication, no client invalidation entry), so when one user
  created/edited one, other users' lists didn't update until a manual refresh.
  Migration **00084** adds the broadcast trigger + publication membership for all
  three (mirroring jobs/invoices/etc.), and the client `TABLE_INVALIDATIONS` map now
  invalidates `['contracts']`, `['purchase_orders']`+`['supplier_po_counts']`, and
  `['suppliers']`. All three are org-scoped RLS, so realtime respects tenancy.
  Verified: all 3 now in the publication + carry the trigger.

### Loop iter 15 — 2026-06-05 — read-side embedded-`.select()` relationship audit
Completed the schema-correctness sweep with the READ side: validated every
embedded PostgREST relationship (`.select('*, properties(name), engineer_assignments
(profiles:engineer_id(...))')`) across ~40 web sites against the live FK graph. A
wrong/ambiguous embed → PGRST200 → the whole list/detail page 400s. **Result: the
read side is clean — 0 page-breaking embeds.** All `profiles:engineer_id` hints,
single-FK `clients(...)` embeds, and `!inner` joins resolve correctly; `actions`'
two FKs to profiles are never embedded ambiguously. One dead-code cleanup surfaced:
- **C16 (LOW — dead inference made working) — cert auto-mint never inferred a type
  from the asset/compliance signals.** `lib/certificates/auto-mint.ts` resolved a
  job's certificate type via `inferFromLinkedAsset` (queried a non-existent
  `job_assets` table + phantom `jobs.asset_id`) and `inferFromLinkedComplianceItem`
  (phantom `compliance_items.related_job_id`) — both always threw (caught) and
  returned null, so auto-mint silently fell back to **title parsing only** + wasted
  2–3 DB round-trips per mint. Replaced both with one `inferFromComplianceItem` that
  walks the REAL chain `jobs.compliance_item_id → compliance_items(compliance_type,
  assets:asset_id(category))`. Now the cert type is inferred from the actual
  compliance item / asset category. **Verified live:** the FK chain + embed resolve.

### Loop iter 14 — 2026-06-05 — edge-function DB-write correctness audit
Audited every DB write/filter across all ~38 edge functions vs the live schema
(the server-side parallel to iter 9's web-write sweep). Most are clean; the bugs
clustered in GDPR + the un-wired accounting/OAuth integrations:
- **🔴 C13 (CRITICAL — GDPR compliance) — `gdpr-delete` note redaction silently
  failed.** It updated `notes.body` filtered by `author_id` — **neither column
  exists** (real: `content` / `user_id`), so on every erasure the redaction threw
  (swallowed by `safe()`) and the data subject's note text was **never redacted**.
  Fixed to `content` + `user_name` redaction filtered by `user_id`. Redeployed v3.
- **C14 (MED — GDPR compliance) — `gdpr-export` silently omitted 5 data sections.**
  The Article-15 export filtered phantom columns: `time_entries.user_id`,
  `field_events.user_id`, `engineer_assignments.user_id` (real: `engineer_id`),
  `notes.author_id`, `timeline_events.actor_id` (real: `user_id`). Each section
  errored (swallowed by `grab()`) so the subject's export was **incomplete**.
  Fixed all five to the real columns. Redeployed v3.
- **🔴 C15 (CRITICAL-on-path) — 5 integration fns read a non-existent
  `user_profiles` table.** `slack-oauth`, `xero-oauth`, `quickbooks-oauth`,
  `quickbooks-push-invoice`, `xero-push-invoice` all did
  `.from('user_profiles').select('organisation_id').eq('id', userId)` — the table
  is `profiles` — so org resolution returned nothing and **every Slack/Xero/
  QuickBooks connect + invoice-push 400'd**. (Not reachable until those OAuth
  integrations are wired, but broken by construction.) Renamed to `profiles`,
  redeployed all 5 v3.
- **Everything else clean.** All other edge-fn writes use real columns + valid
  enums (verified email_log/slack_post_log/accounting_sync_log status literals,
  certificates, compliance snapshots, auto-assign writes, etc.). No edge fn calls
  any `.rpc()`. All corrected columns verified live.

### Loop iter 13 — 2026-06-05 — mobile field-engineer app: entire workflow was broken
Pivoted to the previously-unaudited **mobile (Expo) app**. Cross-checked every
mobile Supabase write/read filter against the live schema. The field-engineer
workflow — the whole point of the mobile app — was **built against a stale `Job`
type full of columns that never existed**, so the core writes threw at runtime AND
poisoned the offline queue (each replay re-threw forever, so reconnect never
recovered the field work).
- **🔴 C12 (CRITICAL) — mobile job list + check-in/out + signature + photo all broken.**
  - `useJobs.fetchJobs` filtered `jobs.assigned_engineer_id` (no such column) →
    the engineer's **job list 400'd and never loaded**. Fixed to inner-join
    `engineer_assignments.engineer_id = user.id` (the real link, mirrors web).
  - `checkIn`/`checkOut` wrote `checkin_at/checkin_lat/checkin_lng` /
    `checkout_*` (none exist) → every check-in/out threw `PGRST204`. Fixed to the
    real columns `arrived_at`/`working_started_at`/`completed_date` + `status`,
    and the GPS now goes to `field_events` (event_type `arrived`/`working_completed`
    + latitude/longitude) where it belongs.
  - `saveSignature` wrote `customer_signature_url`/`engineer_signature_url`
    (neither exists) → signature save threw. Fixed to the single real `signature_url`
    column (+ `customer_signature_at` for the customer); `submitServiceReport` now
    reads the real `signature_url`.
  - Photo metadata insert used `photo_type: 'on_site'` (CHECK allows
    before|after|issue|general) → every gallery row insert + offline replay threw.
    Fixed to `'general'`.
  - Also rewrote the stale `Job` interface (`lib/supabase.ts`) to the real columns
    + status enum, and updated the job-detail screen + JobCard reads (button gating
    on `arrived_at`/`completed_date`, time from `time_start`/`time_window`).
  **Verified live:** check-in/out patches, the field_events GPS insert, the
  signature patch, and the `general` photo insert all succeed against the real
  schema; mobile tsc 0 errors, 15/15 offline-queue tests pass.

### Loop iter 12 — 2026-06-05 — FK on-delete / data-integrity audit
Pivoted to data-integrity: mapped every FK's `ON DELETE` action and cross-checked
it against every parent-delete the app exposes. The main client→property→asset→job
tree was already cascaded (00041); the `organisation_id`/`created_by`/`uploaded_by`
refs at NO ACTION never block (orgs aren't deleted; members are *detached*, not
row-deleted). Three parent-delete buttons touched child FKs left at NO ACTION:
- **C11 (MED) — deleting an Area or a Subcontractor threw an opaque FK error.**
  `useDeleteArea` (assets.area_id) and `useDeleteSubcontractor` (jobs.subcontractor_id)
  hit `NO ACTION` FKs, so deleting one that had assets/jobs failed with a raw
  Postgres error and the delete silently aborted. Both columns are NULLABLE, so
  migration **00083** sets them to `ON DELETE SET NULL` — the child detaches and
  survives (an asset shouldn't vanish with its area; a historical job shouldn't
  vanish with a subcontractor, it just becomes unassigned). subcontractor_documents
  already CASCADEs (correct). **Verified live:** deleting an area now succeeds and
  the asset survives with `area_id = NULL`.
- **Supplier delete was already safe.** `purchase_orders.supplier_id` is NOT NULL
  (SET NULL impossible; CASCADE would destroy financial records), so blocking is
  correct — and `useDeleteSupplier` already catches the FK violation and shows
  "this supplier has purchase orders. Mark inactive instead." No change needed.

### Loop iter 11 — 2026-06-05 — money-math correctness audit (invoice tax)
Pivoted to the logic-correctness class. Audited every money path (quote/invoice/PO
line→header totals, tax, markup, client-vs-DB-trigger divergence) + analytics KPIs
+ compliance score + date math. The quote & PO pipelines reconcile correctly
(client values match the `fos_recalculate_*` triggers); analytics/score/date logic
clean. One real customer-facing money bug, same root cause across two spots:
- **🔴 C9 (HIGH) — invoice detail showed a hardcoded 20% tax on the PDF/email.**
  `invoices/[id].tsx` computed `tax = subtotal * 0.2; total = subtotal + tax`,
  ignoring the STORED `invoice.tax`/`invoice.total`. There is **no DB trigger on
  invoices**, so the stored amounts are the source of truth — a quote→invoice
  conversion carries the quote's actual VAT (may not be 20%). The on-screen
  breakdown, the **downloaded PDF**, and the **emailed amount-due** all showed the
  invented 20%, while "Amount Due"/"Mark Paid" used the real stored total → the
  document and the payable amount disagreed. Fixed to derive `subtotal =
  invoice.subtotal ?? Σlines`, `total = invoice.total ?? subtotal`, `tax =
  invoice.tax ?? max(0, total−subtotal)` — mirrors the already-correct portal page.
- **C10 (HIGH — feature gap behind C9) — manual new-invoice form had no tax.**
  `invoices/new.tsx` stored `total = subtotal` (tax-exclusive, no tax input), so
  the detail page then invented 20%. Added a **Tax Rate (%)** field (default 20),
  and the form now computes + stores `subtotal`/`tax`/`total` (rounded to 2dp) with
  a live Subtotal/Tax/Total summary. Also fixed the out-of-sync `Invoice` TS type
  (was missing `subtotal`/`tax`/`property_id`/`notes`/`created_by`/`tags`/`updated_at`).

### Loop iter 10 — 2026-06-05 — cross-tenant isolation audit (RLS tables + edge fns)
Pivoted from the schema class to the security class. Two systematic sweeps:
(a) every public table's RLS posture, (b) all 37 edge functions for the
service-role-without-caller-org-check pattern. The layer is strong — only two
genuine issues, both fixed:
- **🔴 O10 (CRITICAL) — `weekly-digest` cross-tenant data exfiltration.** The fn
  is `verify_jwt=true` but never resolved WHICH user called it; its preview path
  trusted `body.orgId` + `body.recipient` and emailed THAT org's compliance/jobs/
  actions summary (built with the service role) to any address. Any authed user
  could POST `{preview:true, orgId:<victim>, recipient:<self>}` and receive
  another tenant's portfolio. **Fixed:** added `resolveCaller` (JWT → profile);
  preview now pins org+recipient to the CALLER's own (body fields ignored for
  user callers); the org-wide batch sweep is gated to `service_role` only (the
  cron sends the service-role JWT, verified). Redeployed v3. Verified live:
  unauthenticated cross-tenant POST → 401 at the gateway.
- **O9 (LOW/MED — abuse) — permissive org INSERT policy.** `organisations` had an
  INSERT policy `WITH CHECK (true)` for `authenticated` → any signed-in user could
  spam arbitrary org rows / squat slugs. It was a leftover; org creation only ever
  happens via the `handle_new_user` trigger + `claim_workspace` RPC (both SECURITY
  DEFINER, bypass RLS) and no app code does a direct org insert (grep-confirmed).
  Migration **00082** drops it; SELECT/UPDATE org policies (org-scoped) untouched.
- **Everything else clean.** All org-column tables are `organisation_id()`-scoped;
  the 3 non-org-scoped ones are correctly `user_id=auth.uid()` (push/calendar
  tokens) or fully locked (trust_subscriptions, edge-fn-only). The other 36 edge
  functions either derive org from the caller's own profile, check caller-org ==
  target, or are public-by-design (token/signature/cron). (O1 stripe-checkout was
  re-confirmed as the known billing gap — fix when Stripe is wired.)

### Loop iter 9 — 2026-06-05 — full schema-vs-code write audit (the systematic sweep)
Rather than hunt one area at a time, ran a COMPREHENSIVE cross-check of all 137
`.insert()/.update()` sites in the web app against a dump of the live schema
(every table's real columns + every enum CHECK). The recurring class (UI written
against non-existent columns/constraints) is now **swept clean** — only one new
bug surfaced:
- **🔴 C8 (CRITICAL on its path) — field-mode photo upload always failed.**
  `routes/field/index.tsx` uploaded to a `field-uploads` storage bucket **that
  does not exist** (verified live: only `job-photos` exists) AND inserted a
  phantom `file_name` column into `job_photos` (real cols: …, caption, photo_type,
  …). Both threw → every online field-photo capture fell through to the offline
  queue and never persisted online. Fixed to mirror the canonical
  `useUploadJobPhoto`: upload to `job-photos` with an org-prefixed path
  (`${orgId}/${jobId}/…`, required by bucket RLS 00059), drop `file_name` (the
  filename now goes in `caption`), and guard on a missing org. Verified live: a
  `job_photos` insert with the corrected column set succeeds.
- **Everything else clean.** All enum-bearing forms match their CHECK lists; all
  direct inserts that need `organisation_id` supply it; no other phantom columns.

### Loop iter 8 — 2026-06-05 — actions resolution + document versioning (schema/UI sync)
Two whole UI features were built against DB columns/constraints that never
existed → every write threw. Verified live: 0 `actions` rows existed, confirming
the actions feature had been 100% dead. Fix = migration **00081** making the
schema match the shipped UI (not ripping the features out), then re-verified both
write paths live (insert with the exact column/enum set the app sends).
- **🔴 C6 (CRITICAL) — actions could not be resolved or closed.** The module
  (constants `ACTION_STATUSES`, actions/index filters, actions/[id] buttons) uses
  the lifecycle `open → in_progress → resolved → closed`, but `actions_status_check`
  only allowed `open/in_progress/completed/cancelled` → "Mark Resolved"/"Close"
  hit a CHECK violation. Also `resolution_notes` was written + displayed but the
  column didn't exist. 00081 re-points the CHECK to the real lifecycle + adds
  `resolution_notes text`. (Priority `critical` was already in the DB CHECK — the
  hunt's "critical rejected" flag was a FALSE positive, confirmed live.)
- **🔴 C7 (CRITICAL) — document upload 100% broken.** `use-documents` inserts
  `version` (and reads max(version) for the PRD version-tracking feature) +
  `compliance_item_id` (the compliance proof-upload link), neither of which
  existed → every upload threw "column … does not exist". 00081 adds
  `documents.version int not null default 1` + `documents.compliance_item_id uuid
  → compliance_items(id) on delete set null`, plus the supporting (org,name,version
  desc) + partial compliance-item indexes. TS types already had both fields.

### Loop iter 7 — 2026-06-05 — contract creation + analytics accuracy + PPM rollover
- **🔴 C1 (CRITICAL) — contract creation 100% broken.** `contracts/new.tsx` sent
  raw Zod data straight to `useCreateContract` (direct insert) with (1) no
  `organisation_id` (NOT NULL, no trigger, RLS `WITH CHECK` requires it), (2) no
  `title` (NOT NULL), (3) phantom columns `frequency_commitments` (real col is
  SINGULAR) + `renewal_reminder` (never existed), (4) invalid status `renewal_due`.
  Every submit threw. Rewrote the schema + onSubmit to inject `profile.organisation_id`,
  add a required Title field, map ONLY real columns, and constrain status to the
  DB CHECK set (`draft/active/expired/cancelled`). **Also fixed the out-of-sync
  `Contract` TS type** (was missing `title`/`value`, had plural `frequency_commitments`
  + phantom `renewal_reminder`) and the detail page (`[id].tsx`) that read those
  dead fields — it now shows Contract Value + the singular frequency column.
  **Verified live:** a direct insert with the exact column set the form now sends
  succeeds against the real schema (NOT NULLs satisfied, no phantom columns).
- **C2 (MED) — overdue-visits KPI inflated.** `useOverdueVisits` counted any
  past-dated job that wasn't `completed` — so `cancelled` + `failed_access` visits
  were wrongly counted as overdue. Now excludes `(completed,cancelled,failed_access)`.
  Verified those are valid `jobs.status` values.
- **C5 (MED) — at-risk-clients never flagged payment risk.** `fetchAtRiskClients`
  tested `inv.status === 'overdue'`, but the app never persists that status —
  overdue is derived. Now selects `due_date` and flags invoices that are
  outstanding (not paid/cancelled/draft) AND past due. Verified against the live
  `invoices.status` CHECK set.
- **N7 (LOW) — PPM fallback never rolled `next_due` forward.** The RPC-missing
  JS fallback in `useGenerateJob` inserted a job but left `next_due` unchanged →
  the same visit could regenerate forever. Added an `advanceDueDate` helper
  mirroring the DB's `fos_frequency_interval()` and now updates the plan's
  `next_due` after the fallback insert.

### Loop iter 6 — 2026-06-05 — storage batch + offline-queue race + mobile typecheck
- **N3 (HIGH) — engineer/subcontractor/signature uploads rejected by org-prefix
  RLS.** Prefixed all upload paths with the org id (`${orgId}/…`) in
  engineers/[id], subcontractors/[id], engineer-info-card (signature). Also
  signed the display sites (use-engineers / use-subcontractors embedded docs +
  the signature `<img>`).
- **N4 (HIGH) — documents Download links 403'd** on the private `documents`
  bucket. use-documents now batch-signs at read time (mirrors use-job-photos);
  Download href uses the signed URL.
- **N5 (MED) — org-logo + avatar broken images.** These are branding assets
  embedded in PDFs/emails/public portals where signed URLs would expire, so made
  ONLY org-logos + avatars public-read (00080); writes stay org-prefix RLS-scoped.
  Verified: those two buckets `public=true`, sensitive buckets still private.
- **N6 (MED) — offline-queue data-loss race.** Added an async mutex
  (`withQueueLock`) serializing every read-modify-write; the drain now rebuilds
  from the CURRENT queue (drop successes, keep mid-drain enqueues) instead of
  clobbering with a stale `writeQueue(remaining)`. No upfront clear → no crash-loss.
- **N8 (LOW) — mobile typecheck broken.** `Omit<OfflineAction(union), …>` dropped
  per-variant `table`; added a distributive `NewOfflineAction` type. Also fixed a
  pre-existing `Uint8Array`/`BlobPart` mismatch. **Mobile `tsc --noEmit` is now
  fully clean (0 errors)** + offline-queue tests pass (15/15).

### Loop iter 5 — 2026-06-05 — notifications system + job-photo uploads
- **🔴 N1 (CRITICAL) — in-app notifications 100% dead.** The `notifications`
  column is `link` (00001) but every insert used `link_url` (a non-existent
  column) → all inserts threw. Verified: **0 notification rows existed in the
  entire DB.** Fixed `link_url`→`link` in `lib/notifications.ts` (×2),
  `notification-row.tsx` (type + read/navigate), `notify-renewals` (redeployed
  v3), and the `apply_stock_movement` trigger (00079). Also fixed `stripe-webhook`
  (the O2 bug): `type`→`notification_type`, `body`→`message` (redeployed v3).
  **Verified live:** an authenticated insert with the corrected columns now
  succeeds (was the previously-dead path); INSERT RLS allows same-org rows.
- **🔴 N2 (CRITICAL) — job-photo uploads rejected by org-prefix RLS.** The
  job-photos bucket (00059) requires `foldername[1] = caller org_id`, but web
  uploaded under `${jobId}/…` and mobile under `job-photos/${id}/…` → all
  uploads failed. Fixed both to `${orgId}/${jobId}/…` (read side splits on
  `/job-photos/`, unaffected).
- **Stock movements were also fully broken** — `apply_stock_movement` (00079)
  had `search_path TO ''` + UNQUALIFIED table refs (same 00058 class as the
  org-creation chain) → every stock movement failed. Qualified all refs.

### Loop iter 4 — 2026-06-05 — close O8 (org/role write lockdown)
- **O8 — org-less self-join + direct privilege writes.** Added `claim_workspace`
  RPC (00077): an org-less caller creates a NEW org + becomes org_admin
  server-side (never joins an existing org). Switched the auth-context boot
  fallback from a direct org insert + profile write to this RPC. Then tightened
  the privilege-change trigger (00078) to block ALL direct (authenticated)
  role/organisation changes — not just the in-org case.
  **Verified live:** org-less user → `claim_workspace` creates org + admin +
  seeds (5 templates, trial); second call → "already in a workspace" (403);
  org-less direct PATCH self-join into an existing org → 0 rows (also blocked at
  the RLS layer, which is org-scoped — defense in depth). The old direct-write
  fallback was in fact already RLS-blocked for org-less users, which is why the
  definer RPC was the right fix.

### Loop iter 3 — 2026-06-05 — team management + privilege-escalation fix
- **🔴 O7 (CRITICAL) — self privilege-escalation.** The only `profiles` UPDATE
  policy was `profiles_update_own` (id = auth.uid()) with NO column restriction,
  so any user could PATCH their own `role` to `org_admin`. Fixed with a BEFORE
  UPDATE trigger (`profiles_block_privilege_change`) that blocks direct changes
  to role/organisation once a user is in an org. **Gotcha caught live:** the
  trigger was first written SECURITY DEFINER → `current_user` is always the
  owner → guard never matched → attack still passed. Recreated SECURITY INVOKER
  (00076) so `current_user` is the real effective role. Verified: engineer
  self-escalate via PATCH → 403; via the admin RPC → "not authorised"; benign
  full_name self-update → 200.
- **Team-management completeness** — admin-gated SECURITY DEFINER RPCs (00075):
  `admin_update_member` (role/name, last-admin guard), `admin_remove_member`
  (detaches from org, no-self-remove + last-admin guards), `admin_revoke_invitation`.
  Settings → People rewired to the RPCs (the old direct profile writes were
  silently RLS-blocked) + a Revoke button added on pending invitations.

### Loop iter 2 — 2026-05-31
- **O3 (HIGH) — `invite-team-member` false "join automatically".** Existing-account
  invitees were told they'd join automatically, but the trigger only links on
  NEW user creation. Now resolved honestly by the existing account's current org
  (single-org model): orphan (no org) → linked directly + invite accepted; same
  org → `already_a_member`; different org → `belongs_to_another_workspace` (clear
  message, dangling invite revoked). Settings UI maps the new code. Deployed v2.
- **O4 (MED) — tenant quote tamper.** The `quotes_update_tenant` policy let a
  tenant write ANY quote column. Replaced with a SECURITY DEFINER RPC
  `tenant_set_quote_decision` (status approved/rejected only, scoped to the
  tenant's property) + dropped the broad UPDATE policy (00074). Client switched
  to the RPC. Verified: policy gone, RPC live.
- **O5 (MED) — invoice tax not carried.** Quote→invoice convert left the invoice
  `tax` column at 0 while `total` included tax, so the breakdown didn't
  reconcile. Now carries `tax: quote.tax` onto the invoice header.
- **O6 (LOW) — invite role metadata.** `/invite` read `user_metadata.role` but
  the fn writes `invited_role`; fixed the read.

### Loop iter 1 — 2026-05-31
- **🔴 CRITICAL — `site-accept-invite` account takeover.** The accept path
  overwrote an existing account's password (`updateUserById(existing.id, {password})`)
  with whatever the invite-accepter typed → anyone holding an invite token for
  a known email could seize that account. **Fixed:** never reset an existing
  account's password; verify the typed password via sign-in FIRST (an attacker
  can't pass it), only activate the contact after, return 409 `account_exists`
  for existing accounts with a wrong password. Deployed v3.
- **🔴 CRITICAL — `auto-assign-job` cross-tenant access.** Validated the JWT but
  never checked the caller's org against the job's org; loaded the job with the
  service role (RLS bypassed) → any authed user could pass another org's job_id
  to enumerate its engineers + trigger assignment writes. **Fixed:** assert
  caller's `profiles.organisation_id === job.organisation_id` and role ∈
  {org_admin, manager, scheduler}; 403 otherwise. Deployed v3.

---

## ✅ Fixed (prior sessions — condensed)

### Account / signup / auth
- **Org creation broken for ALL new orgs since 00058** — empty `search_path` +
  unqualified refs in the `organisations` insert-trigger chain rolled back the
  org. Fixed in 00069/00070/00071 (qualify the chain). Verified live.
- **Signup org provisioning** moved into `handle_new_user` (00066), exception-safe,
  collision-safe slug. Two real orphaned accounts back-filled.
- **"Email already registered" fake success** — Supabase anti-enumeration returns
  200 + empty `identities`; register page showed "Check your email" forever.
  Fixed: detect empty identities → "You already have an account" screen (0.23.2).
- **Invite-only team join** — `organisation_invitations` table (00073) +
  `invite-team-member` edge fn + secure trigger match by verified email (NOT
  metadata). Kills the duplicate-org problem (0.24.0).
- **Slug removed from signup** — derived from company name, collision-safe
  server-side; form now asks name/company/email/password only (0.24.2).
- **Production auth email** — Resend SMTP wired (sender `noreply@ourcommune.io`,
  rate 30/h). `RESEND_API_KEY`/`FROM_EMAIL` edge secrets set (were missing → all
  transactional email had been silently no-op'ing).
- **Internal cron/trigger functions** locked down (00072) — revoked anon/auth
  EXECUTE on 7 SECURITY DEFINER fns flagged by the advisor.

### Stale-chunk / deploy
- Vercel SPA rewrite tightened to exclude `/assets/` (MIME-type ChunkLoadError
  after deploy); broadened `isChunkLoadError` detection.

### Strategic Trio (shipped + E2E-verified)
- Trust-URL subscriptions (00067 + trust-subscribe + notify-trust-subscribers cron).
- One-click Tender Pack export (00068 + generate-tender-pack).
- Public live job tracking (live Leaflet map on /track/:token + share link).

### Design / quality
- Typography codemod (~2,150 `text-[Npx]` → `--text-*` tokens) + baseline lint gate.
- Theme-breaking status pills → tokens; brand-color contract reconciled.
- Auth pages use the sidebar `<Wordmark>` (consistent icon + text) (0.24.1).
- Prod console-drop via `@rollup/plugin-strip` (Vite 8/rolldown).

---

## 🚧 Missing features / roadmap

| Priority | Feature | Notes |
|----------|---------|-------|
| BLOCKED | **Card-up-front billing** | Waiting on Stripe `sk_test_` key. Plan: create products/prices/webhook via API → set secrets → deploy checkout (`payment_method_collection: always` staged) → `RequireBilling` hard gate grandfathering existing orgs → E2E with test cards. Fix O1+O2 as part of this. |
| ~~HIGH~~ DONE | **Team management completeness** | ✅ iter 3 — revoke/role-change/remove via admin RPCs + last-admin guards. Follow-up: full account deletion (edge fn) + O8 claim_workspace hardening. |
| ~~MED~~ DONE | **Tenant quote-decision RPC** | ✅ iter 2 (O4). |
| MED | **Custom domain email** | Verify `sitesentriq.com` in Resend → send from `noreply@sitesentriq.com` (Gmail deliverability; currently `ourcommune.io`). |
| LOW | **Edge-function deno-check cleanup** | 13 fns fail strict `deno check` (Supabase-client generic strictness + npm dep resolution). Non-blocking CI job surfaces them. |
| LOW | **Typography tail** | ~120 non-standard `text-[Npx]` sizes held by the baseline gate (not snapped). |

---

## Loop log
- **iter 18 (2026-06-05):** Resumed the loop with a fresh lens — frontend route
  access-control (route × role × tenant-surface matrix). All sensitive settings/
  billing/team/integration/audit routes confirmed correctly admin-gated. Found +
  fixed C17 (MED): the dashboard↔portal surface boundary leaked both ways
  (client_admin could deep-link the internal dashboard; any authed user incl. staff
  could load the customer portal). Data was RLS-scoped (no breach), but fixed by
  enforcing the app's canonical landing mapping at both layout boundaries (mirrors
  SiteLayout). Build/lint/test green. 0.24.18.
- **iter 17 (2026-06-05):** Plateau / full-system verification. Codebase confirmed
  clean by construction (noUnusedLocals on → no dead local code; no disabled tests;
  only 4 legit future-enhancement TODOs; auto-mint.ts left no cruft after iter 15).
  Ran the FULL multi-workspace suite: web build+lint+185 tests, mobile tsc+15 tests,
  marketing build — all green — and re-checked advisors after 00081–00084: 0 ERROR
  (security + perf). Tried to enable HIBP leaked-password protection but it's Pro-
  plan-gated (PATCH silently ignored). Concluded the systematic bug-hunt is complete;
  remaining work is blocked on operator-provided keys (Stripe/Resend) — paused the
  session loop with a handoff. No code change → no version bump.
- **iter 16 (2026-06-05):** Realtime + cache-invalidation audit (the last correctness
  surface). VERIFIED CLEAN: broadcast trigger topic matches the client subscribe
  topic, event names align, all 13 live tables in both the publication + broadcast
  trigger. Feature: extended live cross-client refresh to contracts/purchase_orders/
  suppliers (were missing realtime entirely) via migration 00084 + client invalidation
  map. Build/test/lint green. 0.24.17.
- **iter 15 (2026-06-05):** Read-side embedded-`.select()` relationship audit (~40
  web embeds vs the live FK graph). Read side is CLEAN — 0 page-breaking PGRST200
  embeds. One cleanup: C16 — cert auto-mint's type inference was entirely dead
  (queried a non-existent job_assets table + phantom jobs.asset_id +
  compliance_items.related_job_id), so it fell back to title parsing only. Rewrote
  to the real jobs.compliance_item_id → compliance_items(compliance_type, asset
  category) chain; removed the dead round-trips. Verified live. 0.24.16.
- **iter 14 (2026-06-05):** Edge-function DB-write correctness audit (server-side
  parallel to iter 9). All ~38 fns checked vs live schema. Found + fixed C13
  (CRITICAL: gdpr-delete note redaction wrote phantom notes.body/author_id → GDPR
  erasure never redacted note text), C14 (MED: gdpr-export filtered 5 phantom
  columns → incomplete Article-15 export), C15 (CRITICAL-on-path: 5 Slack/Xero/QB
  integration fns read a non-existent `user_profiles` table → all integrations
  broken; renamed to `profiles`). Redeployed 7 fns v3 (verify_jwt preserved);
  columns verified live. 0.24.15.
- **iter 13 (2026-06-05):** Audited the previously-untouched MOBILE (Expo) app's
  Supabase writes vs the live schema. Found C12 (CRITICAL): the ENTIRE field
  workflow was broken by a stale `Job` type — job list filtered a non-existent
  `assigned_engineer_id`; check-in/out wrote phantom `checkin_*`/`checkout_*`
  columns; signature wrote phantom `*_signature_url`; photos used an out-of-enum
  `photo_type:'on_site'`. All threw + poisoned the offline queue. Rewrote to real
  columns (arrived_at/working_started_at/completed_date/signature_url), engineer_
  assignments join, field_events for GPS, photo_type 'general'. Verified live;
  mobile tsc + 15/15 tests green. 0.24.14.
- **iter 12 (2026-06-05):** FK on-delete / data-integrity sweep. Mapped every FK's
  ON DELETE vs every parent-delete the app exposes. Main tree already cascaded
  (00041). Found + fixed C11 (deleting an Area / Subcontractor threw an opaque FK
  error — assets.area_id + jobs.subcontractor_id were NO ACTION; migration 00083
  sets both to SET NULL so children detach + survive; verified live). Supplier
  delete already handled (NOT NULL FK → friendly "mark inactive" message). 0.24.13.
- **iter 11 (2026-06-05):** Money-math correctness sweep (quotes/invoices/POs/
  analytics/compliance-score/dates). Quote & PO totals reconcile with the DB
  recompute triggers; analytics/score/date logic clean. Found + fixed C9 (HIGH:
  invoice detail hardcoded `subtotal*0.2`, overriding stored tax/total on the
  customer PDF + email — now derives from stored amounts, mirroring the portal
  page) and C10 (added a Tax Rate field to the manual new-invoice form, which had
  none and stored a tax-exclusive total; synced the Invoice TS type). 0.24.12.
- **iter 10 (2026-06-05):** Cross-tenant isolation sweep. Audited every table's
  RLS posture (org layer clean; only user-scoped/locked exceptions) + all 37 edge
  functions for the service-role-without-org-check class. Found + fixed O10
  (CRITICAL: weekly-digest preview leaked any org's summary to any authed user —
  added resolveCaller, pinned preview to caller's own org+email, gated batch to
  service_role; redeployed v3, verified 401 live) and O9 (dropped a permissive
  `organisations` INSERT `WITH CHECK (true)` policy, 00082). 0.24.11.
- **iter 9 (2026-06-05):** Systematic sweep instead of point hunt — dumped the
  full live schema (every table's columns + enum CHECKs) and audited all 137
  web write sites against it. Class now clean; one bug: C8 (field photo upload
  used a non-existent `field-uploads` bucket + phantom `file_name` column → every
  online capture failed into the offline queue). Fixed to the canonical job-photos
  path; verified live. Build/lint/test green, 0 ERROR advisors. 0.24.10.
- **iter 8 (2026-06-05):** Fresh hunt on un-covered areas (scheduler/jobs/docs/
  portal/actions). Found 2 CRITICALs where the UI was built against non-existent
  DB columns/constraints: C6 (actions resolve/close blocked by stale status CHECK
  + missing resolution_notes) + C7 (document upload threw on missing version +
  compliance_item_id). Both were 100% dead features. Migration 00081 aligns the
  schema to the shipped UI; re-verified both write paths live. One hunt finding
  (actions priority 'critical') was a false positive — already allowed. Build/lint/
  test green, 0 ERROR advisors. 0.24.9.
- **iter 7 (2026-06-05):** C1 (contract creation 100% broken — missing NOT NULL
  org_id/title, phantom columns, invalid status) rewritten + Contract TS type and
  detail page fixed; verified live. C2 (overdue-visits KPI excluded cancelled/
  failed_access), C5 (at-risk clients derive overdue from due_date), N7 (PPM
  fallback advances next_due). 0.24.8.
- **iter 6 (2026-06-05):** Storage batch — N3 (engineer/subcontractor/signature
  upload org-prefix), N4 (documents signed-URL reads), N5 (org-logos + avatars
  made public-read, 00080). N6 offline-queue mutex (no more silent field-write
  loss). N8 + a Uint8Array fix → mobile tsc fully clean (0 errors), offline tests
  15/15. Web build/lint/test green. Only O1 (billing) + N7 (LOW) remain. 0.24.7.
- **iter 5 (2026-06-05):** Fresh bug-hunt on un-covered areas. Found + fixed 2
  CRITICALs: N1 (in-app notifications 100% dead — link_url vs link column; 0 rows
  ever existed) across client + notify-renewals + stripe-webhook + stock trigger
  (00079), and N2 (job-photo uploads rejected by org-prefix RLS, web + mobile).
  Also fixed stock movements (00079 unqualified refs) + O2 (stripe-webhook cols).
  Verified notifications insert live. Logged N3-N8 (storage + offline + PPM).
  0.24.6.
- **iter 4 (2026-06-05):** Closed O8 — claim_workspace RPC (00077) replaces the
  auth-context direct-write fallback; trigger tightened to block ALL direct
  org/role writes (00078). Verified live (claim works + seeds, second-claim
  403, org-less self-join blocked by RLS + trigger). Only billing bugs remain.
  0.24.5.
- **iter 3 (2026-06-05):** Found + fixed O7 (CRITICAL self privilege-escalation
  via own-profile role PATCH) — trigger guard, with a DEFINER→INVOKER fix
  (00075/00076) after the first attempt failed a live attack test. Built
  team-management RPCs (admin_update_member / admin_remove_member /
  admin_revoke_invitation) with last-admin guards + wired the Settings UI
  (revoke button added). Logged O8 (org-less self-join residual). 0.24.4.
- **iter 2 (2026-05-31):** Fixed the 4 exploitable-now bugs (O3 invite honesty,
  O4 tenant quote RLS via RPC + migration 00074, O5 invoice tax, O6 invite role
  metadata). Only the 2 billing-path bugs (O1/O2) remain — deferred to billing
  wiring. Build ✓, lint 0 errors, 185/185 tests.
- **iter 1 (2026-05-31):** Established this doc. Verified core stable. Ran a
  bug hunt (8 real bugs found). Fixed + deployed the 2 CRITICAL security bugs
  (site-accept-invite takeover, auto-assign-job cross-tenant). Logged O1–O6.
