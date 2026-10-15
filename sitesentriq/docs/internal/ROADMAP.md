# Roadmap & go-live backlog

Living list of what's parked, why, and roughly when. Current version `0.28.2`
(Trust & Compliance wave live, plus the 0.28.1 access-control repair and the
0.28.2 Codex review pass). Newest thinking at the top of each section.

---

## A. Go-live / launch checklist (do around launch, not before)

- [ ] **Stand up the help subdomain** `help.sitesentriq.com` — content is written
  (`docs/help-center/`, 12 articles). Wrap it in Astro Starlight (matches the Vite/Vercel
  stack) or Mintlify/GitBook, deploy, point DNS. *Deferred to launch by decision.*
- [ ] **Revoke + rotate the Supabase management token** used during development
  (`sbp_…e99e`) before taking real customer data.
- [ ] **Front-end deploy cadence** — decide auto-deploy-on-push (wire Vercel↔GitHub) vs
  the current manual `vercel --prod`. Today it's manual.
- [ ] **Set `BROWSERLESS_TOKEN`** if you want the Building Pack + Tender Pack as PDF
  (HTML is the live output without it).
- [ ] **Seed data / demo org** for sales + onboarding walk-throughs.
- [ ] **Billing live** — confirm Stripe plans/tiers + the anti-lock-in positioning
  (monthly rolling, one-click full export) are real before charging.

## A2. Known residuals from the 0.28.1 / 0.28.2 reviews (found, triaged, not yet fixed)

Each of these was **confirmed by reading the code** during the 2026-08-05 sweeps and
consciously left out of those batches — they are real, just not one-line fixes. See
`docs/internal/BUGS_AND_FIXES.md` for the full findings.

- [ ] **`subcontractor-job` writes upload metadata before the upload happens.**
  `request_upload` mints the signed URL then unconditionally inserts the `job_photos` /
  `subcontractor_documents` + `subcontractor_rams` rows and returns; the client PUTs
  afterwards and nothing reconciles the two. An abandoned or failed upload leaves a
  `pending` RAMS row pointing at a nonexistent object, which `progress.rams_count` then
  reports to the FM dashboard as "RAMS received". A token holder can also loop
  `request_upload` unrate-limited and insert unbounded rows into three tenant tables.
  *Fix shape:* a `confirm_upload` step (or `pending_upload` status + an existence sweep),
  plus a per-token upload counter. Deliberately deferred — it's a protocol change.
- [ ] **Provider-side invoice idempotency key** (long-standing residual) — the accounting
  push can double-apply on the provider side.
- [ ] **`sla_*_met_at` direct-write lockdown** (long-standing residual) — the stamps are
  still writable directly rather than only via the guarded path.
- [ ] **`job_eta_tokens` has no `revoked_at`** *(note: the separate cross-tenant
  binding hole in this table was fixed in 00126; this remaining item is only the
  revoke capability)* — `public-job-eta` checks expiry only, so a
  leaked tracking link cannot be killed inside its 7-day TTL. The `view_count`
  leak-detection design implies you'd want to act on a detection, so a revoke column is
  the natural completion.
- [ ] **`quickbooks-oauth` / `slack-oauth` return the raw upstream error body** to the
  caller. Role-gated to org_admin/finance so impact is small, but it leaks Intuit/Slack
  internals — return a generic message and keep the detail in `console.error`.
- [ ] **10 edge functions fail `deno check` strict mode** — all the same supabase-js
  generics class (`SupabaseClient<any,"public",any>` vs `<unknown,never,…>`). Not a
  defect; they deploy and run. Worth a typed-client helper someday to get the gate to
  fully green. *(Run `deno check` with `DENO_NO_PACKAGE_JSON=1` — otherwise a populated
  root `node_modules` makes every check fail misleadingly.)*

## B. Near-term — finish the moat (the last research items)

- [x] **SFG20 alignment v1** (00123) — maintenance plans can be tagged SFG20-aligned with a
  schedule reference + review date; "X of Y plans SFG20-aligned" credibility marker on the
  maintenance page. **Live auto-update API sync is the fast-follow — needs a free SFG20
  Digital Partner Programme key** (their task content is licensed; we ship the structure).
- [ ] **AI compliance copilot** (deferred — needs Anthropic API key + cost sign-off).
  Design is in `FEATURES.md` §5: RLS-true retrieval via the caller's JWT, fixed toolset,
  read-only v1, feature-flagged + budgeted.
- [x] **Custom fields v1** (00124) — per-org custom field definitions by entity
  (Settings → Custom fields) + a `custom_fields` jsonb on each entity; a reusable card
  renders them on **property** and **asset** detail (other entities a quick follow).
- [ ] **Editable completed records (with audit) + relabel standard fields** — the remaining
  slice of the rigidity fix; separable, each non-trivial.

## C. Mid-term — revenue + intelligence

- [ ] **Meter readings → ESG/energy-lite** — mobile photo meter reads first, then
  IoT/BMS ingestion; every reported figure traceable to a read (MEES/EPC angle).
- [ ] **Asset lifecycle & capex planning** — replacement forecasting, condition scoring,
  budget planning per portfolio.
- [ ] **Consolidated multi-property billing + CIS** for subbies (UK).
- [ ] **SLA penalty → credit-note automation** (currently summary-only by design).
- [ ] **Helpdesk / ticketing triage** — the 24/7 service-desk expectation in UK FM
  (human desk, AI triage, or out-of-hours workflows).

## D. Bigger bets

- [ ] **Public API + webhooks** → an integrations marketplace.
- [ ] **Contractor compliance network** — vetted subbie directory with auto-verified
  CHAS/SSIP (the Prosure360 model), reusable across operators.
- [ ] **Full Building Safety Act golden-thread module** — occurrence reporting, structured
  building information, resident/regulator access.
- [ ] **White-label / multi-brand** for larger operators.
- [ ] **Floor-plan issue pinning** (image-based "BIM-lite") in the portal.

## E. Deferred / parked (with reason)

- Provider-side **invoice idempotency key** (stronger than the 30-min reclaim) — commercial
  decision.
- Unify the **two SLA layers** (org-level 00030 + contract-level 00117) — they coexist
  deliberately; merge is a tidy-up.
- New **cert field types** (numeric/select) + per-org custom cert templates.
- Inspection-failure → **auto work order**.
