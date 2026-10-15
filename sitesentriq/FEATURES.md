# Haumea / SiteSentriq — Features & Selling Points

> Facilities-management SaaS for FM operators and contractors (UK / Ireland focus).
> Web dashboard + client portal + tenant site surface + offline-first engineer
> mobile app, on a single Supabase backend with row-level multi-tenancy.
>
> Current version `0.28.0`. This document is the **capability map + the "why we win"**.
> For release history see [CHANGELOG.md](./CHANGELOG.md); for the latest wave's plan see
> [docs/internal/TRUST_COMPLIANCE_WAVE_PLAN.md](./docs/internal/TRUST_COMPLIANCE_WAVE_PLAN.md).

---

## 1. The one-liner

**Run every building's compliance, planned maintenance, reactive jobs, contractors,
quotes, invoices and customer communication from one place — and prove it.**

Haumea is built for the FM operator who manages *other people's* buildings: a managing
agent, a hard-FM contractor, a multi-site service provider. The product's spine is
**compliance you can demonstrate**, not just track.

## 2. Why we win (the moat)

These are the differentiators — most are things the UK/IE incumbents (simPRO, Joblogic,
BigChange, Commusoft) and the global CMMS tools (UpKeep, MaintainX, Limble) either don't
have, paywall, or do badly. Each maps to a real, documented complaint about those tools.

| Selling point | What it is | Why it beats the incumbents |
|---|---|---|
| **Never loses a job sheet** | Offline-first mobile with an atomic, replay-safe write queue | simPRO/BigChange/Joblogic app reviews are full of "it wiped my entries / lost my signature". Our failed-access + field writes are transactional and idempotent. |
| **Compliance gating built into dispatch** | A subcontractor that fails the org's insurance/accreditation/RAMS matrix **cannot be assigned a job** (DB-enforced, with org-admin override) | Nobody in the mid-market enforces this *at dispatch*. It's the Vantify/Prosure360 model, built into the work order itself. |
| **Contract SLA engine with service-credit maths** | Per-contract response/fix targets stamped onto jobs at creation, live breach countdowns, and "credits accrued" per period | QFM (enterprise) is praised for exactly this; it's rare-to-absent in mid-market tools. |
| **Permit-to-work that actually blocks work** | A flagged job can't start until a permit is issued — enforced in the database | Incumbents sell PTW as a paid bolt-on; ours is wired into the job state machine. |
| **Golden-thread building pack** | One-click per-property Building Information Pack (HTML + machine-readable JSON manifest) | The Building Safety Act handover story; carries criminal liability for duty holders — few mid-market tools can answer it. |
| **No-login subcontractor work links** | A subbie gets one link for one job: accept → upload RAMS → photos → sign → submit | Open ground — incumbents' "subcontractor portals" draw no positive reviews; Commusoft charges daily subbie licences. |
| **Reporting & dashboards in the base product** | No-SQL report builder + scheduled email reports + a user-composable dashboard | "Reports need SQL / export to Excel / are Enterprise-only" is the universal CMMS complaint. |
| **Accounting sync you can see and retry** | Per-invoice Xero/QuickBooks push history, the exact provider error, and a Retry | "The accounting sync is terrible / invoices silently go missing" is the most-cited integration failure across simPRO/Jobber/Joblogic. |
| **Continuous Compliance Score + public Trust URL** | A live 0–100 score per org + a shareable public trust page + a Statement-of-Compliance PDF | A genuine differentiator — turns compliance into a sales asset. |
| **Anti-lock-in posture** | Full data export (GDPR tooling + building-pack JSON manifest), no contract hostility | simPRO/Fiix/ServiceTitan are notorious for exit fees and data-hostage complaints. |

---

## 3. Full capability map

### Clients, properties & assets
- Multi-tenant **clients → properties → assets** hierarchy (deep, portfolio-shaped — not single-site).
- Per-org human-readable numbers: **`P-123` properties**, **`H-101` jobs**.
- Property areas/floors, site managers, regions, primary technicians, access notes, emergency details.
- Asset register with category/make/model/serial/install date; **QR/asset scanning** on mobile.

### Compliance (the spine)
- **Continuous Compliance Score** (live 0–100, banded) computed from operational data.
- **Public Trust URL** — a shareable, no-login trust page per org; **trust subscribers** get alerts.
- **Statement of Compliance** PDF + **Tender Pack** export (compliance evidence bundle).
- **Compliance items** per property/asset with frequency, last-done, next-due, status.
- **UK statutory cert library** — engineer-completable checklists: EICR (BS 7671), Emergency
  Lighting (BS 5266), Fire Alarm weekly + quarterly (BS 5839), Gas Safety CP12, LOLER,
  Legionella monthly + quarterly (ACoP L8), plus fire-alarm/extinguisher/access-control.
- **Printable certificates** (separate system) — EICR, gas-safety, FRA templates → PDF.

### Planned maintenance (PPM)
- Maintenance plans with **fixed or rolling** schedule modes; auto job generation.
- Contract-to-routine wizard; month-end-safe date maths; idempotent generation (no dupes).

### Scheduling & jobs
- Drag-drop **scheduler** with engineer availability + time windows.
- Work-order **status machine** (15 statuses incl. `contractor_review`, `pending_external`…),
  filter tabs, bulk actions, **parent/child tasks** (defect → remedial), **service groups**.
- **Field log on web** — engineer notes + parts/materials with line totals.
- Live **engineer-tracking link** for customers (public ETA page, auto-updating ICS).

### Subcontractor management & compliance *(v0.28.0)*
- Subcontractor records + documents + **insurance / accreditations / RAMS** with approval.
- **Per-org compliance requirement matrix** (Settings → Subcontractor compliance).
- **Dispatch gate**: assigning a non-compliant subbie is **blocked** unless an org admin
  records an override reason (reason + who + when stamped on the job).
- **30-day expiry radar** on the subcontractors list.
- **Per-use, no-login work links**: accept → upload RAMS/cert → photos → signature →
  mark complete; files land in a private bucket and are downloadable by staff via signed URLs.

### Contract SLA engine *(v0.28.0)*
- Per-contract **response/fix targets by priority** + credit-per-breach.
- Targets **stamped onto jobs at creation** (every creation path) = immutable evidence.
- **Live SLA countdown chip** on the job; breach states from field activity (arrival / QR / completion).
- **Per-period service-credit summary** on the contract (breaches + credits accrued).

### Permit-to-work *(v0.28.0)*
- `permits` with a status machine (requested → issued → active → closed/cancelled/rejected).
- **DB-gated job starts**: a flagged job can't enter `in_progress` without an issued permit.
- Issuer role gate (org-admin/scheduler); auto-activate on start; web panel + header chip +
  new-job checkbox; mobile permit-request + advisory banner.

### Golden-thread building pack *(v0.28.0)*
- One-click per-property **Building Information Pack**: assets, compliance + certs,
  **document version chains**, PPM, job history, RAMS, permits, risk register, log book,
  timeline + audit slices — as a self-contained HTML pack **and** a JSON manifest
  (`haumea.building_pack` v1) for data portability (Building Safety Act handover).

### Quotes, invoicing & accounting
- **Quote → job** conversion + portal approval; service-quote / defect-quote dashboard widgets.
- Invoices with line items, payments, PDF generation, reminders (Resend email).
- **Accounting push** to **Xero / QuickBooks** + **Stripe** checkout/portal/webhooks.
- **Accounting sync visibility** *(v0.28.0)* — per-invoice push history, the exact provider
  error, a `pushing` state, a Retry, and a crash-safe stale-claim reclaim.

### Documents
- Document store with **version chains** (`(org, name)` ordered by version), expiry,
  compliance-item links; private-bucket signed-URL reads.

### Reporting, analytics & dashboards
- **No-SQL report builder** + **scheduled email reports** (cron-driven executor, CSV/HTML).
- Analytics dashboards (Recharts) on real data.
- **Composable dashboard** *(v0.28.0)* — show/hide + zone-aware reorder of widgets,
  persisted per-user; new widgets auto-appear.

### Notifications
- In-app / email / push / **Slack**; **per-user preference matrix** gating every channel.
- Weekly digest; renewal alerts; call-out notifications.

### Client portal & tenant site surface
- Client portal: visits, documents, invoices, **quote approval**, **call-out raising**,
  multi-site **site switcher**, compliance + portfolio views, contact.
- Tenant site surface for on-site staff (scoped, file downloads via a signing edge function).

### Mobile field app (Expo / React Native)
- **Offline-first** mutation queue (AsyncStorage), dead-letter, idempotent replay,
  serialized read-modify-write — "never lose a field write".
- Check-in/out with GPS, signatures (customer + engineer), photos (compressed + queued),
  parts, time, defects, **compliance cert forms**, documents.
- **QR proof-of-presence** *(v0.28.0)* — scan on a job → attendance evidence that satisfies
  the SLA response target.
- Dark mode; skeleton loaders; live location share to the web Engineer Tracker.

### Security, multi-tenancy & trust
- **Row-level security** on every table (`organisation_id = public.organisation_id()`);
  portal/tenant scoping; SECURITY DEFINER functions hardened under empty `search_path`.
- **SSO** (SAML/OIDC JIT provisioning), GDPR export/delete, audit export, audit-event trail.
- Stripe billing; integrations-health page; security-board-audited (4-agent review on this wave).

---

## 4. Competitive positioning (grounded in research)

The wave was built from a sweep of ~18 competitor platforms and their **recurring 1-star
themes**:

- **Engineer app loses data** (simPRO, BigChange, Joblogic, Tradify) → our offline queue is
  transactional + idempotent; "never loses a job sheet" is a *provable* claim.
- **Contract lock-in / data hostage** (Fiix 6-month notice, ServiceTitan $39k exit, simPRO
  3–5yr) → full export + the building-pack JSON manifest as a "test the exit" feature.
- **Accounting sync breaks silently** → visible per-invoice sync log + retry.
- **Reporting needs SQL / is Enterprise-only** → no-SQL builder + scheduled reports in base.
- **Subbie work disappears into phone calls + PDFs** → no-login per-use work links + compliance gating.
- **Per-user pricing + feature paywalls** (the category's open wound) → positioning toward
  transparent, all-features pricing (a go-to-market choice, not a code feature).

---

## 5. Deferred / roadmap

### AI compliance copilot *(designed, NOT built — needs API-key + cost sign-off)*
The one wave item intentionally left unbuilt. **How it would work:**
1. **Surface** — a chat panel in the web app ("which sites have overdue compliance?",
   "summarise this property's last 6 months", "draft the client compliance update").
2. **Retrieval is RLS-true** — the copilot queries Supabase **through the caller's own JWT**,
   never the service role, so it can only ever see what that user is allowed to see. No
   cross-tenant leakage is possible by construction.
3. **Tools, not free-text SQL** — a small, fixed toolset (lookup jobs / compliance items /
   contracts / certs / SLA summary for the caller's org), each a parameterised, RLS-scoped
   query. The model picks a tool + arguments; it never writes raw SQL.
4. **Model** — a Claude model via the API; the existing `ai-suggest-compliance` edge function
   is the seed. Auto-drafted visit summaries + client-ready reports build on the report builder.
5. **Guardrails** — behind a feature flag, with a per-org token budget and cost ceiling; read-
   only (no writes) in v1. The blocker is purely **commercial** (an Anthropic API key + a cost
   model), not technical.

### Other deferred items (logged, non-blocking)
- Unify the two SLA layers — the org-level operational SLA (00030, `lib/sla/`) and the new
  commercial contract SLA (`lib/contract-sla.ts`) coexist deliberately; merging is a follow-up.
- Provider-side **invoice idempotency key** (stronger than the current 30-min reclaim window) —
  a commercial decision, deliberately deferred.
- Building-pack **PDF** output (needs a `BROWSERLESS_TOKEN`; HTML is the live output today).
- New cert field types (numeric/select) + per-org custom cert templates.
- Subbie-upload size caps + a confirm-on-upload step for the metadata rows.

---

## 6. Tech stack

- **Web**: Vite + React 19 + React Router SPA · TanStack Query/Table · Radix-based `@haumea/ui` · Tailwind v4 · RHF + Zod · Recharts · Lucide.
- **Mobile**: Expo SDK 54 + React Native + expo-router + HeroUI Native · offline-first AsyncStorage queue.
- **Backend**: Supabase — Postgres + RLS multi-tenancy · 43 edge functions (Deno) · Storage · Realtime · pg_cron + pg_net · Vault.
- **Integrations**: Stripe · Xero · QuickBooks · Resend (email) · Slack · Google Calendar.
- **Monorepo**: npm workspaces — `apps/{web,mobile,marketing}` + `packages/{types,utils,ui}`.

---

## 7. Verification & deployment status (v0.28.0)

- web build ✓ · web tsc 0 · web lint 0 · **238/238 web tests** · mobile tsc 0 · **43/43 mobile tests** · 0 ERROR-level Supabase advisors.
- Migrations through **00122** applied live; **43 edge functions** deployed.
- **The web front-end has NOT been redeployed** — production still serves the v0.27.0 build
  until a deploy is approved. The backend (DB + edge functions) IS live, so prod and `master`
  are consistent at the data layer.
