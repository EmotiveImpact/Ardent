# Changelog

All notable changes to Haumea / SiteSentriq are recorded here. We follow [semver](https://semver.org/) starting from `0.12.0`.

Versioning convention while pre-1.0:
- **0.MAJOR.MINOR** — `MAJOR` bumps for new wave/phase, `MINOR` for incremental fixes within a wave
- **1.0.0** will mark first paid customer launch + ICO compliance cert
- The version is shown in the sidebar footer and tagged on Sentry releases

---

## 0.28.2 — 2026-08-05 — Codex review pass: ETA token binding, billing authz, date drift

A second adversarial pass, this time run through **Codex** using the reusable brief at
`docs/internal/CODEX_REVIEW_PROMPT.md`. Every finding was independently re-verified here
before being applied. Migration **00126** applied live; 5 edge functions redeployed.

- **ETA tokens could cross the tenant boundary** (HIGH). The 00048 INSERT policy bound
  `organisation_id` and `created_by` but never required `job_id` to belong to that org —
  and both public ETA endpoints then follow `job_id` with a **service-role** client, which
  bypasses jobs RLS entirely. A user in org A holding a job UUID from org B could insert
  `{organisation_id: A, job_id: B}` and read B's property name, engineer first name, ETA
  and live coordinates. 00126 adds the job-ownership check; both functions also filter the
  service-role lookup by the token's `organisation_id` so pre-existing malformed rows fail
  closed. Verified live in `pg_policies`.
- **Billing endpoints lacked server-side authorization.** `stripe-checkout` treated
  identity as best-effort and fell through to trusting the body `orgId`, so an anon-key
  request could open a Checkout session against an arbitrary org. `stripe-portal` checked
  tenant membership but **not role**, so any engineer in the org could obtain a URL that
  cancels the subscription or changes the card. Both now require a verified user (or
  service_role) and `super_admin`/`org_admin` — mirroring the existing `settings:write`
  route guard, so no legitimate caller loses access. *Latent rather than live:*
  `STRIPE_SECRET_KEY` is unset on this project, so the config check short-circuits before
  auth — this arms the moment billing is switched on.
- **`stripe-webhook` acknowledged failed writes.** `invoice.paid` / `payment_failed`
  awaited the Supabase builders but discarded `error`, then returned 200 **and** wrote the
  permanent idempotency marker — so a transient DB failure left the subscription stale
  while Stripe considered the event delivered and never retried. Errors now throw into the
  500 path; `payment_failed` no longer overwrites a terminal `canceled` with `past_due`.
- **More UTC day-key drift** (the documented systemic class) — quote→invoice Net-30 due
  dates, monthly statement period ranges, and PO/contract/asset/compliance/log-book/
  onboarding/time-entry/maintenance date defaults. At 00:30 BST a Net 30 landed a day
  early; monthly reporting at the start of 1 Aug could select July.
- **Quote→invoice idempotency guard discarded its read error**, so a timed-out lookup fell
  through to a second insert and surfaced a misleading unique-constraint violation instead
  of the real failure.

Tests 245 → **248** (boundary cases for quote due dates and statement period selection,
plus a no-write assertion on the guard).

---

## 0.28.1 — 2026-08-05 — Access-control repair + correctness & a11y sweep

A two-front adversarial code review (web + backend) run as parallel agents, with every
finding confirmed by reading the code before it was fixed. Migration **00125** applied
live; **5 edge functions redeployed**; the whole batch deployed to production.

**Security — live holes, closed and runtime-verified:**
- **`run-scheduled-reports` had no caller check at all.** `verify_jwt` only proves a
  validly-signed *project* JWT — which the anon key shipped in the browser bundle
  satisfies, as does any logged-in user. Anyone could run **every org's** due report
  schedules with the service role (RLS bypassed) and email the output out. Added the
  `service_role` guard its sibling cron functions already had. Verified: anon POST now
  returns a handler `403`.
- **`field-signatures` storage was world-readable.** The 00022 SELECT policy had no `TO`
  clause, so it was granted to `public` — which includes `anon`; 00059 tightened six
  buckets and missed this one. Signature PNGs are compliance evidence, and any
  authenticated user of *any* tenant could overwrite another tenant's file. Now
  `to authenticated` and org-scoped through the job (roles went `{public}` →
  `{authenticated}`). Paths stay `{job_id}/…`, so no existing object is orphaned.
- **`public.clients` was the table portal scoping forgot** (00096 covered five siblings).
  A portal `client_admin` could read every other client of the operator — and the
  org-wide delete policy let them cascade-delete a rival's record.
- **Portal users could write where they should only read.** 00096's restrictive policies
  narrowed *rows* but not *commands*, so a client could `PATCH` their own invoice to
  `paid` or `DELETE` overdue compliance items. Portal users are now read-only on
  clients / invoices / compliance_items / contracts / properties. `jobs` is deliberately
  excluded — raising a call-out legitimately writes there.
- **`calendar-feed` failed open.** A *missing* token row fell through and served the
  feed, so deleting the row (users have their own DELETE policy; it also cascades on
  offboarding) removed the only revocation record while the year-long HMAC token kept
  working. Now fails closed.
- **`run-report` declared a per-dataset `permission` and never checked it.** RLS is
  org-scoped but not role-scoped, so an engineer could POST `{dataset:'invoices'}` and
  pull the org's financials, or `engineers` for the staff roster. Enforced against the
  caller's role; verified `403`.
- **`site-accept-invite`** read only page 1 of `listUsers`, so past ~200 auth users an
  invite could never be accepted (permanent 500). Now pages through.
- **`stripe-webhook`** flipped any org to `active` on any paid invoice, resurrecting
  cancelled subscriptions on a trailing proration or an out-of-order event.

**Correctness:**
- **`['engineers']` was shared by three queries across two different tables.** Whichever
  page loaded first poisoned the other's cache for 60s — rendering
  "undefined (undefined)" and inserting an FK-invalid `engineer_id`.
- **Today's-jobs tile counted almost nothing** — `.eq(day)` against a `timestamptz`
  column matches only rows stored at exactly UTC midnight. Now a local `[today, tomorrow)`
  range.
- **Annual schedule dropped every timed 31 Dec job** and then regenerated it as a
  duplicate visit.
- **Portal quoted a 15-minute Critical SLA** while storing the job as `urgent` (which the
  SLA engine tracks at 30 min) — a contractual exposure. The banner now quotes the target
  actually applied.
- **Six edit forms wiped in-progress input** on any background refetch (they hydrated on
  object identity, not record id).
- Remaining `toISOString()` UTC day-keys → `toLocalYmd` (today's visits showing overdue,
  invoices booking to the prior accounting day east of UTC).
- KPI deltas used `||` on the baseline, so a legitimate `0` baseline reported
  **"0% change"** on exactly the regression the tile exists to surface.
- Report-builder preview had an unguarded race that painted stale rows under the new
  dataset's headers.
- `run-scheduled-reports` advanced `next_run_at` past **failed** runs, silently consuming
  the period, and returned `ok:true` when every report errored.

**Accessibility:**
- **47 nested `<a><button>` interactive controls removed.** Measured rather than assumed:
  a 48th "hit" was inside a JSDoc comment, and all 47 inner buttons were inert, so
  nothing had to be skipped. The browser does *not* hoist the button out of the anchor
  and this is a client-rendered SPA, so there was no DOM restructuring and no hydration
  mismatch — React's warning is dev-only. What was real: each rendered **two tab stops
  for one visual control** (`role=link` containing `role=button`), and a click fired both
  the button handler and the anchor navigation. 44 now use the `Slot` support `Button`
  already had (`<Button asChild><Link/></Button>`); 3 native styling-only buttons were
  folded into their `Link`.

**Housekeeping:** `check:no-raw-type` back under baseline; `package-lock.json` version
sync (was stale at 0.25.1).

---

## 0.28.0 — 2026-06-10 — Trust & Compliance wave (Waves 1–3) merged to master

The competitive-research-driven **trust + compliance wave** — planned with a Fable
architect pass, built on `feat/trust-compliance-wave`, board-reviewed, hardened, and
merged to `master` (merge `adde1b5`). 12 feature commits, migrations **00114–00122**
applied live, two new edge functions deployed. Targets the loudest complaints about
the UK/IE field-service incumbents (offline data loss, accounting-sync opacity, weak
dashboards) and builds the **UK compliance moat** nobody in the mid-market owns.

**Wave 1 — trust hardening:**
- **Atomic failed-access** — the documented offline split-outcome bug is closed: one
  transactional RPC `record_failed_access` (00114) replaces two independent queue
  actions, via a new `rpc` offline-queue action kind (replay-idempotent).
- **Accounting sync visibility** — per-invoice push history + error reasons + a Retry
  on the invoice page; a crash mid-push no longer wedges an invoice at `pushing`
  (10-min stale-claim reclaim on both `xero-push-invoice` + `quickbooks-push-invoice`).
- **Composable dashboard** — show/hide + zone-aware reorder of dashboard widgets,
  persisted per-user (00115); new widgets auto-appear with zero migration.

**Wave 2 — UK compliance moat:**
- **Subcontractor compliance gating** (00116) — insurance / accreditations / RAMS model
  + a DB dispatch gate: assigning a non-compliant subbie is blocked unless an org admin
  records an override reason. Compliance tab, first-ever job subcontractor panel, 30-day
  expiry radar.
- **Contract SLA engine** (00117) — per-contract response/fix targets stamped onto jobs
  at creation (fail-open trigger across every creation path), breach evidence, live
  countdown chip, and a per-contract service-credit summary.
- **QR proof-of-presence** (00118) — scanning a site/asset QR on a job records attendance
  evidence that satisfies the SLA response target; rendered on the web timeline.
- **Per-use subcontractor work links** (00119) — a no-login link where a subbie accepts a
  job, uploads RAMS, adds photos, signs, and submits for contractor review; via the new
  `subcontractor-job` edge function + chromeless `/subbie/:token` page.

**Wave 3 — packaging + extension:**
- **UK statutory cert library** — 7 engineer checklists added (EICR BS 7671, BS 5839
  weekly/quarterly, Gas Safety CP12, LOLER, L8 legionella monthly/quarterly).
- **Golden-thread Building Information Pack** (00120) — one-click per-property export
  (HTML pack + JSON manifest, schema `haumea.building_pack` v1) via the new
  `building-pack-export` edge function — the Building Safety Act handover story.
- **Permit-to-work** (00121) — a flagged job cannot enter `in_progress` without an
  issued permit (fail-closed gate for flagged jobs only; status machine with an
  org-admin/scheduler issue gate; auto-activate on start).

**Board review + hardening (00122):** a 4-agent board review (security/RLS, backend,
web, mobile) then fixes — closed the **permit-flag bypass** (`fos_protect_requires_permit`
trigger), clamped **SLA backdating** of `sla_fix_met_at`, fixed a mobile **QR
double-write** (client-stamped PK), the **dashboard-draft reset** on background refetch,
the **double-toast** on job updates, the **stale-push** detection, and added the missing
`contracts(org,client,status)` index.

**Residual completions (non-security):** per-org compliance-requirements editor
(`Settings → Subcontractor compliance`), staff download of subbie-uploaded files (signed
private-bucket URLs), loading skeletons on the RPC-backed surfaces, and a mobile permit
request flow.

**Verified:** web build ✓ · web tsc 0 · web lint 0 · **238/238 web tests** · mobile tsc 0
· **43/43 mobile tests** · migrations through **00122** live · 43 edge functions. Backend
is live; the **web front-end has NOT been redeployed** (still serves the 0.27.0 build until
deploy is approved). Deferred: AI compliance copilot (needs API-key/cost sign-off).

---

## 0.27.0 — 2026-06-10 — Security-board hardening + PPM subsystem repair + notification/reporting/mobile delivery

A multi-disciplinary **security-board** audit (intended access-control matrix → parallel
specialist agents → fixes verified against the LIVE deployment), a coordinated repair of the
**PPM job-generation subsystem**, several adversarial bug-hunt waves, and three customer
features. Migrations **00105–00113** applied to the live project; web + edge deploys
runtime-verified. Front-end deploys remain gated on explicit approval (deployed with it).

**Security — exposures closed and proven at runtime:**
- **`sso-jit-provision`** no longer trusts `body.email` (was an account-takeover vector) —
  identity is derived from the verified session; redeployed and verified `401`/`403` live.
- **`send-email` relay + portal RLS** boundary leaks closed (org/portal scoping enforced
  server-side). The 5 documented exploit follow-ups fixed across 7 edge functions: GDPR
  `request_id` scoping, OAuth role gates, invoice-push idempotency, portal quote
  column-tampering.
- **SECURITY DEFINER lockdown + scoping** — `00105` revokes on exploitable definer fns;
  `00106` scopes avatars listing; `00107` portal-scopes `timeline_events` + `payments`;
  `00108` status-only client quote-decision RPC (+ blocks `client_admin` direct column
  writes); `00109` callout-uploads storage policy.
- **Two regressions from our own security tightening** were caught and fixed same-session:
  portal quotes LIST (re-allowed the read path under portal scope) and the PO→supplier
  email (added a supplier probe to the `send-email` org-guard).

**PPM job-generation subsystem repaired (`00110`) — was 100% dead:**
- Root cause: `create_job_from_maintenance_plan` ran under `set search_path = ''` with
  unqualified table refs → always raised "relation does not exist". Re-created
  schema-qualified + **idempotent** (returns the existing non-cancelled job for a
  (plan, date)). FIXED schedules advance `next_due` on generation; ROLLING do not. Added
  `daily`/`fortnightly` intervals, a partial unique index that blocks duplicate PPM jobs,
  and a completion trigger that sets `last_completed` and rolls `next_due` from the actual
  completion for rolling plans. Verified end-to-end with a rolled-back transactional test.
- Also fixed PPM date **month-overflow** (`Jan 31 + 1 month` no longer silently clamps in
  the wrong direction) and a **bulk-delete hidden-row data-loss** bug.

**Backing tables the UI needed (`00111`):** real `log_book_entries` + `risk_assessments`
tables with org-scoped RLS (the screens had been built against non-existent tables).

**Features:**
- **Notification preferences** are now persisted server-side (`00112`, was localStorage),
  with an org-scoped reader RPC. Every channel is gated — in-app, Slack, push, **and email**
  — but only for INTERNAL users who opted out; external client/supplier recipients and any
  lookup failure default to sending.
- **Scheduled reports actually run** (`00113`): a service-role `run-scheduled-reports` edge
  function (cron every 15 min, key read from Vault) finds due schedules → generates via the
  now org-scoped `run-report` → emails CSV/HTML via Resend → advances the schedule.
  Previously write-only.
- **Engineer field data on web** — job detail shows notes + parts/materials (qty · unit
  cost · line total). **Mobile signatures** now upload to the `field-signatures` bucket and
  store the object path (online + offline-queued), re-signed on read.

**Verified:** web build ✓ · web tsc 0 · web lint 0 · 201/201 web tests · mobile tsc 0 ·
28/28 mobile tests · 0 ERROR-level Supabase advisors.

---

## 0.26.0 — 2026-06-08 — V1 customer backlog + adversarial bug sweep + production deploy

The "Haumea Updates — V1" customer feedback doc (Irish FM operator) turned into a
full feature wave, alongside a multi-cycle adversarial bug hunt, a mobile rebuild,
the long-lived feature branch merged to `master`, and a production deploy.

**V1 customer backlog — all 9 items shipped** (migrations 00097–00104, all applied to prod):
- **#1 Status workflow expansion** — added `not_ready / ready / pending_external /
  contractor_review / performed / rejected` to the job lifecycle (widened the
  `jobs_status_check`). Web chips, filter tabs, bulk actions, detail dropdown +
  KPI/analytics filters; mobile status maps. `CLOSED_JOB_STATUSES` governs which
  count as open vs terminal.
- **#2 Human task numbers** — per-org `H-101` sequence via `org_job_counters` +
  `BEFORE INSERT` trigger + backfill. Shown on the jobs list, detail, and mobile.
- **#3 Parent/child tasks** — `jobs.parent_job_id`; a JobLinkedTasks card; the
  defect-quote → parent-task loop (`quotes.job_id`) so "Raise quote from this job"
  prefills + links and convert→job sets the parent.
- **#4 Service Group** — `jobs.service_group` + 13-item `SERVICE_GROUPS` list;
  jobs-list column, new-job select, editable on existing jobs, bulk action, mobile
  JobCard display.
- **#5 Engineer management** — confirmed the existing engineers CRUD + document
  management covers the ask.
- **#6 Quote widgets** — Service-Quote + Defect-Quote dashboard widgets.
- **#7 Property numbers** — per-org `P-123` numbers (trigger + backfill); client-level
  billing already covered the consolidated-billing intent (full multi-property invoice
  generator deliberately deferred — see decisions doc).
- **#8 Client info fields** — primary contact name + phone (client), on-site access
  manager, primary technician (property); forms, detail pages, portal Contact.
- **#9 Compliance cert forms** — `cert_completions` table + templates (Fire & Alarm,
  Emergency Lighting, Extinguisher, Access Control); mobile capture (offline-queued,
  with an asset picker) + web review; certs feed the customer completion email
  ("Compliance checks completed" section).

**Adversarial bug-fix sweep (~49 verified bugs)** across multiple finder→verifier
cycles. Highlights: duplicate compliance PPM jobs (race-safe counter), stale
quote-convert, the React-Aria "cell count must match column count" crash (every table
migrated to native HTML), timezone/date bucketing class, and the floating bulk-action
bar flash/wrap.

**Mobile** — field app rebuilt on hand-rolled primitives after HeroUI Native broke at
runtime (typecheck ≠ runtime); cert capture, expanded status maps, job-number +
service-group display.

**UI chrome** — sidebar made genuinely stationary again (root cause: an
`html, body { overflow-x: hidden }` rule added in a prior commit broke `position:
sticky` on every descendant; removed it and moved the horizontal-overflow guard to the
content column as `overflow-x-clip`). Topbar made sticky to match.

**Release engineering** — the `feat/mobile-heroui-rebuild` branch (52 commits) merged
to `master` (clean fast-forward, no conflicts), pushed to GitHub.

**Production deploy** — web app deployed to Vercel production
(`https://sitesentriq-web.vercel.app`, HTTP 200 verified); `job-completion-email` edge
function redeployed to version 8 (picks up the V1 cert section), `verify_jwt` preserved.
*Pending:* 10 other edge functions carry June-8 bug-fix updates and still need a redeploy
(deferred to a CLI-from-disk deploy to avoid hand-transcribing payment functions).

**Docs** — added `docs/v1-build-explained.html` and `docs/v1-decisions-explained.html`
(plain-English, diagram-rich walkthroughs of the build, the merge, and the two parked
product decisions: certificate-email trigger status, and multi-property invoice
automation).

---

## 0.25.1 — 2026-06-05 — QA follow-ups + Workflow convergence sweep

Closed every documented follow-up from 0.25.0 and ran multi-agent Workflow
convergence audits (specialists + adversarial verifiers) across two passes that
confirmed two batches of real bugs — all fixed:

**Convergence pass 1**
- **Purchase Orders:** the default "New PO" quick-drawer never sent `organisation_id`
  so every quick PO failed — now fixed (verified live).
- **Mobile sync:** the offline write queue only drained on a live reconnect, so field
  work made offline then reopened-in-coverage never synced — now drains on app launch
  and foreground too.
- **Client portal:** the site switcher now actually filters Visits/Documents/Invoices/
  Quotes; tenant document + service-report **downloads work** (new signed-URL edge
  function); the compliance cards respect the property filter.
- **Reports/analytics:** capacity heatmap counts engineers correctly; changing a saved
  report's data source no longer corrupts it.
- **PPM:** rolling-vs-fixed schedule mode is now honoured.
- **UX:** the signature pad no longer wipes mid-draw on window resize; dropdowns show
  the real selected value even when it's not in the list; quote/job notifications fire.

**Convergence pass 2** (re-audit of the fixed code — pass-1 findings stayed fixed)
- **Field Mode:** stopped listing future-dated jobs under "today's work" (which let an
  engineer complete a visit before it was due, prematurely minting certs + emailing the
  client) — now clipped to the current day.
- **Mobile sign-out:** clears the offline write queue, so a shared field device can't
  replay one engineer's queued writes under the next engineer's session.
- **Analytics:** the quote conversion-rate KPI + funnel now count `converted` quotes
  (previously the most-successful outcome was dropped from the rate).
- **Client portal:** the dashboard KPIs/compliance bar and the Compliance page now
  honour the global site switcher like every other portal page.
- **Invoices:** the "Add payment" amount re-syncs to the new balance after a partial
  payment instead of showing a stale figure.
- **Report builder:** the "Group by" control now actually clusters rows (it was a
  silent no-op); the sidebar no longer highlights two nav items at once.

**Convergence pass 3** (caught a revenue bug + a self-introduced regression)
- **Invoices:** "Pull from time entries" now actually bills the pulled time — it used
  to add the line items but leave the invoice total (and PDF, Amount Due, reminder
  email) unchanged, so billable engineer time was silently never charged.
- **Client portal:** fixed invoices disappearing whenever a site was selected
  (invoices are billed at the account level, not per-site).
- **Assets:** changing an asset's property now clears the area selection, so it can't
  be saved against an area belonging to the old property.
- **Subcontractors:** added an Edit screen — subcontractor details could previously
  only be changed by deleting and recreating the record.
- **Invoice PDF:** the VAT line shows the real rate instead of always printing "20%".
- **Mobile:** push-token registration degrades gracefully instead of erroring when no
  EAS project is configured.
- **Polish:** integration "not configured" banners render their amber warning colour;
  approving/rejecting a quote in the site portal no longer shows two error toasts.

**Convergence pass 4**
- **Signatures:** the customer signature pad now captures cleanly on phones/tablets —
  ink was landing offset from the finger on high-DPI screens.
- **Privacy:** "Delete my account" now actually signs you out after anonymising.
- **Invoices:** bulk "mark Paid" is removed (it skipped payment reconciliation — use
  the per-invoice Mark Paid which records the payment); payment reminders now bill the
  outstanding balance, not the full total, when a partial payment exists.
- **Mobile:** "Submit & check out" now tells the engineer when GPS fails (and the job
  can still be checked out) instead of silently leaving it incomplete.
- **Polish:** portal compliance bar can't exceed 100% on large portfolios; site call-outs
  notify with the correct type/icon; analytics chart colours are stable and distinct.

**Convergence pass 10 (final — 0 verified bugs)**
- **Compliance:** "Daily"-frequency items now show a correct daily visit schedule.
- **Client portal:** the "Past" visits tab lists most-recent first.
- The 10-pass adversarial audit converged to zero confirmed functionality bugs.

**Convergence pass 9**
- **Jobs:** bulk-marking jobs Completed now also records the Completed Date (matching
  single-job completion).
- **Polish:** the property "Assets" tile now filters to that property; report-builder
  drag-to-reorder drops a column exactly where you release it.

**Convergence pass 8**
- **Jobs:** completing a job from the status dropdown / field mode now records the
  Completed Date (so service history, MTTR and dashboard trends are accurate).
- **Reports:** custom-report "between" date filters include the end day; CSV/PDF exports
  use friendly column headers matching the on-screen preview.

**Convergence pass 7**
- **Compliance:** a compliant item's past scheduled visits now show as "Completed"
  (green) instead of being mislabelled "Overdue".

**Convergence pass 6**
- **CSV import fixed:** importing clients, properties, or assets from CSV now actually
  inserts the rows (it was silently importing zero — every row was rejected).
- **Accounting settings:** saving Xero / QuickBooks sync settings now persists (the save
  was a silent no-op that reverted on reload); migration adds the missing write policy.
- **Jobs:** the "Overdue" / "Due this week" views no longer list already-completed jobs;
  "My open" now actually scopes to your own jobs.
- **Polish:** can't record a payment against a fully-paid invoice; the report-builder
  preview no longer shows raw ID columns before you pick fields.

**Convergence pass 5**
- **Invoices:** pulling time entries no longer marks the hours "billed" if adding them to
  the invoice fails — so billable time can't silently disappear from the unbilled pool.
- **Advanced Reports:** the "To" date is now inclusive of the whole end day (it was
  dropping the current day's visits).
- **Menus:** removed the non-functional "Profile" item from the client portal and tenant
  site menus.
- **Polish:** analytics receivables KPIs are labelled "Overdue" to match their data; a
  property's Site Manager can be cleared; bulk-action undo state tidies up correctly;
  sidebar section highlighting is precise.

Verified across web build + lint + 185 tests, mobile tsc + 15 tests, and the live DB.

## 0.25.0 — 2026-06-05 — Stability + functionality hardening (18 loop iterations + a 10-cycle dev-team QA sweep)

A long autonomous stabilisation run. First, 18 `/loop` iterations systematically
swept **nine correctness surfaces** — web writes (schema-vs-code), web read/embed
relationships, mobile writes, edge-function writes, RLS/cross-tenant isolation,
money-math, FK on-delete integrity, realtime/cache invalidation, and frontend
route/role/tenant access control — fixing ~17 bugs incl. multiple CRITICALs where
whole features were silently dead (notifications, job-photo upload, contract
creation, the actions module, document versioning, the entire mobile field
workflow, GDPR delete/export, the Slack/Xero/QuickBooks integrations).

Then a **10-cycle dev-team QA sweep** hunted FUNCTIONALITY/UX defects (broken
flows, validation, async/state, navigation, formatting) with ~11 parallel
specialist agents + a verification wave, fixing ~30 more real bugs:

- **Auth / team:** added the missing **password-reset screen** (the recovery link
  was a dead end); fixed a **role-set inconsistency** that locked out anyone invited
  as "manager" and rejected finance/client_admin/auditor role edits (migration
  **00085**); profile **phone** is now saved; profile/org edits refresh the topbar.
- **Commercial:** **Quote→Invoice** now carries subtotal + tax (no more "VAT (NaN%)");
  add-payment guards against overpayment; quote approve/reject notifications fire.
- **Jobs / scheduling:** **scheduler job links** no longer 404; **"Suggest engineer"**
  on a new job actually assigns; the **auto-assign** list assigns the engineer you
  pick (not always #1); engineer-availability counts include timed jobs.
- **Reports:** the custom report builder no longer 400s on the Engineers dataset,
  shows **names instead of UUIDs** for relation columns, and the built-in "PPM due in
  30 days" template works.
- **Analytics:** invoice ageing excludes not-yet-due/cancelled invoices.
- **Realtime:** live cross-client refresh extended to contracts/POs/suppliers (**00084**).
- **Mobile:** the **Today tab** (was permanently empty) and the **job list** (auto-assigned
  jobs were invisible) both work again; status filters/badges use the real status set.
- **Portal:** surface isolation (dashboard ↔ portal no longer bleed by deep-link),
  removed a dead "Internal View" link, map-click now filters by site.

Verified: web build + lint + 185 tests, mobile tsc + 15 tests, marketing build, and
0 ERROR-level Supabase advisors. Full detail in `docs/internal/BUGS_AND_FIXES.md`.
Known follow-ups (documented, not yet shipped): site-surface (tenant) document
downloads, the portal site-switcher on a few pages, rolling-vs-fixed PPM scheduling,
and card-up-front billing (blocked on a Stripe key).

## 0.24.0 — 2026-05-30 — Invite-only team join: teammates join the same workspace, not a duplicate

The most important architectural fix in the app's account model. The customer
is the **organisation**, but until now *every* signup created a brand-new org —
so two people from one company got two separate, fragmented workspaces, and the
Settings "invite" was non-functional (inserted a profile with no auth id,
linked to a `/auth/signup` route that doesn't exist).

New model (chosen with the founder): **owner self-signs-up and creates the org;
everyone else joins by invitation.** Verified end-to-end on the live project.

- **00073** — `organisation_invitations` table (RLS: members read their org's
  invites; all writes service-role-only). `handle_new_user` now checks for a
  pending invitation by the new user's **verified email FIRST** → links them to
  that org + role and marks the invite accepted (no new org); otherwise the
  owner path runs. Driven by the table, **not** signup metadata — metadata is
  user-controlled, so trusting an `organisation_id` from it would let anyone
  inject themselves into any org (cross-tenant breach). This is the secure
  design.
- **invite-team-member edge function** (admin-gated): verifies the caller is an
  `org_admin`/`manager`, forces `organisation_id` to the caller's own org,
  writes the invitation, and sends the invite via `inviteUserByEmail` (through
  Resend). Friendly result codes (`already_a_member`, `already_has_account`,
  `not_an_admin`).
- **Settings → People**: real invite with a role picker (org_admin / manager /
  scheduler / engineer) + a "Pending invitations" list. The `/invite` accept
  page sets the password and lands the user in the app; it was unwrapped from
  `PublicRoute` (the invite magic-link session would otherwise redirect them
  out before they could set a password).

Live verification: admin invite → 200; invitee joins the existing org as the
invited role with the invitation marked accepted and **no duplicate org**;
non-admin caller → 401; owner signup still creates a fresh org. Build ✓, lint 0
errors, 185/185 tests.

Note on the slug: it's still collected at signup but is functionally unused
(the app is path-based; the trust URL uses a separate `trust_url_slug`).
Recommended follow-up is to drop the visible slug field and auto-derive it.

---

## 0.23.2 — 2026-05-30 — Signup: handle "email already registered" instead of a fake success

A returning user (real account, confirmed) tried to sign up again and got
stuck. Root cause: Supabase's anti-enumeration behaviour returns a **200 with
no error** when you sign up with an already-registered confirmed email — the
response carries an obfuscated user whose `identities` array is **empty**, and
no account or usable confirmation email is created. The register page only
checked for an `error`, so it showed the cheerful "Check your email" screen and
the user waited forever for an email that never comes.

- `register.tsx` now inspects the signUp response: if `data.user.identities`
  is empty, it shows a dedicated **"You already have an account"** screen with
  **Sign in** + **Reset your password** actions instead of the false success.
- Unblocked the affected user directly (password-reset email sent via the now-
  live Resend SMTP).
- Brand-new signups are unaffected (their `identities` array is populated) and
  still provision a workspace correctly.

Also hardened this round: revoked public-API EXECUTE on 7 internal cron/trigger
functions (migration 00072) flagged by the security advisor; verified org
provisioning still works after. 0 ERROR-level advisors (security + perf).

---

## 0.23.1 — 2026-05-29 — Production email live + a major org-creation bug fixed + Trio E2E-verified + CI gates

The "prove it, don't just deploy it" follow-up. Wired real email, ran the
Strategic Trio end-to-end against live data, and — while doing so — found and
fixed a serious latent production bug.

### Production email (Resend) — all transactional email now actually sends
- Wired Supabase Auth custom SMTP through Resend (`smtp.resend.com`, sender
  `noreply@ourcommune.io` — the verified domain), rate limit lifted 2/h → 30.
- Set the `RESEND_API_KEY` + `FROM_EMAIL` edge-function secrets — they were
  NEVER set, so every transactional email (quote/invoice send, renewals,
  trust alerts, tracking link) had been silently no-op'ing. Now live.

### Major bug fixed: org creation was broken for ALL new orgs since 00058
- An end-to-end signup test surfaced it: new signups got a profile but no
  organisation. The 00058 search_path hardening set a chain of functions to
  `search_path TO ''` while leaving internal references UNQUALIFIED, so the
  AFTER INSERT trigger chain on `organisations` threw and rolled back — every
  org-creation path (signup, client-side, admin) affected.
- 00069: `handle_new_user` → `search_path = public, extensions`.
- 00070: `auto_seed_report_templates_for_new_org()` qualifies its call.
- 00071: `seed_default_report_templates()` qualifies its table refs.
- Verified live: a fresh signup now provisions the org (clean slug), seeds 5
  report templates + a trial subscription, and emails confirmation via Resend
  (auth logs: `user_confirmation_requested`, no error).

### Strategic Trio — E2E-verified with real data
- Trust: `public-trust-score` returns score 20 / 12 history points;
  `trust-subscribe` 200; `notify-trust-subscribers` real run `alerts_sent: 1`
  (real alert email). Enabled a demoable trust URL at `/trust/sitesentriq-test`.
- Tender Pack: authenticated `generate-tender-pack` returns a working signed
  URL (real data: score 20, 12 trend points, 4 compliance items, HTML render).
- Tracking: `public-job-eta` resolves a real token → status/property,
  PII-minimal. All test artifacts cleaned up.

### CI regression gates
- `scripts/check-no-raw-type.mjs` — raw-type baseline gate (120); fails only
  on regrowth, allows cleanup; wired into `check:all`.
- `scripts/check-edge-functions.mjs` + a non-blocking CI `edge` job running
  `deno check` (edge functions were never type-checked); restored the full
  release-gate + Playwright e2e.
- Fixed the teal email-accent fossil (#08c4ae → brand #e8772e) in the trust
  emails.

### Still open
- Several edge functions fail strict `deno check` (Supabase-client generic
  strictness + npm: dep resolution) — surfaced by the new non-blocking gate,
  tracked for cleanup; they run correctly in production.
- `BROWSERLESS_TOKEN` unset → Tender Pack renders branded HTML (not binary
  PDF); set it for PDFs.
- Codemod tail (120 custom sizes) held by the baseline gate, not yet snapped.

---

## 0.23.0 — 2026-05-29 — Board follow-through: wave gaps closed + typography codemod + Strategic Trio

Completed every outstanding item from the board session — the gaps v0.22.0
shortcut, the big mechanical codemod, and the three strategic bets the CMO/CSO
memo argued would make SiteSentriq "the Vanta of UK FM compliance" rather than
"a seventh Joblogic". Build ✓ (tsc + vite), lint 0 errors, 185/185 tests at
every round. Migrations 00065–00068 + the org trigger applied live to
vphjwvleffuwwgbjxups; 7 cron jobs active; 4 edge functions deployed + smoke-tested.

### Closed the wave gaps
- **Portal :id detail routes** (A2 completion) — real `/portal/quotes/:id` +
  `/portal/invoices/:id` customer-facing pages (line items, totals,
  approve/reject reusing auto-convert-to-job, PDF). Email CTAs deep-link to
  them again instead of `?focus=` on the list page.
- **Org creation in the handle_new_user trigger** (Wave B completion) —
  provisioned server-side + atomically at signup with a collision-safe slug
  (`acme`, `acme-2`, …, replacing the `Date.now()` suffix that broke the
  marketed URL); exception-safe so it can never block signup. Removes the
  client-side timeout-orphan path.
- **Production console-drop** (Wave C completion) — Vite 8/Rolldown dropped
  `esbuild.drop`; now stripped via `@rollup/plugin-strip` (build-only guard,
  dev stays verbose). Strips `console.log/info/debug` + `debugger`; keeps
  `console.error/warn`.

### Typography codemod
- Added a `--text-label: 13px` token (the app's de-facto body size) and
  codemodded ~2,150 `text-[Npx]` hardcodes across 184 files to the `--text-*`
  token scale (`text-micro/caption/label/body/title/headline/display`). Tokens
  are font-size-only (no line-height pairs) so every swap is pixel-identical —
  pure consistency win, zero visual regression. (A CI lint gate banning
  `text-[*px]` is the follow-up to keep it from regrowing.)

### Strategic Trio (real working MVPs, deployed live)
- **Trust-URL subscriptions** — `trust_subscriptions` (00067) + the public
  `trust-subscribe` fn + the `notify-trust-subscribers` cron (daily 06:30 UTC):
  an insurer/client "Watches" a public score and is auto-alerted on a drop.
  "Watch this score" card on the Trust page + one-click unsubscribe.
- **One-click Tender Pack export** — `generate-tender-pack` fn (auth, org from
  JWT) assembles a branded evidence pack (score + 12-mo trend + in-date certs +
  compliance summary) into a signed-URL PDF; private `tender-packs` bucket
  (00068); "Generate Tender Pack" button on the compliance page.
- **Public live job tracking** — `/track/:token` now polls `public-job-eta`
  and renders a live Leaflet map with a gliding engineer marker; "Send tracking
  link to customer" mints/reuses a token and emails the client via a new
  `tracking_link` template. No-login, like a delivery tracker.

### Still deferred
- CI lint gate for `text-[*px]` (codemod stick).
- Resend SMTP for auth email deliverability (needs an API key).
- Trio v2s: zip-of-cert-PDFs in the Tender Pack, SMS (Twilio) + realtime
  (vs polling) for live tracking, threshold-recovery semantics.

---

## 0.22.0 — 2026-05-29 — Board session: demo-readiness audit + Waves A/B/C

A full board-of-agents audit (CTO, CDO, CPO, A11y/Perf, CMO/CSO, Journey)
of `apps/web`, synthesized into a Board Memo, then executed in three waves.
The audit confirmed the infrastructure is strong (auth guards, chunk-load
recovery, fetch timeouts, lazy routes) but found several headline features
that *looked* wired and silently no-op'd — concentrated in the exact flows
you'd demo.

Also fixed this session (pre-board), config-side: the live **signup**
incident — Supabase `SITE_URL` pointed at the old `site-sentriq.vercel.app`
(trailing slash) and `URI_ALLOW_LIST` was empty, so `emailRedirectTo` was
stripped; plus every marketing-site "Get Started"/"Sign In" CTA linked to
`/register`·`/login` routes the marketing app doesn't have (blank screen).
SITE_URL + a 7-origin allowlist are now set; marketing CTAs cross-origin
into the dashboard via a new `appUrl()` helper. (Still open: production
auth email deliverability — Supabase's built-in SMTP is rate-limited to
2/hour with poor Gmail/Yahoo delivery; needs a Resend key.)

### Wave A — Critical demo-killers

- **Compliance never auto-went-overdue.** Nothing ever flipped
  `compliance_items.status` when `next_due` passed — `compute-compliance-scores`
  *reads* status but never *sets* it — so "Needs Attention" stayed empty and
  the whole continuous-compliance value prop silently never fired. New
  migration `00065`: `refresh_compliance_statuses()` (30-day due-soon window,
  leaves manual `non_compliant` untouched), scheduled nightly 01:45 UTC.
- **Renewal + digest crons were built but never scheduled** (00063 only
  scheduled score/statement/accreditation). `00065` schedules
  `notify-renewals` (daily 07:00) and `weekly-digest` (Mon 07:30).
- **Quote/invoice "Send" emailed nothing** — the hooks selected
  `clients(name)` but routes read `.email`; real columns are
  `contact_email`/`billing_email`. Every send fell into "no client email".
  Fixed the selects + a `getClientEmail()` helper; "Send Invoice" now
  actually emails (best-effort) via the existing send-email path.
- **Email CTAs → blank screen** — deep-linked to unregistered
  `/portal/quotes/:id`·`/invoices/:id` and there was no `path="*"`. Added a
  NotFound catch-all; CTAs now point at the list routes with `?focus=`.
- **Job photos 403'd** after the 00059 bucket privatization (`getPublicUrl`
  on a private bucket) — web + mobile now batch-sign via `createSignedUrls`;
  compliance cert signed-URLs de-n+1'd + cached 6 days.
- **use-insights silently showed wrong numbers** on a partial RLS failure
  (`Promise.all` + `?? []`) — converted to `allSettled` + per-slice unwrap.
- **Portal callouts never auto-assigned** — now invoke `auto-assign-job`
  (best-effort) + added missing `onError` toasts; engineer-tracker poll
  pauses on hidden tabs.

### Wave B/C — Foundational + polish

- New `src/lib/status.ts` — single source of truth for status→token/chip
  color; replaced theme-breaking `amber-50`/`emerald-50`/`red-200` pills
  (broke on dark/midnight/glass) across accreditations, scheduler,
  compliance, notification-row.
- **Brand-color contract reconciled** — `CLAUDE.md` claimed teal `#14b89a`
  but `index.css` ships warm orange `#e8772e`. Docs updated to match the
  shipped tokens; killed teal fossils in branding, `lib/branding/apply.ts`,
  and `lib/pdf.ts`.
- **Auth no-org resilience** — a confirmed user whose org-creation timed out
  now gets a recoverable "Finishing setup — Try again" screen instead of a
  silent AccessDenied bounce (`ProtectedRoute` now guards on organisation).
- **A11y** — file-upload dropzone is now keyboard-operable (role/tabIndex/
  Enter-Space/aria-label); bare form labels in clients + users got
  `htmlFor`/`id` association.
- Removed dead `useFormShortcuts` hook.

### Deferred (logged, not done this run)

- Production `console.*` stripping — Vite 8 (rolldown) moved transform to
  oxc; `esbuild.drop` is no longer honored. Revisit via oxc minify config.
- Typography codemod (~2,220 `text-[Npx]` hardcodes → `--text-*` tokens) —
  high-churn, own session + a CI lint gate to make it stick.
- Strategic Trio (trust-URL subscriptions, one-click Tender Pack, public
  live job tracking) — the CMO/CSO "Vanta-for-FM" bet; 4-8 week features.
- Resend SMTP for auth email deliverability (needs an API key).
- Mobile offline-completed jobs don't fire the completion email; quote
  terminal states are mutually exclusive (can't job→complete→invoice).

Verify: build ✓ (tsc + vite), lint 0 errors, 185/185 tests. Migration
`00065` applied live to `vphjwvleffuwwgbjxups`; all 6 cron jobs active.

---

## 0.21.6 — 2026-05-19 — Stale-chunk-after-deploy: tighter Vercel rewrite + broader ChunkLoadError detection

Hotfix following a live "Something went wrong — 'text/html' is not a valid JavaScript MIME type" reproduction immediately after the v0.21.5 deploy. Two gaps in v0.21.5's chunk-recovery story made that particular failure mode slip through.

### Gap 1 — Vercel SPA rewrite was too greedy

The previous `vercel.json` had:
```json
"source": "/(.*)", "destination": "/index.html"
```

That catches EVERYTHING including `/assets/*.js` requests for missing chunk hashes. So when a tab opened on v0.21.4 tried to load `/assets/clients-OLD_HASH.js` after v0.21.5 deployed (and the OLD_HASH file no longer existed), Vercel rewrote the request to `/index.html`. The browser received HTML where it expected JavaScript and refused to execute it, throwing `'text/html' is not a valid JavaScript MIME type`. The user sees `<ErrorBoundary>`'s "Something went wrong" — with no chunk-error detection because the regex didn't match the MIME-type wording (see Gap 2).

Fixed by tightening the rewrite source to exclude static-asset paths via negative lookahead:
```json
"source": "/((?!assets/|icons/|sw\\.js|push-sw\\.js|registerSW\\.js|workbox-|.+\\.(js|css|map|png|svg|jpg|jpeg|webp|woff|woff2|ico|json|webmanifest)).*)"
```

Now missing chunks return a clean 404, the browser fires a proper `ChunkLoadError`, and the ErrorBoundary's auto-reload kicks in.

### Gap 2 — `isChunkLoadError()` regex didn't cover MIME-type errors

`apps/web/src/components/shared/error-boundary.tsx` previously matched:
```
Loading chunk | dynamically imported module |
Importing a module script failed | Failed to fetch
```

That covers the textbook ChunkLoadError variants but NOT the specific Chromium/Safari phrasings for "I got HTML when I expected JS":
- `'text/html' is not a valid JavaScript MIME type` (Chromium)
- `not allowed by Strict MIME Type Checking` (alt phrasing)
- `expected a JavaScript-or-Wasm module script`
- `MIME type ('text/html')`

Broadened the regex to match all of those too, with each pattern documented inline as defence-in-depth for environments without the Vercel rewrite fix (e.g. hosting providers without negative-lookahead support, or tabs that loaded before v0.21.6's rewrite was deployed).

### Why both fixes matter

- **Vercel rewrite alone** wouldn't have helped users whose tab was already open on an older deploy — they'd still need the broadened regex to recover gracefully.
- **Regex alone** wouldn't fix the underlying serving issue — every page load with a stale chunk would still pay the cost of the reload cycle until the SPA bundle naturally refreshed.
- Both together: missing chunks 404 cleanly going forward AND any user who hits the MIME-type variant gets auto-recovered.

### Verification

- `npm run lint:web` clean (0 errors, 1 pre-existing warning)
- `npm run tsc:web` clean
- `npm run build:web` clean
- Live URL still https://sitesentriq-web.vercel.app

### To remember for next time

Vercel's default SPA rewrite pattern (`/(.*) → /index.html`) is the single most common cause of "stale chunk after deploy" hangs on Vite SPAs hosted on Vercel. Bake the negative-lookahead pattern into every new Vercel-hosted SPA from day 1.

---

## 0.21.5 — 2026-05-19 — "Sometimes doesn't load" deep-dive: 10 root-cause fixes for stuck-spinner / blank-page failures

Triggered by an operator report that "pages sometimes don't load." Ran a
3-agent audit across data fetching, routing/chunks, and auth/realtime,
plus direct checks on the live PWA manifest. Found 17 distinct
contributing causes ranging from genuinely demo-killing (no fetch timeout
on the Supabase client) to edge-case race conditions. This release ships
the top 10 by impact-per-minute. Every one shifts a "page stuck on a
spinner forever / blank with no error" failure mode into either a
graceful error state, a single recovery reload, or a degraded-but-
rendered page.

### Fix #1 — Global fetch timeout on the Supabase client (the single biggest unlock)

`apps/web/src/lib/supabase.ts` now passes `global: { fetch }` to
`createClient` with a 12-second hard wall-clock cap on every request,
using `AbortSignal.any([callerSignal, AbortSignal.timeout(12_000)])`.
Long-poll realtime/SSE endpoints are exempted (they intentionally hold
the connection open).

Previously only `useJobs` defined a per-request timeout. Every other
hook — `useDashboardKpis`, `useNeedsAttention`, `useEngineerTracker`,
`useProperties`, `useClients`, `useComplianceItems`, all the
site-portal hooks, all the analytics queries — relied on the
browser's eventual TCP timeout (10+ minutes). A single stalled
request (Supabase pause/wake, slow region, cold edge function) left
the consumer's `isLoading` state `true` forever and the route stuck
on a Skeleton with no recovery. With this in place, the same stall
fails fast with `AbortError` after 12s, TanStack Query enters error
state, and the existing fallback UI renders.

### Fix #2 — ErrorBoundary detects ChunkLoadError and forces a single recovery reload

`apps/web/src/components/shared/error-boundary.tsx` now exports an
`isChunkLoadError()` helper and uses it in `componentDidCatch`. When
a chunk-load failure is detected (e.g. after a deploy ships new
chunk hashes and an already-open tab tries to import a stale hash),
the boundary forces `window.location.reload()` once, guarded by a
`__chunk_reload__` sessionStorage flag so a genuinely missing chunk
doesn't reload-loop.

The previous behaviour was: ChunkLoadError → "Something went wrong"
card → "Try again" button → re-renders the same lazy() → reuses the
SAME failed import from module cache → user is stuck on the error
screen until they manually hard-refresh.

### Fix #3 — SWUpdatePrompt moved from DashboardLayout to App root

Previously `<SWUpdatePrompt />` was only mounted inside
`DashboardLayout`, so portal users, site-portal users, login,
register, onboarding, /track and /trust visitors never re-registered
the service worker after the boot-script eviction. Stale precaches
on those screens never refreshed.

Now mounted in `apps/web/src/App.tsx` next to `<DevStatusBadge />`
so every screen registers and updates the SW.

### Fix #4 — PublicRoute role-aware landing

`apps/web/src/components/auth/public-route.tsx` previously redirected
EVERY authenticated user to `/dashboard`. A `tenant_user` (single-
property portal contact) has no RLS access to dashboard data, so they
landed on an empty shell with the four hero counters reading 0 — no
explicit redirect, no error message, just a dead page. Now branches
on `profile?.role`:

- `tenant_user` → `/site`
- `client_admin` → `/portal`
- everyone else → `/dashboard`

Also blocks the redirect until `profile` actually resolves so a
`TOKEN_REFRESHED` event during the tick doesn't briefly bounce to
the wrong landing page.

### Fix #5 — `authRunRef` bumped on profile/session timeout

`apps/web/src/contexts/auth-context.tsx` now bumps `authRunRef.current`
in both the profile-lookup timeout and the session-lookup timeout
catch blocks. Without these bumps, a late-resolving inner promise
(the `me()` RPC that the outer `withTimeout` abandoned) could still
call `setProfile()` 5+ seconds later, flipping the UI back from
AccessDenied → org_admin out of nowhere. The bumps make the
`shouldApply()` gate return false for any late writes.

### Fix #6 — Promise.all → Promise.allSettled in dashboard aggregators

`use-dashboard-kpis.ts`, `use-needs-attention.ts`, `use-engineer-tracker.ts`,
and `dashboard-kpi-hero-row.tsx` previously used `Promise.all([...])` over
3-5 unrelated table reads. One RLS denial, one schema-cache miss, or one
slow query would reject the entire `Promise.all` — the whole dashboard
section then either errored or (worse) silently returned zero across
every tile with no signal to the operator.

All four converted to `Promise.allSettled` with per-source error logging.
A failed slice degrades to empty/zero for that slice; the other slices
still render real data. (`useEngineerTracker` kept Promise.all for the
2 load-bearing reads + `.then(_, () => ({data:null,error:null}))` on
the 2 decorative reads to preserve typed inference downstream.)

### Fix #7 — Trust + track public pages: hard fetch timeout

`apps/web/src/routes/trust/[slug].tsx` and `apps/web/src/routes/track/[token].tsx`
were using raw `fetch(url, ...)` with no timeout on calls to
`public-trust-score` and `public-job-eta`. These are the public pages
prospects get sent in cold outreach (Trust URL) and customers see for
job tracking — exactly the worst place for an infinite spinner. Now
both pass `signal: AbortSignal.timeout(8_000)`, mapping a stall to
the existing `{ error: 'lookup_failed' }` error UI.

### Fix #8 — `lazyRetry` helper with one auto-retry on chunk failure

`apps/web/src/App.tsx` exports a `lazyRetry()` wrapper around
`React.lazy()` that retries the import once after 350ms before
letting the failure propagate. Applied to the 5 auth-flow routes
(`/login`, `/register`, `/invite`, `/forgot-password`,
`/auth/sso/callback`) which are the very first pages every user
hits. A transient network blip on those routes used to manifest as
"the login page won't load" — now it transparently retries.

### Fix #9 — Suspense + ErrorBoundary inside Portal & Site layout outlets

`PortalLayout` and `SiteLayout` previously had a bare `<Outlet />`
inside `<main>`. When a lazy portal/site page chunk loaded, the
Suspense bubble travelled up to the App-root spinner which unmounts
ALL the layout chrome (header, navigation, brand) — looking like
the whole page just collapsed to a centered spinner. Now each layout
wraps its `<Outlet />` in `<ErrorBoundary><Suspense>...</Suspense></ErrorBoundary>`,
so cross-page navigation keeps the chrome rendered while the child
chunk resolves, and ChunkLoadError recovery works inside each
layout's scope.

### Fix #10 — `useInsights` throws on error instead of swallowing into zeros

`apps/web/src/hooks/use-insights.ts` had three fetchers that returned
`{ score: 0, ... }` / `{ count: 0, ... }` on `error` — the consumer
saw the query as "successful" with zeros and rendered "Compliance
score 100, no overruns, no clients at risk" even when the underlying
table query was failing with 403/RLS. Now throws, so TanStack Query
enters error state and the consumer can render a small
"Insight unavailable" tile per metric instead of misleading numbers.

### Verification

- `npm run lint:web` — 1 warning (pre-existing useEffect-deps in jobs/[id].tsx, unrelated), 0 errors
- `npm run tsc:web` — clean
- `npm run test:web` — 24 files, 185 tests passing (unchanged)
- `npm run build:web` — clean (209 precache entries, ~3.98 MB)

### Deployment

Frontend redeployed to Vercel production after this commit — live URL
https://sitesentriq-web.vercel.app picks up all 10 fixes.

### Findings logged but NOT shipped in v0.21.5 (deferred to v0.21.6+)

The audit surfaced ~7 more medium-severity bugs that weren't worth
the risk of a bigger release. Captured in the bug-memo:
- `signOut()` fire-and-forget in 3 layouts (use AuthContext's awaited version)
- `RoleRoute` conflating "null profile" with "timed-out profile"
  (would need a `profileError` field on AuthContext)
- Duplicate realtime channel cleanup at top of `use-realtime-subscriptions` effect
- `usePresence` cleanup ordering (`untrack()` not awaited)
- `useTenantQuoteDecision` and `useRaiseCallout` mutations lack `onError`
- `useComplianceCertificates` uses `Promise.all` for per-row signed URLs
- 25 routes missing from `route-prefetch.ts`

### Pending operator actions

No change from v0.21.4 — HIBP still Pro plan, domain still pending,
seed Trust URLs still pending, **5 customer-discovery calls still
the strategic gap**.

---

## 0.21.4 — 2026-05-18 — Portal hardening: 4 demo-killers fixed + end-to-end smoke test doc

Closes the 4 portal UX gaps the v0.20.0 board memo flagged that were
deferred. Each was a demo-killer for the customer-discovery work — the
portal is the surface a prospect's customer experiences, so it has to
work end-to-end before any sales conversation. Plus the canonical
end-to-end smoke test at `docs/testing/portal-end-to-end.md` so this
class of regression doesn't slip through again.

### Fix #1 — RealtimeProvider in PortalLayout (`apps/web/src/components/layout/portal-layout.tsx`)

The DashboardLayout has mounted `<RealtimeProvider>` for months,
giving every dashboard page live cross-browser updates via the
`org:<id>:changes` Broadcast topic. PortalLayout did NOT. A portal
user watching their dashboard wouldn't see live status updates when
the FM operator changed a job; they'd have to refresh.

Now the portal layout also wraps with `<RealtimeProvider>`. The
existing `useRealtimeSubscriptions` hook handles cache invalidation
when DB triggers emit Broadcast messages. Portal users now see live
updates with no app changes elsewhere.

### Fix #2 — Portal quote approval auto-creates the job (`apps/web/src/routes/portal/quotes.tsx`)

The portal "Approve" button only updated `quotes.status = 'approved'`.
That defeated the closed-loop demo: customer approves → admin sees in
dashboard → admin has to manually click "Convert to Job" elsewhere.
Worse, the only way the prospect ever sees the loop close is over
multiple sessions.

Now `handleAction` calls the existing `useConvertQuoteToJob` mutation
on approval. The job is created automatically (status='scheduled',
line items replicated, client + property + organisation links carried
through). Failure to convert is non-fatal — the quote stays
'approved' and the operator can convert manually. The signature of
`handleAction` changed from `(quoteId, status)` to `(quote, status)`
so the mutation has the data it needs without an extra read.

### Fix #3 — SLA text from `sla_policies`, not hardcoded (`apps/web/src/routes/portal/raise-call-out.tsx`)

The SLA response time shown next to the priority radio was hardcoded
in a constant `SLA_RESPONSE` map. Two problems: (a) prospects who set
custom SLA in `/dashboard/settings/sla` would see the placeholder, not
their real numbers; (b) the explicit code comment said this needed
fixing, which is the kind of thing a prospect's CTO reading the code
during procurement would flag.

Now reads from `useSlaPolicies()` (existing hook at
`apps/web/src/lib/sla/hooks.ts`), matches on `applies_to_priority`,
formats `response_minutes` to human-readable text via a new
`formatResponseMinutes()` helper. Falls back to the old constants when
the org has no policy yet (so brand-new orgs still show sensible
numbers until they configure their own).

### Fix #4 — Notification emails fire on portal call-outs (`apps/web/src/routes/portal/raise-call-out.tsx`)

Previously a portal call-out only created in-app bell notifications
via `createBulkNotifications`. Org admins who weren't logged in at
that moment never knew — silent dropped notifications. The previous
flagged issue: "notifications fire but don't deliver."

Now after the in-app fan-out, the route also calls
`supabase.functions.invoke('send-email', ...)` per recipient using
the existing `job_notification` template on the `send-email` edge
function (v0.21.3 hardened). The fan-out uses `Promise.allSettled`
so a single recipient's email failure doesn't block the others.
Failures are logged but not surfaced to the customer — the
in-app bell already landed.

### `docs/testing/portal-end-to-end.md` (NEW)

5-phase smoke test running ~10 min covering:
1. Fresh org creation via /register + onboarding wizard
2. Inviting a portal user via property_contacts
3. Raising a call-out from the portal (validates Fixes #1, #3, #4)
4. Quote approval triggers auto-job (validates Fix #2)
5. Cross-tenant isolation check (validates RLS hardening from v0.21.0)

Each step has explicit pass/fail criteria + SQL queries to verify
state at the DB level. Plus a failure-mode lookup table for the
most common regressions and what they imply.

Run before every prospect demo + every release that touches
portal/site/auth/RLS code.

### Verification

- `npm run lint:web` — 1 warning (pre-existing useEffect-deps in jobs/[id].tsx), 0 errors
- `npm run tsc:web` — clean
- `npm run test:web` — 24 files, 185 tests passing (unchanged)
- `npm run build:web` — clean (210 precache entries, ~3.97 MB)

### Deployment

Frontend redeployed to Vercel — production URL https://sitesentriq-web.vercel.app picks up all 4 fixes after this deploy. No edge function or migration changes in this release.

### Pending operator actions (no change)

Same as v0.21.3: HIBP blocked on Pro plan, domain `sitesentriq.com` still pending, seed Trust URLs still pending, **5 customer-discovery calls still the strategic gap.**

---

## 0.21.3 — 2026-05-18 — Cron path end-to-end working + edge function bundle + auth-claim hardening (10 redeploys)

Triggered by setting the vault secret for crons. The cron helper
worked at the SQL level but returned BOOT_ERROR from the edge runtime,
which uncovered two separate bugs across 10 edge functions.

### Bug 1 — Curl-PATCH deploys produce non-bootable bundles

The 7 functions deployed in v0.21.0 via direct `PATCH /v1/projects/{ref}/functions/{slug}` with the source code in a `body` field were ALL returning HTTP 503 BOOT_ERROR. Diagnosis: that endpoint shape doesn't trigger the proper Deno bundling. Functions deployed via the MCP `deploy_edge_function` tool (which uses a different internal pipeline) booted fine.

**Fix:** found the correct multipart endpoint — `POST /v1/projects/{ref}/functions/deploy?slug={name}` with the file as a multipart `file` field plus a `metadata` JSON part. All 10 affected edge functions redeployed successfully via this path. Verified each boots + executes:

```
compute-compliance-scores       ✅ runs OK — 200 successful response
generate-statement-of-compliance ✅ runs OK — 200 successful response
stripe-portal                    ✅ runs OK (Stripe key not configured)
generate-certificate             ✅ runs OK (logic validation 400)
send-email                       ✅ runs OK (logic validation 400)
send-push                        ✅ runs OK — 200 successful response
send-expo-push                   ✅ runs OK (logic validation 400)
slack-post-notification          ✅ runs OK (logic validation 400)
job-completion-email             ✅ runs OK (RESEND_API_KEY not set)
integrations-health              ✅ runs OK — 200 successful response
```

### Bug 2 — Brittle service-role detection

After bundle fix, `compute-compliance-scores` booted but returned 401 `invalid_authorization` even with a valid service-role JWT. Diagnosis: the canonical `isServiceRoleJwt()` helper (copied across all 9 hardened functions from v0.20.1 + v0.21.0 — including the codex review's fix) used:

```ts
return jwt === SUPABASE_SERVICE_ROLE_KEY && decodeJwtPayload(jwt)?.role === 'service_role'
```

The string-equality against the env var fails when the project has multiple service-role keys, or when keys are rotated, or when the env-injected value differs from the operator's-current-key.

**Fix:** check the JWT role claim only. The `verify_jwt = true` gateway has already validated the signature before the function executes, so the role claim is signed-and-attested:

```ts
return decodeJwtPayload(jwt)?.role === 'service_role'
```

Applied across 9 functions: compute-compliance-scores, generate-statement-of-compliance, generate-certificate, send-email, send-push, send-expo-push, slack-post-notification, job-completion-email, integrations-health. (stripe-portal already used the simpler pattern.)

### Cron path verified end-to-end

After setting the vault secret:
```sql
select vault.create_secret('<service_role_jwt>', 'service_role_jwt');
```

Calling the helper function directly (which the cron will do nightly):
```sql
select public.call_edge_function('compute-compliance-scores', '{}'::jsonb);
-- request_id 2
```

Reading the response:
```sql
select * from net._http_response where id = 2;
-- 200 {"processed":2,"updated":2,"errors":0,"snapshot_date":"2026-05-18"}
```

2 organisations got fresh compliance score snapshots written. The nightly cron at 02:00 UTC will now succeed.

### Database state after v0.21.3

```sql
select organisation_id, snapshot_date, score, breakdown->>'compliance' as compl
from compliance_score_snapshots where snapshot_date = current_date;

-- org A: score 20 (compliance 25%)
-- org B: score 0  (no data)
```

### Skill update (`~/.claude/skills/board-session/runtime-gotchas.md`)

Two new entries added:
- **Edge function deploy: use multipart POST, not body PATCH.** Direct curl PATCH with `body` field doesn't bundle. Use `POST /v1/projects/{ref}/functions/deploy?slug={name}` with multipart `file` upload + `metadata` JSON part.
- **JWT role claim, not env-var equality.** The `verify_jwt=true` gateway already validates signatures. Check `decodeJwtPayload(jwt)?.role === 'service_role'`, not `jwt === SUPABASE_SERVICE_ROLE_KEY`. The latter breaks on key rotation, multi-key setups, or when the env-injected value drifts from what the operator currently has.

### Verification

- `npm run lint:web` clean
- `npm run tsc:web` clean
- `npm run test:web` — 185 passing (unchanged)
- Edge functions: 10/10 boot, 10/10 authenticate, 4 return successful responses on empty body, 6 return logic-level errors for missing config/env (correct behaviour)
- Live cron path round-trip via SQL helper: HTTP 200

### Pending operator actions delta

- ~~Set vault secret~~ ✅ **DONE**
- HIBP upgrade — still blocked (Pro plan)
- Domain DNS + TLS — still pending
- Seed Trust URLs — still pending
- 5 customer discovery calls — still strategic gap

### Method note

The board-session skill needed a new section on Supabase edge function deploy mechanics. The codex review's auth helper, while logically sound at the time, was brittle to operational drift (key rotation). Both lessons baked into `runtime-gotchas.md` so future sessions avoid them.

---

## 0.21.2 — 2026-05-18 — Data-API misconfiguration revert + Free-plan password hardening + pending-actions ledger

A short post-mortem release. Two operator actions taken in the
Supabase dashboard had unintended consequences that needed
remediation, plus the password policy was tightened to the
strongest Free-plan-compatible settings, plus the README now
carries a permanent "Pending operator actions" ledger so we
stop losing track of what needs the operator (not the code) to
move forward.

### 1. Data-API misconfiguration revert (CRITICAL fix)

The operator clicked "Harden Data API" in the Supabase dashboard
Integrations → Data API settings, which opened a 2-step modal:
- Step 1: "Create a custom `api` schema and expose it" — clicked,
  green check, `api` schema created and exposed.
- Step 2: "Remove the `public` schema from the exposed schemas"
  — also clicked, which set PostgREST's `db_schema` to just
  `api, graphql_public` (no public) and `db_extra_search_path`
  to `extensions` (no public).

**Effect:** the entire app's Data API was broken. Every
`supabase.from('<table>')` call returned `PGRST205 Could not
find the table 'api.<table>' in the schema cache`. Verified by
hitting `/rest/v1/organisations` and receiving HTTP 404.

**Recovery** (no migration; this was Supabase platform config
modified via the Management API at
`/v1/projects/{ref}/postgrest`):
- PATCH `db_schema` back to `public, graphql_public`
- PATCH `db_extra_search_path` back to `public, extensions`
- After PostgREST schema-cache reload (~10 sec), confirmed the
  same `/rest/v1/organisations` request returned HTTP 200.
- Dropped the now-orphan `api` schema:
  `revoke usage on schema api from anon, authenticated;
   drop schema if exists api cascade;`

**Lesson for `~/.claude/skills/board-session/runtime-gotchas.md`:**
"Harden Data API" is a Supabase dashboard pattern for greenfield
projects adopting the `api`-schema convention from day 1. For an
existing app with hundreds of tables/edge functions/RLS policies
on `public`, clicking it without first moving the entire schema
breaks the Data API immediately. **Do not click the second
button without doing the architectural migration first.**

### 2. Free-plan password hardening

While addressing the HIBP advisor WARN, the Supabase Management
API returned `HTTP 402: Configuring leaked password protection
via HaveIBeenPwned.org is available on Pro Plans and up`. HIBP
is therefore a known-deferred WARN until the project upgrades
from Free → Pro plan.

In its place, the strongest available Free-plan password rules
were applied via PATCH `/v1/projects/{ref}/config/auth`:
- `password_min_length`: 6 → **12**
- `password_required_characters`: null → **lowercase + uppercase + digit required**

New signups now require a 12+ character password with all three
character classes. Existing accounts are unaffected until they
next change their password.

### 3. Pending-operator-actions ledger added to README

New section near the top of `README.md` listing every action that
only the operator can perform (vault secret for crons, HIBP
upgrade, domain DNS, seed Trust URLs, customer discovery calls).
Each row has Status, Where, Why so nothing falls off the radar
between releases. CHANGELOG remains the by-release log; README
holds the always-current snapshot.

### Verification

- `npm run lint:web` clean
- `npm run tsc:web` clean
- `npm run test:web` — 185 tests passing (unchanged)
- Data API live-sanity: `GET /rest/v1/organisations` → HTTP 200 (RLS empty for anon, correct)

### Live state of the project after v0.21.2

- 64 migrations applied (00001 through 00064)
- 35 edge functions deployed (8 hardened with JWT verification in v0.20.1/v0.21.0)
- 3 cron schedules active (pending vault secret to actually fire successfully)
- PostgREST config: stock Supabase defaults (`public, graphql_public` + `public, extensions`)
- Password policy: 12 chars + complexity
- Supabase security advisor: 0 ERRORs, ~20 remaining WARNs (auxiliary functions covered in 00064 may take an advisor recache; HIBP deferred to Pro plan; 3 architectural acceptances)

### Method note

This release was triggered by an out-of-band operator action in
the Supabase dashboard, not by board-session work. The pattern
worth standardising in the board-session skill: when an operator
clicks something with unintended consequences, the orchestrator's
job is (a) diagnose via Management API, (b) revert via Management
API (no migration unless DB state is touched), (c) document the
"don't click this" warning in `runtime-gotchas.md`, (d) cut a
patch release with the full post-mortem.

---

## 0.21.1 — 2026-05-18 — The Deferred-Stack Wave: cron schedules + remaining search_path + mobile gaps + Wave F codemod + 3 mega-file split

A focused wave closing the six items deferred from v0.21.0's board memo
that weren't customer-blocking but were waiting in the punch list.
Three codex agents ran in parallel git worktrees while three smaller
items shipped synchronously via the orchestrator.

### What shipped LIVE (Supabase project `vphjwvleffuwwgbjxups`)

- **Migration 00063** — `pg_cron` + `pg_net` enabled, 3 cron schedules created:
  - `compliance-score-nightly` (02:00 UTC daily) → POSTs to `compute-compliance-scores`
  - `statement-of-compliance-monthly` (06:00 UTC on the 1st) → POSTs to `generate-statement-of-compliance`
  - `engineer-accreditations-nightly` (01:30 UTC daily) → calls `refresh_engineer_accreditation_statuses()`
  Uses a `public.call_edge_function(name, body)` helper that fetches the
  service-role JWT from `vault.decrypted_secrets`. **One-time setup**
  required from the user: `select vault.create_secret('<JWT>',
  'service_role_jwt');` — without this secret, the crons fire but
  raise "vault secret not found".
- **Migration 00064** — `search_path = ''` set on 22 auxiliary helper
  functions that were flagged by the Supabase advisor as
  `function_search_path_mutable` WARNs (the long tail not covered by
  v0.21.0's 00058 which only targeted SECURITY DEFINER functions).
  Includes: `touch_*_updated_at` triggers, `time_entries_*`,
  `fos_set_*`, `apply_stock_movement`, `seed_default_*`,
  `update_updated_at_column`, etc.

### Mobile gaps (Wave Mobile)

- **`apps/mobile/lib/image-compress.ts` (NEW)** — `compressImage(uri)`
  matches the web contract (1920px long-edge JPEG q0.85). Wired into
  both `handleAddPhoto` and `handleTakePhoto` in `apps/mobile/app/job/
  [id].tsx`. Reduces 3-5MB iPhone JPEGs to 200-500 KB.
- **Offline photo blob queue** — `apps/mobile/lib/offline-queue.ts`
  extended with a new `storage_upload` op type that stores the base64
  blob payload alongside the metadata insert. `apps/mobile/hooks/
  useOffline.ts` drain replays the storage upload on reconnect.
  Previously only metadata was queued and the blob was lost when an
  engineer was offline. 5 new vitest cases for the storage queue
  path.
- **`expo-image-manipulator ^55.0.16`** added to mobile deps so the
  dynamic-import in `image-compress.ts` resolves at runtime.

### Wave F — Primitive callsite migration (169 callsites across 82 files)

The 3 foundational primitives shipped in v0.21.0 (`<PageHeader>`,
`<Heading>`/`<Text>`, `<LineItemInput>`) were unused until now.
Codex migrated:

- **Task F1 — `<PageHeader>` (78 migrations across 74 files)** — Inline
  `<h1 className="text-[22px] font-semibold ...">` collapsed into a
  single primitive with optional subtitle prop. 3 complex
  icon/adornment titles left as TODO: `dashboard/compliance/
  statements.tsx`, `dashboard/integrations/sso/index.tsx`,
  `portal/raise-call-out.tsx`.
- **Task F2 — `<Heading>`/`<Text>` (76 migrations across 19 files)** —
  Ad-hoc `text-[Npx]` callsites migrated to scale-based primitives
  (`scale="body"`, `scale="caption"`, etc.). Table columns, labels,
  and the 13px long-tail intentionally skipped.
- **Task F3 — `<LineItemInput>` (15 migrations across 4 files)** —
  Raw `<input>` in PO/Quote/Invoice line grids migrated. Extended
  the primitive with `id`, `min`, `max`, `step` passthroughs +
  1 new unit test.
- **Wave F fixup** — 2 import statements broken by F1's mid-line
  insertion (`dashboard/timesheet/index.tsx`, `settings/health.tsx`)
  repaired post-merge.

### Mega-file split (3891 → 894 LOC across 3 route files)

Three worst-offender route files split into focused
presentational + data-orchestration components:

| Route | Before | After | Reduction |
|---|---|---|---|
| `apps/web/src/routes/jobs/[id].tsx` | 1381 LOC | 403 LOC | -71% |
| `apps/web/src/routes/dashboard/index.tsx` | 1273 LOC | 57 LOC | -95% |
| `apps/web/src/routes/engineers/[id].tsx` | 1237 LOC | 434 LOC | -65% |

Extracted into:
- `apps/web/src/components/jobs/` — JobOverviewTab, JobTimelineTab, JobPhotosTab, JobInvoiceTab, JobEtaPanel
- `apps/web/src/components/dashboard/` — DashboardComplianceScoreCard, DashboardKpiHeroRow, DashboardKpiGrid, DashboardJobsActivityFeed, DashboardComplianceFeed, DashboardStatementOfCompliancePulse, DashboardEmptyState
- `apps/web/src/components/engineers/` — EngineerInfoCard, EngineerAccreditationsTable, EngineerDocumentsTable, EngineerJobsTable, EngineerLocationPanel, EngineerTravelTimeForm

Bug fixes folded in:
- **ETA clear path** in jobs/[id].tsx no longer writes the literal
  string `"null"` to non-null DB columns (was casting `null as
  unknown as string`). Proper `null` values now used.
- **5 `any` types** in engineers/[id].tsx replaced with proper
  interfaces.

### Verification

- `npm run lint:web` — 1 warning (acceptable, pre-existing useEffect-deps in jobs/[id].tsx), 0 errors
- `npm run tsc:web` clean
- `npm run test:web` — 24 files, **185 tests passing** (unchanged)
- `npm run build:web` clean (209 precache entries, ~3.97 MB)

### Pending user actions (not blocking release)

- **HIBP toggle** in Supabase Auth Dashboard → enable
  "Leaked Password Protection" (closes 1 advisor WARN)
- **Vault secret** for crons: `select vault.create_secret(
  '<service_role_jwt>', 'service_role_jwt');` — without it the 3
  scheduled crons fire but error. Find JWT at Supabase Dashboard
  → Settings → API → service_role.

### Method note

This release used the parallel-worktree pattern documented in
`~/.claude/skills/board-session/` (added to the skill yesterday
after v0.21.0): 3 codex agents in dedicated `/tmp/` worktrees,
orchestrator merges all branches after verification. Wall-clock
~40 min for what would have been ~3 hours serially.

---

## 0.21.0 — 2026-05-17 — The Second Board Wave: 6-agent audit + codex review → Wave SEC (security wave) + Wave A (4 demo-killers) + Wave B (foundational primitives)

After v0.20.1, a full second board session (6 specialist agents + an
independent `codex review`) audited the entire post-v0.20.0 state.
Two ERROR-level multi-tenant boundary holes and 7 more cross-tenant
edge-function vulnerabilities surfaced. v0.21.0 closes the entire
"Tier 0" security section of that board memo, plus 4 demo-killer
fixes, plus 3 foundational UI primitives. 26 commits across 3
parallel codex/agent waves; 11 of those waves merged into master
this evening, 7 new migrations applied LIVE, 8 edge functions
redeployed LIVE.

The headline is the security wave. The v0.20.0 release shipped 4
new edge functions in support of the Compliance Score / Trust URL /
Statement PDF strategic bet. Codex caught 2 cross-tenant bugs the
day after; this wave caught 7 MORE — every other edge function that
created a service-role client. The pattern was always the same: trust
`body.organisation_id` (or `user_ids`, or `job_id`) without verifying
the caller's JWT belongs to that org. Any authenticated user could
fire arbitrary push notifications to other orgs' users with our
branding, send compliance-themed emails from our SPF/DKIM-signed
domain to anyone, post Slack messages into other orgs' workspaces,
generate certificates in other orgs' folders, manage Stripe billing
portals for other orgs' subscriptions. All 8 functions now share
the canonical `resolveCallerContext()` pattern; service-role JWT
bypasses for the cron path, every other caller is org-pinned.

Alongside the edge-function hardening: 5 tables (engineers,
engineer_accreditations, engineer_documents, subcontractors,
subcontractor_documents — GDPR Article 9 special-category data)
had RLS policies of `FOR ALL USING (true)` from 00003. 6 storage
buckets (documents, engineer-documents, job-photos, avatars,
group-images, org-logos) were public with broad `auth_read` policies
that let any authenticated user list every other org's files. The
certificates bucket had a policy that didn't enforce the folder-1
= org-id convention. `audit_log_view` and `low_stock_view` were
SECURITY DEFINER (silently leaked every org's audit log to any
caller of audit-export). `seed_sample_data(org_id)` was callable
by any authenticated user. **All closed.** Supabase advisor went
from 2 ERRORs + dozens of WARNs to 0 ERRORs and only the lower-tier
WARNs (function search_path on 21 helper functions, HIBP toggle).

The demo-killer fixes are no less consequential: QuickBooks and
Xero integration pages existed on disk but were never registered in
`App.tsx` — clicking the integration card 404'd. Edit buttons on
Client and Asset detail pages were permanently `isDisabled` — two
of the most-visited pages couldn't be edited. The onboarding wizard
had no compliance-item step, so every new tenant landed on the
dashboard with a 0/100 Compliance Score on day one — the strategic
moat was undelivered on first run. The Statement of Compliance PDF
emailed monthly to every org's support inbox was rendered in the
WRONG brand color (last quarter's teal `#08c4ae` instead of the
current orange `#e8772e`) and with score band labels that didn't
match the live Trust URL.

The foundational primitives — `<PageHeader>`, `<Heading>` + `<Text>`
with a 6-step typography scale, `<LineItemInput>` — were already
needed for the Tier 1 polish work that comes next.

### Wave SEC — Security wave (7 migrations + 8 edge functions, all live)

- **`9555d49` → `cb1764b`** (migrations) — 7 new migrations close every Tier 0 finding:
  - **00056** RLS rewrites on engineers + 4 related tables (was FOR ALL USING (true))
  - **00057** `seed_sample_data` lockdown (caller must be admin of target org)
  - **00058** `search_path = ''` on every SECURITY DEFINER function in `public.*`
  - **00059** privatize 6 public buckets + tenant-isolated RLS via folder-1 check
  - **00060** certificates bucket folder-1 check (closed the path-convention hole)
  - **00061** statements-of-compliance bucket — the codex P1 fix that hadn't applied to live because v0.20.1 patched the original migration (Supabase doesn't re-run applied migrations). Now in its own migration.
  - **00062** `audit_log_view` and `low_stock_view` converted to `security_invoker = on` + defence-in-depth organisation_id filters on every UNION branch of audit_log_view
- **`b282aa2`** (edge functions) — 8 functions hardened with `resolveCallerContext()`:
  - **stripe-portal**: was zero auth, trusted body.orgId — now JWT-verify + caller-org match
  - **generate-certificate**: was zero auth + raw path traversal via certificate_record_id — now JWT-verify + regex sanitise
  - **send-email**: NO AUTH at all (open mailer with our SPF/DKIM) — now JWT-verify + require `org_admin`/`scheduler` role
  - **send-push**, **send-expo-push**: narrowed target user_ids to caller's org via profile join
  - **slack-post-notification**: derive org_id from caller, not body
  - **job-completion-email**: verify job.organisation_id matches caller's org, drop override_recipient
  - **integrations-health**: was no-auth global aggregates — now JWT-verify + scope to caller's org
- **`supabase/config.toml`** new file — explicit `verify_jwt` per function so the public-by-design ones are documented (was relying on platform defaults).

### Wave A — Demo-killer fixes (4 commits, all merged)

- **`303c8d0`** (A1) — QuickBooks + Xero routes registered in App.tsx; Edit buttons on Client + Asset detail pages wired to functional edit routes (new `routes/clients/edit.tsx` + `routes/assets/edit.tsx` following the new-route pattern); ConfirmDialog wrapped around `notes-section` delete.
- **`8ff1c07`** (A2) — Onboarding wizard now 6 steps: Welcome → Client → Property → Asset → **Compliance Item** → PPM. New `step-5-compliance.tsx` pre-fills compliance type from the asset category, persists via `useCreateComplianceItem`, optional proof-file upload via `useUploadDocument`. New tenants land on the dashboard with a real Compliance Score on day one.
- **`c517fd5`** (A3) — Statement of Compliance PDF brand colors corrected: `BRAND_COLOR` `#08c4ae` → `#e8772e`, `BRAND_DARK` `#0f1225` → `#1b1f2e`, all 7 status colors aligned with canonical `--color-status-*` tokens. Score bands now match the Trust URL ("Exceptional / Strong / Fair / Needs work"). Bonus: QR code in the PDF footer linking back to the org's live Trust URL.
- **`fdded74`** (A4) — Trust URL polish: OG meta + favicon + Twitter card meta + print stylesheet; `score-sparkline.tsx` repainted from raw hex to `var(--color-status-*)` tokens; tooltip from `bg-slate-900` to design-system tokens; footer wordmark + "verified at" stamp.

### Wave B — Foundational UI primitives (3 commits, all merged)

- **`cf7e79e`** `<PageHeader>` primitive in `@haumea/ui` — locks the canonical page-header treatment (`text-[22px] font-semibold text-text-primary tracking-[-0.02em]`) used in 87 places across `apps/web`. 7 new vitest tests.
- **`42ba5a4`** Typography scale (6 steps: display / headline / title / body / caption / micro) added to `apps/web/src/index.css` under `@theme` + `<Heading>` and `<Text>` primitives in `@haumea/ui`. Replaces 350+ ad-hoc `text-[Npx]` declarations once migrated. 8 new tests.
- **`094c25b`** `<LineItemInput>` primitive — invoice/PO/quote line-grid input wrapper with built-in label hiding, currency prefix, error state. Replaces 15 raw `<input>` instances once migrated. 7 new tests.

### Versions reconciled

`apps/web`, `apps/mobile`, root `package.json` all bumped to `0.21.0` together. `apps/marketing` left at `0.0.0` (separate deploy, intentional).

### Verification

- `npm run lint:web` clean
- `npm run tsc:web` clean
- `npm run test:web` — **24 files / 185 tests passing** (unchanged from v0.20.1)
- `npm run build:web` clean
- Supabase security advisor — **2 ERRORs → 0 ERRORs**, many cross-tenant WARNs closed; remaining WARNs are auxiliary helpers + 1 manual auth-dashboard toggle (HIBP).

### Live deployments shipped this evening

- ✅ Migration 00055 (actions.priority adds `'critical'`) applied LIVE
- ✅ Migrations 00056–00062 (7 security migrations) applied LIVE
- ✅ 8 edge functions redeployed LIVE (`stripe-portal`, `generate-certificate`, `send-email`, `send-push`, `send-expo-push`, `slack-post-notification`, `job-completion-email`, `integrations-health`)

### Known WARNs deferred to v0.21.x

- 21 auxiliary trigger functions (`touch_*_updated_at`, `time_entries_*`, `fos_set_*`, `update_updated_at_column`, etc.) still missing `set search_path = ''`. Non-critical (none are auth-affecting).
- `organisations_insert_authenticated` `WITH CHECK (true)` — known DoS-via-org-creation vector, accepted for now.
- `org-branding` bucket public — intentional for org logos rendered in emails; flagged for review.
- `anon EXECUTE` on SECURITY DEFINER functions — function bodies already auth-check; permissive grant is defence-in-depth concern.
- HIBP leaked-password protection — needs manual toggle in Auth Dashboard.

### Method note

This release is the first where 2 codex agents ran in parallel git worktrees while 4 Anthropic sub-agents simultaneously ran in their own isolated worktrees, with the orchestrator merging all 11 branches back to master after verification. The board-session skill at `~/.claude/skills/board-session/` should incorporate this parallel-worktree pattern as a wave-execution option.

---

## 0.20.1 — 2026-05-10 — Codex second-opinion: security + correctness fixes on the v0.20.0 wave

An independent `codex review` pass against the v0.20.0 diff surfaced 6
real issues the 6-agent board audit missed — 2 launch blockers and 4
should-fix-before-first-customer items. All 6 fixed in this release,
each in its own commit, with new vitest coverage for every behaviour
that changed.

The security findings are the headline: two of the new Edge Functions
(`generate-statement-of-compliance` and `compute-compliance-scores`)
were creating service-role clients and trusting `body.organisation_id`
from the request without verifying the caller's JWT. Any authenticated
user could pass another tenant's org id and either generate that org's
compliance statement (and email it) or mutate that org's compliance
snapshots. Both functions now resolve the caller's JWT via the user-
scoped supabase client, enforce body.organisation_id (if provided)
must equal the caller's org, and only allow all-org sweeps when the
caller presents a service-role JWT (the cron path). Pattern lifted
from the existing audit-export / gdpr-export functions.

The correctness findings include one painful own-goal worth calling
out: the Compliance Score's `action_health` component filtered
`actions.priority = 'critical'`, but the schema constraint only
allowed `('low', 'medium', 'high', 'urgent')`. The filter therefore
matched zero rows, leaving `overdue_actions_count` at 0 and
`action_health` at 100 every single time — **every org's headline
score was overstated by ~10 points** since the bet shipped a week
ago. Migration `00055` adds `'critical'` to the allowed values so
the formula matches its intent.

This release also reconciles split-brain package.json versions: the
monorepo root and mobile app had drifted to `1.0.0` while web sat
at `0.20.0`. All three workspaces now sit at `0.20.1` together.
`1.0.0` is reserved per the original convention for first paying
customer launch + ICO compliance cert.

### Fixes

- **P1 — `9555d49`** — `generate-statement-of-compliance` cross-tenant
  data leak closed. JWT verification + caller-org enforcement before
  the service-role lookup.
- **P1 — `46ccf5e`** — `statements-of-compliance` storage bucket
  created in migration 00054. Without this, the first call on a fresh
  environment failed with `Bucket not found`. Bucket is private (signed
  URLs only) with tenant-isolated RLS on storage.objects.
- **P2 — `3a56131`** — Same security pattern applied to
  `compute-compliance-scores`. Empty/forged body no longer triggers
  cross-tenant or all-org sweeps for non-service-role callers.
- **P2 — `4666b91`** — `<FormSelect>` clearable mode shipped + 23
  callsites audited. The v0.20.0 codemod broke the case where an
  optional placeholder ("All Properties", "No specific asset", "--
  Skip --") needed to remain selectable after a value was picked.
  Optional callsites now pass `clearable`; required forms keep the
  prior behaviour. 7 new primitive tests.
- **P2 — `6a20ade`** — Invoice "Mark as paid" no longer inserts the
  full invoice total as a payment when partial payments already
  exist. Extracted the math into `apps/web/src/lib/invoices/balance.ts`
  with 3 vitest cases; mark-paid and AddPaymentModal now share one
  source of truth for outstanding balance.
- **P2 — `6fd3822`** — Migration `00055_actions_priority_critical.sql`
  adds `'critical'` to the allowed values for `actions.priority`.
  Mirrored the same fix in the in-app calculator
  (`apps/web/src/lib/compliance-score/calculate.ts`) and extended
  its test suite to assert critical-priority actions drop the score.

### Verification

- `npm run lint:web` clean
- `npm run tsc:web` clean
- `npm run test:web` — 24 files, 185 tests passing (was 23 files / 181 — +4)
- Targeted: FormSelect 7 ✅ · invoice balance helper 3 ✅ · compliance-score 15 ✅

### Live deployments needed

These changes ship code only — the migration + edge function deploys
need a manual apply step before the security fixes are live:

```bash
# 1. Apply both new migrations to the linked Supabase project
supabase db push                                       # applies 00054 (bucket) + 00055 (priority constraint)

# 2. Redeploy the two hardened edge functions
supabase functions deploy generate-statement-of-compliance
supabase functions deploy compute-compliance-scores
```

Until those run, the security fixes are in the repo but not enforced
on the live project. Do this before the first customer touches the app.

### Method note

This release is the first to formalise a "second opinion" check on a
shipped wave: after a major release, run `codex review --base <pre-
wave-sha>` and treat the findings as a punch list. The board-session
skill at `~/.claude/skills/board-session/` now references this pattern
as the canonical post-wave QA gate. Two models from two vendors
reviewing the same diff is meaningfully more reliable than one model
auditing its own work.

---

## 0.20.0 — 2026-05-09 — The Board Wave: Critical fixes, foundational primitives, Compliance Score, codemods, and a11y/theme/skeleton completion

After a board-driven audit by 6 specialist agents, an autonomous run of
23 commits across 7 waves shipped: 5 critical fixes, 3 foundational UI
primitives + sweeping codemods (~110 files), 4 strategic features
(Compliance Score, public Trust URL, monthly Statement PDF, calendar
ETA feed), a 12-item polish sweep, and a quality completion pass
(a11y / public-page repaint / skeleton-everywhere).

The headline of this release is **the first-ever Vanta-style continuous
compliance score for UK FM**: an org-level number 0–100 calculated
nightly from compliance status + PPM on-time + job pass-rate + open-
critical-action health, rendered on the dashboard as a hero tile,
exposed to insurers/auditors via a public no-login Trust URL
(`/trust/<slug>`), and crystallised once a month into a branded
Statement-of-Compliance PDF emailed to the org's support inbox. Every
existing FM CMMS competitor in the UK ships compliance status as
per-asset traffic lights; nobody ships a single trust-grade number with
a public verification surface.

The plumbing wave of this release is equally consequential: 3
foundational UI primitives (`AppCard`, `FormSelect`, `DataTable` →
HeroUI Table) replaced ~110 bespoke implementations across the
codebase via four AppCard codemod parts, a 50-file FormSelect
codemod, and a 19-file Table codemod. Every list page in the app now
flows through the same accessible compound primitive; every form
select is a typed wrapper bound to React Hook Form; every card
matches a single visual contract. Future visual changes ship by
editing one file. 4 new migrations + 4 new edge functions are live
on `vphjwvleffuwwgbjxups`. Web tests grew 138 → 181, mobile holds at
10/10, ui at 10/10.

### Wave A — Critical 5 (demo-killer fixes, 5/5)

The 6-agent audit surfaced 5 issues that would each tank a customer
demo. Each landed as its own commit with full test coverage.

- **Critical 1 — onboarding routing** (`6dbe770`) — email-signup never
  landed on `/onboarding`; the flow was `/register` → "check your
  email" → click link → `/` → `/login` → `/dashboard`, leaving the
  wizard unreachable for the very users it was built for. `lib/auth.ts`
  now passes `emailRedirectTo=<origin>/onboarding` so the welcome-email
  link drops the user straight into the wizard. New
  `resendSignupConfirmation()` helper + visible "Resend confirmation
  email" button on the success screen. `use-onboarding` swallow-errors
  fallback tightened so transient outages no longer corrupt new-tenant
  state — only the specific "column / schema cache doesn't know about
  onboarding_state" errors (code 42703) are silenced; real
  DB / network / RLS errors bubble up so React Query can retry.
- **Critical 2 — quote → job conversion** (`bc8de05`) — the
  convert-to-job flow was dropping `client_id` and discarding line
  items, producing orphan jobs with no scope. Fixed; the converter now
  carries `client_id` through and materialises each quote line as a
  job task. Locked down with new hook tests (`use-quotes-convert.test`).
- **Critical 3 — mobile service report submission** (`daec3a9`) —
  engineers closing a job from the mobile app had no way to file a
  `service_reports` row. The customer-facing job-completion email
  (which reads `service_reports` for outcome / engineer name / notes)
  went out empty whenever the job was completed from mobile. New
  inline form (outcome + notes, signature reused from
  `job.engineer_signature_url`), offline-queued via the existing
  AsyncStorage queue, "Submit & check out" combo button chains the
  existing `checkOut()` so the engineer finishes in one tap. Latest
  report renders inline read-only after submit.
- **Critical 4 — Mark Paid writes a payments row** (`1dc9155`) — the
  Mark Paid button only flipped `invoices.status` / `paid_date`,
  leaving `payments` empty for those invoices and breaking
  reconciliation against accounting integrations. New
  `useMarkInvoicePaid` inserts a `payments` row for the full total
  then updates the invoice (with rollback delete if the second write
  fails). New manual "Add payment" modal for partial / out-of-band
  payments. 9 new hook tests lock the contract.
- **Critical 5 — notifications deep-linkable + dedicated page**
  (`77cbfc0`) — notifications were ephemeral popovers off the topbar
  with no deep-link surface, so support links / digest emails
  couldn't point at a specific item. New `/dashboard/notifications`
  page (sidebar entry added) showing the full feed in a dense list.
  New shared `<NotificationRow>` primitive used by both the topbar
  popover and the new page (101 lines of duplicated markup removed
  from the topbar in the process).

### Wave B — Foundational 3 (UI primitives, 3/3)

Three primitives landed first as small proof migrations, locking the
call-site API so the codemod waves below could mechanically migrate
~110 files without touching any consumer's contract.

- **Foundational 1 — `AppCard` primitive** (`f252b43`) — new
  `packages/ui/src/app-card.tsx` is a plain-div card with `padding`
  (`sm` | `md` | `lg` | `none`), `tone`
  (`default` | `elevated` | `subtle`), `interactive` flag, header /
  footer slot props, and `className` escape-hatch. No HeroUI Card
  import — owns its chrome end-to-end so callers stop fighting
  `!gap-0 / !shadow-none / !p-5` overrides. First vitest setup for
  `@haumea/ui` (jsdom + RTL cleanup + matchMedia shim, no new
  installs). 5 new tests; 5 proof migrations
  (`clients/[id]`, `properties/[id]`, `quotes/[id]`, `invoices/[id]`,
  `dashboard/index`).
- **Foundational 2 — `FormSelect` + `FormSelectController`**
  (`f754d2c`) — addressed 121 raw `<select>` elements across the web
  app, 62 of which shared an identical hand-rolled className.
  `FormSelect` (controlled) + `FormSelectController` (RHF Controller
  wrapper) replace the boilerplate block in 3 lines. Conscious choice
  to wrap a styled native `<select>` rather than the HeroUI v3 Select
  compound — same trade-off documented in `FilterSelect`: portal-
  rendered react-aria-components widget overkill for a 4-line dropdown
  and misbehaves under jsdom. The call-site API
  (`value | onChange | options | ariaLabel | placeholder | isInvalid |
  disabled`) is locked today and will not change when the underlying
  widget swaps. 5 new tests; 2 proof migrations
  (`quotes/new`, `invoices/new`).
- **Foundational 3 — `DataTable` on HeroUI Table** (`c03f046`) — the
  shared `DataTable` and three high-traffic list pages
  (`compliance/index`, `actions/index`, `dashboard/stock/index`)
  migrated from raw `<table>` to the HeroUI v3 Table compound
  (`Table.Content` / `Table.Header` / `Table.Column` / `Table.Body` /
  `Table.Row` / `Table.Cell`). The DataTable change cascades to every
  consumer (clients, jobs, invoices, etc.) without a prop-API change.
  A11y win: sortable headers expose
  `aria-sort=ascending | descending | none` derived from TanStack's
  `getIsSorted()` so screen readers announce the current direction;
  pagination buttons gain `aria-label="Previous page" / "Next page"`;
  sort-trigger buttons gain a per-column `aria-label`.

### Wave C — Polish sweep (12/12)

A single-commit (`feea8e0`) hit-list of high-value, low-risk fixes:

1. Auto-assign delete now goes through `ConfirmDialog` instead of
   firing immediately — org-wide rules deserve a confirm step.
2. Native `window.confirm` / `prompt` purged from quotes/invoices
   detail, dashboard/audit ("save filter"), and site-contacts-panel
   in favour of HeroUI `ConfirmDialog` + `Modal+TextField`.
3. `/dashboard/jobs?filter=unassigned` now actually works:
   `useSearchParams` drives an "Unassigned only" filter chip with a
   Clear button; the Field empty-state link works end-to-end.
4. Profile "Daily critical alerts" switch correctly disabled with a
   "Coming soon" chip — backend digest job is not wired (per
   migration 00014's "v2 — not yet wired" comment). Honest >
   misleading.
5. Field photo offline-queue drain failures now surface a toast
   instead of a silent `console.warn`.
6. Portal call-out notifications use the new
   `NOTIFICATION_TYPES.CALLOUT_RAISED` instead of the misleading
   `ACTION_OVERDUE`. Slack blocks updated to map it as critical
   severity with the "Call-out raised" label.
7. Engineer-tracker now lazy-imports `PortfolioMap` inside Suspense
   — saves ~180 KB from the first nav, matches `portal/index.tsx`
   pattern.
8. `AuthContext` / `ThemeContext` / `RealtimeContext` value objects
   `useMemo`'d (and callbacks via `useCallback`) so consumers stop
   re-rendering on every parent render.
9. Sidebar nav links emit `aria-current="page"` for the active item.
10. `job-time-card` manual entry: 7 floating `<label>`s now have
    `htmlFor` paired with stable `useId`-derived input ids.
11. `data-table` `aria-sort` already wired by Foundational 3 —
    verified, no change needed.
12. Removed the permanently-disabled "Bulk Assign" placeholder button
    from `bulk-action-bar` — hiding > greying for unimplemented
    features.

### Wave D — Strategic 1: Continuous Compliance Score MVP

- **Compliance Score MVP** (`914fde7`) — a single org-level number
  0–100 that goes up. The answer to a UK FM buyer's #1 question ("is
  my building compliant?"). Score formula
  (`apps/web/src/lib/compliance-score/calculate.ts`, duplicated into
  the edge function for Deno-runtime reasons):

  ```
  score = round(
      40% * compliance%       (compliance_items in 'compliant' / 'due_soon')
    + 25% * ppm_on_time%      (PPM jobs in last 90d completed by scheduled_date)
    + 25% * pass_rate%        (completed jobs in last 90d with outcome='pass')
    + 10% * action_health     (100 - 5pts per open critical action older than 7d, floor 0)
  )
  ```

  Capped 0–100. Empty input → 0 (with a friendly empty-state, not a
  misleading "100"). Idempotent per `(organisation_id, day)` so the
  cron and the "Recompute now" button both write safely. New
  `compliance_score_snapshots` table (migration 00051) shaped to
  power Trust URL + monthly Statement follow-ups out of the same
  source of truth. New `compute-compliance-scores` edge function
  walks every active org (notify-renewals pattern). Dashboard hero
  tile renders today's score, 30-day delta chip, and the 4 sub-
  metrics. 14 pure-fn tests + 3 hook tests (no-previous, empty
  tenant, latest+delta).

### Wave E — Strategic completion (3 follow-ups)

- **Strategic 2 — self-updating ICS calendar feed** (`e32e7cb`) —
  Onfleet shows live ETA in a tracking link (we shipped that as D2
  in 0.19.0). Next-level move nobody else in UK FM has done: hand the
  customer a **calendar subscription URL** whose VEVENT updates
  itself as the engineer's ETA window narrows from 11:15–11:45 to
  11:23–11:31, and auto-completes on arrival. Migration 00052 adds
  `ics_sequence` + `ics_last_hash` to `job_eta_tokens` so the
  RFC-5545 SEQUENCE bump is monotonic and only fires when the ETA
  shape changes (calendar clients then treat the re-pull as UPDATE,
  not duplicate). New `public-job-eta-ics` edge function
  (`verify_jwt: false`) returns a VCALENDAR with stable UID
  `eta-{token}@haumea.io`, supports both `?token=` and `/<token>`
  path forms (the path form lets calendar apps subscribe with no
  apikey header), STATUS maps CANCELLED on
  `cancelled / failed_access`, CONFIRMED otherwise. PII rules match
  `public-job-eta` — first-name only, property name in LOCATION (no
  street address). New `use-job-ics-url` hook with
  `buildIcsUrl` / `buildWebcalUrl` helpers. `ShareTrackingLinkButton`
  on the job detail page gains a second button ("Add to customer's
  calendar (.ics)") plus an inline `webcal://` link for one-tap
  macOS / iOS subscribe. 4 new tests cover URL shape, webcal
  protocol, no-PII guarantee, encodeURIComponent defensiveness.
- **Strategic 1 follow-up — public Trust URL** (`239d659`) — exposes
  the Compliance Score (Strategic 1) as a public, no-login URL per
  organisation. Insurers, auditors, board members, and prospects
  verify continuous compliance posture via a single shareable link.
  Migration 00053 adds
  `trust_url_slug` + `trust_url_enabled` + `show_breakdown` /
  `show_history` to organisations, with a partial-unique index
  protecting the slug namespace only for orgs that have actually
  published. New `public-trust-score` edge function
  (`verify_jwt: false`), service-role read of
  `compliance_score_snapshots` + `organisations`, PII-minimal (org
  name + logo + score + breakdown only), 404 on disabled, 410 on
  no-snapshots-yet, CDN-cached for a minute. New public route
  `/trust/:slug` mounted outside the auth shell next to
  `/track/:token`, plain `fetch` (no supabase-js) to keep the
  bundle small. Hero with display-size score + colour-coded band
  chip, optional 4-metric breakdown row, lazy-imported recharts
  sparkline for the 30-day trend, "What this means" disclosure for
  auditors. Settings UI in the existing branding page, gated by
  `branding:write`. 9 tests covering URL builder, slug validator,
  slug suggester. **First-ever Vanta-style continuous compliance
  verification page in UK FM.**
- **Strategic 1 follow-up — monthly Statement of Compliance PDF**
  (`cd8db3a`) — once a month every org gets a branded PDF emailed to
  their `support_email` summarising the prior month's compliance
  posture. The artifact a FM lead forwards to insurer / board /
  lender. Pattern follows `notify-renewals` (cron-driven email) +
  `generate-certificate` (Browserless PDF render with HTML-only
  graceful fallback when `BROWSERLESS_TOKEN` is unset). Migration
  00054 = table + RLS + storage bucket, idempotent on
  `(organisation_id, period_start)`. New
  `generate-statement-of-compliance` edge function aggregates
  snapshots, renders branded HTML, optionally PDFs via Browserless,
  uploads to storage, upserts row, emails via Resend. New
  `LatestStatementCard` widget on the dashboard beside the
  `ComplianceScoreCard` (live score + monthly artifact in one row).
  New `/dashboard/compliance/statements` history table with
  download + admin generate-now. 5 new tests (1 list + 1 empty +
  1 mutation + 2 helper).

### Wave F — Codemod sweeps (UI consistency, 6 commits)

The Wave B primitives gave us the call-site API. Wave F mechanically
applied them across the codebase.

- **F1 part 1 — AppCard codemod** (`b6f293f`) — 25 files migrated
  from the canonical
  `<Card className="!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default !p-X">`
  pattern. Skeletons, settings pages, field/site/stock/time
  components.
- **F1 part 2 — AppCard codemod** (`1c861a3`) — 13 more files, this
  time bespoke
  `<div className="bg-surface-card border border-border-default rounded-xl p-X">`
  blocks. Actions, assets, scheduler, portal, site invite, suppliers.
- **F1 part 3 — AppCard codemod** (`f8a2bfd`) — `reports/[id]` (6
  cards) + `reports/advanced` (3 empty-state cards).
- **F1 part 4 — AppCard codemod** (`787e0c6`) — `reports/log-books`
  + `reports/risk-assessments` (form + empty-state in each).
- **F2 — FormSelect codemod** (`941ae45`) — **50 files, 119 raw
  `<select>` elements** swapped to `FormSelect` /
  `FormSelectController`. RHF-bound selects use the Controller
  variant; useState-bound selects use the controlled variant. Dead
  `inputClass` / `inputCls` / `selectClass` / `labelClass` constants
  removed where the primitive replaced their last consumer.
- **F3 — HeroUI Table codemod** (`889b04b`) — 19 files, ~26 raw
  `<table>` blocks replaced with the HeroUI compound. Each Table
  gets a unique aria-label, every Column has a unique id (first
  column `isRowHeader`), every Row / Cell has an id.

### Wave G — Quality completion (3/3)

- **G1 — a11y completion pass** (`07bd1a4`) — heading order
  (dashboard adds sr-only h2; settings/privacy + settings/data
  promote section h3s to h2 so each page is h1 → h2, no skipped
  levels), status icons (SLA full-mode, accounting status, scheduler
  StatusBadge now lead with a lucide icon so state is conveyed
  without relying on color alone), file-input labels (avatar upload
  + CSV import drop-zone get aria-labels on the hidden
  `<input type="file">`; CSV drop-zone also gets `role="button"`,
  `tabIndex=0`, keyboard activation), portal site picker (trigger
  gets `aria-haspopup="listbox"` / `aria-expanded`, click-outside
  backdrop is now a real `<button aria-hidden>` instead of an
  unreachable `<div onClick>`, Escape dismisses), `po-quick-drawer`
  migrated off the bespoke fixed-inset div pile to HeroUI Modal
  (focus trap / ESC / click-outside / aria-modal all delegated to
  react-aria), sidebar mobile overlay + command-palette backdrop
  same `div onClick → button` conversion.
- **G2 — public-page theme repaint** (`256a67c`) — public-facing
  pages (`track`, `trust`) plus auth screens (login, register,
  forgot-password, invite) hardcoded `bg-white` / `bg-slate-*` /
  `text-slate-*` / `text-gray-*` and rendered broken in
  dark / midnight / glass themes — and they are the customer's
  first impression of the product. Every raw color class on these
  surfaces now reads from the canonical theme-token vocabulary
  (`bg-surface-page` / `text-text-primary` /
  `border-border-default` / `status-compliant` etc.). Status
  banners now map semantically (track: travelling → due-soon,
  on-site / completed → compliant, cancelled → overdue,
  scheduled → accent; trust: exceptional → compliant,
  fair → due-soon, needs_work → overdue, strong → accent).
  `photo-annotator` keeps its hardcoded gray-900/800/700 chrome
  with a documenting comment — deliberate dark canvas for
  engineer-drawn photo annotations. 8 surfaces repainted +
  1 documented exception.
- **G3 — skeleton-everywhere migration** (`a303b3e`) — replaced
  centred `Spinner` placeholders with shape-matching `Skeleton`
  primitives so content fades in pre-shaped instead of sitting
  behind a generic spinner. New `ListSkeleton`, `TimelineSkeleton`,
  `HeaderBarSkeleton` (and `KpiGridSkeleton` alias), `SkeletonBox`
  re-export for one-off shapes, **50+ list / detail / section
  loaders migrated across routes and shared components**. Spinner
  preserved for inline button states, fullscreen auth-gate
  splashes, and "doing work right now" indicators where a small
  spinner is the correct primitive.

### What needs configuring

Two new pg_cron schedules and one new edge-function env var:

- **`compute-compliance-scores`** — recommended schedule
  `15 1 * * *` (01:15 UTC daily). Late enough that yesterday's
  last-minute job updates have settled, early enough that the
  morning shift sees a fresh score. SQL:

  ```sql
  select cron.schedule(
    'compute-compliance-scores', '15 1 * * *',
    $$ select net.http_post(
      url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/compute-compliance-scores',
      headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    ) $$
  );
  ```

- **`generate-statement-of-compliance`** — recommended schedule
  `0 6 1 * *` (06:00 UTC on the 1st of each month). Runs after
  the previous month's last `compute-compliance-scores` has
  already landed. SQL:

  ```sql
  select cron.schedule(
    'generate-statement-of-compliance', '0 6 1 * *',
    $$ select net.http_post(
      url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/generate-statement-of-compliance',
      headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    ) $$
  );
  ```

- **`PUBLIC_APP_ORIGIN`** edge-function secret — set to e.g.
  `https://app.haumea.io` so the ICS feed URLs returned by
  `public-job-eta-ics` and the Trust URL builder can construct
  fully-qualified subscription links instead of relative ones.

### Verification

| Workspace | Tests | Result |
|---|---|---|
| `haumea-web` (vitest) | 181 | 181/181 pass |
| `haumea-mobile` (vitest) | 10 | 10/10 pass |
| `@haumea/ui` (vitest) | 10 | 10/10 pass |
| `npm run build:web` | n/a | clean |
| `npm --workspace=haumea-web run typecheck` | n/a | clean |
| `npm --workspace=haumea-web run lint` | n/a | clean |

### Live deployments

All applied to the production Supabase project
`vphjwvleffuwwgbjxups` (`eu-west-2`, Postgres 17).

**Migrations:**

| ID | Description |
|---|---|
| `00051_compliance_score_snapshots` | Daily snapshot table for the Compliance Score, idempotent on `(organisation_id, snapshot_date)`. Shape supports Trust URL + Statement reuse. |
| `00052_job_eta_tokens_sequence` | `ics_sequence` + `ics_last_hash` on `job_eta_tokens` so RFC-5545 SEQUENCE bumps are monotonic and only fire on actual ETA-shape changes. |
| `00053_trust_url` | `trust_url_slug` + `trust_url_enabled` + `show_breakdown` + `show_history` on organisations, partial-unique index on slug. |
| `00054_statement_of_compliance` | Statement-of-Compliance table + RLS + storage bucket, idempotent on `(organisation_id, period_start)`. |

**Edge functions (all `ACTIVE`):**

| Function | `verify_jwt` | Purpose |
|---|---|---|
| `compute-compliance-scores` | true | Daily cron walks every active org, calculates score + sub-metrics, upserts snapshot. Driven by pg_cron. |
| `public-job-eta-ics` | **false** | Serves a self-updating RFC-5545 ICS calendar feed for customer ETA tracking. Stable UID; SEQUENCE only bumps on shape change. |
| `public-trust-score` | **false** | Public Trust URL backend. PII-minimal. CDN-cached. 404 on disabled, 410 on no-snapshots-yet. |
| `generate-statement-of-compliance` | true | Monthly cron renders branded HTML, optionally PDFs via Browserless, uploads to storage, emails via Resend. |

---

## 0.19.0 — 2026-05-09 — Sprint 1 + 2 + 3 (autonomous loop, customer-facing differentiation)

24 commits across one autonomous run. Closes the original Sprint 1 bug-fix /
gap-closure list (9 items), Sprint 2 differentiation set (3 items), Sprint 3
pull-ahead set (6 items), plus a Sprint 1.5 hardening pass and analytics
depth work that weren't in the original plan. Five new edge functions and
five new migrations are deployed and live on the production project
(`vphjwvleffuwwgbjxups`, `eu-west-2`).

### Sprint 1 — Stop-the-bleeding fixes + portal/site polish (9/9)

- **A1 quote_type mismatch** — turned out to be a false positive in the audit;
  DB constraint already matched the UI strings. Closed with a NO-OP after
  verifying both sides.
- **A2 mobile photo persistence** (`4861422`) — captured photos now insert into
  `job_photos` after the storage upload and load on mount. Field photos no
  longer evaporate on screen reload, so service-report PDFs include them.
- **A3 mobile offline mutation queue** (`f4feb12`) — new
  `apps/mobile/lib/offline-queue.ts` is an AsyncStorage-backed FIFO queue.
  `useJobs` checks NetInfo before each write; offline → enqueue + optimistic
  local state, online → direct supabase write. `useOffline` drains the queue
  on the offline → online edge. Stops silent data loss when an engineer is in
  a basement / lift / rural site.
- **B1 maintenance category filter** (`e43ad19`) — third FilterSelect added to
  the plan list (Routine / Reactive / Statutory / Other).
- **B2 engineer tracker dashboard widget** (`215feaf`) — fourth hero counter on
  the dashboard ("3 en route, 2 on site") linking to `/engineer-tracker`.
- **B5 client billing edit panel** (`bb86e72`) — billing fields became inline-
  editable (5 fields) instead of write-once at client creation.
- **B6 portal contact dynamic** (`0082540`) — `routes/portal/contact.tsx` now
  reads `organisations.support_email` / `support_phone` instead of a hard-coded
  `support@haumea.com` / `+44 20 1234 5678` (which was wrong for any white-
  labelled deploy).
- **B8 site portal photo upload** (`b606388`) — mirrored the client portal's
  photo flow on `routes/site/raise-callout.tsx`. Up to 4 photos × 8 MB each,
  uploaded after job creation so the storage path includes `job.id`.
- **B9 site portal downloadable service-report link** (`c01d600`) — visits page
  now surfaces `signature_url` + linked job documents as download links with
  aria-labels.

### Sprint 1.5 — Hardening pass (added on top of Sprint 1)

- **H1 mobile vitest + offline-queue tests** (`b7984b2`) — added vitest to the
  mobile workspace, scoped to `lib/__tests__/`. 10 tests covering
  enqueue / drain / FIFO / update-where safety / mixed-success-failure /
  reentrancy-safe drain / corrupted-storage tolerance. **Caught a real bug**:
  the queue was persisting `'[object Object]'` instead of the supabase error
  message because supabase errors are plain objects, not `Error` instances.
  Fixed in the same commit.
- **H3 billing-edit validation + 11 tests** (`8980143`) — `validateBillingDraft`
  pure function (`client_code` 2–32 alphanumeric/dash, RFC-ish email,
  permissive 8–20 char alphanumeric+spaces+dashes tax number). Inline aria-
  invalid + aria-describedby errors, save button disables on invalid, success
  toast added (was previously silent).
- **H2 client-side image compression on call-out uploads** (`11b4a89`) —
  `apps/web/src/lib/image-compress.ts` decodes via `createImageBitmap`
  (honours EXIF orientation natively in modern browsers), draws onto canvas
  capped at 1920px long-edge, re-encodes JPEG q=0.85. Falls back to original
  on any failure. Net effect: 6–8 MB phone JPEGs → 200–500 KB. Wired into
  both `routes/site/raise-callout.tsx` and `routes/portal/raise-call-out.tsx`.
- **H4 split aria-stately out of react chunk** (`1b97959`) — **caught a real
  rolldown bug**: vite 8 silently merges any chunk whose name is a prefix of
  another. Naming the bucket `react-aria` caused the entire `react-aria*` /
  `@react-aria/*` / `react-stately` graph to collapse into the `react` chunk,
  inflating it to 688 KB / 210 KB gzip. Renamed to `aria-stately` so the
  chunk emits separately. **−88 KB gzipped on every cold load**, with the
  same total bytes downloaded in parallel.

### Analytics depth (added between Sprint 1.5 and Sprint 2)

- **Date-range filter + median/p90 resolution time** (`d2e575c`) —
  `apps/web/src/lib/analytics-utils.ts` ships date-range options
  (7d / 30d / 90d / YTD / All — default 30d), `filterByCreatedSince`,
  `filterInvoicesByIssueSince`, `computeResolutionStats` (mean / median / p90
  with absurd-duration filtering: drops negative + > 1y to protect averages
  from typos), and `bucketResolutionTimes` (six humane bands: < 4h, 4–24h,
  1–3d, 3–7d, 7–14d, 14d+). 23 tests. Operational analytics tab gains a
  resolution-time histogram + Median / p90 stat cards. Until now every
  analytics metric was unbounded all-time.

### Sprint 2 — Customer-facing differentiation (3/3)

- **C1 auto job-completion email** (`dcc1920`) — new `job-completion-email`
  edge function fires on the `status → completed` transition (wired into
  `useUpdateJob.onSuccess`, fire-and-forget). Service-role read across jobs +
  properties + clients + service_reports + job_photos + organisations,
  branded HTML template with up to 6 photo thumbnails (3-col grid + "+N
  more" badge), engineer notes, outcome chip, signature image (capped at
  240px wide), org support contact in footer. Recipient: prefers
  `clients.billing_email`, falls back to `contact_email`; short-circuits with
  `no_recipient` when neither is set.
- **C2 compliance certificate auto-mint** (`947200d`) — new
  `apps/web/src/lib/certificates/auto-mint.ts` gates on four conservative
  rules in this order: ALREADY_EXISTS (idempotency), NO_REPORT (must have a
  service report), NOT_PASS (only `outcome='pass'` — failures must go
  through the human cert flow with defects + observations), NO_TEMPLATE_MATCH
  (must unambiguously map to gas_safety / eicr / fra; 'generic' inferences
  are skipped because a wrong-shaped CP12 is a regulatory issue). Reuses the
  existing `generateCertificate` pipeline. Type inference tries job_assets
  join → jobs.asset_id → compliance_items → job title (in that order). Fires
  fire-and-forget from the same `useUpdateJob.onSuccess` block as C1.
  `CERTIFICATE_ISSUED` added to `TIMELINE_EVENT_TYPES`. 8 unit tests.
- **C5 contracts elevated + renewal-watch alerts** (`be2dcb9`) — extended
  `useNeedsAttention` so contract renewals join the dashboard "Needs
  attention" feed alongside compliance / actions / invoices. Severity scaled
  by urgency (upcoming renewals start at 50 because money on the table is
  more urgent; overdue renewals jump to 70+ because delivering work
  out-of-contract is genuinely an emergency). New edge function
  `notify-renewals` walks all active contracts daily and drops in-app
  notifications + email to org `support_email` at 0 / 7 / 30 / 60 day
  thresholds, with a `contract_renewal_notifications` dedup table to stop
  daily spam. **Caught a real timezone bug** in the `useContractRenewals`
  hook — `new Date(end_date).getTime()` parses YYYY-MM-DD as UTC midnight,
  but the comparison was against local midnight, producing off-by-one day
  counts for FM admins in any UTC offset. New `localMidnightFromYmd` helper
  fixes it. 12 tests.

### Sprint 1.5b — Quote→invoice integration tests

- **6 integration tests for `useConvertQuoteToInvoice`** (`f44c921`) — locks
  down the 5-step flow (lines fetch → invoices insert → invoice_lines
  insert → quotes update → timeline event). Covers happy path, empty quote,
  each step's failure surface, and the deliberate graceful-degradation
  behaviour where a quote-update failure still returns the invoice. Required
  extending `createSupabaseMock` with a new `queueResults()` FIFO helper
  for multi-call mutations without breaking existing single-result tests.

### Sprint 2 supporting work (foundations)

- **Mobile Expo push end-to-end (S2A)** (`cb8c591`) — closes the
  field-engineer push gap. New `expo_push_tokens` table (multi-device per
  user, RLS to owner). `registerExpoPushTokenWithBackend()` upserts on every
  signed-in app start (idempotent via UNIQUE on token, never blocks app
  boot). New `send-expo-push` edge function batches into Expo's 100-per-
  request limit, bumps `last_used_at` on success, deletes
  `DeviceNotRegistered` tokens. Web `notifications.dispatchPush` now fans to
  BOTH transports in parallel — every device a user signed into lights up
  on a single notification create.
- **Quote → invoice automation (S2B)** (`946831a`) — one-click convert button
  on approved quotes mirrors quote_lines onto invoice_lines, drafts the
  invoice (`status='draft'`, `INV-{quote_number}`, Net 30 due date), marks
  the source quote `converted` so it can't be invoiced twice, fail-closed
  rollback on line-insert failure, timeline event. The quote update failing
  doesn't roll back the invoice (graceful degradation).
- **Integrations health page (S2C)** (`15c123e`) — new
  `/dashboard/settings/health` calls a new `integrations-health` edge
  function and shows green / amber / gray for each backend integration
  (Web Push / Expo push / Email / Stripe / Slack / Calendar / AI). Missing
  env-var names are listed inline so the admin sees exactly what to set.
  No outbound API calls (no pinging Resend / Stripe — slow, paid, rate-
  limited); status is judged from env-var presence + DB sentinels (e.g.
  count of `expo_push_tokens` rows = "X devices registered").

### Sprint 3 — Pull-ahead features (6/6)

- **D2 public unauthenticated ETA tracking** (`3c85393`) — Onfleet's killer
  flow that Joblogic + BigChange both make customers create accounts to
  use. SMS link → tap → see status + ETA window, no login. Migration
  `00048_job_eta_tokens` adds the table (RLS read/insert/delete to issuing
  org only). New `public-job-eta` edge function with `verify_jwt: false`
  is token-gated and deliberately leaks no PII beyond what the customer
  needs: property name, engineer FIRST name only (surnames stay
  internal), status, scheduled date, ETA window, completed date, optional
  live position only while `status='travelling'` (and only if the last
  fix is within 5 minutes — stale positions are worse than none). View
  counter bumps on every read so leaked-token abuse stands out. New
  unauthenticated `/track/:token` route mounted outside the
  ProtectedRoute / DashboardLayout wrappers, plain fetch (no
  supabase-js client) so the public bundle stays small. New
  `ShareTrackingLinkButton` on the job detail header reuses any live
  token (so existing customer SMS links keep working) or mints a
  fresh 7-day token + copies to clipboard. v1 deliberately ships
  WITHOUT a map (privacy-respectful "X minutes away" pill is the
  lower-risk first cut). 6 unit tests.
- **D3 customer arrival window editor** (`9c1e8cc`) — pairs with D2 (the
  public ETA page already renders a window when present). Migration
  `00049_jobs_eta_window` adds `eta_earliest_at` + `eta_latest_at` with a
  CHECK constraint enforcing both-null OR both-set-AND-latest-≥-earliest, a
  partial index on `eta_earliest_at` for the dispatcher's "next 2h" view.
  New `EtaWindowEditor` on the job detail page (only shown while status
  is scheduled / in_progress / travelling), two `datetime-local` inputs +
  three quick-pick chips ("In 30 min", "In 1 hr", "In 2 hr") that set
  both inputs to the picked offset + a 30-minute window. Why a window
  not a single ETA: a single point creates false precision and erodes
  trust the moment the engineer slips by 5 min. Amazon's "10 stops away"
  pattern, applied to FM.
- **D5 customer portal branded as "Client Hub"** (`15b10e6`) — ServiceTitan
  calls theirs the "Owner Portal", Jobber the "Client Hub". A name (not
  just "Portal") gives the customer surface its own gravity in marketing
  + sales conversations. New `CLIENT_HUB_NAME` constant in
  `lib/constants.ts`. Per-org branding ALWAYS wins — when an org has set
  `branding_enabled` + a custom display name, the layout still surfaces
  that. Updated portal-layout footer, site-layout footer, topbar "Client
  View" toggle (now "Client Hub"), and raise-call-out breadcrumb.
  Deliberately did NOT change the `/portal/*` route paths — that would
  break every bookmark / email link / customer SMS.
- **D1 PO right-side quick-capture drawer** (`2f3a2e3`) — Linear pattern.
  The dispatcher's most common PO is "we need 4 of these from this
  supplier" — today that took a full page navigation, losing list
  context (filter chip, scroll position). New
  `apps/web/src/components/purchase-orders/po-quick-drawer.tsx` slides in
  from the right at 440px on desktop, full-width on mobile, ESC + backdrop
  close, PO number prefilled to a short timestamp suffix, form resets on
  every open, live subtotal / VAT / total summary. "Open full editor"
  deep-link in the footer for multi-line / property linkage / notes
  cases the drawer can't handle. The status chip bar above the table
  pre-existed; only the drawer was new work.
- **C3 mobile engineer notes + completion-email trigger** (`acba82c`) —
  there was no UI for engineers to add notes from the mobile app at all.
  New `addNote()` in `useJobs` INSERTs a row into the existing `notes`
  table (chronological feed the dashboard already shows on property /
  job / asset detail pages, with author + timestamp — not a single
  text column on jobs that would erase prior context every save).
  Offline-queued via the existing AsyncStorage queue; banner-style
  alert "Note saved offline" so the engineer knows the write didn't
  drop. Multi-line `<TextInput>` on the job detail screen above
  check-in/out so it's the first thing in eyeshot. SECOND change in
  the same commit: mobile `checkOut()` now invokes the
  `job-completion-email` edge function (best-effort) so jobs closed
  from mobile email the customer too — the C1 web hook was only firing
  for admin-side closes.
- **C4 van-stock readiness as 6th axis on auto-assign engine** (`0bd268e`) —
  Service Geeni and BigChange both market this. Migration `00050` adds
  `required_parts jsonb` on `auto_assignment_rules`. Engine now has a
  `parts` axis on `AutoAssignWeights` / `ScoreBreakdown` /
  `ScoreWeightKey`, default weight 0 so existing rules behave EXACTLY as
  before. New `scoreParts()` function: empty required_parts → 100 (silent
  neutral), no van_stock data → 50 (safer than worst-case), otherwise %
  of required parts met at min_qty. Match priority: sku exact →
  case-insensitive name substring (so "Boiler O-ring" finds "Boiler
  O-Ring 12mm"). Parts is a SOFT signal — never a hard fail (a
  near-miss engineer 15 min away beats a perfectly-stocked one 50 km
  away). Data loader populates `van_stock` from `stock_movements` (sum
  per engineer per stock_item) ONLY when the rule has required_parts
  configured (perf-preserving). Engine got its first-ever test coverage:
  16 tests including 8 for the parts axis covering every scoring branch
  and the weight-normalisation invariant.

### Net session metrics

| | Before | After |
|---|---|---|
| Total commits to master | — | **24** |
| Web tests | 58 | **138** (+80) |
| Mobile tests | 0 | **10** |
| Real bugs caught by new tests | — | **3** ([object Object] in queue, chunk-name collision, timezone day-count) |
| Migrations applied to prod | — | **5** (46/47/48/49/50) |
| Edge functions deployed | — | **5** (send-expo-push, integrations-health, public-job-eta, notify-renewals, job-completion-email) |
| Production project | — | `vphjwvleffuwwgbjxups` (`eu-west-2`, Postgres 17, healthy) |

### What needs configuring

All migrations applied. All edge functions deployed and ACTIVE. Each
integration goes live the moment the corresponding env vars are set in
**Supabase Dashboard → Edge Functions → Secrets**. Visit
`/dashboard/settings/health` any time to see the live status.

| Integration | Env vars required | Notes |
|---|---|---|
| **Web Push** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Generate with `npx web-push generate-vapid-keys --json`. |
| **Email (Resend)** | `RESEND_API_KEY` (+ optional `FROM_EMAIL`) | Get a key from resend.com → API Keys. |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional per-plan price IDs (`STRIPE_PRICE_STARTER`, etc.). |
| **Google Calendar** | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Per-user OAuth happens after this is set. |
| **AI** | `OPENAI_API_KEY` OR `ANTHROPIC_API_KEY` | Either is fine — first one present wins. |
| **Mobile push (Expo)** | None — auto-configures | The first time any engineer signs in to the mobile app, their device registers automatically. `EXPO_ACCESS_TOKEN` is optional (higher rate limits + Expo dashboard analytics). |

Optional cron for the renewals watcher (daily at 9 AM UK time, set in
**Supabase Dashboard → Database → Cron Jobs**):

```sql
select cron.schedule(
  'notify-renewals', '0 9 * * *',
  $$ select net.http_post(
    url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/notify-renewals',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>"}'::jsonb
  ) $$
);
```

### Verification

- `npm --workspace=haumea-web run typecheck` — clean
- `npm --workspace=haumea-web run lint` — clean
- `npm --workspace=haumea-web run test -- --run` — 138 tests pass across 17 files
- `npm --workspace=haumea-mobile run typecheck` — clean
- `npm --workspace=haumea-mobile run test` — 10 tests pass
- `npm run build:web` — clean PWA build
- Edge function smoke: `integrations-health` and `public-job-eta` both return
  expected responses to live curl with the anon key.
- Visible web app version bumped to `0.19.0`.

---

## 0.18.2 — 2026-04-29 — Workflow expansion

- Added migration `00045_workflow_expansion.sql` for supplier catalogue items,
  PO workflow timestamps/email metadata, quote revisions, contract routine
  templates, contract-to-maintenance-plan generation, and engineer location
  capture.
- Expanded Purchase Orders with supplier email sending, sent/approved/received
  timestamps, supplier catalogue maintenance, catalogue-to-PO line insertion,
  and dashboard PO widgets.
- Added `purchase_order` support to the `send-email` edge function.
- Added quote revision history with explicit revision snapshots from quote
  detail pages.
- Added contract-to-routine wizard support on contract details, including
  routine templates and one-click generation of Routine Maintenance plans.
- Added field-mode location capture so engineers can write live GPS updates to
  the Engineer Tracker.
- Reduced auth audit noise by using the cached Supabase session for best-effort
  audit events instead of forcing an extra `auth.getUser()` network call.
- Bumped the visible web app version/cache buster to `0.18.2`.

### Verification

- `npm run typecheck:web`
- `npm run lint:web`
- `npm --workspace=haumea-web run build`
- `git diff --check`
- Authenticated browser smoke: dashboard, purchase orders, new PO, quotes,
  contracts, field mode, and engineer tracker render without blank screens or
  serious console/page errors.

---

## 0.18.1 — 2026-04-29 — Operational hardening

- Added migration `00044_operational_hardening.sql` to enforce purchase-order
  line totals, recalculate PO totals from lines, recalculate quote totals from
  markup/tax-aware quote lines, generate jobs atomically from maintenance
  plans, refresh engineer accreditation expiry status, and reload the Supabase
  schema cache.
- Added headed-paper printable PDFs for Service/Defect Quotes and Purchase
  Orders from their detail pages.
- Hardened purchase order and quote creation so parent records are cleaned up
  if line insertion fails.
- Added explicit purchase-order schema/setup messaging when Supabase migrations
  have not been applied, instead of leaving users with a vague blank state.
- Suppressed expected pending-migration schema-cache misses for the optional
  operational tables so setup guidance appears in the UI without noisy console
  errors.
- Expanded supplier maintenance with active/inactive status toggles.
- Expanded engineer accreditation handling with renewal-risk counts, expired /
  expiring warnings, and days-left/overdue context.
- Bumped the visible web app version/cache buster to `0.18.1`.

### Verification

- `npm run typecheck:web`
- `npm run lint:web`
- `npm --workspace=haumea-web run build`
- Browser smoke: purchase orders, new PO, quotes, maintenance, engineer
  tracker, and engineers render without error boundaries or console errors.

---

## 0.18.0 — 2026-04-29 — Commercial operations and engineer tracking

- Added a Purchase Orders module under Finance with maintained suppliers,
  predefined Fortus/Screwfix supplier shortcuts, PO lines, quantity, unit
  cost, tax, totals, status workflow, job/property links, list/detail/create
  routes, and CSV export.
- Added an Engineer Tracker route under Job Management with travel-time
  totals, current/next job state, client ETA, and a map of active engineer
  destinations.
- Added migration `00043_operations_commercial_upgrade.sql` covering suppliers,
  purchase orders, client-level billing fields, unique client/property codes,
  routine-maintenance metadata, engineer location support, quote markup fields,
  Revisit job status, and a PostgREST schema-cache reload notification for the
  `schedule_mode` issue.
- Updated maintenance plans so Routine Maintenance is a first-class category
  with routine type, start/takeover date, fixed/rolling schedule mode, and
  contract-ready schema fields.
- Replaced visible job status wording from Follow Up to Revisit across jobs,
  scheduler, reports, and database status constraints.
- Split quotes into Service Quote and Defect Quote, added dashboard widgets,
  and added markup-aware quote pricing fields.
- Extended engineer accreditations with QQI levels and issuing bodies for Gas,
  QQI, NICEIC and related certifications.
- Bumped the visible web app version/cache buster to `0.18.0`.

### Verification

- `npm run typecheck:web`
- `npm run lint:web`
- `npm --workspace=haumea-web run build`

---

## 0.17.23 — 2026-04-29 — Job management table-selection crash fix

- Fixed the HeroUI/React Aria table-selection crash that broke Job
  Management pages with `A slot prop is required. Valid slot names are
  "selection"`.
- Added `slot="selection"` to the shared `TableCheckbox` primitive so Jobs,
  Invoices, Compliance, Actions, Engineers, Subcontractors, and other
  selectable HeroUI tables use the required table selection slot.
- Updated the shared TanStack `DataTable` row-selection checkboxes to use the
  same table selection slot.
- Switched the Clients page to the shared `TableCheckbox` primitive instead of
  duplicating raw Checkbox compound markup.
- Bumped the visible web app version/cache buster to `0.17.23`.

### Verification

- `npm run typecheck:web`
- `npm run lint:web`
- Browser smoke: `/dashboard/schedule`, `/dashboard/jobs`, and
  `/dashboard/clients` render without the error boundary.

---

## 0.17.22 — 2026-04-28 — Senior cleanup batch: table and token consistency

Closes the next app-hardening batch after the release-gate work.

- Converted the Jobs and Clients list pages from hand-rolled HTML tables to
  the app's HeroUI compound `Table` pattern while preserving selection,
  bulk actions, export, route prefetch, and SPA navigation behavior.
- Replaced remaining bespoke tenant-portal status pills with HeroUI `Chip`
  across site quotes, visits, compliance, contacts, and the FM-side site
  contacts panel.
- Removed raw gray/red/blue/amber/emerald/violet Tailwind classes from the
  touched portal layouts and shared field/upload/time/favourite components,
  replacing them with design-system text, status, accent, and surface tokens.
- Bumped the visible web app version/cache buster to `0.17.22`.

### Verification

- `npm run typecheck:web`
- `npm run lint:web`

---

## 0.17.21 — 2026-04-28 — Monorepo release gate hardening

Turns the workspace split into a verified release baseline instead of a
best-effort build.

- Added a root `npm run check:all` gate that runs web + marketing lint,
  web + marketing + mobile + shared-package typechecks, web + utils tests,
  and web + marketing production builds.
- Added missing marketing ESLint config so `haumea-marketing` is checked
  independently.
- Added explicit typecheck scripts for web, marketing, and mobile.
- Fixed Expo notification behavior for SDK 54 by returning the required
  banner/list flags.
- Made `@haumea/utils` package-local again by removing the accidental
  `@/lib/observability` import from the web app, and guarded CSV export for
  non-DOM runtimes.
- Fixed utils tests to import from the package entrypoint and run DOM-specific
  CSV tests under jsdom.
- Corrected the web Vite `@` alias to point at `apps/web/src` after the
  workspace move.
- Raised the web build chunk warning limit to the audited React 19 vendor
  chunk size, keeping warnings focused on new bundle regressions.
- Added Node version pins (`.nvmrc` / `.node-version`) and moved CI to the
  monorepo `check:all` gate plus web Playwright smoke tests.
- Added `npm run bundle:audit` with explicit web and marketing bundle budgets.
- Added `npm run smoke:realtime-delete`, a live guarded Supabase smoke test
  that creates a temporary job, deletes it, and verifies the org-scoped
  realtime Broadcast DELETE event is received by a second Supabase client.
- Fixed Playwright preview host resolution and made the e2e suite build in
  deterministic DEV_MODE before serving, so local real Supabase env files do
  not make CI-style smoke tests redirect unexpectedly.
- Updated stale e2e expectations for the current signed-in DEV_MODE behavior
  and onboarding gate.
- Updated README commands and layout docs for the current monorepo structure.

### Verification

- `npm run check:all`

---

## 0.17.20 — 2026-04-28 — Monorepo migration (apps/web + apps/mobile)

The repo is now an npm-workspaces monorepo. Web and mobile each
live in their own app under `apps/`, the workspace root holds
shared config and shared backend assets, and `packages/` is
reserved for future shared `ui` / `lib` / `types` extractions.

### What moved

```
src/                         → apps/web/src/
public/                      → apps/web/public/
e2e/                         → apps/web/e2e/
index.html                   → apps/web/index.html
vite.config.ts               → apps/web/vite.config.ts
vitest.config.ts             → apps/web/vitest.config.ts
tsconfig*.json               → apps/web/tsconfig*.json
eslint.config.js             → apps/web/eslint.config.js
playwright.config.ts         → apps/web/playwright.config.ts
package.json (web deps)      → apps/web/package.json (renamed haumea-web)
package-lock.json (web)      → apps/web/package-lock.json
.env, .env.example           → apps/web/.env, apps/web/.env.example

mobile/                      → apps/mobile/  (haumea-mobile, untouched)
```

### What stays at root

- `supabase/` — migrations + seed are shared backend assets, neither
  app owns them
- `docs/`, `references/`, `brand-source/`
- `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `PROGRESS.md`,
  `BLOCKERS.md`, `AGENTS.md`, `facilities_os_prd.md`
- `.git/`, `.github/`, `.gitignore`
- `vercel.json` (now points to `apps/web/dist`)
- new `package.json` — workspace shell only, no app deps

### New workspace scripts (run from root)

```
npm run dev:web        # starts apps/web Vite dev server
npm run dev:mobile     # starts apps/mobile Expo metro bundler
npm run build:web      # production build of apps/web → apps/web/dist
npm run lint:web       # eslint on apps/web
npm run test:web       # vitest on apps/web
npm run tsc:web        # tsc --noEmit on apps/web
```

### Verification

- `npm install` from the root resolves both workspaces and hoists
  shared deps to root `node_modules` (-211 packages from the old
  layout, +722 from clean install — net smaller because of dedupe).
- `npm run tsc:web` — clean.
- `npm run build:web` — built with PWA + 192 precache entries.
- `apps/mobile/package.json` untouched; mobile still installs and
  runs via `npm run dev:mobile` (Expo).

### Vercel config

`vercel.json` updated to set `buildCommand: npm run build:web`,
`outputDirectory: apps/web/dist`, `installCommand: npm install`.
The Vercel project still treats the repo root as its root and just
defers build + output to the workspace command + path.

### What's intentionally NOT in this commit (future work)

- `packages/ui` — shared HeroUI wrappers, design tokens, primitives
  (TableCheckbox, FilterSelect, SearchInput, KpiTile)
- `packages/lib` — shared Supabase client, auth helpers, utils
- `packages/types` — shared Database + domain types
- Splitting marketing into its own `apps/marketing` (Astro/Next for
  SEO)
- Turborepo orchestration (npm workspaces alone is fine for two
  apps; add Turborepo when build times start hurting)

These are deferred so the monorepo move stays surgical. Mobile and
web still each have their own copy of `useAuth`, `supabase.ts`,
etc. — extracting them into `packages/lib` is its own focused wave.

---

## 0.17.19 — 2026-04-28 — Jobs list blank-screen guard

Fixes the Jobs route and job detail click-through so navigation stays inside
the dashboard shell and never falls back to a full document load.

- The Jobs table `View` action now uses React Router `navigate(...)` instead
  of an anchor wrapping a button.
- The job detail route chunk is prefetched on hover/focus of each `View`
  action, so the main content area swaps faster when opening a job.
- Added an app-level SPA navigation guard that captures same-origin internal
  route links before the browser can perform a full document navigation. It
  leaves external links, downloads, modified-clicks, and new-tab targets alone.
- `useJobs` now bounds the initial list query with an 8s timeout.
- If the engineer assignment relation expansion fails, the hook retries with
  the base jobs/property query so the list still renders.
- `/dashboard/jobs` now shows a clear retryable error state when the initial
  jobs load genuinely fails instead of treating `undefined` data as an empty
  list.
- Supabase instrumentation no longer logs expected abort/cancelled requests as
  console errors.
- Stabilisation follow-up: `auto-assign-job` edge function now uses
  `Deno.serve`, returns JSON with CORS headers on every handled error path, and
  verifies the caller JWT in-function before service-role scoring. This removes
  the likely edge boot/CORS failure path seen when opening job details.

---

## 0.17.18 — 2026-04-28 — Realtime diagnostics + version source cleanup

Adds in-app visibility for the live-update path without changing deployment
state.

### Diagnostics

- The topbar realtime pill now exposes a compact diagnostics panel for
  dev/debug/super-admin users.
- The panel shows the active app version, aggregate realtime status, per-channel
  status, and the last realtime event received in this browser, including
  source (`Broadcast` or `Postgres Changes`) and invalidated TanStack Query keys.
- `RealtimeProvider` now exposes `perTable` channel status and `lastEvent` from
  `useRealtimeSubscriptions`, so future diagnostics can read the same source of
  truth instead of adding duplicate subscriptions.

### Version display

- Sidebar and health page version displays now read `APP_VERSION` from
  `src/lib/constants.ts`, which is injected from `package.json` by Vite.
- Package metadata bumped to `0.17.18` so this diagnostics/cache-buster release
  cannot be confused with the verified `0.17.17` realtime migration release.

---

## 0.17.17 — 2026-04-28 — Realtime broadcast verified live

Confirms the `0.17.16` realtime work is now active on the live Supabase
project.

### Live verification

- `supabase/migrations/00042_realtime_broadcast_org_changes.sql` has been
  applied to the connected Supabase project.
- The org-scoped private Broadcast path is working in practice:
  deleting a job in one browser removes it from another browser on
  `/dashboard/jobs` without a manual reload.
- Package metadata bumped to `0.17.17` so `APP_VERSION` advances again and
  clears any stale persisted query cache for users receiving this deploy.
- Vite now treats `package.json` as the only source of truth for
  `APP_VERSION`; stale `VITE_APP_VERSION` hosting env vars can no longer
  make the sidebar display an old release like `0.17.0`.

### Current realtime contract

- Database triggers emit committed INSERT / UPDATE / DELETE events to
  `org:<organisation_id>:changes`.
- Other browsers react to server events, not fabricated local state.
- DELETE events remove the committed deleted id from visible list caches,
  then active queries refetch from Supabase.
- UPDATE / INSERT events invalidate active queries so relation and
  aggregate data comes from Supabase.

---

## 0.17.16 — 2026-04-28 — Instant cross-browser live updates

Fixes the remaining realtime gap where deleting a job in one browser could
leave another browser stale until reload.

### Realtime broadcast fanout

- Added `supabase/migrations/00042_realtime_broadcast_org_changes.sql`.
  It creates a private Supabase Realtime Broadcast topic per organisation:
  `org:<organisation_id>:changes`.
- Added one trigger function, `public.fos_broadcast_org_table_change()`,
  and triggers across the operational realtime tables (`jobs`,
  `compliance_items`, `actions`, `invoices`, `quotes`, `engineers`,
  `clients`, `properties`, `assets`, `subcontractors`,
  `maintenance_plans`, `documents`, `timeline_events`).
- Added a `realtime.messages` RLS policy so authenticated users can only
  receive broadcast messages for their own organisation topic.
- Kept Postgres Changes subscriptions as a fallback, but Broadcast is now
  the source of truth for instant cross-browser DELETE events.

### Client cache behavior

- `useRealtimeSubscriptions` now subscribes once to the private org
  broadcast channel and normalizes both Broadcast and Postgres Changes
  payloads through the same cache updater.
- DELETE events from the server remove matching rows directly from active
  TanStack Query list caches before refetching, so the receiving browser
  updates immediately from the committed database event.
- UPDATE/INSERT events invalidate active queries so relation and aggregate
  data comes back from Supabase, not a local merge.
- `useDeleteJob` and `useBulkDeleteJobs` now optimistically remove deleted
  jobs in the initiating browser and roll back on failure.
- Realtime auth debug logging is now gated behind dev/debug mode.

### Verification

- TypeScript: clean.
- ESLint: clean.
- Vitest full suite: 76/76 passing.
- Production build: `BUILD SUCCESS` with the existing vendor chunk-size
  warning only.

### Deployment note

At implementation time, the local Supabase CLI session in this workspace
returned a 403 when attempting to list/push migrations. The migration was
subsequently applied and verified live in `0.17.17`.

---

## 0.17.15 — 2026-04-28 — Loading-stack hardening + project map

Closes the loading cleanup pass and brings the repo documentation back in
line with the implementation.

### Runtime/loading fixes

- `AuthProvider` now uses bounded auth boot: `getSession()` is capped at
  4s and profile/org resolution at 5s, so a slow Supabase profile lookup
  cannot leave the app on a permanent spinner.
- Duplicate Supabase `INITIAL_SESSION` handling is ignored after the
  explicit boot path, which removes a double profile fetch on first load.
- Stale auth runs are guarded so sign-out/session changes cannot apply
  old profile state after a newer auth event wins.
- Dashboard layout is now imported eagerly while child routes stay lazy,
  avoiding the second full-screen shell loader after auth.
- Dashboard child routes now use a dashboard-local section skeleton, so
  `/dashboard/*` navigation keeps the sidebar/topbar mounted while only
  the main page outlet changes.
- Replaced a hard `<a href="/dashboard/jobs/...">` in the auto-assign
  activity log with React Router `<Link>` to prevent full document
  reloads from inside the dashboard.
- Sidebar route prefetch coverage now includes the deeper dashboard,
  settings, audit, integration, field, timesheet, import, and analytics
  targets.

### Documentation and project organization

- Added [docs/architecture-map.md](docs/architecture-map.md), a
  contributor-facing map of app boot, routing, data flow, Supabase
  ownership, realtime invalidation, and performance rules.
- Updated [README.md](README.md) to remove stale global-polling language,
  correct the IndexedDB cache key, document the eager dashboard shell, and
  align the design-token notes with the current theme system.
- Bumped package metadata to `0.17.15`, which also updates the
  `APP_VERSION` query-cache buster for this release.
- Expanded ESLint global ignores for generated/runtime folders that are
  not part of the source tree.

### Verification

- ESLint: clean.
- Vitest full suite: 76/76 passing.
- Production build: `BUILD SUCCESS` with the existing vendor chunk-size
  warning only.
- `git diff --check`: clean.

---

## 0.17.14 — 2026-04-28 — Wave 17F: <FilterSelect> primitive + accent-token sweep

Continuation of the visual-consistency work — closes off two more
inconsistencies the audit surfaced:

### `<FilterSelect>` primitive

New shared component at
[src/components/shared/filter-select.tsx](src/components/shared/filter-select.tsx).
Sits next to `<SearchInput>` on every list page, uses the same
surface / border / focus tokens, and replaces the bespoke
`filterSelectClass` constants that were duplicated across pages.

API matches the rest of our primitives:

  <FilterSelect
    value={statusFilter}
    onChange={setStatusFilter}
    ariaLabel="Filter by status"
    options={[{ value: '', label: 'All Statuses' }, ...]}
  />

Migrated:

  - src/routes/compliance/index.tsx — 3 selects (status / property / type)
  - src/routes/assets/index.tsx — 2 selects (area / size) + dropped
    the `selectClass` orphan constant
  - src/routes/portal/documents.tsx — 1 select (type)

Note: these are still native `<select>` under the hood, kept
consistent so a future Wave 17G HeroUI `<Select>` migration is a
one-place swap.

### Accent-token sweep — `focus:ring-brand-500` → `focus:ring-accent`

About 30 files had hard-coded orange focus rings
(`focus:ring-brand-500/20 focus:border-brand-500`). After the
primary-CTA navy retheme, those didn't match the rest of the app on
the light theme — focus rings should match whatever `--accent`
resolves to. Single sed pipeline:

  focus:ring-brand-500/20  → focus:ring-accent/20
  focus:ring-brand-500/30  → focus:ring-accent/20
  focus:ring-brand-500/40  → focus:ring-accent/40
  focus:ring-brand-500     → focus:ring-accent
  focus:border-brand-500/40 → focus:border-accent/40
  focus:border-brand-500   → focus:border-accent/40

Result: 0 stragglers; every form input's focus ring is now
theme-aware. `text-brand-600`/`hover:text-brand-600` left untouched —
those are intentional orange-warm link/hover affordances (kept per
the earlier theme-token decision).

`bg-brand-500/10` and similar brand-emphasis surfaces (saved-view
active chip, theme picker active card, install-prompt icon tile,
trial banner, command palette match highlight, job-time-card option
selection, deploy-status banner) are also intentionally left as
brand colour — those signal "brand emphasis", not "primary action".

### Audited and already-good

  - Error block styling — 9 files use the canonical
    `bg-status-overdue/10 border border-status-overdue/30` shape; no
    one-offs found.
  - Page-mount transitions — already killed in 0.17.12.
  - Empty-state spacing — 20 files use the shared `EmptyState`
    primitive; no bespoke variants.

### Verification

  - TypeScript strict: 0 errors
  - Build: 1.08s
  - 64 files changed, +256 / −219 lines

---

## 0.17.13 — 2026-04-28 — Sidebar toggle fix + visual uniformity sweep

### Sidebar — toggle works on the active section (`501e096`)

Previously `isOpen` was derived during render as
`(openSections[key] ?? false) || activeSectionKey === key`. The OR
clause forced any section containing the active route to read open
on every render, so toggling the active section closed via the
header click flipped `openSections[key]` but the next render forced
it back open. Net effect: users couldn't collapse the section they
were currently in.

Fix: replaced the during-render OR with a one-shot
`useEffect(() => …, [activeSectionKey])`. Navigating into a new
section auto-opens it once; user-toggle wins after that. Verified
in preview: starting on `/dashboard/clients` with cleared storage,
CRM auto-opens; click closes; click reopens — `bugFixed: true`.

### Visual uniformity — bulk-action bars + invoices filter chips

- **Bulk-action bar in `/dashboard/engineers`** previously used
  `bg-foreground/5 border border-navy-950/10` — a one-off styling
  that didn't match any other page. Standardised on
  `bg-surface-elevated border border-border-default` (the same
  surface tokens every other selection-bar uses across the app).
- **Status filter chips on `/dashboard/invoices`** previously
  used `bg-brand-500 text-white` (orange) for the active state —
  inconsistent with the new dark-navy `--accent` token. Now
  `bg-accent text-accent-foreground` so they automatically match
  the primary CTA colour in every theme.

---

## 0.17.12 — 2026-04-28 — Wave 17E: uniform white inputs + <SearchInput> primitive

User asked for every input field across the app to be white (matching
the search inputs on the actions page) and called out that small
visual inconsistencies were making the app "fall apart". Closed the
gap with a five-step plan executed in one commit:

### Step 1 — `bg-surface-page` → `bg-surface-card` sweep (24 files)

Form inputs were inconsistently themed: some white, 26+ used the
light-grey page surface. Single sed pipeline across the unambiguous
shape `bg-surface-page border border-border-default rounded-lg` —
caught every form input without touching unrelated `hover:` states
or page backgrounds. Files swept: components/layout/topbar,
components/stock/stock-item-form, components/stock/parts-used-panel,
components/onboarding/steps/{1..5}, routes/{clients,schedule,portal/
raise-call-out,compliance,subcontractors,dashboard/settings/{privacy,
data,branding,sla},engineers,engineers/[id],dashboard/stock,
properties,site/accept-invite,assets,assets/new}/index.tsx.

### Step 2 — `<SearchInput>` primitive

New file: [src/components/shared/search-input.tsx](src/components/shared/search-input.tsx).
Wraps the canonical search-with-icon pattern:

  <SearchInput
    value={search}
    onChange={setSearch}
    ariaLabel="Search clients"
    placeholder="Search clients..."
    className="flex-1"      // optional layout override
    autoFocus               // optional
  />

White surface, magnifying-glass icon left, X clear button right when
there's a value, accent focus ring at 20%/40% opacity (matches the
new dark-navy --accent token). Documented with anatomy comments
explaining why this isn't a HeroUI <Input> directly (no leading-icon
slot in the v3 API).

### Step 3 — list-page search bars migrated (10 files)

Every list-page search input is now `<SearchInput>` — clients,
properties, assets, jobs, actions, engineers, subcontractors,
knowledge-base, dashboard/stock, portal/documents. Each call site
dropped from 9–11 lines of bespoke JSX to one self-documenting tag.
Unused `Search` lucide-react imports removed per file.

### Step 4 — global CSS safety net

Added `@layer base` rule in src/index.css:

  input:where(:not([type="checkbox|radio|range|color"])),
  select,
  textarea {
    background-color: var(--color-surface-card);
  }

Low-specificity base layer — Tailwind utility classes still win
(e.g. an explicit `bg-surface-page` on a button hover state remains
uncontested). Means any future raw form element added to the app
automatically defaults to white without anyone remembering to set
it. Verified at runtime: a probe `<input type="text">` resolves to
`rgb(255, 255, 255)`.

### Step 5 — verification

- TypeScript strict: 0 errors
- Build: 1.69s
- DOM probe: bare input → white bg confirmed

### Out of scope (future waves)

These are bigger refactors that need their own waves and weren't
needed to close today's complaint:

  - Wave 17F — migrate raw <input> → HeroUI <TextField> across ~66 files
  - Wave 17G — migrate raw <select> → HeroUI <Select> across ~54 files
  - <textarea> migration folds into 17F (8 files)

The white-surface sweep + SearchInput primitive shipped today gives
visual uniformity without forcing the full HeroUI v3 form-component
migration.

---

## 0.17.11 — 2026-04-27 — Hero-counter icon tiles colour-coordinated

User pointed out the dashboard's hero-greeting counters
("0 jobs today / 3 compliance items due / 0 open actions") had
washed-out flat-grey icon tiles (`bg-accent-soft`) that didn't
communicate anything. The colour-coded dot next to each value
already conveyed severity, so the tile was redundant noise.

Replaced the flat grey with per-counter tinted icon tiles + matching
icon strokes that mirror each row's severity dot:

  jobs today              → bg-status-compliant/10  + text-status-compliant   (green)
  compliance items due    → bg-status-due-soon/10   + text-status-due-soon    (amber)
  open actions            → bg-status-overdue/10    + text-status-overdue     (red)

Same 10%-opacity-tint + matching-stroke pattern that
`<KpiTile>` already uses across the dashboard, so the dashboard now
reads as one coherent visual language.

Audited other `bg-accent-soft` callers to see if they share the
same problem — they don't:

  - auto-assign-suggestions.tsx — circular avatar with engineer
    initials (avatar pattern, soft brand tint reads as a name pill)
  - timeline.tsx — quote-event icons (soft brand tint distinguishes
    quote events from severity events)
  - saved-views.tsx — active-state pill (soft brand tint marks
    selection)
  - csv-import-modal.tsx / file-upload.tsx — drop-zone hover

Those use `bg-accent-soft` semantically (brand affordance, not
washed-out icon decoration). Left alone.

---

## 0.17.10 — 2026-04-27 — Wave 17D: list-item Checkbox migration completes

User asked for the "list items" we'd already updated on /dashboard/assets
(the row-select checkboxes via DataTable) to roll out across every list
page in the app, and for it to be a primitive — not copy-paste.

### `<TableCheckbox>` primitive

Lives at [src/components/shared/table-checkbox.tsx](src/components/shared/table-checkbox.tsx).
Tight API:

  <TableCheckbox
    isSelected={...}
    isIndeterminate={...}     // optional — for select-all partial state
    onChange={(next: boolean) => ...}
    ariaLabel="..."
  />

Wraps the canonical HeroUI v3 anatomy
(`<Checkbox><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox>`)
so future call sites stay one-line.

### List-item tables migrated (7)

  - src/routes/clients/index.tsx       (already in 0.17.9)
  - src/routes/invoices/index.tsx
  - src/routes/compliance/index.tsx
  - src/routes/subcontractors/index.tsx
  - src/routes/engineers/index.tsx
  - src/routes/jobs/index.tsx
  - src/routes/actions/index.tsx

Each route's header (select-all) and row checkboxes now render
`<TableCheckbox>`. Indeterminate state wired everywhere:
`isIndeterminate={someSelected && !allSelected}` so when only some rows
are selected the header checkbox shows the partial-select indicator.

DataTable users (assets, properties, etc.) were already on the new
primitive via the DataTable migration in 0.17.9.

Verified at runtime: /dashboard/compliance renders 20 HeroUI
checkboxes (1 header + 19 rows) all with `data-slot="checkbox"`.

### Out of scope (different category — single-checkbox sites)

Form fields with a single boolean (jobs/new.tsx, contracts/new.tsx,
settings/profile.tsx, settings/branding.tsx, settings/sla, signature-pad,
job-time-card, knowledge-base/new+[id], maintenance/new) aren't list-item
patterns — they're inline form toggles. Those will migrate to plain
`<Checkbox>` (no TableCheckbox) in a separate follow-up wave when we do
the form-component round.

---

## 0.17.9 — 2026-04-27 — Dark navy primary buttons + HeroUI v3 Checkbox migration begins

### Primary buttons → dark navy in light theme

User showed a reference: primary CTAs on the light theme should match
the sidebar's dark navy (`#1b1f2e`), not the orange `#e8772e` that
HeroUI was painting them. Flipped two CSS variables in
`src/index.css` under `:root[data-theme="light"]`:

  --accent:                 #e8772e → #1b1f2e   (primary button bg, focus rings)
  --accent-foreground:      #ffffff → #ffffff   (unchanged)
  --accent-soft:            #ffedd5 → #e8eaf0   (soft chip bg)
  --accent-soft-foreground: #7a3a15 → #1b1f2e   (soft chip text)
  --focus:                  #e8772e → #1b1f2e   (focus rings)

Kept `--link: #d06420` and `--color-text-accent: #d06420` as orange
so headline accents and inline links still pop with brand warmth —
only CTAs change. Verified at runtime: `--accent` resolves to
`rgb(27, 31, 46)` and a probe button paints accordingly.

Other themes (dark, midnight, glass, luxe) untouched — their accent
tokens are tuned for their own palettes.

### HeroUI v3 Checkbox migration — Wave 17D begins

User asked us to start migrating the 20 files that still use raw
`<input type="checkbox">` to HeroUI v3's
`<Checkbox><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox>`
anatomy. Got the foundation in:

- **`src/components/shared/data-table.tsx`** — header (select-all)
  and per-row checkbox both migrated, with `isIndeterminate` for the
  "some-but-not-all" partial-select state. This cascades to **every
  page that wraps DataTable** — properties, assets, and ~14 others.

- **`src/components/shared/table-checkbox.tsx`** — new shared helper
  that wraps the canonical anatomy in a tight `<TableCheckbox
  isSelected isIndeterminate onChange ariaLabel />` API. Future
  migrations call this instead of repeating the verbose Checkbox
  markup.

- **`src/routes/clients/index.tsx`** — first standalone-table route
  fully migrated to inline `<Checkbox>` (header + row).

Remaining 17 files use the same shape and will be migrated in a
follow-up commit using `<TableCheckbox>` as the call site:
invoices, compliance, subcontractors, engineers, jobs, actions,
stock, plus 11 settings/form/single-checkbox sites (profile,
contracts/new, branding, sla, knowledge-base/new+[id],
maintenance/new, jobs/new, signature-pad, time cards).

---

## 0.17.8 — 2026-04-27 — Uniform white table headers across the app

The user pointed out that table headers had three different backgrounds
across the app — some `bg-surface-page` (light grey), some
`bg-surface-elevated` (slightly off-white), and some bare with no
background at all (inherited the parent card / page colour, which
varied by where the table was placed). They wanted "white tops" and
asked for it to be uniform.

Standardised every in-app `<thead>` on `bg-surface-card`. The token
resolves to `#ffffff` in the light theme (verified via DOM probe) and
to the appropriate elevated surface in dark / midnight / glass / luxe.

### Files touched (22)

- `src/components/shared/data-table.tsx` (the master data-table — affects
  16+ pages that wrap it, including assets, properties, etc.)
- `src/components/shared/csv-import-modal.tsx`
- `src/components/import/mapping-table.tsx`
- `src/components/import/preview-table.tsx`
- `src/components/stock/parts-used-panel.tsx`
- `src/routes/clients/index.tsx`
- `src/routes/invoices/index.tsx`
- `src/routes/subcontractors/index.tsx` + `subcontractors/[id].tsx`
- `src/routes/archives/index.tsx`
- `src/routes/compliance/index.tsx`
- `src/routes/dashboard/settings/privacy/index.tsx`
- `src/routes/dashboard/settings/sla/index.tsx`
- `src/routes/dashboard/settings/data/index.tsx`
- `src/routes/dashboard/integrations/slack/index.tsx`
- `src/routes/dashboard/stock/index.tsx` + `stock/[id].tsx`
- `src/routes/dashboard/import/index.tsx`
- `src/routes/engineers/index.tsx` + `engineers/[id].tsx`
- `src/routes/actions/index.tsx`
- `src/routes/jobs/index.tsx`
- `src/routes/assets/[id].tsx`
- `src/routes/reports/advanced.tsx`
- `src/routes/settings/roles.tsx`

In each file: the `<thead>` element now carries `bg-surface-card` and
the previous per-row `bg-surface-page` / `bg-surface-page/50` /
`bg-surface-elevated` was dropped from the header `<tr>`. Tbody hover
states (e.g. `hover:bg-surface-page`) are intentionally left alone —
they're a deliberate row-hover affordance and have nothing to do with
header colour.

The certificate-PDF templates in `src/lib/certificates/templates/`
and the HTML-export string in `src/routes/reports/builder/index.tsx`
are intentionally NOT touched — they render outside the app's theme
context (PDF generators, copied-to-clipboard HTML).

---

## 0.17.7 — 2026-04-27 — Wave 17 polish (Day 3 night)

Visual / UX polish over the bulk-action + sidebar work shipped earlier
in 0.17.6:

### Sidebar tooltips — clean dark chip, no arrow (`bf464e2` → today)

The first pass added HeroUI `<Tooltip>` to nav icons in the collapsed
sidebar, but used HeroUI's default white floating-tooltip styling — it
clashed with the dark navy sidebar and looked like an unrelated popover
floating into the canvas. Iterated:

1. `bf464e2` — overrode bg / text / radius / border with `!important`
   utilities. Tooltip now uses `bg-surface-sidebar` (matches the rail),
   white 12 px medium text, sharp `rounded-sm`, thin `white/10` border,
   and the `<Tooltip.Arrow>` was tinted to match the chip.
2. **today** — removed the arrow tip entirely (the user found the
   white pointer ugly), dropped the hairline border, and bumped the
   radius to `rounded-md` for a softer rectangular chip. Added an
   `ml-2` offset so the chip sits visually separate from the icon
   without needing a pointer.

Final result: a flat dark chip that reads as part of the sidebar, no
ornament, no white pointer.

### Coloured side-bars on Smart Insights cards removed (`bf464e2`)

Each card in [src/components/shared/insights-panel.tsx](src/components/shared/insights-panel.tsx)
had a 4 px coloured strip absolutely positioned along its left edge
(red for overdue, green for compliant, etc.). The user found these
"annoying and ugly" — and the tinted icon tile in the top-right
already conveys severity. Removed the strip + the `pl-5` offset that
compensated for it (back to `p-4`). The `severityStyles[].bar` lookup
key is intentionally retained in case we want to re-use the colour as
a subtle border-color override later.

### Sidebar starts with all categories collapsed (`d0e26f1`)

Previously default-expanded all sections so users could discover the
30+ pages behind section headers. The user preferred a calmer first
impression, so:

- Default seed in `loadOpenSections()` flips from `true` to `false`.
- Render-time `??` fallback also flips to `false` so any new section
  added in a future release is collapsed by default rather than
  silently expanding everyone's sidebar.
- Existing users who customised their sidebar keep their persisted
  choice in `localStorage.haumea_sidebar_sections`.
- Route-driven auto-open effect still opens whichever section
  contains the current page, so users always see their nav context.

### Tab labels never wrap (`83db27a`)

`<Tabs.Tab>` labels like "In Progress" were wrapping to two lines on
`/dashboard/actions` and other pages whenever the tablist was even
slightly narrower than the sum of its tabs. One global rule in
[src/index.css](src/index.css) forces `white-space: nowrap` on every
`[role="tab"]` (the React Aria element HeroUI renders) and pins
`flex-wrap: nowrap; overflow-x: auto` on `[role="tablist"]` so the
bar scrolls horizontally on tiny viewports instead of wrapping.
Applies to every Tabs in the app (actions, jobs, properties,
scheduler, archives, knowledge-base, analytics, advanced-reports,
stock, data-privacy, portal-visits) — fixed once, structurally.

### Commits in this entry

```
(today)  ui(sidebar): drop tooltip arrow + softer chip — flat rectangular
bf464e2  ui: dark sidebar tooltips + drop coloured insight side-bars
83db27a  ui: nowrap tab labels everywhere + tooltips for collapsed sidebar nav
d0e26f1  ui(sidebar): default sections to collapsed on first visit
```

---

## 0.17.6 — 2026-04-27 — Wave 17 perf+UX (Day 3 evening)

Closes the loop on the live-update issue users were reporting and fixes the
floating bulk-action bar that hung around showing stale selection counts.

### Bulk-action bar — two bugs in `<DataTable>` (`286b5b1`+)

- **Stale `rowSelection`**: TanStack Table preserves selection-state keys
  even after their backing rows are removed from `data`. After a delete,
  the floating "N items selected" pill kept counting the gone rows.
  Added a reconciliation effect that builds a `Set` of currently-visible
  IDs (using `getRowId` when provided, otherwise `row.id`) and prunes any
  selection key not in the set. Functional `setRowSelection` keeps it
  concurrent-safe; only updates state when the prune actually changes
  something to avoid render churn. ([src/components/shared/data-table.tsx](src/components/shared/data-table.tsx))
- **Hard-coded inverted theme**: the bar was `bg-foreground text-background`
  which painted a black pill on every theme — wrong on the light theme
  and inconsistent everywhere else. Replaced with the same
  `bg-surface-elevated/95 border-border-strong text-text-primary` tokens
  the rest of the app uses for floating menus, plus HeroUI `<Button>`
  primitives (variant `danger` / `ghost`) instead of bespoke
  `<button class="bg-status-overdue ...">`. ARIA: added
  `role="region"` + `aria-label="Bulk actions"` and a proper aria-label
  on the deselect button.

### FK ON DELETE rules across the operational graph (`7eda8fd`)

Users hit `update or delete on table "assets" violates foreign key
constraint "compliance_items_asset_id_fkey"` because the original schema
created most FKs without explicit `ON DELETE` rules. Migration **00041**
adds explicit cascade rules for 18 previously-RESTRICT FKs:

- **Assets** → CASCADE to compliance_items, documents, maintenance_plans;
  SET NULL on actions (preserve audit history).
- **Properties** → CASCADE to assets, compliance_items, documents,
  maintenance_plans, jobs, actions, timeline_events; SET NULL on quotes,
  invoices (financial records persist after the property is gone).
- **Clients** → CASCADE to invoices, quotes, jobs, contracts,
  timeline_events (properties was already CASCADE).
- **Jobs** → CASCADE to documents, service_reports, timeline_events;
  SET NULL on actions, quotes (preserve audit trail).
- **Compliance items** → SET NULL on jobs (a completed job stays billable
  even if the underlying compliance item is removed).
- **Maintenance plans** → SET NULL on jobs.
- **Invoices** → CASCADE to payments. Quotes → SET NULL on
  invoices.quote_id (already-issued invoices stand alone).
- **Engineers** → SET NULL on jobs.engineer_record_id (the job retains
  its history; the assignment just clears).

Verified end-to-end via Node + service-role probe + management-API SQL.
The application's realtime invalidation map automatically picks up
cascaded deletes — other tabs see the changes within ~1 s.

### Light by default, topbar de-cluttered (`412d77d`)

- `localStorage.haumea_theme` and the in-memory default both flip from
  `'dark'` to `'light'`. `THEMES` is unchanged, so users who explicitly
  picked dark/midnight/glass/luxe keep their choice.
- `<ThemeToggle>` removed from the topbar. **Settings → Appearance**
  retains the full selector — same control, single discovery surface.

### Stale-SW chicken-and-egg fix (`446a1af`)

The PWA shipped with `registerType:'prompt'` for several weeks. When
0351f56 flipped that to `autoUpdate`, returning users were trapped: the
old SW was still serving the OLD bundle (which had `prompt`), so
`autoUpdate` could never reach them. Solution: an inline `<script>` in
`index.html` (network-first since it has no cache headers) checks for a
`haumea_sw_evicted_v1` localStorage flag, and if absent, unregisters
every SW it finds, deletes the IndexedDB query cache (otherwise stale
persisted data replays after the SW is gone), sets the flag, and
reloads. Fires once per browser. After that, `autoUpdate` handles every
future deploy cleanly.

### Realtime end-to-end verification

Verified the full pipeline from a Node probe before shipping the
client-side fixes — replication slots active, supabase_realtime
publication populated (13 tables, all events), RLS `organisation_id()`
returns the right UUID for an authenticated user, anon-key WebSocket
SUBSCRIBE succeeds, and the browser auth flow (anon key + setSession +
subscribe) delivers events in <1 s. WSS reachability from the user's
network was also confirmed clean.

### Tests / quality

- Vitest: **76 / 76 green** across 10 test files.
- TypeScript strict: **0 errors**.
- Production build: **`built in 1.12s`** with PWA + Workbox output.
- Lint cleanup: removed 8 unused `eslint-disable next-line no-console`
  directives from realtime + supabase wiring (the `no-console` rule
  isn't enabled — the disables were noise) (`286b5b1`).

### Commits in this entry

```
286b5b1  chore: drop unused eslint-disable comments
7eda8fd  fix(db): add ON DELETE rules to operational-graph foreign keys
412d77d  ui(theme): default to light + drop topbar quick-toggle
446a1af  fix(pwa): one-time service-worker eviction in index.html
0351f56  fix(pwa,query): autoUpdate SW + 30s polling fallback
d75a188  debug(realtime): verbose logging + boot-time JWT race fix
8f1b36e  perf: refetch on every mount + realtime auth + bundle splits
75e0bd1  perf(realtime): wire publication + invalidate the rest of the cache
d93dade  perf(query-cache): persist TanStack cache to IndexedDB
```

---

## 0.17.5 — 2026-04-27 — Brand polish — sidebar lockup nudges

Several iterative tweaks to the sidebar's H-mark and Wordmark lockup
based on visual review:

- `04a0014` saturate-boost the H mark + scale Wordmark sizes up
- `f4234e6` two-tone snap — kill the muddy anti-aliased mids
- `4b400bc` sidebar default-expanded sections on first visit
- `fe21585` returned mark + Wordmark sizes to the originally-approved state
- `f498c40`/`bb0d733` switched H mark to SVG, then reverted (PNG retained)
- `0cbf7e1` scaled Wordmark mark sizes up
- `44786a3` shifted logo lockup left (`pl-2` instead of `px-4`)
- `7bf4cbe` aligned H mark with the nav-item icon column
- `4b125e9` / `a3abc60` / `d6971d3` 4-px nudges left/right to settle
  the H mark against the top of the nav-item column

Net: a tighter, more consistent brand lockup across the sidebar without
reflowing nav-item alignment.

### Commits in this entry

```
d6971d3  brand(sidebar): nudge H mark 4px right (pl-2 → pl-3)
a3abc60  brand(sidebar): more left for H mark (pl-4 → pl-2)
4b125e9  brand(sidebar): nudge H mark 4px left (pl-5 → pl-4)
7bf4cbe  brand(sidebar): align H mark with nav-item icon column
44786a3  brand(sidebar): shift logo lockup left (pl-2 instead of px-4)
0cbf7e1  brand(logo): scale Wordmark mark sizes up
bb0d733  Revert "brand(logo): switch H mark to SVG"
f498c40  brand(logo): switch H mark to SVG
fe21585  revert(logo): return H mark + Wordmark sizes to originally-approved state
4b400bc  fix(sidebar): default-expand all sections on first visit
f4234e6  brand(logo): two-tone snap — kill the muddy anti-aliased mids
04a0014  brand(logo): saturate-boost H mark + scale Wordmark sizes up
0599774  brand(logo): swap H mark for dark-navy variant + softer corners
b8d42d5  fix(brand): strip dark-navy background from H mark for true transparency
85f285a  feat(brand): add H mark to wordmark lockup
```

---

## 0.17.0 — 2026-04-27 — Wave 17B: Form component migration — 28 files

Migrated bespoke `<input>`/`<label>`/`<textarea>` + raw error-`<p>` trios across the application onto HeroUI v3's `<TextField>` + `<Input>` / `<TextArea>` + `<Label>` + `<FieldError>` composition. HeroUI v3 MCP was used to confirm the canonical sibling-composition anatomy (NOT compound dot-notation) before any code was written. React Hook Form `register('name')` spread is the integration pattern: the spread of `{name, ref, onChange, onBlur}` flows through `<Input>` and `<TextArea>` (plain React Aria primitives) without a Controller wrapper. Validation error visibility is wired by passing `isInvalid={!!errors.field}` on the parent `<TextField>` and conditionally rendering `<FieldError>{errors.field.message}</FieldError>`.

### Migrated files (28)

- **Auth (4)**: `auth/login.tsx`, `auth/register.tsx`, `auth/forgot-password.tsx`, `auth/invite.tsx`
- **CRUD new pages (10)**: `clients/new.tsx`, `properties/new.tsx`, `assets/new.tsx`, `compliance/new.tsx`, `maintenance/new.tsx`, `jobs/new.tsx`, `quotes/new.tsx`, `invoices/new.tsx`, `contracts/new.tsx`, `engineers/new.tsx`, `subcontractors/new.tsx`, `actions/new.tsx`, `knowledge-base/new.tsx`
- **CRUD detail pages (3)**: `properties/[id].tsx` (area sub-forms), `engineers/[id].tsx` (engineer/accreditation/document/travel sub-forms), `knowledge-base/[id].tsx`
- **Settings (2)**: `settings/profile.tsx`, `settings/organisation.tsx`
- **Portal/Site (2)**: `portal/raise-call-out.tsx`, `site/raise-callout.tsx`
- **Marketing (1)**: `marketing/contact.tsx`
- **Reports (2)**: `reports/log-books.tsx`, `reports/risk-assessments.tsx`
- **Onboarding wizard (5)**: `onboarding/steps/step-1-welcome.tsx`, `step-2-client.tsx`, `step-3-property.tsx`, `step-4-asset.tsx`, `step-5-ppm.tsx`
- **Components (1)**: `components/site/site-contacts-panel.tsx`
- **Integrations (1)**: `dashboard/integrations/sso/index.tsx`

### Out of scope

- **Native `<select>`** — already styled by the global Wave 15.1 `select:not(.appearance-auto)` CSS rule with a clean chevron + neutral fill that respects the active theme. Migrating these to HeroUI's `<Select>` requires a `<Controller>` wrapper because v3's `Select` uses `value`/`onChange` with `Key` types rather than spread-compatible event handlers, and the existing `register()` flow would need to be rewritten end-to-end. Deferred to a separate wave.
- **Existing `<Switch>` callsites** — `routes/settings/profile.tsx`, `routes/settings/index.tsx`, `routes/dashboard/integrations/{xero,quickbooks,sso}/index.tsx`, `routes/dashboard/auto-assign/index.tsx` use the v2-style flat `<Switch isSelected={x} onChange={fn} />` form which renders an empty switch under v3 (the compound `<Switch.Control><Switch.Thumb /></Switch.Control>` is required to render the visible track + thumb). This is a pre-existing bug from earlier waves; fixing it is out of scope for this form-migration wave.
- **Bespoke composite inputs** — `auth/register.tsx` slug field with `haumea.app/` prefix uses a custom `<div>` wrapper that combines a static prefix segment with a styled `<input>` flex-child. Kept as-is to avoid disrupting the visual shell.
- **`useFieldArray` line items** — invoice/quote line-item rows in `invoices/new.tsx` + `quotes/new.tsx` use a 12-column grid with index-conditional labels and number/decimal inputs. Kept as-is to avoid breaking the column alignment.
- **File inputs** — `<input type="file">` in profile avatar upload + organisation logo upload + photo attachments stay as native HTML inputs (no HeroUI v3 component for file pickers; existing implementation is correct).

### Sample migration (before / after)

```tsx
// BEFORE — bespoke trio with hardcoded classes
<div>
  <label className="block text-[13px] font-medium text-text-secondary mb-1.5">
    Property Name <span className="text-status-overdue">*</span>
  </label>
  <input
    {...register('name')}
    type="text"
    className="w-full px-3 py-2 border border-border-default rounded-lg ..."
    placeholder="e.g. Main Office Building"
  />
  {errors.name && (
    <p className="mt-1 text-[12px] text-status-overdue">{errors.name.message}</p>
  )}
</div>

// AFTER — HeroUI v3 sibling composition
<TextField isRequired isInvalid={!!errors.name}>
  <Label>Property Name</Label>
  <Input type="text" placeholder="e.g. Main Office Building" {...register('name')} />
  {errors.name && <FieldError>{errors.name.message}</FieldError>}
</TextField>
```

### Build status

`npm run build` passes green. TypeScript strict mode passes. RHF spread integration verified working on `clients/new.tsx` reference migration.

---

## 0.17.0 — 2026-04-26 — Wave 17A: Card migration

Replaced bespoke surface-div containers (`bg-surface-card border border-border-default rounded-xl`) with HeroUI v3's `<Card>` compound across the app. HeroUI v3 MCP (`list_components`, `get_component_docs`, `get_component_source_styles`) was used to confirm the canonical anatomy (`Card > Card.Header > Card.Title / Card.Description`, `Card.Content`, `Card.Footer`) and the auto-applied base styles (`p-4 gap-3 rounded-3xl shadow-surface bg-surface-secondary`) before any code was touched.

Card defaults are overridden via `className` (using Tailwind's `!` important prefix) to preserve the existing Wave 16 surface design exactly: `!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default` plus a contextual padding override (`!p-0` for table-shell cards, `!p-5` / `!p-6` for content cards). This keeps the visual language identical while moving the underlying primitive onto the design system. The internal section structure (header/body/footer divs with their own `px-6 py-4` padding) is preserved so header-bordered cards and form panels look exactly the same.

### Changed

- **Skeleton components** (6 files): `components/shared/skeleton.tsx`, `components/shared/skeletons/{form,table,card-grid,kpi-row,detail-page}-skeleton.tsx` — all loading placeholders that paint a card surface now use `<Card>`.
- **Settings pages** (6 files): `routes/settings/{profile,organisation,users,roles,billing,index}.tsx` — every section card on the user-facing settings flow.
- **Dashboard settings** (4 files): `routes/dashboard/settings/{branding,sla,data,privacy}/index.tsx` — including the live-preview card on branding and the GDPR request history card.
- **Auth pages** (5 files): `routes/auth/{login,register,forgot-password,invite,sso/callback}.tsx` — the primary login/register/invite card surfaces.
- **Clients pages** (3 files): `routes/clients/{index,[id],new}.tsx` — list table shell, detail cards, properties grid tiles, timeline panel, and form card.
- **Properties pages** (3 files): `routes/properties/{index,[id],new}.tsx` — list table shell, property/client info cards, areas-and-zones panel, related modules card, timeline panel, and form card.
- **Shared / domain components** (12 files): `components/shared/{auto-assign-suggestions,error-boundary,certificate-preview,portfolio-map,insights-panel,install-prompt}.tsx`, `components/site/site-contacts-panel.tsx`, `components/stock/parts-used-panel.tsx`, `components/time/job-time-card.tsx`, `components/field/{gps-check-in,on-site-activity}.tsx`, `components/onboarding/wizard-layout.tsx`.

### Canonical pattern

```tsx
// Sectioned card with header/body/footer (most common)
<Card className="!p-0 !gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default overflow-hidden">
  <div className="px-6 py-4 border-b border-border-subtle">
    <h2 className="text-[14px] font-semibold text-text-primary">Title</h2>
  </div>
  <div className="px-6 py-5">{/* body */}</div>
  <div className="px-6 py-4 border-t border-border-default flex justify-end gap-2">
    {/* footer actions */}
  </div>
</Card>

// Padded single-content card
<Card className="!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default !p-5">
  {/* content */}
</Card>
```

### Notes

- HeroUI v3's `<Card>` component renders compound parts (`Card.Header`, `Card.Title`, `Card.Description`, `Card.Content`, `Card.Footer`) with their own padding-less semantics. Our existing surface divs already carry `px-6 py-4` per section, so we use `<Card>` as the wrapper only and leave the inner section divs untouched. This avoids reflowing the layout while still gaining HeroUI's semantic `<h3>`-rendered `Card.Title` where it makes sense.
- Skipped intentionally: `components/shared/kpi-tile.tsx` (a `motion.div` from framer-motion — replacing it with a static `<Card>` would lose the entrance + hover animations), `components/import/entity-picker.tsx` (the surface IS a `<button>` — Card cannot replace a button without breaking click semantics), `components/shared/command-palette.tsx` and `components/layout/topbar.tsx` notification dropdown / `components/layout/portal-layout.tsx` site switcher (these are positioning popovers / overlays, not cards conceptually).
- ~84 files / 250 occurrences across detail pages (jobs/[id], engineers/[id], assets/[id], compliance/[id], reports/, scheduler, portal/, etc.) and the calendar / Slack / QuickBooks / Xero / SSO integration pages have the same pattern but use either `<section>` tags, `cardCls` constants, or computed className strings — those are deferred to a follow-up sweep so this commit set stays reviewable. The remaining files are tracked by the same grep pattern (`bg-surface-card border border-border-default rounded-xl`).

---

## 0.17.0 — 2026-04-26 — Wave 17C: Modal/AlertDialog migration

Replaced every bespoke `fixed inset-0` modal div pile with HeroUI v3's `<Modal>` and `<AlertDialog>` so we get focus trap, ESC-to-close, click-outside-to-close, scroll lock, and proper `role="alertdialog"` / `role="dialog"` for free. HeroUI v3 MCP was used to fetch the canonical anatomy (`Backdrop > Container > Dialog > Header / Body / Footer` with dot notation) before any code was written — no API guesses from training data.

### Changed

- **`components/shared/confirm-dialog.tsx`** — now wraps `<AlertDialog>` internally; the public API (`open / title / message / confirmLabel / variant / onConfirm / onCancel`) is unchanged so the ~30 callsites across the app keep working without modification. Default ConfirmDialog uses `<AlertDialog.Icon status="accent">`; danger variant uses `status="danger"` + `<Button variant="danger">`.
- **`components/shared/upgrade-modal.tsx`** — soft paywall migrated to `<Modal>` with `variant="blur"` backdrop and `<Modal.Icon>` for the Sparkles glyph.
- **`components/shared/csv-import-modal.tsx`** — bespoke `fixed inset-0` wrapper replaced with `<Modal size="lg">`; drop zone / preview / importing / done states now sit inside `<Modal.Body>` and the action row is `<Modal.Footer>`.
- **`components/shared/shortcuts-help.tsx`** — keyboard help dialog migrated to `<Modal size="lg">`. Manual focus trap + Escape handler removed (HeroUI handles them); the `?`-press-to-close behaviour is preserved via a window keydown listener.
- **`components/shared/bulk-action-bar.tsx`** — `TypeToConfirmDialog` (the destructive >10-row delete prompt) now wraps `<AlertDialog>` with `<AlertDialog.Icon status="danger">` and `<Button variant="danger" isDisabled={!matches}>` — type-to-confirm UX preserved exactly.
- **`components/field/complete-job-modal.tsx`** — engineer "Complete with signature" flow migrated to `<Modal size="lg">`; outcome / notes / signature pad inside `<Modal.Body>`.
- **`components/field/gps-check-in.tsx`** — three inline consent / out-of-radius / manual-confirm prompts now share a single `Dialog` wrapper that renders `<AlertDialog>`. Same prop shape so the three callsites stay clean.
- **`components/time/job-time-card.tsx`** — local `Overlay` helper now wraps `<Modal>`; both callsites (Start a timer + Add/Edit time entry) keep working unchanged.
- **`components/time/pull-from-time-modal.tsx`** — invoice "Pull from time entries" workflow migrated to `<Modal size="lg">`; Cancel/Back/Pull buttons moved into `<Modal.Footer>`.
- **`components/stock/parts-used-panel.tsx`** — Add part to job migrated to `<Modal>`.
- **`routes/jobs/[id].tsx`** — photo lightbox migrated to `<Modal size="cover">` with transparent dialog (preserves the bespoke fullscreen-image look).
- **`routes/jobs/new.tsx`** — Suggested engineers panel migrated to `<Modal size="lg">`.
- **`routes/invoices/[id].tsx`** — Send Payment Reminder confirmation migrated to `<AlertDialog>` with `<AlertDialog.Icon status="accent">`.
- **`routes/portal/raise-call-out.tsx`** — `CriticalConfirmModal` migrated to `<AlertDialog>` with `status="danger"` for H&S risk confirmation.
- **`routes/dashboard/settings/sla/index.tsx`** — SLA policy add/edit migrated to `<Modal size="lg">`.
- **`routes/dashboard/integrations/sso/index.tsx`** — SSO domain mapping add/edit migrated to `<Modal>`.
- **`routes/dashboard/stock/index.tsx`** — stock receipt/adjust modal migrated to `<Modal>`.
- **`routes/settings/users.tsx`** — Edit User modal migrated to `<Modal>`.
- **`routes/reports/builder/index.tsx`** — Schedule report modal migrated to `<Modal>`.

### Tests

- `components/shared/confirm-dialog.test.tsx` — three small adjustments: `renders nothing when closed` now checks `screen.queryByText` (HeroUI mounts a hidden portal node when `isOpen=false`); `applies the danger variant styling` no longer checks for the raw `bg-red-600` class (it's a `<Button variant="danger">` now); `calls onCancel when Escape is pressed` uses `userEvent.keyboard('{Escape}')` so React Aria's dialog-scoped listener fires. All 7 tests still pass; full suite: 76/76 green.

### Notes

- HeroUI v3 MCP (`get_component_docs`) used to fetch the canonical Modal + AlertDialog patterns (anatomy, controlled state via `<Backdrop isOpen onOpenChange>`, `<Dialog className="sm:max-w-…">` for sizing, render-props on Dialog when needed) before any code was touched.
- `AlertDialog.Backdrop` defaults differ from `Modal.Backdrop`: `isDismissable` defaults to `false` and `isKeyboardDismissDisabled` to `true` (because the v3 default for alert dialogs is to require explicit user action). We re-enable both flags in `ConfirmDialog` and the inline confirm dialogs to preserve the prior backdrop-click + ESC-to-cancel UX. The destructive `TypeToConfirmDialog` keeps Cancel-always-works while leaving the input untouched on ESC.
- The fullscreen photo lightbox in `routes/jobs/[id].tsx` uses `<Modal size="cover">` with a transparent dialog (`bg-transparent shadow-none border-0`) — preserves the original "image fills the screen, dim everything else" look without re-implementing scroll lock and focus trap by hand.
- The full-screen photo annotator (`components/shared/photo-annotator.tsx`) is intentionally **not** migrated — it's a fullscreen tool overlay (a drawing canvas with toolbars), not a popup modal. The command palette (`components/shared/command-palette.tsx`) is also intentionally **not** migrated — it's a search overlay with its own focus management and is the wrong shape for `<Modal>`. Sidebar mobile menu and portal-layout dropdown click-blockers are not modals at all.

---

## 0.17.0 — 2026-04-26 — Wave 17D: Tabs migration

Replaced ad-hoc segmented-control button rows (the canonical Wave 16 `bg-surface-elevated border border-border-default rounded-lg p-1` pattern) and detail-page underline tab strips with HeroUI v3's accessible `<Tabs>` compound component. The component now provides automatic keyboard navigation (arrow keys, Home/End), proper ARIA `tablist`/`tab`/`tabpanel` semantics, and theme-aware indicator rendering — without any change to the underlying filter / view-toggle state management.

### Changed

- **Segmented filter controls (primary variant)** migrated to `<Tabs>` compound API on 9 pages: `routes/jobs/index.tsx`, `routes/actions/index.tsx`, `routes/archives/index.tsx`, `routes/scheduler/index.tsx`, `routes/properties/index.tsx`, `routes/dashboard/stock/index.tsx`, `routes/reports/advanced.tsx`, `routes/knowledge-base/index.tsx`, `routes/analytics/index.tsx`. State (`useState` for the active key) and the underlying filter logic are unchanged — only the UI representation moved from custom `<button>` rows to `<Tabs.List><Tabs.Tab id="…">`. Empty-string filter keys are mapped to `"all"` round-trip so `selectedKey` stays a non-empty string while filter logic still receives `''`.
- **Detail-page underline tabs (secondary variant)** migrated on 2 pages: `routes/portal/visits.tsx` (Upcoming / Past), `routes/dashboard/settings/data/index.tsx` (Requests / Export / Delete). Both use `variant="secondary"` for the underline-indicator look.

### Canonical pattern

```tsx
<Tabs
  selectedKey={statusFilter || 'all'}
  onSelectionChange={(key) => setStatusFilter(key === 'all' ? '' : String(key))}
  aria-label="Filter jobs by status"
  className="w-fit"
>
  <Tabs.ListContainer>
    <Tabs.List aria-label="Filter jobs by status">
      {ALL_STATUSES.map((s) => (
        <Tabs.Tab key={s.value || 'all'} id={s.value || 'all'}>
          {s.label}
          <Tabs.Indicator />
        </Tabs.Tab>
      ))}
    </Tabs.List>
  </Tabs.ListContainer>
</Tabs>
```

### Notes

- HeroUI v3 MCP (`get_component_docs`) used to fetch the canonical compound API (`Tabs` / `Tabs.ListContainer` / `Tabs.List` / `Tabs.Tab` / `Tabs.Indicator` / `Tabs.Panel`) before any migration — no guesswork.
- Keyboard navigation, focus rings, and ARIA wiring now come for free from React Aria Components under the hood.
- `npm run build` green.

---

## 0.17.0 — 2026-04-26 — Wave 17F: Tooltip migration

Replaced raw HTML `title="…"` attributes on icon-only buttons with HeroUI v3's compound `<Tooltip>` component. The topbar already shipped two examples (Bell + Client View) in Wave 16; this wave brings the rest of the app to the same pattern so tooltips render consistently across light/dark/midnight/glass/luxe themes (the native browser tooltip ignores theme entirely and is plain-OS-grey, which clashed against the styled UI).

### Changed

- **Icon-only buttons in tables and toolbars** — wrapped each in `<Tooltip delay={400}><Tooltip.Trigger>…</Tooltip.Trigger><Tooltip.Content placement="top|bottom"><Tooltip.Arrow />Label</Tooltip.Content></Tooltip>`. The `aria-label` on the inner `<button>` is preserved (still the accessible name); the tooltip is supplementary visual text on hover/focus.
- **Files touched (6)** — `components/shared/notes-section.tsx` (Delete note), `components/shared/photo-annotator.tsx` (Undo, Clear all), `components/site/site-contacts-panel.tsx` (Resend invite, Disable access, Delete contact), `routes/settings/profile.tsx` (Change avatar), `routes/settings/users.tsx` (Edit user, Remove user), `routes/dashboard/stock/index.tsx` (Receive, Adjust). Total: 11 tooltips added.

### Notes

- HeroUI v3 MCP `get_component_docs(["Tooltip"])` was used to verify the compound API before any code was written.
- `delay={400}` matches the topbar baseline so tooltips don't pop on every cursor pass-through.
- Skipped: text-only buttons (the `title` was redundant with the visible label), component-prop `title="…"` (e.g. `SectionHeader`, `ConfirmDialog`, `EmptyState`), and chips/spans whose body is already self-evident.
- Build green: `npm run build` passes with the existing 207 precache entries / ~3.7 MB.

---

## 0.17.0 — 2026-04-26 — Wave 17E: Chip sweep

Wave 16 unified the most-visible status pills (subcontractors index/detail and admin pages) onto HeroUI v3 `<Chip>`. Wave 17E sweeps the remainder. Every bespoke `<span>` status pill across the rest of the app — portal, schedule, dashboard, settings, contracts, properties, clients, jobs, compliance, reports, documents, scheduler, site, and the subcontractor jobs sub-table — now renders through `<Chip variant="soft">` with theme-aware semantic colours. HeroUI v3 MCP was used to fetch the canonical Chip props (`variant`, `color`, `size`) before each migration so we never guessed the API.

### Changed

- **Status maps moved to ChipColor type** — every `Record<string, string>` of bespoke Tailwind colour strings (`bg-blue-50 text-blue-600`, `bg-emerald-50 text-emerald-700`, `bg-status-overdue/10 text-status-overdue`, …) replaced with `Record<string, ChipColor>` returning `'default' | 'accent' | 'success' | 'warning' | 'danger'`. Maps renamed to `*_CHIP_COLOR` so the call site reads `<Chip variant="soft" color={MAP[k] ?? 'default'} size="sm">`.
- **Mapping table** (canonical):
    - `compliant` / `paid` / `approved` / `completed` / `resolved` / `success` / `pass` / `active` → `success`
    - `due_soon` / `in_progress` / `medium` / `pending` / `renewal_due` → `warning`
    - `overdue` / `non_compliant` / `failed_access` / `rejected` / `expired` (kept default) / `high` / `critical` / `cancelled` (when destructive) / `fail` → `danger`
    - `scheduled` / `sent` / `open` / `in_progress` (queue) / `converted` / `super_admin` / `org_admin` / `scheduler` / `manager` / `client_admin` → `accent`
    - `draft` / `cancelled` / `closed` / `low` / `auditor` / `viewer` / generic `bg-muted` → `default`
- **Files touched (21)**: `routes/portal/{visits,quotes,invoices,actions,index}.tsx`, `routes/contracts/[id].tsx`, `routes/schedule/index.tsx`, `routes/dashboard/index.tsx`, `routes/settings/{users,roles,profile}.tsx`, `routes/clients/[id].tsx`, `routes/properties/{index,[id]}.tsx`, `routes/site/index.tsx`, `routes/jobs/[id].tsx` (photo-count chip), `routes/compliance/[id].tsx` (status + AI-assisted chip), `routes/reports/[id].tsx` (outcome chip), `routes/documents/index.tsx` (version chip), `routes/scheduler/index.tsx` (job-count chip), `routes/subcontractors/[id].tsx` (job-status sub-table chip).

### Notes

- The Wave 16 chips already migrated in `subcontractors/index.tsx`, `subcontractors/[id].tsx`, `jobs/index.tsx`, `jobs/[id].tsx` (status/priority), `quotes/[id].tsx`, `quotes/index.tsx`, `invoices/index.tsx`, `invoices/[id].tsx`, and `compliance/[id].tsx` (visit-status sub-row) were left untouched.
- Pure non-pill rounded shapes (status dots, avatars, count badges inside segmented tabs, the SLA-priority chip with custom `style={{backgroundColor}}`, decorative traffic-light dots in marketing pages) were intentionally not migrated — they're not status pills, they're presentational dots/glyphs.
- Build green — `npm run build` clean after the sweep.

### Smoke test

- 5 themes (light, dark, midnight, glass, luxe) re-paint every migrated chip correctly because all chips now route through HeroUI v3 semantic tokens (`var(--success)`, `var(--warning)`, `var(--danger)`, `var(--accent)`).

---

## 0.16.0 — 2026-04-26 — Wave 16: app-wide visual consistency sweep

The user flagged that the same component patterns rendered differently across pages (some empty states brand-tinted, some grey; some buttons solid orange, some dark-foreground; segmented controls with three different paddings; brand-orange hover on neutral menu items; status pills as bespoke spans on some pages and as `<Chip>` on others). Wave 16 is one branch with per-area commits that finds and unifies every remaining inconsistency without changing behaviour. HeroUI v3 MCP was used to fetch the canonical CSS for `Button`, `Chip`, `Card`, `Input`, `Dropdown`, and `Tabs` before deciding each canonical pattern.

### Changed (per area)

- **Buttons (Area 1)** — internal-app primary CTAs converged on `bg-foreground text-background hover:bg-foreground/90 px-4 py-2 rounded-lg text-[13px] font-medium`. External pages (auth, portal, marketing, site, field PWA) deliberately keep brand-orange CTAs because they're public-facing. Fixed `settings/profile.tsx` (3 buttons used `hover:bg-muted` not `/90`; one used `px-3.5`), `reports/index.tsx` (was brand-500), `compliance/[id].tsx` (Generate certificate was brand-500), `actions/new.tsx` (px-5 py-2.5), `contracts/new.tsx` (px-5 py-2), `notes-section.tsx` (HeroUI Button with className override → `variant='primary'` onPress), `access-denied.tsx` (raw red-50/red-500/gray-* → tokens).
- **Segmented controls (Area 2)** — every status-filter / view-toggle now matches `flex gap-0.5 bg-surface-elevated border border-border-default rounded-lg p-1 w-fit` with `bg-surface-card text-text-primary shadow-sm` for active and `text-text-muted hover:text-text-primary hover:bg-surface-card/50` for inactive. Re-wrote: archives, scheduler, analytics, reports/advanced, knowledge-base, dashboard/stock, properties.
- **Hover states (Area 3)** — neutral-surface hovers for non-CTA items. Topbar Client View toggle was `hover:bg-brand-500/10 hover:text-brand-500 hover:border-brand-500/20` next to neutrally-hovering Bell/Theme — now `hover:bg-surface-page hover:text-text-primary`. Search button border-brand-400 → border-strong. Dashboard KPI tile group `hover:border-brand-500` → `hover:border-border-strong + bg-surface-card`. Reports/index card icons brand-50 → accent-soft and `hover:border-brand-500` → border-strong. Stock row click target `hover:text-brand-500` → `hover:text-text-primary` for action buttons.
- **Status pills (Area 4)** — bespoke `<span>` with `bg-status-X/10 text-status-X` replaced by `<Chip variant='soft' color='success|warning|danger|default' size='sm'>` in subcontractors index + detail. Light-only `bg-brand-50 text-brand-600/700` swapped to theme-aware `bg-accent-soft text-accent-soft-foreground` (or `text-accent`) in 8 places: settings/profile role, compliance/[id] AI chip + cert count, jobs/[id] task/photo counts + assignee dot, dashboard/auto-assign accreditation, dashboard/audit saved-filter chip, properties/[id] inline-confirm hover, components/shared/saved-views, components/shared/auto-assign-suggestions. Form-validation reds: `text-red-500/600/700` and `bg-red-50/100` swept to `text-status-overdue` / `bg-status-overdue/10` / `border-status-overdue/30` across 28 admin pages.
- **Form input focus (Area 5)** — `focus:ring-brand-500/10 focus:border-navy-400` (9 files) → canonical `focus:ring-brand-500/20 focus:border-brand-500`. Files: settings/{organisation,profile,users}, portal/{documents,compliance}, contracts/new, dashboard/integrations/{xero,quickbooks,slack}.
- **Card surfaces (Area 6)** — canonical `bg-surface-card border border-border-default rounded-xl`. Onboarding wizard `rounded-2xl` → `rounded-xl` for both panels; `step-1-welcome` callout `border-border-subtle` → `border-border-default`. Marketing pages keep their `rounded-2xl` (different visual language).
- **Page titles (Area 7)** — `SectionHeader` (variant=`page`) was `text-2xl` (24px) but every inline page h1 in routes/ uses `text-[22px] font-semibold tracking-[-0.02em]`. Aligned. Subtitle `text-sm text-text-secondary` → `text-[13px] text-text-muted`. Icon brand-500 → `text-text-accent` (theme-aware).
- **Loading states (Area 8)** — legacy `SkeletonBox` in `src/components/shared/skeleton.tsx` (still used by ~20 routes) used `bg-gray-200`, which renders flat in dark themes. Switched to `bg-surface-elevated` so the pulse is visible in every theme — matches the newer `/skeletons/skeleton-base.tsx`.
- **Shared admin components (extends Area 5/7)** — six widely-used components used hardcoded gray-/red-classes that flatten in dark themes. Swept to design-system tokens: `data-table.tsx` (column header / sort / paginator / floating bulk bar), `breadcrumbs.tsx`, `confirm-dialog.tsx`, `csv-import-modal.tsx` (drop zone, mapping table, error banner — ~12 hardcodes), `file-upload.tsx`, `signature-pad.tsx`, `timeline.tsx` (event-icon palette swap to `status-` / `accent-soft` tokens so it renders in all 5 themes; body text gray-* → tokens). `text-white` on `bg-foreground` was wrong (foreground is black in light, white in dark — `text-background` is the correct inverse) — fixed in csv-import-modal.

### Notes

- HeroUI v3 MCP (`get_component_source_styles`) used to verify the canonical CSS for Button, Chip, Card, Input, Dropdown, Tabs before each area was canonicalised — no API guesses from training data.
- All 5 themes (light, dark, midnight, glass, luxe) re-paint correctly after the sweep.
- Auth, portal, marketing, site, and field PWA intentionally keep their brand-orange-on-light visual language and were not touched.
- A separate sub-commit (`359be97`) landed during the sweep — sidebar grey active-state removal and topbar HeroUI v3 `Tooltip` adoption on Bell/Client View. Folded into the same branch.
- Build green at every commit. ~50 files touched across the wave.

### Smoke test

- `npm run build` clean.
- 5 themes toggled via topbar — surfaces, text, accent buttons, status chips, form fields, dropdowns, hover/focus halos all re-paint correctly with no light-theme tokens leaking into dark themes.

---

## 0.15.0 — 2026-04-26 — Wave 15: HeroUI v3 semantic-token alignment + theme class switching

### Added
- **Full HeroUI v3 semantic-token bridge** in `src/index.css` — every theme (`light`, `dark`, `midnight`, `glass`, `luxe`) now defines the complete v3 surface: `--background`, `--foreground`, `--surface`/`--surface-foreground`, `--overlay`/`--overlay-foreground`, `--accent`/`--accent-foreground`/`--accent-soft`/`--accent-soft-foreground`, `--success`/`--warning`/`--danger` (each with `-foreground`), `--field-background`/`--field-foreground`/`--field-placeholder`/`--field-border`, `--default`/`--default-foreground`, `--muted`/`--muted-foreground`, `--border`, `--separator`, `--focus`, `--link`, `--backdrop`, `--scrollbar`, plus the v3 constants `--white`/`--black`/`--snow`/`--eclipse`. The pre-existing internal palette (`--color-brand-*`, `--color-text-*`, `--color-surface-*`, …) is untouched — both layers coexist so HeroUI v3 components pick up theme colours via `var(--accent)` etc. while the existing 35+ pages keep using `bg-surface-card` / `text-text-primary`.
- **Theme switcher writes both `class="dark|light"` and `data-theme="X"`** (already in place from Wave 13 — confirmed and documented). HeroUI's class-based component CSS works alongside the per-theme `[data-theme="X"]` selectors.
- **`prefers-reduced-motion` honoured** via a new `useEffect` in `theme-context.tsx` that sets `data-reduce-motion="true"` on `<html>` when the OS-level reduce-motion preference is on. HeroUI v3 automatically disables enter/exit animations when this attribute is present; the bespoke keyframe animations in `index.css` (scale-in, fade-in-up, slide-in-from-left, bell-ring, status-pulse) are also gated by a `@media (prefers-reduced-motion: reduce)` block plus a `:root[data-reduce-motion="true"]` rule for programmatic override.
- **`docs/heroui-v3-tokens.md`** — new contributor-facing guide explaining the v3 semantic surface, full mapping table from internal tokens to v3 tokens, usage examples (`bg-accent text-accent-foreground`, `buttonVariants()` for plain `<button>`), and the HMR caveat for `@theme` edits (restart dev server). First file under `docs/`.

### Notes
- `@heroui/styles` is installed transitively via `@heroui/react@^3.0.3` — `src/index.css` already had `@import "@heroui/styles";` at the top so component CSS continues to load.
- No component prop changes — `<Button variant="primary|secondary|tertiary|soft|ghost|outline|danger|danger-soft">` already matched the v3 API.
- Compound-component migration (e.g. `<Alert.Icon /><Alert.Content />`), `tv()` adoption for bespoke variants, and the per-component cleanup pass are deferred to v15.1.
- After editing `src/index.css` you may need to restart `npm run dev` — Vite's HMR for Tailwind v4 `@theme` blocks is unreliable. `npm run build` is unaffected.

### Smoke test
- `npm run build` clean.
- All 5 themes toggled via the topbar selector — surfaces, text, accent buttons, status chips, and form fields all re-paint correctly.

---

## 0.14.0 — 2026-04-26 — Wave 14: Tenant Portal

### Added
- **Tenant portal at `/site/*`** — a new single-property end-user portal for clients-of-clients (e.g. the actual pub manager AT The Fox Inn, not Greene King's regional FM). Pages: overview (3 KPIs), raise call-out, visits + service reports, compliance with explainers, quotes (approve/reject), contacts.
- **`property_contacts` table** + `tenant_property_id()` RLS helper. New `tenant_user` role added to permissions.
- **Invite flow** — magic-link tokens (32-char URL-safe random, 7-day expiry) emailed via the existing Resend `send-email` function.
- **Two new edge functions** — `site-invite` (org-admin only, generates token + sends email) and `site-accept-invite` (`--no-verify-jwt`, supports `inspect` + `accept` actions, provisions auth user via service role, returns a session for `supabase.auth.setSession`).
- **FM-side site-contacts panel** — embedded on `/dashboard/properties/:id` to invite/resend/disable/delete contacts.
- **Tenant-scoped RLS** — parallel `*_select_tenant` policies on properties, jobs, compliance_items, assets, service_reports, documents, quotes, quote_lines, actions, timeline_events, clients (minimal), organisations (for branding). Plus `jobs_insert_tenant_callout` for raising call-outs and `quotes_update_tenant` for status flips only.
- **Notification fan-out on call-out** — tenants raising a call-out auto-notify all org_admin/scheduler/client_admin profiles in the FM org via `createBulkNotifications` (dedups Slack posts).
- **White-label branding extends to `/site`** — `applyOrgBranding` runs in `SiteLayout` so the FM company's logo + accent applies to tenant portal too.

### Manual ops to go live
- Set `PUBLIC_APP_URL` env var on the `site-invite` edge function if your domain isn't `https://app.haumea.com`.
- Resend domain should already be wired from Wave 5B — invite emails reuse `send-email` with the `invite` template.

---

## 0.13.1 — 2026-04-26 — Wave 13A: GDPR UI Integration

### Added — GDPR UI integration
- **Front-end Data & Privacy surfaces shipped to master** — admin console at `/dashboard/settings/data` (Requests / Export / Delete tabs, gated by new `data:export` permission) and self-service user page at `/dashboard/settings/privacy` (gated by `privacy:read`). Wires up the `gdpr-export` and `gdpr-delete` edge functions that were already deployed in 0.12.0; backed by `gdpr_requests` table from migration `00033_gdpr_requests.sql`.
- **Sidebar navigation** — single mutually-exclusive "Data & Privacy" entry per role under System (admins → admin console; engineers / finance / scheduler / client_admin / auditor → self-service privacy page). Adds `ShieldHalf` icon import.
- **Permissions** — three new permissions wired across role grants: `data:export`, `data:delete` (org_admin + super_admin only), `privacy:read` (every authenticated role).

### Notes
- Rebased `wave12/gdpr` onto current master (which had picked up branding + time-tracking + deploy-status + wave13/pdf-rendering + wave13/cmdk-tests since the GDPR branch forked). Resolved overlapping touches in `App.tsx`, `sidebar.tsx`, `permissions.ts`, and `PROGRESS.md`. No HeroUI prop fixes were required — the GDPR builder's `Button` (`variant="primary" | "danger" | "ghost" | "danger-soft" | "soft"`) and `Chip` (`color="default" | "danger"`) usage compiled cleanly against this codebase's API. `variant="page"` is on the shared `SectionHeader` component, not Button.
- Migration and both edge functions were already live on Supabase from the 0.12.0 wave; no infra ops on this release.

---

## 0.13.0 — 2026-04-26 — Wave 13: Polish & Production-Readiness

### Added
- **Real PDF rendering for compliance certificates (Browserless integration)** — the `generate-certificate` edge function now POSTs the rendered HTML to Browserless's `/pdf` endpoint and stores the binary PDF at `certificates/<org>/<cert_id>.pdf` alongside the HTML record. Closes the v1 promise from Wave 8B. Falls back to HTML-only when `BROWSERLESS_TOKEN` is unset — feature degrades gracefully with no user-visible error. After Save & Print, the primary button switches to "Download PDF" when a binary PDF is available.
- **Push notifications backend (Wave 13D / Task 113)** — `send-push` edge function fans out Web Push messages signed with VAPID via `npm:web-push@3.6.7` on Deno's npm-compat layer. Service-worker `push` + `notificationclick` handlers added via `public/push-sw.js`, imported into the workbox-generated SW through `vite.config.ts`. `src/lib/notifications.ts` fires-and-forgets pushes after every in-app notification insert (single + bulk; bulk variant groups by payload so a 12-admin fan-out becomes one edge invocation with 12 user IDs). Feature flag `pushNotifications` default flipped from opt-in to opt-out — force-disable with `VITE_FEATURE_PUSH=false`. Dead subscriptions (410/404) auto-cleaned in the same invocation. Manual op to activate: generate VAPID keys (`npx web-push generate-vapid-keys --json`), set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` Supabase secrets + `VITE_VAPID_PUBLIC_KEY` browser env (see `.env.example`). Until activated, the edge function returns `{ unconfigured: true }` and the UI subscribe path no-ops with a toast — in-app notifications continue working untouched.

---

## 0.12.0 — 2026-04-26 — Wave 12: Operational Depth

### Added
- **Time tracking on jobs** — engineer hours split travel / on-site / admin / break, billable/unbillable, per-engineer rates with override, weekly timesheet view, "Pull from time entries" on invoice line creation. Migration `00032_time_tracking.sql`.
- **GDPR data export + right-to-be-forgotten** — admin Data & Privacy panel, user-facing self-service, soft-anonymisation strategy preserving audit trail. Migration `00033_gdpr_requests.sql` + 2 edge functions.
- **White-label per-org branding** — logo upload, accent colour picker with WCAG contrast check, plan-gated to Growth, applies to client portal only. Migration `00034_org_branding.sql`.
- **Deploy status DX panel** — fail-state banner on `/dashboard/health` + `/dashboard` (super_admin only), dev-mode floating badge polling GitHub deployments API.

### Fixed
- **"Access Denied" flash** on every navigation — auth context now awaits `fetchProfile` before flipping `loading=false`, preventing RoleRoute from rendering AccessDenied during the auth-load gap. Plus RoleRoute defensively shows a spinner while `loading || !profile`.
- **`require is not defined`** runtime error on `/settings` (Appearance) — replaced CommonJS `require()` with top-level ESM imports.
- **Settings sub-page navigation broken** — settingSections array linked to `/settings/*` but real routes live under `/dashboard/settings/*`. Prefixed all 5 links.
- **Vercel deploys failing** — `.npmrc` with `legacy-peer-deps=true` resolves the `vite-plugin-pwa@1.2.0` peer-dep conflict against `vite@8`.

### Marketing
- Homepage redesign — replaced generic SaaS features grid with "Six tools, one platform" + 3 alternating narrative blocks with custom mini-mockups.
- About page — opinionated narrative ("UK FM software is stuck in 2014") + 6 hard commitments ("What we won't do") + technical pillars.
- Features page — grouped 4-section layout with sticky tab nav and tagged cards.
- Contact page — three-path layout (demo / quick question / support).
- Navbar — always-visible solid white (was transparent on top of dark hero, broke on white hero).

---

## 0.11.0 — 2026-04-26 — Wave 11: Bulk CSV Import
- Drag-drop wizard for clients / properties / assets / engineers / compliance items
- Inline CSV parser, fuzzy auto-mapping, FK-by-name lookup
- `import_runs` audit table

## 0.10.0 — 2026-04-26 — Wave 10: SLA Tracking
- Per-priority response + completion targets
- Live countdown chips + breach detection
- 6 default policies seeded per org

## 0.9.0 — 2026-04-26 — Wave 9: Intelligence + Communication
- AI compliance suggester (Claude Haiku 4.5)
- Custom report builder (drag-drop, 8 datasets, scheduled exports)
- Slack notifications integration
- Stock & parts tracking

## 0.8.0 — 2026-04-26 — Wave 8: Operational Depth
- GPS check-in + on-site signature capture
- Auto-generated PDF compliance certificates
- Org-wide audit log search
- Auto-assignment rules engine

## 0.7.0 — 2026-04-26 — Wave 7: Enterprise Integrations
- Calendar sync (iCal feed + Google Calendar 2-way)
- Xero + QuickBooks accounting push
- Microsoft Entra + Google Workspace SSO

## 0.6.0 — 2026-04-25 — Wave 6: Production-Blocking
- Tests (Vitest + Playwright)
- Stripe billing (subscriptions, customer portal, webhook)
- Onboarding wizard
- Sentry observability

## 0.5.0 → 0.1.0 — 2026-03 → 2026-04 — Phases 1-5
- Initial scaffolding, RLS, RBAC, realtime, engineers/subcontractors, advanced reports, mobile/PWA, polish, demo seed

---

Versions before 0.12.0 are reconstructed retroactively. From this point on, every wave bumps `0.X.0` and every fix between waves bumps `0.X.Y`.
