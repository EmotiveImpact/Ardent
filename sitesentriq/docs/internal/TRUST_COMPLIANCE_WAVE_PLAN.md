# Trust + Compliance Wave — Implementation Plan

> Planned by Fable 5 (architect pass) on 2026-06-10, executed by Opus 4.8 on
> branch `feat/trust-compliance-wave`. Derived from the competitive research
> sweep (18 platforms; see chat transcript 2026-06-10): the loudest market
> complaints are offline data loss, accounting-sync opacity, weak dashboards,
> and a missing UK compliance moat (subcontractor gating, SLA engine,
> golden thread). Status markers updated as tasks land.

## Status

| Task | Description | Status |
|---|---|---|
| W1-T1 | Ready security migrations 00094/00095 | ✅ 2026-06-10 — found ALREADY LIVE (verified via pg_policy/pg_proc); files kept at original numbers; BLOCKERS.md unstale'd |
| W1-T2 | Offline queue group atomicity (failAccess RPC, 00114) | ✅ 2026-06-10 — 00114 applied + smoke-tested (rolled back); `rpc` queue kind; 36/36 mobile tests |
| W1-T3 | Accounting sync surfacing + retry hardening | ✅ 2026-06-10 — sync panel + pushing chip + retry; stale-claim reclaim deployed (xero/qb v6); 206/206 web tests |
| W1-T4 | Dashboard widget composition (00115) | ✅ 2026-06-10 — registry + zone-aware reorder/hide, per-user DB prefs, 00115 applied; 215/215 web tests |
| W2-T5 | Subcontractor compliance gating (00116) | ✅ 2026-06-10 — 3 tables + matrix + evaluator + dispatch gate applied; authed gate test passed live (block/override); compliance tab + job panel + expiry banner; 224/224 web tests. Deferred: requirements editor UI, dashboard widget |
| W2-T6 | SLA engine (00117) | ✅ 2026-06-10 — contract_sla_policies + stamped targets + met-evidence triggers + credit summary applied; 7-assertion live smoke incl. PPM-path fail-open; chip + contract editor; 233/233 web tests. DISCOVERY: a pre-existing ORG-level SLA system (00030, lib/sla/, settings/sla) was missed by planning — new module renamed lib/contract-sla.ts (commercial layer, per-contract credits) to coexist; UNIFYING THE TWO is a follow-up |
| W2-T7 | Per-use subcontractor link flow (00119) | ✅ 2026-06-10 — token table + subbie-uploads bucket applied; subcontractor-job fn deployed v1; /subbie/:token chromeless stepper; work-link mint/copy/revoke on the job panel. FULL live lifecycle verified (404/409/accept/upload-PUT/complete/side-effects/anon-zero-rows); test data cleaned. Known gap: staff UI doesn't yet sign subbie-uploads paths for download (RAMS approval row works) |
| W2-T8 | QR proof-of-presence (00118) | ✅ 2026-06-10 — CHECK extended + applied; scan?jobId= check-in mode (offline-aware, best-effort location); timeline renders "Proof of presence"; live smoke: qr_checkin stamps SLA evidence; 40/40 mobile tests |
| W3 | Golden-thread pack · PTW · AI copilot (needs key sign-off) · UK cert library | outline |

---

## 1. Decisions

### D1 — Offline split-outcome fix: single transactional RPC (not groupId quarantine)

**`public.record_failed_access(...)` enqueued as ONE queue action, via a new
`rpc` action kind in the offline queue.**

- groupId quarantine cannot deliver atomicity: the queue applies actions
  independently across drain passes (`drainOfflineQueue`), so member A can
  succeed in pass 1 while member B dead-letters in pass 8 — the split outcome
  remains reachable. One queue entry = one atomic outcome by construction.
- Smaller surgery on field-critical code: an additive `applyAction` branch vs
  group bookkeeping threaded through enqueue/drain/dead-letter.
- Replay-safe via client-stamped `p_note_id` UUID + `on conflict (id) do nothing`
  (the queue's existing idempotency idiom).
- SECURITY INVOKER (caller's RLS applies to both writes); still `set
  search_path = ''` + schema-qualify everything per house style.
- Other multi-action enqueues explicitly do NOT need this: `recordFieldEvent`
  is best-effort, checkout `function_invoke` is idempotent server-side, the
  signature pair converges on replay. Document this in offline-queue.ts.

### D2 — SLA stamping: at job creation via DB trigger (not computed live)

- Jobs are created from ≥5 paths (web, mobile, portal callout, PPM RPC,
  auto-assign); only a DB trigger covers all of them.
- Stamped targets are immutable evidence for service-credit disputes; live
  computation also makes breach queries join-heavy where a stamped partial
  index is a single scan.
- Breach evaluation stays live + client-side (`lib/sla.ts`).
- Trigger is SECURITY DEFINER (portal tenant has no RLS read on contracts),
  `set search_path = ''`, fully qualified, and **fail-open** (`exception when
  others then return new`) — an SLA bug must never block job creation (the
  00086/PPM failure mode must not repeat).

### D3 — Accounting sync log: extend the existing shared table; NO new table

`accounting_sync_log` (00019) + `invoices.accounting_status/-_provider/
-_pushed_at/-_error` + `AccountingStatusChip` + `usePushInvoiceToAccounting`
already exist. The genuine gaps: a per-invoice history panel (current hook is
org-wide only), surfacing `accounting_error`, a `pushing` chip state, an
explicit Retry, and a **stale-`pushing` reclaim** in both push functions
(today a crash mid-push wedges the invoice forever).

### D4 — Subbie token: mirror `job_eta_tokens`; all public access via one service-role edge function

Token table follows 00048 exactly (unguessable token, expiry, view counters,
org RLS, zero anon PostgREST exposure). Public reads AND writes go through
`subcontractor-job` (verify_jwt=false, token-is-the-auth, like
`public-job-eta`); uploads via short-lived signed upload URLs.

---

## 2. Migration number registry

| # | File | Task |
|---|---|---|
| — | 00094/00095 verified already applied; kept at original numbers | W1-T1 ✅ |
| 00114 | `00114_record_failed_access_rpc.sql` | W1-T2 |
| 00115 | `00115_dashboard_widget_prefs.sql` | W1-T4 |
| 00116 | `00116_subcontractor_compliance.sql` | W2-T5 |
| 00117 | `00117_sla_engine.sql` | W2-T6 |
| 00118 | `00118_subcontractor_job_tokens.sql` | W2-T7 |
| 00119 | `00119_qr_checkin_events.sql` | W2-T8 |

---

## 3. Wave 1

### W1-T1 — Apply the two ready security migrations as 00114/00115 (FIRST)

1. Pre-flight: confirm remote state — 00094/00095 NOT applied (note: this
   project applies migrations via `supabase db query --linked -f`, so check
   the actual policies/functions live, not just migration history).
2. `git mv` 00094→00114, 00095→00115; update header comments.
3. Modernise 00115: `set search_path = public, extensions` → `set search_path
   = ''`; verify all refs schema-qualified.
4. Sanity-check the legit caller passes 00114's org binding (site callout
   insert supplies the property's own organisation_id).
5. Apply; smoke via `pg_policy` / `pg_proc` reads.

### W1-T2 — Offline queue group atomicity (failAccess)

Migration 00116: `public.record_failed_access(p_job_id, p_note_id,
p_note_content, p_user_name)` — SECURITY INVOKER, `search_path=''`,
update jobs→failed_access + idempotent note insert in one transaction;
revoke from public/anon, grant to authenticated.

Code: `offline-queue.ts` gains `'rpc'` action kind + `applyAction` branch +
export `uuidv4`; `useJobs.ts` `failAccess` → one RPC call (online) / one
queued action (offline); extract note composition to `lib/fail-access.ts`.

Tests: rpc drain success/retry/dead-letter; partial-failure simulation
(no jobs/notes writes when rpc fails; queue holds single intact action);
replay idempotency (same `p_note_id` both drains). Update BLOCKERS.md.

### W1-T3 — Accounting sync surfacing + retry hardening (no migration)

- `types.ts`: `AccountingStatus` gains `'pushing'`.
- `accounting-status-chip.tsx`: render `pushing`; `errorMessage` tooltip.
- `hooks.ts`: `useInvoiceSyncLog(invoiceId)` (per-invoice history).
- New `components/invoices/invoice-sync-panel.tsx`: status + error +
  history + **Retry push** (visible on `error`, or `pushing` older than
  10 min); mount in `routes/invoices/[id].tsx`.
- Edge fns xero-/quickbooks-push-invoice: stale-claim reclaim (`pushing`
  + `updated_at < now()-10min` re-claimable, race-safe guarded update);
  QuickBooks column/sync-log parity audit with Xero.

### W1-T4 — Dashboard widget composition (00117)

- Table `dashboard_widget_prefs(user_id pk, organisation_id, layout jsonb,
  updated_at)`, own-row RLS (00112 pattern; no secdef reader needed).
- `lib/dashboard-widgets.ts`: `WIDGET_REGISTRY` (compliance_score, soc_pulse,
  kpi_grid, trend_chart, jobs_activity, quote_widgets, po_widgets,
  compliance_feed, activity_rail); KPI hero row stays pinned. Pure
  `mergeLayout(saved, registryKeys)` — unknown keys dropped, missing keys
  appended visible (zero-backfill story).
- `hooks/use-dashboard-prefs.ts` mirroring use-notification-prefs.
- `components/dashboard/dashboard-customize.tsx`: visibility checkboxes +
  reorder (@dnd-kit/sortable, up/down buttons as a11y fallback) + reset.
- `routes/dashboard/index.tsx`: render ordered visible sections; activity
  rail keeps its column slot when visible.

---

## 4. Wave 2

### W2-T5 — Subcontractor compliance gating (00118)

Tables (all org-RLS 4-policy pattern from 00056):
- `subcontractor_insurance_policies` (policy_type CHECK public_liability/
  employers_liability/professional_indemnity/contractors_all_risk/other,
  insurer, policy_number, cover_amount, start_date, expiry_date NOT NULL,
  subcontractor_document_id FK).
- `subcontractor_accreditations` (scheme CHECK ssip/chas/safecontractor/
  constructionline/niceic/gas_safe/other, reference, expiry_date, doc FK).
- `subcontractor_rams` (job_id FK nullable = generic, title, doc FK,
  approval_status pending/approved/rejected, approved_by/at, valid_until).
- `subcontractor_compliance_requirements` (org PK, required jsonb default
  `{"insurance":["public_liability"],"accreditation_any_of":["ssip","chas",
  "safecontractor"],"rams_required":true}`). Settings editor UI DEFERRED.
- Fn `subcontractor_compliance_status(p_subcontractor_id) returns jsonb`
  `{compliant, failures[]}` — sql stable SECURITY INVOKER.
- Jobs override columns: `subcontractor_override_reason/by/at`.
- Gate trigger `enforce_subcontractor_compliance()` BEFORE INSERT OR UPDATE
  OF subcontractor_id ON jobs, fires only on assignment change; SECURITY
  DEFINER, qualified; non-compliant → exception unless override reason +
  caller role in (super_admin, org_admin); service-role (auth.uid() null)
  bypasses.

Web: types; `hooks/use-subcontractor-compliance.ts` (CRUD + status rpc +
`useExpiringSubcontractorCompliance(30)`); three tabs on subcontractor
detail; **`components/jobs/job-subcontractor-panel.tsx`** (no UI sets
jobs.subcontractor_id today!) with compliance badge + override dialog;
expiry banner on subcontractors index; `subbie_compliance` dashboard widget.
Pure evaluation mirror in `lib/subcontractor-compliance.ts` + unit tests.

### W2-T6 — SLA engine (00119)

- `contract_sla_policies` (contract_id FK, priority CHECK matching jobs,
  response_minutes, fix_minutes, credit_per_breach, unique(contract,
  priority)), org RLS.
- Jobs: `sla_contract_id`, `target_response_at`, `target_fix_at`,
  `sla_response_met_at`, `sla_fix_met_at`; partial index on open unmet.
- `stamp_job_sla()` BEFORE INSERT — secdef, qualified, FAIL-OPEN; match
  active contract by client (job.client_id, fallback property.client_id),
  policy by priority; tie-break latest start_date.
- Met-stamping BEFORE UPDATE (arrived_at → response_met; completed →
  fix_met) + AFTER INSERT ON field_events (arrived|qr_checkin) → response
  evidence (pre-wires T8).
- `sla_contract_period_summary(contract, from, to)` — breaches + credits.
- Optional backfill for currently open jobs only.

Web: pure `lib/sla.ts` (`slaState` → no_sla/on_track/at_risk/
response_breached/fix_breached/met; at_risk <25% window left) + tests;
`hooks/use-sla.ts`; `job-sla-indicator.tsx` countdown chip (job header +
overview tab); SLA section on contract detail (policy editor + period
summary, default current quarter); `sla_risk` dashboard widget.
Post-migration regression: create a job via web form, portal callout, AND
`create_job_from_maintenance_plan` — all must succeed (fail-open proof).

### W2-T7 — Per-use subcontractor link flow (00120; needs T5)

- `subcontractor_job_tokens` modelled on 00048: job_id, subcontractor_id,
  token unique, status issued/accepted/completed/revoked, expires_at
  default now()+14d, view_count, created_by; org RLS; anon gets NOTHING.
- Private bucket `subbie-uploads` (in-migration insert, 00109 pattern).
- Edge fn `subcontractor-job` (verify_jwt=false, service role): GET job
  summary (incl. property address); POST accept / request_upload
  (rams|cert|photo → signed upload URL + metadata row) / signature
  (field-signatures path, jobs.engineer_signature_url) / complete
  (→ status contractor_review + note + timeline event + org notification).
  Every action re-validates token/expiry/status; 404/410 split.
- Web: `use-subcontractor-job-token.ts` (mint/list/revoke); "Generate work
  link" in job-subcontractor-panel; public chromeless `/subbie/<token>`
  route (stepper: Accept → RAMS → photos → signature → Complete).
  Email send via send-email = fast follow (deferred).

### W2-T8 — QR proof-of-presence (00121; needs T6's evidence trigger)

- Recreate field_events event_type CHECK + `'qr_checkin'`; metadata jsonb
  carries `{entity_type, entity_id, raw}`.
- Mobile: scan.tsx accepts `?jobId=` → records qr_checkin field event
  (offline-aware) instead of navigating; job screen gains "Scan QR
  check-in"; generalise recordFieldEvent (additive); pure `lib/qr.ts` +
  test.
- Web: `useJobFieldEvents(jobId)`; timeline renders "Proof of presence —
  scanned <asset> at HH:mm".

---

## 5. Wave 3 (planned in detail by Fable 2026-06-10; building T12 → T9 → T10)

| Task | Description | Status |
|---|---|---|
| W3-T12 | UK cert library — CODE-ONLY (templates are constants in packages/types + a deliberate Metro-local mirror in apps/mobile/constants/cert-forms.ts; cert_completions.cert_type is unconstrained text). 7 new checklist templates: eicr, fire_alarm_weekly, fire_alarm_quarterly, gas_safety_cp12, loler, legionella_monthly, legionella_quarterly. NOT touching the parallel printable-certificates system (apps/web/src/lib/certificates/) | ✅ 2026-06-10 — 7 templates added to both canon + mobile mirror; guard suites extended (uniqueness assert) |
| W3-T9 | Building pack export — 00120 `building-packs` bucket (00068 pattern) + `building-pack-export` edge fn (modeled on generate-tender-pack: resolveCallerContext + per-property org 403; gathers assets/compliance/cert_completions/document version chains/plans/jobs/RAMS/timeline/`system_audit_events`/risk_assessments/log_book_entries); output = self-contained HTML + JSON manifest, 7-day signed URLs (D2: no zip/no embedded files/no per-doc URLs). Web: export button on property detail (toast.promise pattern) | ✅ 2026-06-10 — 00120 bucket + fn deployed v1; live-tested (401/404/200, real-data HTML + manifest validated, artifacts cleaned); export button on property detail |
| W3-T10 | Permit-to-work — 00121: `permits` table (type CHECK ×7, status machine requested→issued→active→closed/cancelled/rejected via secdef transition trigger w/ issuer role gate) + `jobs.requires_permit` + FAIL-CLOSED gate `fos_enforce_permit_to_work` (flagged jobs only; service-role bypass; D3: auto-activate issued→active fail-open inside the gate). Web: permits panel + header chip + new-job checkbox + gate-error toasts; mobile: read-only banner + check-in error mapping | ✅ 2026-06-10 — 00121 applied; 8-group rolled-back live smoke (gate block, requested≠issued, engineer-issue forbidden, issue stamps, AUTO-ACTIVATE, machine negatives, service-role bypass, PPM regression); permits panel + header chip + new-job checkbox + hook-level gate-error humanizing; mobile banner + check-in message; building pack extended w/ permits section (fn v2) |
| W3-T11 | AI copilot — BLOCKED on user API-key/cost sign-off; do not start | ⏸ |

Wave-3 deferrals (from the Fable plan): new cert field types / per-org custom
templates; mobile permit request-issue UI + offline dead-letter special-casing;
DB-level guard on flipping requires_permit (client-gated only); pack zip/PDF/
per-doc signed URLs; audit slice thin until more domains write audit events.

## 6. Dependencies

- W1-T1 first, alone. Then T2/T3/T4 parallelizable (migrations land in
  numeric order). T5→T7; T4→T5/T6 widgets; T6→T8. T5 ∥ T6 (00118 before
  00119). Edge deploys autonomous; NO web deploys without approval.

## 7. Deferred (honest scope)

- T5 requirements-matrix settings editor UI (defaults suffice until asked).
- T6 service-credit → credit-note automation (commercial decision needed).
- T7 automated email of subbie link (copy-link first; 1-day fast follow).
- T4 free-form grid drag/resize (section reorder/hide only).
- W3-11 AI copilot until API-key/cost sign-off.

## 8. Risk register

| # | Risk | Mitigation |
|---|---|---|
| R1 | secdef + `search_path=''` unqualified ref breaks job creation (PPM failure mode, now on a trigger) | Fully qualify; SLA trigger fail-open; gate fires only on subbie assignment; post-push regression via all 3 creation paths |
| R2 | Subbie token = unauth write access to a job | 14d expiry, revoke state + UI, single-job scope, status preconditions, signed uploads with type/size limits, view counters, zero anon policies (explicit anon-select test) |
| R3 | Migration renumber history mismatch | Pre-flight live-state check; both files idempotent; pg_policy/pg_proc post-verify; documented abort path |
| R4 | Offline-queue regression on the field-critical path | Strictly additive change; 28 existing tests stay green; new rpc tests; optimistic UI contract kept |
| R5 | New jobs triggers vs portal callout RLS interacting | Gate no-ops on null subcontractor_id; SLA trigger secdef + fail-open; tenant-callout live smoke in T6 checklist |

---

## Board review + hardening — 2026-06-10 (00122)

A 4-agent board (security/RLS, backend/SQL, web, mobile) adversarially reviewed
the whole wave's diff. Verdict: bones solid (no cross-tenant leak, trigger
ordering + breach maths correct, offline rpc fix sound). Fixed what fell short:

- **🔴 Mobile QR double-write** — `recordQrCheckin` stamped no client PK, so a
  lost-response insert + queue fallback wrote TWO qr_checkin events (duplicated
  SLA attendance evidence). Now stamps the id once → the queue's 23505 dedupe
  converges a replay. +3 idempotency tests.
- **🔴 Double success toasts** — `useUpdateJob`'s generic onSuccess + the
  panels' local onSuccess both fired (Query v5). Removed the local toasts; the
  hook now also stays silent on `subcontractor_not_compliant` (the panel owns
  it via the override dialog).
- **🔴 Dashboard customise reset** — the seed effect depended on `savedLayout`,
  so a background refetch wiped an in-progress reorder. Now seeds on the open
  transition only (ref-read).
- **🟠 Permit-gate bypass (00122)** — any org member could
  `set requires_permit=false, status=in_progress`. New `fos_protect_requires_permit`
  trigger: only admin/scheduler may CLEAR the flag (setting it true stays open;
  service-role bypasses). Live-tested.
- **🟠 SLA met-time backdating (00122)** — clamp `sla_response_met_at`/
  `sla_fix_met_at` to `[created_at, now()]` so a backdated completion can't
  erase a breach + its service credit. Live-tested.
- **🟠 Subbie `complete` replay/spam** — close the token FIRST (race-guarded),
  gate all side effects on it → exactly-once job update / note / timeline /
  notifications. Live-verified (timeline=1, notes=1 on replay). Fn v2.
- **🟠 Invoice `!updatedAt ⇒ stale`** — flipped: unknown timestamp is NOT stale
  (no Retry on an in-flight push).
- **🟡 Contracts index (00122)** — `idx_contracts_org_client_status` removes a
  seq-scan from the per-insert SLA-stamp lookup.
- **🟡 Accounting reclaim 10→30 min** — don't re-POST a merely-slow invoice. xero/qb v7.
- **Polish** — subbie Complete button gates on RAMS+signature; mobile QR tile
  hidden when org id absent; textarea label `htmlFor` associations.

Verified: web tsc/lint/238 tests/build · mobile tsc/43 tests · deno clean ·
00122 applied + rolled-back smoke (clamp/index/flag-protect) · 3 fns redeployed.

Residual (noted, not blocking): per-org compliance-requirements editor UI; mobile
permit request/issue UI; direct-column writes to sla_*_met_at (internal-org
integrity only); loading skeletons on the new in-app panels; provider-side
invoice idempotency key (vs the time-window reclaim).

### Residual completions — 2026-06-10 (non-security)

Built the non-security residuals (code-only — no new migration/edge fn):
- **Compliance-requirements editor** (completes W2-T5) — `/dashboard/settings/compliance`
  edits the per-org matrix (required insurance types, accepted accreditation
  schemes, RAMS-required) the dispatch gate enforces; upsert verified live.
- **Staff download of subbie-uploaded files** (completes W2-T7) — new
  `resolveSubcontractorFileUrl` signs private `subbie-uploads/` paths; the
  documents-tab download + a new RAMS-row "View" now open work-link uploads.
- **Loading skeletons** on the RPC-backed surfaces (compliance status banner,
  SLA period summary) so they don't pop in from nothing.
- **Mobile permit request** (completes W3-T10 mobile) — engineers can raise a
  permit request from the field (offline-aware; office still issues, role-gated
  server-side); engineer-insert verified live.

Deliberately NOT built (the security/money items the user excluded): provider-
side invoice idempotency key (vs the 30-min reclaim window) and a DB lockdown
of direct writes to `sla_*_met_at` (internal-org integrity only — the 00122
clamp already covers the realistic backdating path).
