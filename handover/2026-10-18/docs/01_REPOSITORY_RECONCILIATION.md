# 01. Repository reality and safe reconciliation

**Evidence timestamp:** 18 October 2026. The GitHub connector was read-only during this investigation; no code, branches, deployments or permissions were changed. Branch heads may change while other builders are active. All statuses below are **REPO-OBSERVED**, not a fresh integrated build/test.

## Confirmed GitHub context

- `EmotiveImpact/Ardent`: **public**, default branch observed `claude/project-thread-vzm2xt`.
- Default branch root at observation: a `sitesentriq/` directory. Commit `944327b945db8f3d8276c8d61ca06330a13ff14f`, recorded 15 October 2026, states: *Import SiteSentriq into sitesentriq/*; snapshot of private repository at `master` commit beginning `dd4dd46` copied without original Git history.
- `EmotiveImpact/SiteSentriq`: **private**, default `master`; product documents name the internal system **Haumea**, a mature pre-1.0 multi-tenant facilities management SaaS with web, portals, engineering mobile and Supabase schema. Documentation version `0.28.x`. Claims of deployment/test pass counts are repository claims until independently retested.
- Four observed Ardent branches:
  - `claude/project-thread-cunjer`: `core/` plus `sitesentriq/`.
  - `claude/project-thread-kbo579`: `mobile/` plus `sitesentriq/`.
  - `claude/project-thread-jpboda`: `homepage/` plus `sitesentriq/`.
  - `claude/project-thread-vzm2xt`: `sitesentriq/` at repository root; default at inspection.
- **Do not merge all branches uncritically.** Inspect commit DAG and divergent changes. Determine whether shared branches were cut from the imported baseline or whether they contain unpublished changes.

## Current Ardent Core (`core/`) from its README and sample source

**Stack:** React 19, Vite 8, TypeScript, React Router, Tailwind v4, shadcn/Radix, Geist + Geist Mono, Lucide. Dark dense console.  
**Screens listed:** `/` Operations; `/jobs`; `/jobs/:id`; `/schedule`; placeholders for customers, money, certificates, crew, stock, settings.  
**Important:** `core/src/data/mock.ts` supplies demo records. `core/src/data/client.ts` defines `ArdentClient` and is currently mock-backed. The README proposes a future Supabase adapter. No end-to-end production persistence was verified.

Current model contract `core/src/data/model.ts` includes: `Trade`, `JobStatus`, `Priority`, `Customer`, `Site`, `Operator`, `LineItem`, `ComplianceCheck`, `Job`, `Certificate`, `Exception`, `TimeEntry`, `Photo`, `Note`, `Quote`, `Invoice`, `Signature`, `PaymentMethod`. Money is **integer pence**; timestamps ISO UTC; machine IDs prefixed (`job_`, `cus_`, `opr_`); human refs separate (`J-1042`). Preserve these conventions.

`ArdentClient` exposes jobs (list/get/create/setStatus/addLine/removeLine/setCheck), customers, sites, operators, time, photos, notes, quotes, signatures and invoices (create/send/recordPayment). As the product grows, extend the **interface and adapter** rather than reaching around it inside screens. Current statuses are `enquiry`, `quoted`, `booked`, `en_route`, `on_site`, `paused`, `complete`, `invoiced`, `paid`, `cancelled`.

**Potential schema risk:** The status model combines operational progress with financial settlement. Longer-term it may be better to separate `job.status`, `invoice.status`, and lead/quote/payment lifecycles. This is a **PROPOSED** evolution, not permission to break existing screens today. First characterise all routes/transitions and write migration tests.

## Current Ardent Mobile (`mobile/`)

**Stack:** Expo / React Native / TypeScript / expo-router / Reanimated. Mobile README records app flows:

- Mode selection: On Site, En Route, On Call, Workshop, Off Shift.
- Today: worklist and metrics.
- Job view: job notes, customer/site, travel/labour clocks, checklists, before/during/after photographs, materials and progress.
- Wrap-up: customer signature; draft invoice; sample payment methods (card, transfer, cash).

**Source behaviour:** `mobile/src/data/jobs.ts` defines `STEPS`: `booked -> en_route -> on_site -> complete`, with pause/resume and time entries. It calls `ardent.jobs.*`, `ardent.time.*` and `ardent.operators.*`. The desktop and mobile source are separate branches. Actual cross-branch integration and production side effects have not been verified.

**Contract sync:** `mobile/scripts/sync-core.sh` is the documented path to copy shared Core model, client interface and tokens into `mobile/src/data/core/` and `mobile/src/theme/core/`. Changes in Core MUST be deliberately synced/verified in Mobile, not patched into the copies manually.

**Current mobile invoices/payments:** The README describes drafting/sending/taking payment. The sampled data client is mock-backed. Never connect actual collection, SMS delivery or bank updates without provider integration, security approvals and reconciliation tests. Example display is not payment-provider certification.

## Current Ardent Homepage (`homepage/`)

Plain HTML/CSS/JS site on its branch: `index.html`, `engineers.html`, `news.html` and common `styles.css` / `main.js`. Source `homepage/README.md` describes editorial trade photography, focus, four services, verticals, CTA, engineer-specific page, and news. Assets produced using generated imagery; sample names, dates and certificates illustrative. Keep established logo, human-centred material and spacious visual hierarchy. Do not assume homepage branding should replicate the dense app console.

## Current SiteSentriq (`sitesentriq/` imported snapshot)

Documented facilities-management product includes clients→properties→assets; scheduled and reactive work; PPM; certificates (CP12, EICR, fire, LOLER, Legionella etc.); offline-first mobile data queue; contractor/compliance gates; permit to work; SLA and building pack; quotes/invoices; Xero/QuickBooks sync; client portal; reporting; access controls. Its AI copilot was explicitly documented as planned, not delivered. See `docs/08_SITESENTRIQ_REUSE.md`.

## Immediate security/provenance gate [P0]

**Risk:** A public Ardent repository includes a copied directory of a separate private repository. Even if both are owner-controlled, that can expose previously private source, operational configuration, internal documents, demo contacts, API endpoints, signatures or secrets. A new commit removing a directory would not remove previous public history.

Next agent should:

1. Verify intended Ardent visibility and whether SiteSentriq was intentionally licensed/published into it.
2. Inventory tracked configuration and secrets via safe scanning across **all exposed history**; do not echo discovered credentials into logs/chat.
3. Check for any real user/customer records, production configuration, licences and third-party materials.
4. Report findings, exposure timeframe and recommended containment. Seek permission to change repo visibility/rotate credentials/purge and rewrite public history if required.
5. Preserve source provenance (snapshot SHA, licence/permissions) and establish a proper vendoring/extraction rule before continued reuse.

## Branch integration protocol [mandatory]

1. `git status --short`, identify current worktree, `git branch -avv`, `git log --graph`, `git worktree list` and any open PRs. Do not run destructive reset/clean.
2. Record branches' latest SHAs; inspect changes, collisions, test scripts, tooling versions and ownership.
3. Baseline independently for each branch (`core` build/lint, mobile typecheck/expo smoke, homepage browser review) **without** implying all branches run together.
4. Agree a canonical integration branch plus a non-destructive branch ordering. Preserve the existing split until integration contracts/tests exist.
5. Merge changes only using reviewable PRs and explicit human authorisation. Cherry-pick or adapt when merge histories are unsuitable; no manual history surgery without approval.
6. Record provenance of selectively reused SiteSentriq modules and why they are safe for Ardent.

## Current status truth table

| Capability | Current evidence | Safe status wording |
|---|---|---|
| Core console | Routes + UI source + mock data | Prototype / demo until runtime verified |
| Mobile engineer app | Screens, flow, code and mock-backed client | Prototype / verify actual device and persisted flows |
| Homepage | Static implementation | Existing design branch; needs browser QA and content review |
| Shared model and tokens | Source examined | Exists; integration across branches not established |
| Live backend | Core README says future Supabase client | Not verified / do not claim live |
| Live payments, phone/SMS | No connected providers verified | Not verified / do not claim live |
| SiteSentriq reuse | Imported source, docs and examples | Source available; extraction and privacy audit pending |
| AI receptionist/coplanar agents | Proposals, not confirmed functionality | Planned |

## References

- https://github.com/EmotiveImpact/Ardent
- https://github.com/EmotiveImpact/Ardent/tree/claude/project-thread-cunjer/core
- https://github.com/EmotiveImpact/Ardent/tree/claude/project-thread-kbo579/mobile
- https://github.com/EmotiveImpact/Ardent/tree/claude/project-thread-jpboda/homepage
- https://github.com/EmotiveImpact/Ardent/tree/claude/project-thread-vzm2xt/sitesentriq
- https://github.com/EmotiveImpact/Ardent/commit/944327b945db8f3d8276c8d61ca06330a13ff14f
- https://github.com/EmotiveImpact/SiteSentriq (private)
