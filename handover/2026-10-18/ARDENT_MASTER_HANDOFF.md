# ARDENT · COMPLETE MASTER HANDOVER

**18 October 2026 | For active Claude development**

This stand-alone file reproduces the full handover. If using the full ZIP, read the individual chapters instead. **Proposals are not retroactive instructions to undo existing work.**

---
# ARDENT · Product and Development Handover

**Handover date:** 18 October 2026  
**For:** Claude and other development agents working on EmotiveImpact/Ardent  
**Purpose:** Consolidate product vision and engineering requirements without interrupting, resetting, or overwriting development already underway.  
**This is a planning and integration brief, not permission to merge, deploy, replace architecture, disclose private code, or execute irreversible changes.**

## Start here

1. **Read `CLAUDE_FIRST_MESSAGE.md`.** Paste it into the active Claude coding session after Claude has saved or committed the work already underway.
2. **Read `docs/01_REPOSITORY_RECONCILIATION.md` before editing code.** Ardent has several parallel Claude development branches, with `core/`, `mobile/`, and `homepage/` in different branches. Do not assume a single branch has all work.
3. **Read `docs/02_VISION_AND_POSITIONING.md` and `docs/03_PRODUCT_REQUIREMENTS.md`.** The product is a worker-first trades operating system, deployed within the wider Ardent AI infrastructure company.
4. **Read `docs/04_OPERATING_WORKFLOWS.md`, `docs/05_PERSONAS_AND_SCREENS.md`, and `docs/06_AI_AND_AUTOMATION.md`** to understand how the product should work during a real trading day.
5. **Read engineering and release documents** before suggesting code changes. Produce a reconciliation report and phased implementation plan first.

## Non-negotiables

- **Preserve active development:** No destructive rewrite, force push, branch deletion, dependency migration, sweeping refactor or auto-merge. If Claude is mid-task, fold this brief into the *next* work plan, not the middle of uncommitted changes.
- **Ardent is more than trades software.** Ardent is the parent AI infrastructure and managed systems company. Its trades operating product is an initial vertical, not the company definition.
- **Reuse rather than blindly rebuild.** The owner also controls SiteSentriq, whose source has been imported into Ardent. Inventory and reuse suitable parts selectively after a code/security audit. Avoid wholesale duplication and unreviewed imports.
- **Core owns shared contracts.** Existing `core/src/data/model.ts`, `core/src/data/client.ts`, `core/tokens/tokens.ts` are the current contract. Mobile consumes copies via `mobile/scripts/sync-core.sh`. Preserve compatibility or migrate deliberately.
- **The existing Core/Mobile UI direction is dark, functional and premium.** Canonical tokens: near-black `#070707`, surfaces `#121212`, restrained ember `#ff6a1a`, Geist, Geist Mono and Michroma. The light montage included here is an exploratory illustration, *not* permission to replace the adopted visual design.
- **Human-first field work.** Low taps, usable with one hand, low signal and gloves; never lose notes/photos/signatures; no engineer forced to learn AI jargon.
- **No fabricated states:** Current Core and Mobile READMEs describe mock-backed flows. A live backend, billing, voice agent or payment collection must not be represented as operational before it is independently verified.
- **Safety and consent:** Qualified humans certify regulated work; financial, scheduling and customer-facing actions have explicit rules and audit trails.
- **Public/private source exposure:** `EmotiveImpact/Ardent` was visible as PUBLIC with a copy of the PRIVATE `EmotiveImpact/SiteSentriq` source in `sitesentriq/`. Urgently review repository visibility, git history, credentials, third-party licences and publication intent. Removing files in a new commit is not sufficient to erase them from prior public git history.

## Evidence labels

- **CONFIRMED USER DIRECTION:** Established in conversations; can be used as product principle.
- **REPO-OBSERVED (18 OCT 2026):** Based on connected GitHub repository paths, docs and source snippets; not equivalent to tests or runtime audit.
- **PROPOSED:** A new design/engineering/commercial recommendation; requires acceptance through the usual project process.
- **VERIFY:** Needs branch reconciliation, runtime confirmation, legal review or customer validation.

## What to do in Claude first

**Do not begin with feature construction.** Start with a non-destructive inventory of active branches/worktrees and a gap analysis: `Already Built`, `Partially Built`, `Mock/Prototype`, `Missing`, `Blocked`, `Overlaps with SiteSentriq`. Compare against this pack. Then recommend the smallest set of additive PRs. Work only in the agreed active integration workflow and do not merge/deploy without approval.

## Deliverable index

| File | Purpose |
|---|---|
| `CLAUDE_FIRST_MESSAGE.md` | Paste into active Claude session |
| `ARDENT_MASTER_HANDOFF.md` | Stand-alone, all-in-one version (generated from documents) |
| `docs/01_REPOSITORY_RECONCILIATION.md` | Verified repo state, parallel branches, safety gates |
| `docs/02_VISION_AND_POSITIONING.md` | Parent company, product thesis, principles, commercial strategy |
| `docs/03_PRODUCT_REQUIREMENTS.md` | Functional/non-functional requirements and ownership |
| `docs/04_OPERATING_WORKFLOWS.md` | End-to-end scenarios, lifecycle and state rules |
| `docs/05_PERSONAS_AND_SCREENS.md` | Role-based interfaces, mobile and client portal |
| `docs/06_AI_AND_AUTOMATION.md` | AI voice, assistants, agents, approvals, failure behaviour |
| `docs/07_ARCHITECTURE_DATA_API.md` | Shared contracts, proposed architecture and domain changes |
| `docs/08_SITESENTRIQ_REUSE.md` | Module audit, reuse/abstract/rebuild criteria |
| `docs/09_DESIGN_SYSTEM.md` | Brand, navigation, accessibility and detailed UI patterns |
| `docs/10_SECURITY_AND_TRUST.md` | Multi-tenancy, audit, privacy, certification, payments |
| `docs/11_ROADMAP_AND_BACKLOG.md` | Sequencing, milestones, dependencies, acceptance gates |
| `docs/12_TESTING_AND_MEASUREMENT.md` | Test matrix, real-world scenarios, outcome metrics |
| `docs/13_COMMERCIAL_AND_DELIVERY.md` | Pricing hypotheses, pilots, onboarding, support |
| `docs/14_DECISION_LOG_AND_OPEN_QUESTIONS.md` | Locked vs proposed decisions and unresolved risks |
| `schemas/sample_event_envelope.json` | Illustrative append-only event contract (not implementation) |
| `reference/EXPLORATORY_UI_MONTAGE_NOT_CANONICAL.png` | Earlier UI sketch only; existing dark tokens prevail |

## Why this package exists

To allow a continuing builder to inherit the **why, what, how, constraints and sequence** of Ardent without losing the context or duplicating SiteSentriq. Nothing in this pack is an instruction to disregard existing repository evidence, customer feedback, or tests. When product text conflicts with working code, note the conflict and propose a deliberate migration rather than silently choosing a side.


---

# PASTE THIS TO CLAUDE: ARDENT CONTINUITY HANDOVER

You are continuing active work on `EmotiveImpact/Ardent`. **You are not starting a fresh project.** I am giving you the attached ARDENT handover pack, including the master document and specialised requirements. Integrate it with the work you have *already* built and the original project intent. Preserve all current uncommitted work and every useful approved design decision.

## Phase 0: inventory before implementation

1. Inspect the current checked-out branch, worktree, status, logs and any active/uncommitted changes. Preserve them. Record your commit SHAs and current tasks. Do not overwrite another agent's changes.
2. Inspect ALL relevant remote development branches: `claude/project-thread-cunjer` (`core/`), `claude/project-thread-kbo579` (`mobile/`), `claude/project-thread-jpboda` (`homepage/`), and `claude/project-thread-vzm2xt` (imported `sitesentriq/`, default at inspection time). These may have moved. Find any newer branches and PRs. **Do not assume the default branch contains Core or Mobile.**
3. First review the immediate repository-visibility and provenance risk: connected GitHub showed `EmotiveImpact/Ardent` as public and `EmotiveImpact/SiteSentriq` as private, with a code snapshot copied to `sitesentriq/` on 15 October 2026. Flag the exposure and perform safe, non-destructive auditing; don't change visibility, rewrite history or rotate anything without coordinating permissions/approval.
4. Open `00_START_HERE.md`, then read each `docs/` file in order. Maintain the evidence labels (confirmed, repo-observed, proposed, verify). Treat the earlier light UI montage as a CONCEPT ONLY; the existing Core dark palette / typography / interactions take precedence.
5. Compare the handover with what is actually built, and output a **Reconcilation Table**: Feature | User purpose | Existing module/file | Status (working/mock/partial/missing) | SiteSentriq candidate | Conflicts | Proposed next action | Test evidence.
6. Present a brief plan with an order of execution and exactly what would change in each branch. Preserve shared type ownership in Core and mobile sync mechanism. Run the existing project's prescribed checks.

## Build principles, after reconciliation

- **Business:** Ardent is an AI infrastructure and managed systems company. The trades software is a premium, worker-first initial vertical. Never confine the company to facilities management or turn it into a generic CRM.
- **Experience:** The owner gets an exception-driven business command centre. The office gets an operational work queue. The engineer gets a usable offline-first field tool. Customers get a simple consent-aware self-service experience. Keep everything visually coherent and genuinely faster than traditional tools.
- **Operations:** Manage enquiry → triage → quote → approval → schedule → dispatch → site work → evidence → quality/compliance → invoice → payment → follow-up, with missed access, emergencies, return visits and subcontractors.
- **AI:** Build voice/agents/revenue automation on a permissions-and-approval architecture. AI drafts and suggests, humans approve regulated, consequential or financial actions. Clear source attribution, idempotency, budget limits, audit logs and deterministic fallbacks.
- **Engineering:** Build on the already-defined `ArdentClient` interface and shared tokens. Replace mocks incrementally through adapters; avoid screens querying raw Supabase tables. Do not introduce a parallel truth source without an explicit migration plan.
- **Reuse:** SiteSentriq source contains job/dispatch, offline engineer, certificates, customer/asset, invoicing, contractor, reports, and RLS patterns. Reuse selectively and only after dependency/licence/security/semantic analysis. Do not copy all of its complex facilities-management features into the trades MVP.

## First return to me

Give me (A) current branch and code reality, (B) the resolved product map against this pack, (C) a proposed integration order for Core, Mobile, Homepage and SiteSentriq-derived pieces, (D) an issue/PR breakdown with P0/P1/P2 acceptance criteria, (E) security blockers and tests, and (F) the safest first implementation slice. If a feature is already built, mark it built; do not reimplement it because the document mentions it.

Once the active build is at a safe checkpoint, continue the highest-priority additive slice through a reviewable branch/PR only. Do not merge to production, deploy, reset or force push without authorisation. Do not ask me to repeat a decision already described in this pack or in the repo; record unresolved conflicts as explicit choices.


---

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


---

# 02. Vision, positioning, product doctrine

## What Ardent is [CONFIRMED USER DIRECTION]

**Ardent is the parent AI infrastructure, systems, deployment and managed operations company.** It delivers configurable, business-ready technology rather than merely selling a chatbot. Its product/service scope includes AI infrastructure, voice, agents, compute/private deployments, systems integration, ongoing operation and measurable improvement. Trades (plumbing, heating/HVAC, electrical, tiling, fire/security, multi-trade, building services) are an initial vertical, not the full company identity. Prior discussions targeted capable businesses approximately £1m–£50m in turnover; this is a strategic focus, not a verified market segmentation result.

Previous offer names explored: **Ardent Core, Ardent Field, Ardent Deployed, Ardent Embedded**, alongside **Ardent Voice, Agents, Compute, Private, Operations**. Names are planning vocabulary, not necessarily final public navigation. The parent/vertical distinction matters: a plumber should see a product that understands their business; a property-services firm should see a proven operational system; a non-trades buyer should still see Ardent as credible.

## Positioning

**Company:** Ardent. AI infrastructure for real businesses.  
**Trades product:** A worker-first operating system that captures enquiries, coordinates jobs, reduces paperwork, protects margin and accelerates payment.  
**Core promise:** *You do the work. Ardent runs the business around it.* (PROPOSED product messaging, not final approved trademark.)  
**Alternate:** *Built for the business behind the work.*

Ardent should make technology disappear into the workday: the client feels faster, more reliable service; the engineer feels less paperwork; the office feels less chasing; the owner can see what's happening and why. Judge the product by hours saved, jobs won and cash collected, not number of AI buttons.

## Three architectural/commercial layers [PROPOSED]

1. **Ardent Platform**: shared identity, data, permissions, events, integrations, AI tool governance and deployment tools.
2. **Ardent Trades / Operations**: branded operating environment for customers, enquiries, jobs, scheduling, assets, work orders, evidence, finance, service and field mobile.
3. **Ardent Services**: Deployed (setup/integration/migration/training), Embedded (ongoing specialist engineering), Voice, Agents, Compute and Private (tailored runtime/hosting/security where justified).

This is a product taxonomy, not a requirement to create three new repos or rebuild the existing Core code. Resolve naming with actual branch owners first.

## Who pays / who uses

- **Primary economic buyer:** owner/director of a profitable 5–30-van trades business, or operations director of a larger firm. They buy confidence in cash, response and control.
- **Primary power user:** office coordinator/dispatcher who keeps the business moving across calls, jobs and engineers.
- **Primary daily field user:** engineer/operative/subcontractor using a phone in dirty, bright, wet, cold and intermittently connected places.
- **Secondary users:** estimator, accounts/finance, customer service, client/property manager, auditor and tenant/site contact.
- **Expansion:** facilities/property service firms, managed maintenance, fire and security and multi-site operations.

Do not start by targeting every sole trader or every enterprise facility manager simultaneously. Pilot 5–30 vans, retain scalable tenant/permission foundations and validate price willingness from real businesses.

## Problems to solve in priority order

1. Missed calls/enquiries and slow response cause lost jobs.
2. Quotes stall because nobody follows up and unclear scope prevents approval.
3. Job information lives in WhatsApp, notebooks, memory and scattered software.
4. Office repeatedly calls engineers for status/evidence; engineers retype work they have already done.
5. Completed jobs sit unbilled, materials/labour are missed, and collections are slow.
6. Compliance, accreditation, access and safety records are hard to find when needed.
7. Owners cannot distinguish booked work from profitable and *collected* work.

The aim is a connected execution system, not merely reporting. But every automated external action must be bounded and accountable.

## Design doctrine [CONFIRMED USER PREFERENCES + PROPOSED PRINCIPLES]

- **Worker-first and operationally simple.** Minimal form fields, fast load, coherent job context, forgiving errors, clear next action.
- **Premium but not flashy.** Polished visual quality with functional density. Avoid clip-art AI, decorative glowing orbs, cartoon management metaphors and generic boilerplate SaaS styling.
- **Show humans on the marketing site.** Human photographs and the trade context; homepage has generous space, hierarchy and purposeful storytelling, not every module stacked into a sales wall.
- **Business language.** 'Jobs waiting to invoice' beats 'AI opportunity orchestration'. 'Record work' beats 'multimodal capture session'.
- **Exceptions first.** A director needs the five real problems requiring intervention, not thirty charts; a dispatcher needs queues/status; an engineer needs their next job.
- **Work without signal.** Photos, notes, signatures and job activity survive dropped connections and app restarts.
- **One source of truth.** Field, office, AI and finance see consistent state and history appropriate to role.
- **Explain why.** Every recommendation references source records and indicates what evidence is missing.
- **Reliable over autonomous.** Humans own legally significant, safety-critical, financially material and reputationally sensitive choices.

## Strategic non-goals for first delivery

- Do not launch a consumer marketplace for finding any local tradesperson.
- Do not rebuild an entire enterprise CAFM suite already present in SiteSentriq.
- Do not make all existing competitors' features a day-one requirement.
- Do not autonomously promise emergency arrival times, guarantee diagnosis or issue regulated certificates.
- Do not create a general unrestricted agent with production/database admin access.
- Do not require a customer to abandon their accounting system to gain value.

## Outcome hierarchy

**Level 1, product usefulness:** a job can pass through capture, field visit, evidence, invoice and payment status without double entry.  
**Level 2, commercial benefit:** lower missed-enquiry rate, faster quote turnaround, lower unbilled-completed work, lower administration time and better collection times.  
**Level 3, durable advantage:** rich service history, trusted asset/compliance evidence and intelligently coordinated workflows deliver compounding value.  
**Level 4, Ardent strategic scale:** the same core AI/automation infrastructure supports other business verticals without cloning a bespoke codebase for each.

## Success definition

At pilot exit, owners and office teams should be able to name concrete moments in which Ardent prevented work being lost. Field engineers should complete a normal job with little or no redundant paperwork. The platform should demonstrate zero cross-tenant leaks in the tested threat model, recover correctly from offline disruptions and clearly distinguish human decisions from agent proposals. Commercial thresholds are hypotheses until baseline data is collected.


---

# 03. Product requirements document

**Status:** Requirements dossier. Features marked existing are repository-reported or observed only; a future reconciliation may supersede them.  
**Priority language:** P0 = required for coherent audited pilot, P1 = first commercial expansion, P2 = differentiated intelligence or sector depth.

## A. Product components

| Module | Scope | Priority / current status |
|---|---|---|
| Ardent Core | Operator desktop console, operational truth | P0; prototype screens present |
| Ardent Field | Engineer/operative mobile workday | P0; Expo prototype present |
| Ardent Revenue | Enquiry, quote, invoice, collection queues | P0; some invoice/quote model exists, UI/automation incomplete |
| Ardent Voice | Business telephone agent, controlled handoff | P1; proposed |
| Ardent Agents | Tool-bounded assistants across app/integrations | P1; proposed |
| Ardent Intelligence | Exceptions, margin and action recommendations | P1–P2; proposed |
| Ardent Portal | Customer quotes, evidence, status and payments | P1; SiteSentriq reference exists |
| Ardent Deployed | Integrations, migration and managed onboarding | Commercial service, define alongside pilot |
| Ardent Private/Compute | Bespoke deployment/infrastructure | Case-by-case, not prerequisite for trades MVP |

## B. Functional requirements and behaviours

### FR-001 Organisations, roles and teams [P0]
- Tenant has settings: identity, locale, timezone, currency, tax registration, contact details, opening hours, emergency routing, service areas, trades, approval policies, billing preferences, retention settings.
- Roles: owner, org admin, office manager, scheduler/dispatcher, estimator, finance, engineer, subcontractor, client/portal, auditor/read-only, optional multi-org support user.
- Grant least privilege: employee sees assigned job scopes; subcontractor sees only authorised jobs for a limited period; client sees only their own properties/jobs/quotes/invoices; support access is logged, scoped and time-bound.
- Membership and invitations have expiry/revocation and offboarding handling. Every protected mutation is authorised server-side, not just hidden from UI.

### FR-010 Enquiries [P0]
- Capture manual call, website form, email, voice intake and import. Each has source, consent state, timestamps, customer identity resolution, contact preference and original content reference.
- Detect duplicate enquiries using address/contact/topic/time, but never discard silently; present possible matches.
- Support lead states: new, needs_information, qualified, rejected, converted, closed_lost. Do not conflate `enquiry` and an already booked job in future architecture without compatibility planning.
- Assign follow-up owner, due date, SLA and reason; missed calls trigger a queue. An emergency uses a higher-priority human escalation policy.

### FR-020 Customers, sites, assets [P0]
- One customer can have multiple people, sites and assets. A site has address, access instructions, emergency contacts, safety notes, communication preferences and property owner/tenant distinctions.
- Asset records include type, manufacturer/model/serial, install/service history, previous faults, photos, warranties, certificates and QR reference when useful.
- Support both residential single-site and multi-site business clients. Never expose sensitive access codes in alerts or untrusted links.

### FR-030 Quotes and estimates [P0]
- Create estimate from enquiry/visit/job with materials, labour hours, rates, callout, travel, discounts, optional alternatives, VAT and expiry. Preserve source price version and quote revision history.
- Quote lifecycle: draft → internal_review → sent → viewed? → accepted/declined/expired → converted. Approval channel and accepted version immutable, with recorded consent/signature or contractual acceptance method.
- Automated follow-up policy must respect business hours/contact consent and stop on reply/acceptance/decline/dispute. A suggestion can be created without permission to send.
- Variations/change orders require approval before expanding billable scope; no silent price changes.

### FR-040 Scheduling and dispatch [P0]
- Work queue and calendar by operative/team/day/week, including assigned trade qualification, travel, site access windows, availability, leave, priority, equipment/materials and maintenance contract SLA.
- Conflict detection for overlapping bookings, unqualified assignment, expired accreditations, double dispatch and travel impossibilities. Suggest options; do not silently move a committed booking.
- Every confirmed schedule change logs who/when/reason and informs relevant people under policy. Store assignment revision and actual acknowledgement.
- Existing Core schedule screen should be extended incrementally, not rebuilt wholesale.

### FR-050 Job lifecycle [P0]
- One job contains customer/site, service type, quoted scope, priority, schedule, assignments, hazards, status history, tasks, checklists, photos, notes, time, materials, costs, signatures, documents, defects, authorisations and linked quote/invoices.
- Proposed states for operational lifecycle: created → ready_to_schedule → scheduled → dispatched → en_route → arrived/on_site → in_progress → paused/awaiting_part/failed_access → work_complete → QA_review → closed. `cancelled` has actor and reason. Existing Ardent status enum differs; retain until planned migration with compatibility tests.
- Distinguish technical completion, financial billing and payment settlement; avoid status anomalies when partial invoices/payments occur.
- Failed access captures reason/time/proof, triggers authorised reschedule or callout policy; is not equivalent to successful completion.
- Return visits, multi-operative jobs and partial completion produce linked tasks, not overwritten single status.

### FR-060 Engineer field app [P0]
- Today: next job, travel/onsite status, job order, key access notes, calls/navigation, offline indicator, outstanding handovers and a one-tap emergency route.
- Job: status action, clock, photos, dictated notes, materials, checklists, defects, documents, customer consent/signature, safe pause/failed-access, wrap-up.
- Actions work reliably offline where possible. Durable local write queue with idempotent replay; clear states `saved locally`, `syncing`, `synced`, `needs attention`. Files remain locally until provider confirms persisted upload. Never show success purely because a mutation entered a queue.
- No mandatory AI step to finish a job; manual entry always possible. Permissions and safety gates work offline through a constrained capability cache; sensitive approvals require online reconfirmation.

### FR-070 Compliance and evidence [P0 for applicable trade]
- Work type chooses relevant policy and checklist (Gas Safe, electrical, fire, site permits, RAMS, landlord certificates) with policy version and responsible qualified signatory.
- Evidence provenance: actor/device/time/location where appropriate, source photo hash/metadata, edit trail, check state and final document version. Support lawful correction by append/revision, not untraceable overwrite.
- AI may draft descriptions or check completeness. It must never certify, sign on behalf of an engineer, claim statutory compliance or override a safety gate without authorised process.

### FR-080 Quotes to invoices and payments [P0–P1]
- Generate draft invoice from completed, approved job lines, materials and hours; show variance against quote and missing evidence.
- Support VAT in basis points (existing Core pattern), integer pence, adjustments, deposits, partial payments, credit notes, split billing and clear aged debt.
- Provider integrations: Xero/QuickBooks accounting or selected alternatives, payment processor, bank transfer reconciliation. Visibility into sync result/error and ability to retry safely.
- Record payment does not mean funds were received unless confirmed by processor/bank/provider or deliberately entered and approved as manual receipt. Never expose card data to AI model transcripts/logs.

### FR-090 Revenue and intelligence [P1]
- Exception queues: missed enquiries, quote follow-ups due, jobs awaiting evidence, jobs complete not invoiced, invoices overdue, expiring certificates, technicians delayed, SLA at risk, profitability at risk.
- Insights explain exact records, assumptions, potential value, confidence, action owner and suggested next step. Provide dismissal/review history and ranking by urgency/value.
- Distinguish open quote value from confirmed revenue, invoice value from collected cash, and turnover from gross margin. No invented ROI claims.

### FR-100 Communications [P1]
- Central timeline for calls/SMS/email/web messages per customer and linked job; lawful recording/transcription controls, opt-outs, templates, escalation and attachments.
- Automatic acknowledgements permitted only under configured policies; consequential commitments (arrival time, quote price, contractual terms) require confirmation of source system state and approval thresholds.

### FR-110 Customer portal [P1]
- Minimal secure links for quote review/approval, service appointment details, engineer ETA if consented, service reports, invoice, payment and issues. Token scoped to resource, purpose and expiry; easy revoke.
- Do not show one client's assets, financials, staff schedules or credentials to another client. Avoid unrestricted no-login browsing.

### FR-120 Automation and AI [P1]
- Event-triggered and scheduled workflows operate as tasks with state, retry, approval and audit. Agents call typed tools exposed by permission-checked back-end actions, not unrestricted SQL or raw production credentials.
- AI cost budgets, model/provider routing, confidence thresholds, consent gates, escalation and human review mandatory. See `docs/06_AI_AND_AUTOMATION.md`.

## C. Non-functional requirements

- **Tenant isolation:** prove it with cross-tenant negative tests and database policies.
- **Reliability:** idempotent mutations, eventual consistency, replayable event history, persistent offline queue and transparent error recovery.
- **Performance:** practical budgets proposed: initial dashboard meaningful within 2.5 s on representative mid-range broadband, critical field interactions under 150 ms perceived when using local state, list/search responsive to 10k+ jobs; measure in real devices rather than promises.
- **Accessibility:** WCAG 2.2 AA target for applicable web surfaces; contrast, focus, keyboard, screenreader, touch targets and reduced motion.
- **Security:** encrypted transport/storage, least privilege, secrets isolation, MFA options, retention, consent, minimised logs, audit, backup/restore drills.
- **Observability:** trace each change with tenant, actor, source, correlation id, provider response, retry attempts, cost and immutable timestamps.
- **Interoperability:** versioned contracts, clean import/export, mapped external IDs and standard integration points.
- **Configurability:** per-trade checklists and policies through data configuration, not cloned apps or uncontrolled conditionals in every screen.
- **Compliance/standards:** have appropriately qualified UK professionals and counsel validate sector-specific certificate content and legal/recordkeeping obligations before commercial release.

## D. Definition of complete for any feature

1. User can complete a real end-to-end workflow on intended device.
2. Backend confirms state; mocks clearly marked; loading/error/retry handled.
3. Correct tenant/user permissions, audit and privacy behaviour tested.
4. Offline and conflict handling tested where relevant.
5. Accessible interactions with correct empty/success/error states.
6. Acceptance tests exist; monitoring and rollout/rollback decision recorded.
7. Documentation and migration/reuse provenance updated.


---

# 04. How the entire business operates on Ardent

This is the behavioural operating playbook, not a static feature catalogue. Ardent follows work from an enquiry through cash collection while keeping the appropriate people in control. Every flow has a **trigger → context → decision → execution → evidence → next action** structure. UI only exposes the role's relevant stage.

## A. The standard service day

**07:00 Owner opens Core:** sees the exceptions in order: emergencies awaiting allocation, engineers late, safety/registration blocks, quotes ready to follow up, jobs ready to invoice, unpaid/late invoices. Can open proof behind every insight. The ordinary jobs running to plan do not dominate the home screen.

**07:30 Dispatcher starts:** outstanding messages and missed calls are triaged; jobs assigned against skills and availability. Delayed jobs prompt realistic options. Customer communication is sent only from confirmed schedules.

**08:15 Customer calls about no heating:** phone is answered by human or, when explicitly configured, Ardent Voice. It captures customer, address, issue, availability and urgency. A safety-sensitive gas concern routes to emergency guidance/escalation, not AI diagnosis. A typed enquiry is created; duplicate match shows possible existing site/asset. The office receives an exception, not a vague transcript.

**08:20 Office qualifies and books:** scheduler checks engineer registration, job scope, location, outstanding job load, ETA confidence and material availability; selects slot. Customer gets confirmation by approved channel. Booking captures terms, contact consent and access notes.

**09:30 Engineer starts travel:** mobile shows site, caller, equipment history, any permits and access conditions. `Set off` begins travel clock and changes assignment status. Accurate ETA may be shared through a short-lived token only if configured.

**10:00 Engineer arrives:** GPS check-in is recorded where permission granted and appropriate; location can be entered manually with a reason. Required RAMS/permit gates display before hazardous work starts. A failed gate blocks work progression rather than being a decorative warning.

**10:45 Work progresses:** engineer takes before photo, records diagnosis, adds material line(s), notes unexpected fault, pauses to obtain approval for variation. If offline, field evidence is locally saved and visibly pending sync.

**11:30 Work complete:** engineer reviews a human-readable checklist, captures appropriate signature, confirms used materials/time, and generates a report draft. AI can tidy text and suggest missing details; engineer has final responsibility for regulated content.

**11:45 Office QA:** finance/office sees a completed job with evidence and flags: quote variance, missing timesheet, material mismatch, outstanding certificate. Approves corrected invoice draft, sends via provider and records provider receipt ID.

**Later:** payment confirmation reconciles invoice; overdue policy schedules polite reminders, pauses on disputes, and escalates at appropriate thresholds. Owner sees realised cash vs booked work. Aftercare/certificate renewal is offered if customer consent permits.

## B. Explicit lifecycle model [PROPOSED evolution]

Keep concepts separate:

- **Lead/Enquiry** `new → triaged → qualified → converted | lost | rejected`, may create quote/inspection or direct job.
- **Quote** `draft → internal_review → sent → accepted | declined | expired`, with revisions and customer acceptance evidence.
- **Job** `created → ready → scheduled → dispatched → en_route → arrived → in_progress → paused | awaiting_parts | failed_access → work_complete → qa_passed → closed`, plus `cancelled`/reopen by authorised policy. Multiple visits may share one parent job and have independent timestamps.
- **Invoice** `draft → approved → issuing → sent → part_paid → paid`, plus `overdue`, `disputed`, `void`, `credited` subject to accounting semantics.
- **Payment** `initiated → pending_provider → confirmed | failed | refunded | chargeback`; mark source of truth.
- **Engineer availability** `off_shift | available | dispatched | en_route | on_site | workshop | delayed` as separate identity/shift state.

**Existing code:** `JobStatus` currently includes enquiry, quoted, booked, en_route, on_site, paused, complete, invoiced, paid, cancelled. Mobile maps booked → en_route → on_site → complete. This can remain as an initial contract while agents write and test an incremental migration plan. It is *not* safe to simply update enum strings and leave event flows or queries unchanged.

## C. Transaction and guard rules

1. A client/operative must not be double-booked against mutually exclusive slots without explicit override and audit.
2. A job cannot be assigned to a subcontractor lacking required authorisations for the specified work; exemptions require scoped human override with recorded reason.
3. A regulated job cannot be certified by a general AI model or unqualified user.
4. Job completion does not automatically mean invoice paid; invoice issuance does not automatically mean payment confirmed.
5. Material pricing/labour amounts have immutable versions in agreed quote and issued invoice.
6. Repeated mobile taps, webhook retries or duplicate speech transcripts must not produce duplicate notes, photos, quote sends, invoice issues or payments.
7. External messages only send once against a unique channel/campaign/resource version; retries check provider acknowledgements.
8. Corrections in compliance/history are revisions, preserving initial record/audit trail.
9. Owner can override ordinary business workflow gates according to permissions, but cannot override a legal/safety rule by clicking an unqualified bypass.
10. Every consequential transition records who/what/when/source, the previous and next state and correlation/idempotency key.

## D. Scenario playbooks

### 1. Emergency callout: burst pipe/no heating

**Trigger:** high-priority call outside normal booking window.  
**AI:** identifies location, immediate safety constraints, existing customer history and whether an on-call person is available; supplies approved emergency instruction only.  
**Human:** dispatcher/on-call person confirms urgency, capacity and promised arrival window.  
**Result:** priority job, customer contact, engineer alert, ETA status, documentation and audit.  
**Failure:** nobody available → honest alternatives, escalation/answering-service protocol; never promise a fictional engineer or booking.

### 2. Missed enquiry and quote recovery

Missed call → attempted callback task → send a permitted acknowledgement → human/voice qualification → quote draft → internal approval → send → follow-up schedule. Stop follow-ups when customer replies/opts out/accepts. Dashboard shows 'recovered' only with attributed conversion evidence, not from mere contact attempt.

### 3. Planned boiler servicing and compliance renewal

Asset last-service date and certificate policy → upcoming work recommendation → office confirms customer contact and date → scheduler allocates qualified engineer → field checklist and evidence → appropriate human certificate issuance → verified client access → next due date. Renewal recommendation cannot substitute for statutory confirmation.

### 4. No access / tenant absent

Engineer taps 'No access' → reason (no answer, unsafe access, incorrect key, site closed, refused entry) → optional photo/GPS evidence → shift goes available → office alerted → authorises follow-up and callout/fee policy → customer gets appropriate message. No completion claim and no fake sign-off. Preserve travel/attendance labour if billable under contract.

### 5. Unexpected extra work

Engineer discovers additional fault → capture note/photos and proposed parts/labour → quote variation draft → office/client approves revised commercial scope → materials/job plan updates → continuation. If unsafe, work pauses even if customer wants immediate continuation. Preserve original quote/version.

### 6. Subcontractor job

Client/job need → office chooses subbie → accreditation/insurance/trade/competence checks → limited access invitation with expiry → acceptance and evidence upload → arrival/work completion → verified sign-off → accounts review. Subbie never accesses broader customer lists or other engineers' jobs.

### 7. Multi-visit installation project

Parent job/project with phases (survey, quote, install, test, snag, handover); multiple engineers/material deliveries; independent visit clocks and evidence; partial invoice milestones under accepted terms; one coherent customer view. Variations never silently increase final charges.

### 8. Duplicate enquiry/customer record

Voice, email and form capture same breakdown → matching engine suggests existing customer/site and active job → operator confirms merge/link → retain both source records and original communications → no duplicate dispatch/follow-up. Declined match remains separate, with traceable rationale.

### 9. Customer dispute or refund

Dispute opens an issue; automatic payment chasing pauses. Officer reviews quote revision, scope acceptance, timestamps, evidence, messages, invoice and provider reconciliation; authorised decision leads to correction/credit note/refund. AI may compile evidence but may not decide legal liability or issue money movement.

### 10. Mobile offline all afternoon

Engineer completes visit with camera/photos/signature/time while no network. Every user action must return `saved on device`, with local durable journal and media references. On reconnection, sync serialises dependencies (job state before dependent evidence, upload blobs before published report), retries safely and shows conflicts for human reconciliation. A failed upload does not disappear when an app is backgrounded or terminated. An online safety gate remains enforceable through previously authenticated context and safe blocked fallback.

## E. Workflow exception engine

Every exception has type, severity, tenant, object links, detection source, confidence, owner, next action, expiry, dedupe key, acknowledgement and resolution. Deduped warnings cannot repeatedly spam owner. Incident closes when source conditions actually change, not when an agent merely says 'done'. Examples: overdue invoice, customer promise breached, certificate expiry, unanswered emergency, missed engineer arrival, job complete without invoice, quote idle for configured days, failed sync.

## F. Communications governance

- Single customer timeline associates communications with enquiry/job/quote/invoice. Preserve consent and a purpose code.
- Confirm timezone and business hours per tenant; support emergency override rules defined by organisation.
- Templates allow edit/preview; auto-send only under explicit approved tenant policy and per-channel opt-out checks.
- Incident or dispute opens human escalation and suspends repetitive reminders.
- Record original customer words separately from AI summary; highlight uncertain transcription.

## G. Closing loop

Every job should answer: **What was requested? What was agreed? Who went? What happened? What evidence proves it? What did it cost? What did we charge? Was it paid? What should happen next?** An owner should get all nine answers by opening the job, without chasing multiple people.


---

# 05. Roles, screen architecture and interaction standards

## Primary personas

**Owner/director** needs visibility into throughput, profitability, work at risk, engineering capacity, debt and reputation. They do not need to be the everyday dispatcher. Success: 5-minute daily review leads to concrete authorised actions.

**Office/dispatcher** needs a live dispatch surface, one inbox, quick edits, conflict checks, customer communications, quote approvals, engineer tracking and evidence chases. Success: new call to credible booked job without multiple tabs or spreadsheets.

**Estimator** needs asset/site history, templates, labour, cost versions, margins, revisions and customer approval. Success: defensible quote with no hidden cost loss.

**Finance** needs completed/not invoiced queue, reconciled material/labour, invoice previews, accounting sync, payments, credit notes and aged debt. Success: less leakage and fewer mismatches.

**Engineer** needs today's work, safety/asset knowledge, calls/navigation, stopwatch, photos/materials, notes, signature and finish. Success: no unnecessary admin, reliable offline mode, minimal choices while working.

**Subcontractor** needs a restricted, time-bound job link and clear requirements. Success: know what to do, provide RAMS, complete evidence and submit without seeing the rest of the firm.

**Customer/tenant/landlord** needs responsive communication, date/ETA, clear quote, service history, approvals, documents and receipts. Success: trust without needing to call back.

## Ardent Core: desired navigation [PROPOSED, inspect before editing]

- **Operations**: owner/office role-aware default, KPIs with drill-down, ranked exceptions, crew states and today's timeline.
- **Enquiries**: queue with call/transcript, source, qualification, consent, owner, follow-up due and convert action.
- **Jobs**: table/board by active state; search across ref, customer, site, asset, engineer; bulk actions guarded.
- **Schedule**: dispatch board with engineer lanes, bookings, travel buffers, calendar, conflicts, AI suggestions.
- **Customers**: records, sites, contacts, assets, communications, work history, quotes and invoices.
- **Quotes**: lifecycle board with template/edit/revise/accept history, follow-ups and value at risk.
- **Money**: invoices, unbilled completed, overdue, part paid, provider sync, margin waterfall and cash views.
- **Crew**: engineers, skills, registrations, shifts, live assignment status and permissions.
- **Assets/Compliance**: service histories and due work, certificates with human sign-off.
- **Intelligence**: recommended actions with evidence and approval audit, not a conversational-only panel.
- **Settings**: tenant profile, workflow policies, communications, integrations, audit, roles and privacy.

**Repo caveat:** currently Core has implemented operations, jobs and schedule surfaces while several other routes are placeholders. Do not describe every proposed navigation item as built or rename all routes immediately.

## Screen-level behaviour and information density

### Operations / owner dashboard

**Top:** welcome, shift/day context, genuine time of data refresh, selected company/location.  
**First row:** unassigned urgent jobs, today's jobs in flight, quotations waiting, completed-uninvoiced, overdue money. Real sources and period labels.  
**Action queue:** chronological/impact-ranked actionable exceptions with a specific next action, source links and owner. Examples 'Call customer back', 'Approve invoice draft', 'Reassign delayed engineer'.  
**Field awareness:** crew on/off shift, travelling, on-site, delayed, registration issues.  
**Money:** value confirmed, value invoiced, collected, gross margin signals. Never collapse these into a single revenue metric.  
**AI:** a calm contextual assistant offering reviewable suggestions ('Five quotes need follow-up'), not chat occupying half the screen.  
**Interaction:** click a tile opens filtered records, not a dead-end chart. Dismissal has reason and is reversible/audited.

### Jobs board and individual job

**Board:** quick search, statuses, trade/date/owner filters, saved views. Rows show human ref, customer/site, promise time, status, person and exception badge.  
**Job detail header:** title, ref, customer, job state, safety gate, promised visit, 'Call', 'Message', 'Navigate' according to device/role.  
**Body:** Activity, Work, Schedule, Evidence, Materials, Compliance, Quotes, Invoices, Customer communications. Put active actions above legacy metadata.  
**Sticky actions:** move stage, add note/photo, flag issue, prepare invoice; context-aware permissions and confirmation.  
**Status timeline:** immutable events plus readable summaries, original timestamps, role/actor and source.

### Dispatcher schedule

Full-week calendar with engineers as resources or columns, filters by trade/coverage, jobs in waiting tray, local timezone, drag/drop only when permission. Dragging shows consequences and conflicts *before* committing. Multi-select reschedule requires explicit confirmation and sends one consolidated communication after persisted changes. Show travel feasibility confidence and qualifications.

### Quotes

Show original scope beside revised lines and margin estimates; editable labour/material list, VAT, revision preview, customer acceptance link and follow-up history. Label commercial figures accurately. Quote actions require current prices and permissions. Distinguish 'viewed' from 'accepted'.

### Money and intelligence

Money has separate 'Ready to invoice', 'Invoices sent', 'Overdue', 'Payments' and 'Sync errors'. Each shows source evidence and ability to remedy the underlying job. Intelligence adds reasons and suggested next action with proof, confidence and permission. Neither should fabricate financial totals from cached mock data.

## Ardent Field: mobile screen map

Existing `mobile/` app concepts should be retained where validated:

1. **Mode picker**: On Site, En Route, On Call, Workshop, Off Shift. It is an operational quick-state, not a barrier to opening today's jobs.
2. **Today**: next appointment, countdown to promised time, route/call, remaining jobs, high-priority office messages and sync indicator. Only a few cards, suitable for one hand.
3. **Job**: job summary, site contact/access, safety, clock, work stages, photos, materials, voice/typed notes, signature, issues. Critical action pinned to bottom.
4. **Capture**: camera and voice record from within job; auto-association with active job and stage; review and correct before saving.
5. **Wrap-up**: summary, missing tasks/evidence, time/material charge review, signature, report draft and invoice *request* (or invoice send if authorised by employer). Clear difference between saved, submitted, approved and issued.
6. **Offline queue**: one visible status destination that lists pending/failed items and allows safe resend. Never make offline work appear lost or complete when only queued.
7. **Optional reference**: documents, assets, past fixes, certificates and QR scanning.

### One-handed field rules

Primary button large enough for gloved thumb; action nouns in plain English; no multi-step wizard for taking a photograph; save in-progress dictation locally; scroll position retained; no destructive swipe as sole mechanism; light/dark outdoor readability; confirmations only for consequential actions; spoken notes should be transcribed and previewed, not silently filed into statutory certificates.

## Customer portal

Mobile-first link from email/text with clear purpose and expiry. Show company identity, booked slot, job status/ETA (only when authorised), quote decision, service report/certificates, invoices/payment and support contact. Avoid demanding account creation for one simple acceptance when a secure one-time link suffices, but retain stronger login for ongoing portfolios. Do not reveal engineer exact location beyond approved ETA policy.

## Public marketing website

Existing homepage branch uses purposeful imagery and sections. Preserve brand and content direction unless separately revised: who we serve, measurable relief, what platform does, how onboarding works, compliance/trust, honest integrations, product proof and clear consultation/pilot CTA. Avoid claiming unshipped modules are live. Human elements should show the tradesperson and operating business, not abstract AI stock images. Keep 'services' and 'software' distinguishable.

## Design reference caveat

The included collage `reference/EXPLORATORY_UI_MONTAGE_NOT_CANONICAL.png` uses light surfaces and is **not** the adopted Core design. Useful ideas from it: job overview, schedule grid, quote table, engineer mobile flow and owner metrics. Actual palette, typography and layout decisions should be grounded in `core/tokens/tokens.ts`, `core/src/index.css`, existing components, mobile token sync, and the approved brand direction.

## Accessibility and copy

Use proper landmarks/headings, reachable keyboard focus, readable labels, confirmation for irreversible action, persistent controls without hover dependency, status announced in accessible text (not colour alone), loading and optimistic state signalled clearly. Dates and amounts UK-localised. Error microcopy explains what was saved, what was not and the specific next action; never 'Something went wrong' alone for data-critical operations.


---

# 06. AI Voice, Agents, Field Assistant and Revenue Intelligence

## Operational premise

An AI assistant is a **controlled participant** in the workflow, not a second hidden administrator. It gathers evidence, proposes actions, performs authorised narrow operations and makes its work inspectable. Every agent has a declared purpose, a tool allow-list, a budget, tenant/role scope, side-effect classification, failure behaviour and human escalation.

## A. Ardent Voice

### Entry channels

Inbound telephone via an approved provider, call-back task, website chat/form, voicemail transcription, optionally business messaging. Tenant can run human-first, after-hours AI, overflow AI, or explicit AI-fronted service. Avoid forcing AI adoption.

### Call sequence

1. Answer in company brand, disclose automation and recording/transcription as required by applicable law/policy. Confirm customer intent.
2. Collect minimum necessary identity, phone/contact preference, address/postcode, symptom, safety urgency, time preference and relevant asset where known.
3. Match existing customer/site records cautiously; confirm ambiguous matches with human or caller. Use tool calls (searchCustomer, listUpcomingVisits, getBusinessHours, getApprovedSlots), not guessed memory.
4. Classify request: emergency, new booking, reschedule, status request, billing, complaint, general query.
5. Offer only slots from **real, current scheduling service** with transactional hold/commit semantics. If unavailable, create callback request and tell customer truthfully.
6. Read booking summary back: location, contact, trade/service and time range. Confirm before commit, obtain any relevant consents.
7. Create structured enquiry/action, attach transcript with confidence and original timestamps, notify responsible human. Do not invent technician registration or pricing.
8. Handoff to human with concise summary + caller context when low confidence, complaint, medical/safety issue, unusual damage, vulnerable caller or payment dispute.

### AI voice hard stops

No remote gas/electrical safety diagnosis or instructions for dangerous work; no contractual guarantee from probabilistic output; no emergency-service impersonation; no taking raw card details into LLM context; no unauthorised recordings; no scheduling outside actual available slots; no promise of same-day service without confirmation; no discriminatory triage. Safety escalation is scripted and human-reviewed.

### Voice provider abstraction

Inbound call event, provider call ID, verified tenant DID, consent/recording metadata, media pointer, transcript segments, intent, suggested urgency, created enquiry/ref, errors. Provider adapters must handle duplicate webhook deliveries with idempotency keys. Store audio only for documented retention, restrict access and keep transcripts separately from free-form agent thought.

## B. Ardent Field Assistant

Engineer can press one large microphone button from a job. Dictate natural language such as 'Replaced the pump, checked pressure at 1.5 bar, used two fittings, left system running'. The system:

1. Records locally if network absent and saves original audio only if policy allows; preserves text draft and upload status.
2. Transcribes; shows editable text and confidence on ambiguous words/part numbers.
3. Suggests structured notes, materials, times and next actions based on the job context.
4. Highlights any material/price that does not match catalogue (never invents cost silently).
5. Captures engineer approval, then commits each typed field using the application service/`ArdentClient`, producing audit events.
6. Suggests a customer-friendly report, separate from legally required certificate sections.

**Human remains the authority on what work was done.** A generated narrative must be visibly labelled draft until reviewed.

## C. Revenue Engine

### Inputs

Missed calls/enquiries, follow-up events, quotes, jobs, labour/material records, invoices, payments, customer communication consent, external accounting sync and previous interactions.

### Insights

- Missed enquiry without assigned callback within tenant SLA.
- Sent quote awaiting reply after configurable business-day threshold.
- Approved work completed but no invoice prepared.
- Draft invoice has missing materials/hours, or a significant quote variance.
- Issued invoice due soon/overdue, with dispute and contact policy gates.
- Assets due service or contract renewal, only when customer/qualification information supports suggestion.
- Engineer utilisation and route inefficiency, contextualised by leave, emergency work and geography.

### Action loop

**Detect → verify current record → explain evidence/value → propose action → approve if required → execute typed tool → provider acknowledgment → update timeline → measure outcome.**

Example: 'Seven completed jobs, £8,450 draft potential' must link to seven source jobs, with totals calculated by deterministic code and uncertainties shown. 'Send invoices' remains a finance approval unless explicitly configured and tested to automate under a bounded policy.

## D. Policy-based autonomy tiers [PROPOSED]

| Tier | Meaning | Examples | Authorisation |
|---|---|---|---|
| L0 | Read and summarise | Identify overdue quotes, search job history | Tenant/role read scope |
| L1 | Draft only | Draft quote, report, callback text, work-order notes | Human reviews before write/send |
| L2 | Supervised tool execution | Schedule booking, send quote, invoice issue, alter assignment | Explicit human approval + current-state check |
| L3 | Bounded autonomous | Acknowledgement, low-risk reminder within approved policy | Preapproved policy + rate/budget/consent gates and easy suspend |
| L4 | Forbidden without separate redesign | Issue regulated certificate, bypass safety permit, disclose private data, make arbitrary payment/refund, unrestricted DB access | Never allowed as generic agent action |

Autonomy is action-specific, not model-specific. 'The AI is confident' is not an authorisation decision.

## E. Tool and approval architecture

Use typed commands and permission-enforced server application services: `searchCustomer`, `createEnquiry`, `draftQuote`, `getAvailableSlots`, `proposeBooking`, `requestBookingApproval`, `prepareInvoice`, `requestInvoiceSend`, `recordJobNote`, `getComplianceRequirements`, `openCustomerIssue`, `queueFollowup`. Each checks tenant, actor, auth, business rule, version/preconditions, consent, amount limits, current status and duplicate operation keys. Database RLS is defence-in-depth, not a substitute for workflow policy.

Every consequential proposal receives: `proposalId`, tenant/actor/source, action type, affected objects, full preview/diff, evidence references, rationale, confidence, estimated side effects, creation/expiry, approver, approval timestamp and eventual execution receipt. Approvals expire when underlying state changes. UI must clearly identify which steps were automatic and which were approved.

## F. Event automation design

- Events such as `enquiry.created`, `quote.sent`, `quote.accepted`, `visit.arrived`, `job.work_completed`, `invoice.issued`, `payment.confirmed`, `certificate.expiring` trigger idempotent handlers.
- Workflows maintain durable task states: pending → waiting_approval → queued → executing → succeeded / retryable_failed / terminal_failed / cancelled.
- Outbox transaction and provider receipt prevents record updated while SMS/email not actually sent. Per-provider retry backoff, dead-letter and operator re-drive.
- Rate limits: per customer/channel/day, per tenant, per automation policy. No infinite loops when two agents react to each other's updates.
- All money arithmetic, dates, certification requirements and state machines determined by code/policy; model used for extraction/drafting/recommendation.

## G. AI accuracy, privacy and cost

- Retrieval via authorised business services only, with source links; no global vector-store cross-tenant retrieval.
- Guard against prompt injection in emails, attachments, customer texts, websites, transcription and external tool responses. Treat those as untrusted data, not instructions.
- Data minimisation and retention. Do not put live credentials, access codes, bank/card details or unrestricted contact exports into model context.
- Per-tenant/provider budgets, token/time limits and fallback routing. Expose meaningful usage for administrators and allow disable/suspend.
- Model should say 'I cannot confirm' when context absent; never fill missing amounts/dates with a plausible guess.
- Evaluate extraction quality separately from generative tone; sample real speech accents, names, postcodes, part serials and background noise.
- Incident logging: model/version, prompt template ID, tool names/outcomes, evidence IDs, policy decision, human approval. Protect sensitive content and avoid retaining private chain-of-thought.

## H. Evaluation pack [must be testable before autonomous send]

- 20+ real/synthetic call intentions including emergency, unclear postcode, double booking and complaint.
- 20+ speech notes with accents/noise/parts names and dictated negative results ('did NOT replace part').
- Adversarial external email instructing agent to leak tenant data or bypass pricing controls.
- Disputed invoice followed by recurring reminder trigger (must not send).
- Expired approval after changed quote price (must reject).
- Duplicate provider webhook (exactly one business mutation).
- Model outage and provider timeout (human fallback; task not silently lost).
- Cost/rate budget exhaustion (continue basic workflows without AI).
- Cross-tenant retrieval attempt (deny and log).

## I. What differentiates Ardent

Not 'we have AI'. **Ardent actually performs the mundane connective work reliably**: understands the call, prepares the job, helps the field worker capture what happened, gets it ready for finance, notices missing money and tells the owner what to do next. This is meaningful intelligence embedded in operational context, not a chatbot bolted to a dashboard.


---

# 07. Architecture, canonical data, APIs and integration contracts

## A. Start from existing code, not an idealised replacement

**REPO-OBSERVED:** Core currently React/Vite/TS, Mobile Expo/React Native, Homepage static web; `ArdentClient` is an interface backed by mock data. The mobile app imports copies of shared model/client/tokens from Core via `mobile/scripts/sync-core.sh`. SiteSentriq uses Supabase PostgreSQL/Row-Level Security, multiple web/mobile surfaces and edge functions. No unified Ardent production backend has been verified.

**Proposed architectural target:** one audited application services/API layer, one multi-tenant authoritative PostgreSQL database, event/outbox processing, provider adapters, offline mobile synchronization, typed AI tools and role-based experiences. Consider Supabase because the owner's related product already uses it, but **do not provision/migrate a database before proving the active build's current plan, credentials, ownership and constraints**.

```text
          Customers / Phone / Email / Web forms / SMS
                           | provider webhooks
              [Inbound adapters + consent/dedupe]
                           |
  Core Web UI ----------> [Ardent Application API] <---------- Mobile Field
           via ArdentClient       |  ^                  via ArdentClient
                                 |  | receipts/replay
                [Policies + Roles + State machines]
                                 |
                [Postgres source of truth + RLS]
                    |                |
             [Outbox/events]    [Documents/media]
                    |
              [Workflow workers] ----> approved AI tools
                    |
           [Telephony/Email/SMS/Accounting/Payments]
                    |
                [Provider receipts]
```

## B. Contract ownership and versioning

`core/src/data/model.ts` currently owns business shapes; `core/src/data/client.ts` owns common operations; `core/tokens/tokens.ts` owns shared design values. Do not duplicate contracts ad hoc inside mobile. Proposed next step: move shared contract to a versioned workspace package **only if the active branches and tooling benefit**, with backwards compatible exports and an intentional integration PR. In the meantime, use the existing sync script, compare generated copies and add CI drift detection.

Every API mutation must accept organisation/tenant scope from verified auth, never trust `orgId` supplied in a browser body. Write commands have `idempotencyKey`, entity version/precondition, actor, source, request ID and server timestamps. Read APIs support deterministic pagination, filters and role scoping. Avoid app screens issuing unrestricted SQL or using privileged provider keys.

## C. Domain model proposed extensions (in addition to current Core types)

| Entity | Important properties/relationships |
|---|---|
| Organisation | ID, name, timezone, currency, service areas, policy version, integration settings |
| Membership | userId, orgId, role, active dates, delegated permissions, revocation |
| CustomerContact | customerId, people, verified channel, consent and opt-outs |
| Enquiry | source, severity, customer/site, contact details, original communication, qualification state |
| Appointment / Visit | jobId, engineer assignments, start/end window, actual arrival/completion, access status |
| WorkOrder / Job | stable external ref, trade, priority, operational state, customer, site, assets, scope revision |
| JobTask | dependencies, checklist, ownership, per-task evidence, visit assignment |
| Asset | siteId, model, serial, service history, status, certificate links |
| QuoteRevision | quoteId, revision, line versions, price/tax, approval terms, acceptance source |
| CostLedgerEntry | labour, parts, travel, subcontract, overhead allocation (not invoice revenue) |
| Invoice and InvoiceLine | approved amount, tax, provider IDs, issue state, payment allocations, credit links |
| PaymentEvent | provider transaction ID, amount, method, status, settlement/refund, reconciliation evidence |
| Certificate / ComplianceRequirement | type, policy, competent author, issued version, expiry, linked evidence |
| EvidenceItem | blob ref, cryptographic hash, actor, device/source timestamps, sync history, permissions |
| Communication | provider ID, channel, content ref, consent state, related objects, outcome |
| AutomationRun / ApprovalRequest | trigger, policy, proposed command, approval state, provider receipt, errors |
| AuditEvent / OutboxEvent | append-only event IDs, actor, tenant, source, before/after hashes, correlation/version |
| IntegrationConnection / ExternalMapping | tenant, provider, scope, token ref, external object IDs, retry/status |

Do not add all tables at once. Evolve schema according to user value and real workflow slices. Preserve backward compatibility/migration scripts.

## D. Financial integrity

- **Amounts as integer pence**; rates/taxes represented deterministically. `vatRate` basis points (`2000`=20%) already exists in Core.
- Distinguish unit pricing, cost, discount, tax, quote value, invoice amount, receipts and gross margin. Calculate VAT/rounding according to chosen invoicing policy and audit it.
- A valid invoice is its own immutable issued document; subsequent change requires credit/adjustment. A quote acceptance references a specific revision.
- Accounting provider may be source of truth for ledger state. Keep external IDs and reconciliation timestamps; avoid competing financial truth.
- Partial allocations, refunds and chargebacks should not be reduced to setting job `paid=true`.

## E. API design pattern (illustrative; adapt to `ArdentClient`)

```ts
interface MutationContext {
  idempotencyKey: string;
  expectedVersion?: number;
  requestId: string;
}
interface BookingProposal {
  enquiryId: string;
  siteId: string;
  assignmentIds: string[];
  windowStartUtc: string;
  windowEndUtc: string;
  customerNoticeDraft: string;
}
interface BusinessCommandService {
  proposeBooking(input: BookingProposal): Promise<{ proposalId: string; conflicts: string[] }>;
  approveBooking(id: string, ctx: MutationContext): Promise<{ bookingId: string; version: number }>;
  prepareInvoice(jobId: string, ctx: MutationContext): Promise<{ draftInvoiceId: string; warnings: string[] }>;
}
```

This is an **API design example**, not a claim current repository exports these types. Commands should run through server-side transaction/auth/constraint logic; no `service_role` in mobile/browser.

## F. Offline-first protocol [P0]

Mobile requires a **durable local database/queue** (technology decision after assessing present code, SQLite or equivalent). Each operation has generated UUID, device ID, tenant, local creation time, monotonic local sequence, entity ID, expected version, payload, media dependencies and sync state. Steps:

1. Save primary action and attachment metadata atomically on device, then show `Saved on device`.
2. Process queue in dependency order when online, with retryable backoff and provider/server idempotency checks.
3. Upload large media via durable resumable or retryable mechanism. Mark success only after server/storage confirmation and hash validation where applicable.
4. Reconcile canonical server response and refresh local view. Preserve event original occurred-at vs received-at and actor/source.
5. Conflicts (someone else changed assignment, customer data or status) show side-by-side resolution for humans. Never silently clobber other edits.
6. Expired auth: retain encrypted queued data, require re-auth to send and never leak across org switching.
7. Logout/offboarding wipes sensitive cached data according to controlled policy after safe sync/explicit warning; support device loss/revocation.

**Test:** force-kill app while offline after 20 photos/notes; relaunch, reconnect, repeat upload callbacks and confirm exactly once retained in correct job. Check background suspend and partial upload.

## G. Event sourcing vs practical audit

Full event sourcing is **not** mandated. A transactional operational schema + append-only audit/outbox offers much of the benefit with less complexity. Event envelope example provided in `schemas/sample_event_envelope.json`. Event identity, time, tenant, actor, related object and causation/correlation must be reliable. Replays must not trigger external messages/payments twice.

## H. Integration architecture

Connector interface: metadata/config, OAuth/token management or API key vault, auth state, feature capabilities, read/sync/write scopes, webhook verification, webhook replay, per-tenant rate limits, mappings, diagnostic UI, re-authorisation and revoke.

Initial priorities: email/calendar if relevant, telephone provider for Voice, SMS/email, accounting (Xero/QuickBooks), payments, maps/navigation. **Do not add integrations because they appear on marketing pages; each must have a tested customer need, funded operational cost and provider access.**

External system sync must show pending/succeeded/failed, last successful sync and specific actionable errors. Prior SiteSentriq demonstrated this as a documented product principle.

## I. Search and intelligence

Use deterministic filters/full-text search for operational navigation first. Add embeddings only for genuinely useful unstructured materials and with strict tenant scoping and retention. AI retrieval must be linked back to source records; sums and compliance status computed by deterministic functions, not model approximation.

## J. Environment, deployment and operations

- Separate local/dev/staging/prod and organisation demo fixtures; no production customer data in screenshots or AI demo prompts.
- Versioned database migrations with restore/rollback reasoning and staged traffic, feature flags and compatibility window.
- Enforce protected secrets, short-lived credentials, provider webhook signature checks, support access limits and audited elevation.
- Observability includes API errors, queue lag, sync conflicts, webhook failures, AI costs, model/tool errors, message delivery, payment discrepancies, cross-tenant access failures.
- Daily backup policy and restore drills; security policies and retention aligned to UK customer requirements.
- Stage and validate Core + Mobile contracts together before production; maintain version compatibility.

## K. Architecture decision records needed

ADR-001 Product boundaries (Ardent platform vs Trades UI).  
ADR-002 Auth/tenancy/storage reuse vs new project.  
ADR-003 Mobile offline queue and media persistence.  
ADR-004 Source-of-truth accounting integration.  
ADR-005 Core/Mobile contracts ownership and versioning.  
ADR-006 Audit/outbox/workflow engine.  
ADR-007 AI policy/tools, approvals, budgets.  
ADR-008 Safe SiteSentriq code provenance/public exposure.  
ADR-009 Communications recording/retention/consent.  
ADR-010 Branch/worktree integration strategy.


---

# 08. Selective reuse from SiteSentriq (Haumea)

## Decision

**CONFIRMED USER DIRECTION:** The user is happy for Ardent to reuse parts of SiteSentriq and does not need a strict product separation. The objective is to accelerate Ardent, not copy every part of a different product. Both repositories are controlled in the same GitHub account, but Ardent's public visibility makes reuse governance urgent.

## Evidence from SiteSentriq docs [REPO-OBSERVED]

`FEATURES.md` and `README.md` describe multi-tenant facilities software with jobs, scheduling, clients/properties/assets, compliance, PPM, quotes, invoicing, Xero/QuickBooks integrations, document versions, customer portal and field mobile. `ENGINEER_APP.md` describes actual mobile↔web data mappings and tracking. `MOBILE_PRODUCT_VISION.md` contains worker-first user journeys. Source/README assert Supabase RLS, offline queue and mobile delivery. Claims are not independently audited in this handover.

- Private source: https://github.com/EmotiveImpact/SiteSentriq
- Imported snapshot (public Ardent): https://github.com/EmotiveImpact/Ardent/tree/claude/project-thread-vzm2xt/sitesentriq
- Core feature map: `sitesentriq/FEATURES.md`
- Field engineering notes: `sitesentriq/ENGINEER_APP.md`, `sitesentriq/MOBILE_PRODUCT_VISION.md`
- Security notes: `sitesentriq/SECURITY.md`
- Positioning: `sitesentriq/docs/POSITIONING.md`

## Reuse decision matrix

| Capability | SiteSentriq candidate | Recommendation for Ardent | Risk / conditions |
|---|---|---|---|
| Organisation/tenant patterns | PostgreSQL, RLS, roles | **Study / adapt** | Never copy grants blindly; new role semantics |
| Customers/sites/assets | Portfolio hierarchy | **Adapt strongly** | Simplify defaults for domestic trade workflows |
| Job/visit scheduling | Calendar, assignments, states | **Reuse patterns and tested logic** | Current Ardent Core model differs; map carefully |
| Field note/photos/time/signature | Expo mobile + backend contracts | **Selective reuse** | Expo SDK, React and schema divergence; sync reliability audit |
| Offline durable queue | Replay/idempotency queue | **High-value extract candidate** | Retest device/storage and per-tenant keys |
| Quotes/invoices | Documents, lines, accounting sync | **Selective reuse** | Tax/refund/approval semantics and duplicate issue risk |
| Certificates/safety workflows | CP12/EICR/LOLER/fire/RAMS/PTW | **Adapt as modules** | Competent engineer legal review; avoid false certifications |
| Subcontractor invite + gating | Document checks/no-login links | **Adapt for P1** | Scope access, expiry, abuse prevention |
| PPM and service renewals | Recurrence and auto jobs | **Reuse scheduling logic later** | Different tenancy and trade schedule rules |
| Customer portal | Portfolio and booking views | **Reuse UX/workflow ideas** | Simplify customer experience; test token scopes |
| SLA engine | Contract targets + credits | **Reuse selectively for B2B** | Too complex for domestic MVP; contractual accuracy |
| Document storage/versioning | Private buckets, versions, exports | **Strong candidate** | Retention, attachment ownership, signed URL expiry |
| Accounting sync log/retry | Provider errors and recoverable status | **High-value candidate** | New provider credentials, external ID semantics |
| Dashboard/report builder | Composable panels, reports | **Inspiration / selected components** | Avoid importing full CAFM dashboard density |
| Golden thread building pack | Building Safety Act exports | **Defer for non-FM trades MVP** | Sector-specific complexity/legal claims |
| Public trust score / tender pack | FM-specific differentiator | **Defer** | Different buyer expectations |
| AI compliance copilot | Docs explicitly mark unbuilt | **Do not assume reusable feature exists** | Concept only; build separately behind policies |
| Brand/visual style | Orange/navy Haumea theme | **Do not copy** | Ardent owns dark/ember design tokens |

## Technical due diligence before extracting code

1. Identify exact file/module, dependencies, data tables, database functions/triggers and tests. Beware of copying a hook that relies on dozens of RLS policies and edge functions.
2. Determine licensing/attribution/third-party asset rights, and whether any source is intended to remain private. Preserve commit source attribution and licence notes.
3. Review security assumptions: tenant identifiers, storage paths, privileged endpoints, signed links, service-role use, auth bypass/fail-open, location sharing and data exports.
4. Map domain semantics explicitly (FM property/contract/asset vs domestic customer/site/job). Prefer adapters to renaming underlying SiteSentriq tables haphazardly.
5. Compare frameworks and package versions. Current Ardent Mobile uses Expo 58; SiteSentriq's prior mobile docs refer to Expo 54. Native modules, migrations and dependency drift must be tested.
6. Characterise existing functionality with tests before porting. Include regressions for duplicate sync, lost photo, multi-tenant access, attachments and provider retry.
7. Extract a cohesive unit into an Ardent-owned module with typed interfaces and comprehensive acceptance tests. Do not make Ardent runtime depend on imported whole `sitesentriq/` application.

## Proposed first reuse slices

**Slice R1: customer/site/asset reference model**, but only once Core owner approves field mapping. Outcome: engineering app can retrieve legitimate service history and address safely.  
**Slice R2: offline write queue and evidence capture**, starting from existing Ardent mobile gaps; the highest field reliability value.  
**Slice R3: invoice sync status/retry and document metadata**, only after provider integration decisions.  
**Slice R4: sector-specific certificates, PPM and subcontractor gates** when pilot needs prove demand.

## Acceptance bar for reuse

- A specific user problem is solved and no duplicate implementation left behind.
- Independently testable and maintainable without importing unrelated FM infrastructure.
- No leaked private config, production data, embedded credentials or proprietary dependencies beyond permissions.
- Existing Ardent Core UI, shared contracts and mobile modes remain working.
- Cross-tenant and offline tests pass; file provenance documented.
- PR names origin, licences, notable semantic deviations and operational risks.

## SiteSentriq relationship options (decision deferred)

(a) Reference/import selected code, (b) shared independently versioned packages, (c) expose public API to integrate a running SiteSentriq installation. All are technically viable; choose by ownership and stability. The user does not demand corporate/product separation, so avoid organisational theory debates. Implement the lowest-friction option with clear build boundaries and source security.


---

# 09. Brand, design system and interaction specification

## Existing Ardent Core design tokens [REPO-OBSERVED]

Canonical file: `core/tokens/tokens.ts`. These values exist in source and should be preserved as the starting point:

| Token | Value | Meaning |
|---|---|---|
| `bg` | `#070707` | True dark application backdrop |
| `surface` | `#121212` | Panels |
| `inset` | `#0b0b0b` | Deep wells |
| `raised` | `#1d1d1d` | Hover/controls |
| `line` | `#1c1c1c` | Table row separators |
| `lineStrong` | `#2e2e2e` | Stronger dividers |
| `fg` | `#f2f2f2` | Main text |
| `fgMuted` | `#9a9a9a` | Secondary text |
| `fgFaint` | `#5f5f5f` | Tertiary text, avoid for essential information |
| `ember` | `#ff6a1a` | Restrained brand accent |
| `ok` | `#22c55e` | Confirmed/success state |
| `warn` | `#f59e0b` | Attention |
| `danger` | `#ef4444` | Risk/failed |
| `info` | `#3b82f6` | Informational state |
| `violet` | `#8b5cf6` | Auxiliary state only |

Typography: **Michroma** wordmark/display, **Geist** body and UI, **Geist Mono** for quantities, money, job references, serials/postcodes. Spacing uses a four-point grid, radii primarily 6–14 px. Existing Core rule: cards/buttons generally no decorative borders; use tonal surfaces and meaningful table dividers.

**CONFLICT RESOLUTION:** Earlier light-coloured UI collage is a concept only; it does not supersede these source tokens. Marketing pages may use a separate editorial visual language if previously established; their design should be reviewed against the user's approved direction, not forcibly made all black.

## Product character

**Functional precision, not generic SaaS.** The console should resemble a dependable operational instrument: quiet typography, unusually good hierarchy, consistent status semantics and low visual noise. Important numbers prominent, supporting explanations compact, actions always obvious. Avoid neon rainbows, ornamental gradients, giant abstract AI shapes, excessive card borders or meaningless animations.

Mobile should be confident and tactile, slightly larger than desktop, with clear state and haptic feedback. Do not recreate desktop dashboard miniaturised into a phone screen.

## Semantic status hierarchy

- Active/current action: ember sparingly.
- Completed/safely confirmed: green.
- Needs attention: amber; must include reason text.
- Blocked/error: red; must offer recovery path and show affected job.
- Informational: blue only where needed.
- Unknown/stale/offline: neutral text/icon; never pretend it is success.

Status never relies on colour alone; each state has descriptive text and icon with accessible label. Show last verified sync/refresh time where states are important.

## Interaction components to standardise

1. **Metric tile:** label, period, value, movement/benchmark where meaningful, source drill-down, data freshness; no vanity counts without action.
2. **Exception row:** urgency, affected record, why, evidence, owner, recommended action, dismiss reason, last updated.
3. **Job card:** reference, customer/site, trade, scheduled range, current phase, engineer, exception marker, next action.
4. **Schedule block:** colour encodes work state only, not engineer identity; drag/drop preview shows validity and conflicts.
5. **Record detail:** stable title, action bar, sticky context, chronological evidence and structured tabs only if needed.
6. **Activity entry:** user/agent/system attribution and actual event vs upload time, attachments, immutable audit link.
7. **Approval tray:** before/after diff, side effects, source evidence, expiry, accept/reject, reason, explicit audit.
8. **Connection/sync status:** provider, last success, current attempt, exact error, retry with dedupe semantics.
9. **Voice capture control:** clear recording/pause/stop/consent, editable draft, upload state and confidence flags.
10. **Empty state:** explain what belongs here and provide the single next useful action.

## Suggested desktop shells

Left rail: Ardent wordmark, Operations, Enquiries, Jobs, Schedule, Customers, Money, Crew, Intelligence, plus lower settings/help. Organise by actual job-to-be-done; advanced FM features can live in scoped subsections. Top contextual row: organisation selector where relevant, global search, connected/sync indicators, notifications and user. Main content: queue and record-first layout. Side assistant appears only in context rather than permanently displacing work.

## Mobile field patterns

- Full-height dark shell and current operational state, next job prominently displayed.
- Critical action near thumb zone, preferably one primary button at a time (Set off / Arrived / Pause / Finish).
- Tall readable touch targets; photograph and note capture from any job stage.
- Clear segmented job evidence and review stage; avoid bouncing between screens for every material.
- Voice input can pre-populate fields, but all parsed information remains editable before formal submission.
- 'Saved locally' and 'Synced with office' treated as different states.
- Offline status survives navigation; connectivity loss never resets current job content.
- Time clocks display elapsed with server-confirmed record when available; guard against overlapping entries.

## Motion and sound

Limit motion to status transitions, drawers and feedback. Respect reduced-motion preference. Haptics useful on mobile arrival, save and confirmed completion; do not celebrate when a record is only queued. Audible alerts reserved for genuinely urgent matters and allow per-role configuration.

## Responsive and accessibility

Desktop planning targets: 1440 wide, 1280 standard, 1024 compact; mobile 320–430 effective width and varied system font scaling. Tests include 200% zoom, keyboard-only, screen readers, high contrast, direct sunlight for field mobile. Use accessible modals, validation on submit as well as inline, 44 px target sizes where feasible, no nested links/buttons.

## Brand marketing consistency

Parent Ardent should look premium and credible. Earlier user preference: retain the Ardent logo, mix established corporate direction with human trade imagery, maintain breathing space, do not pack every capability onto one page. Use real operational scenarios and honest proof. Ardent marketing can serve bespoke infrastructure buyers while the trades product page focuses on specific workflows and people. Naming/offer architecture should be visually distinct from internal app navigation.

## Visual QA gates

- Compare core/mobile screens against present approved branch screenshots before any redesign.
- Preserve shared token sync; document any deliberate platform exception.
- No placeholder/synthetic data portrayed as live customers or transactions.
- Functional interactions tested at real viewport widths and with error/empty states.
- Visual legibility, state semantics and action priority approved by product owner.


---

# 10. Security, compliance, reliability and trust

**Purpose:** a trades operating platform stores customer addresses, site access notes, personnel details, location history, quotations, card/payment references, voice recordings and regulated evidence. Trust needs deliberate architecture before connecting agents or taking payments. Requirements below are engineering and operational guardrails, not legal certification.

## Critical issue: public Ardent repo carrying private source [P0]

GitHub connector observed `EmotiveImpact/Ardent` as PUBLIC, with `sitesentriq/` holding copied files from PRIVATE `EmotiveImpact/SiteSentriq`; the import commit on 15 October 2026 copied a source snapshot. This may have been intentional, but MUST be explicitly reviewed. Preserve evidence and report without pasting secrets or customer data in the chat. Check source licences, publishing intent, environment files, references to production project IDs/URLs and historic commits. Change visibility, rotate exposed credentials and remediate history with owner authorisation as appropriate. Merely deleting `sitesentriq/` in a later commit does NOT erase it from history/forks/caches. Do not disrupt other Claude branches while investigating.

## Threat model areas

- Customer A sees customer B jobs or files through bad organisation ID or storage policy.
- Customer link leaks because long-lived bearer token is forwarded/shared; site access details exposed.
- Mobile engineer phone lost with offline customer records and unsynced photos.
- Agent follows malicious instructions embedded in a customer email or PDF and exports contacts.
- Public voice endpoint impersonation or injection into booking flow.
- Duplicate payment webhook creates two receipts or double books invoice.
- RLS policy grants excessive access to subcontractors, clients or anonymous actors.
- Internal support or billing endpoint trusts caller-supplied org ID or insufficient role.
- Unverified document claims legally valid certificate from AI output.
- GPS location tracked outside an authorised job/shift without minimisation/consent.
- Sensitive transcripts or stored recordings retained beyond policy and used in external model training without authorisation.

## Multi-tenancy and server-side authorisation [P0]

- Organisation ID from verified auth/session, not writable client parameter. Check membership and resource ownership for every read/write and nested lookup.
- PostgreSQL RLS on all tenant records and storage paths where used, with restrictive role-specific policies, tested against service-role bypass pathways.
- The privileged service key never goes to web/mobile and is isolated to approved server jobs. Privileged functions implement their own authorisation and explicit tenant filters.
- Customer portal scopes rows to actual client membership; subcontractor grant restricts per job, time, data fields and mutation types.
- Support/admin impersonation uses temporary grants, user-visible audit, reason and two-person review where needed. Offboarding revokes sessions, tokens and outstanding links.

## Evidence provenance and regulated work

- Evidence captures original occurredAt and server receivedAt, device identifier (privacy-aware), actor, job, hash, asset and relationship to checklist.
- Edited notes/photos have visible revisions. Never silently overwrite the signed initial record.
- Certificates have authorised qualified signatory, version, issuing date, regulatory template version, audit history and expiry/renewal rules; region-specific policy reviewed by qualified experts.
- AI can pre-fill *drafts* from engineer notes but cannot sign, certify, declare a property safe or bypass permit/RAMS checks.
- Permit-to-work and qualification gates enforced at back-end; a UI warning alone is not a safety guard.

## Communications, recording and privacy

- Clear customer notices, channel and purpose-specific consent/legal basis tracking, call recording settings, retention schedule and subject-access/delete processes. Have UK privacy counsel review live flows as needed.
- Automated calls/messages respect opt-outs, marketing vs service distinction, business hours, throttling and escalation.
- Voice transcripts may contain payment, health, disability, home access, safeguarding or dispute details. Collect the minimum necessary and restrict access by role; redact sensitive data before routing to models.
- Customer identity matching must not disclose another person's records because of a similar phone number or address.
- Exact engineer location shared only during approved travel/visit and for permitted recipients; default to ETA, not live pinpoint, when customer doesn't require location.

## Offline mobile protection

- Encrypted sensitive local storage and scoped credentials; tokens in platform secure store; avoid plaintext logs or shared photo gallery where possible.
- Never mingle cached records across organisations or user sessions. Provide remote revocation and wipe strategy; offboarding handles pending queue carefully.
- Media saved to durable app storage until explicit server receipt. Crash and reconnection tests required.
- Maintain compliance/safety conservative offline fallback: if authorisation cannot be confirmed, allow evidence capture but block irreversible regulated action until reconnected.

## AI security and governance

- Tool registry allow-list; no unrestricted shell, database admin, arbitrary URL fetching or CRM mass export.
- Typed schemas, server-side permission gates, prompt injection testing, output validation and deterministic policy checks.
- Per-tenant budget, rate and action volume limits; kill switch and emergency rollback of auto-send policies.
- Approval includes exact action payload, entity revision, amount, recipient and expiry; stale approvals rejected.
- Provider secrets stored in vault, rotated and access-logged. No raw customer data in build prompts/fixtures.
- Log model/tool metadata but do not publish private reasoning traces or sensitive prompts into dashboards.

## Financial risk controls

- Never route card PAN/CVV or bank credentials into LLM. Use hosted compliant providers for card entry.
- Payment webhooks signature verified, replay protected, idempotent and reconciled with provider events. Failed DB writes return retryable error rather than pretending receipt processed.
- Quote/invoice amounts cannot be changed after acceptance/issue without proper revision/credit note.
- Refunds, payouts and provider-account changes have heightened role/approval.
- Accounting sync failure visible, retryable and never silently changes an invoice to 'paid'.

## Reliability and disaster recovery

- Database migration lifecycle with staged rollout, migration tests, backups, point-in-time recovery where available, restore drills.
- Worker queue retry/dead-letter and replay runbooks. Idempotent scheduled jobs and webhook processing.
- SLOs for critical read/write and sync, alerts on dropped intake, unpaid dispatch tasks, media sync backlog, document generation and overdue workflows.
- Every tenant owns exportable data and has a documented cancellation/portability path. Avoid unreasonable lock-in.

## Security acceptance tests [minimum]

1. Customer A and engineer A cannot read/update customer B data through IDs, joins, RPCs, signed URLs or exports.
2. An unauthorised engineer cannot issue invoice, update bank details or bypass compliance gate.
3. Every subcontractor link expires/revokes and exposes only designated job fields.
4. Invalid/incomplete webhook rejects/retries; duplicate webhook produces exactly one accounting effect.
5. Offline cached tenant A data does not appear after sign-in to tenant B; lost phone revocation tested.
6. Adversarial transcript/email can't induce cross-tenant export or pay/refund.
7. Failed access/unsafe work cannot be marked normal completed without required override and clear evidence.
8. All public source in imported `sitesentriq/` and reachable git history scanned for exposures; response signed off before launch.

## Ownership

Security acceptance isn't an optional QA checkbox. App engineering owns implementation, product owns business rules, customer success owns communications policies, finance owns invoice/payment reconciliation, qualified trade experts own statutory content and the repository owner approves changes to visibility or history.


---

# 11. Delivery roadmap, dependencies and actionable backlog

**Constraint:** development is already underway in parallel Claude branches. This is a proposed **integration and feature sequence**, not a reset plan and not a fixed calendar commitment. The first milestone is a safely reconciled build, not another mock-up.

## Phase 0: Continuity, protection and baseline [MUST DO]

**Goal:** know exactly what exists and stop accidental loss/exposure.

- Catalogue branches, worktrees, SHAs, open PRs, uncommitted changes, CI and expected integration direction.
- Audit PUBLIC Ardent repository containing private SiteSentriq snapshot. Report material exposure and permission/provenance recommendations.
- Validate `core`, `mobile`, `homepage` independently at baseline. Run builds/lint/typecheck and visible UI checks. Capture screenshots/short walkthrough; label mock data.
- Diff shared type contracts/tokens against mobile synced copies. Verify `sync-core.sh` process works under current branch layout.
- Create status matrix per feature and module with proof, blockers and overlap.
- Produce ADRs for branch integration, tenant auth and persistence; agree additive PR order before structural changes.

**Exit gate:** protected repository posture agreed, no untracked loss, documented canonical state, reproducible checks, first integration PR plan.

## Phase 1: One genuinely persistent end-to-end job [P0]

**Goal:** replace fake end-to-end data with one reliable job loop, keeping approved UI.

- Create tenant identity and membership with RLS-backed authorisation and seed/demo separation.
- Implement persistence through `ArdentClient` adapter for Customer/Site/Operator/Job, preserving Core contracts.
- Wire a job booked in Core to appear in Mobile, with correct assigned engineer and vice versa.
- Persist job statuses/clock/note/photo/material/signature to the same record, with audit and error handling.
- Build owner/office action surfaces for real current jobs rather than mock rows.
- Minimal mobile offline queue: durable note/photo/action, idempotent replay with clear sync status.

**Proof:** office creates job, engineer completes offline, regains signal, office sees exactly one correct state and evidence; second tenant cannot access it.

## Phase 2: Quote → job → invoice → payment status [P0]

- Price items/labour with integer-pence deterministic arithmetic and VAT.
- Quote revisions and customer approval; quote conversion to visit/job.
- Complete-job QA queue, invoice draft/approval/issue and status tracking.
- Accounting adapter or explicitly labelled manual status; no fake collection.
- Reconcile payment status via provider or authorised manual receipt with clear provenance.
- Revenue action queue: completed not invoiced, quotes waiting, overdue/blocked invoices.

**Proof:** one accepted quote through collected invoice in staging or deterministic provider sandbox, including failure and duplicate webhook cases.

## Phase 3: Operational strength and reuse [P1]

- Dispatcher conflict detection, qualifications, leave/availability, field/office messaging, missed access/returns and material stock requirements.
- SiteSentriq reuse slices: field/offline reliability, selected document versioning, account sync observability, applicable certificate templates.
- Company configuration/permission console, live sync diagnostics, customer portal (restricted).
- Reporting/exception engine with evidence and accurate metrics; field usability and device performance testing.

**Proof:** three pilot organisations complete realistic weeks with no lost evidence or cross-tenant data.

## Phase 4: AI assistants, Voice and automation [P1]

- Typed tool registry, policy engine, proposal/approval flows, audit and budgets.
- Field dictation -> editable structured work notes/materials; quality metrics.
- Inbound Voice for after-hours/overflow; safe escalation, real availability, tenant routing and consent.
- Quote and invoice follow-ups with approved message templates, opt-outs, quotas and stop conditions.
- Intelligence cards for profitability and operations, with source-linked evidence.

**Proof:** adversarial tests and human approval gates pass; no AI can issue certificates, promise nonexistent slots or send financial actions without permission.

## Phase 5: Sector expansion and Ardent deployment services [P2]

- Building-services portfolio features, multi-site contract SLAs, recurring maintenance, subcontractor procurement, enterprise reporting.
- Role-targeted Ardent Deployed integrations and Embedded tailored system options.
- Multi-company support console, migration tools, configurable trade modules, partner/agency APIs, more deployment options when warranted.

## Suggested issue/PR decomposition

| ID | Priority | Work item | Dependencies | Acceptance criteria |
|---|---|---|---|---|
| A-000 | P0 | Repo branch/worktree inventory + security publication review | None | Exact SHAs/changes documented; no secrets exposed in report; remediation options |
| A-001 | P0 | Core/Mobile contract drift checker | A-000 | CI fails on mismatched types/tokens; sync documented |
| A-002 | P0 | Auth/tenant data layer ADR and service skeleton | A-000 | Server-enforced permissions + role tests; no service key in client |
| A-003 | P0 | Real job repository implementing `ArdentClient` | A-002 | CRUD persists, versioned states, cross-tenant denial |
| A-004 | P0 | Mobile durable field mutation + media sync | A-001/A-003 | Kill/retry/duplicate tests pass, clear pending UI |
| A-005 | P0 | Cross-device job state and timestamps | A-003/A-004 | Core/mobile reflects actual status with no duplicate events |
| A-006 | P0 | Enquiries and customer/site linking | A-002 | Incoming captured + dedupe review + qualification and owner |
| A-007 | P0 | Quote revisions/approval and conversion | A-003/A-006 | Accepted revision immutable, booking created once |
| A-008 | P0 | Invoice draft/approval/issue | A-005/A-007 | VAT, fees, variations and audit work, no fake 'paid' |
| A-009 | P0 | Security regression suite and audit trail | A-002 through A-008 | Tenant, role, webhook and media tests |
| A-010 | P1 | Schedule conflict/skills engine | A-005 | Double-book and unqualified gates with override audit |
| A-011 | P1 | Revenue exceptions | A-006/A-008 | Every card maps to true records and actionable owner |
| A-012 | P1 | SiteSentriq extraction: offline/doc/versioning | A-000/A-004 | Provenance, new unit tests, no wholesale import |
| A-013 | P1 | Customer portal | A-005/A-007/A-008 | Scoped approved links, revocation, accessible flow |
| A-014 | P1 | Agent policy/action proposal and tool registry | A-009/A-011 | L0–L3 gates, audit, budget, stale approvals rejected |
| A-015 | P1 | Field voice documentation | A-004/A-014 | Edit-before-save, no invented materials, offline draft |
| A-016 | P1 | Voice phone intake | A-006/A-014 | Verified slots, consent, escalation and webhook dedupe |
| A-017 | P1 | Provider accounting, communication diagnostics | A-008/A-014 | Retry-safe sync, provider receipts/errors visible |
| A-018 | P2 | Contract/PPM/subbie/facilities features | Pilot evidence | Sector gates and scoped acceptance tests |
| A-019 | P1 | Homepage product-truth alignment | Current features/staging | No unshipped features portrayed as operational |

## 90-day PILOT shape [hypothesis, not project estimate]

**First 2–3 weeks:** branch/security baseline and technical reconciliation, scope pilot integration.  
**Next 3–5 weeks:** persistent vertical slice Core↔Mobile, offline evidence and job completion.  
**Next 3–4 weeks:** quote/invoice cycle and owner operational exceptions.  
**Final weeks:** usability, permissions, reliability, three controlled pilot customers and evidence gathering.  
**Note:** actual time depends on active builders, branch conflict, infrastructure decisions and provider access. Never tell the user features are 'ready' without demo/tests.

## Delivery rules for every agent

- Work from existing branch/worktree; coordinate before changing shared Core contracts; no force push or auto-merge.
- Small reviewable changes; avoid touching SiteSentriq original unless that is the explicit task.
- Preserve design and functional behaviour; if redesign is necessary, show before/after and reason.
- Every issue description includes user story, state/permission requirements, failure/offline cases, tests and rollback.
- Update `CHANGELOG`/PRD/ADR/contract docs as modules mature.
- Show code vs mock status and proof in each handoff; avoid 'complete' claims based solely on compilation.

## First most valuable engineering slice

After security/branch preflight, **make one real scheduled job flow from Core to Mobile, saved offline and back to the office with full evidence and verified tenancy**. This validates the product spine and creates the interface across which Revenue, Voice and Agents later plug in. Do not build another polished dashboard that still depends exclusively on mock data.


---

# 12. Quality, evaluation and commercial measurement

## Quality hierarchy

1. **Truthfulness of operational state**: no data loss, false billing, double payment, impossible booking or misleading AI completion.
2. **Security/permission correctness**: isolation and proof of who could do what.
3. **Worker usability**: ability to perform complete job in real field conditions.
4. **Reliability/performance**: offline, high volume, provider outage and recovery.
5. **Visual quality/accessibility**: true to existing design and usable for all roles.

## Test matrix by layer

| Layer | What to test | Examples / method |
|---|---|---|
| Domain/state | Allowed transitions and irreversible effects | Double taps, partial invoice, return visit, permit failure |
| Finance | Pence, VAT, rounding, partial settlement, adjustment | Table tests, provider test fixtures |
| Auth/RLS | Role/tenant boundaries | Direct API/RPC/storage negative tests |
| Mobile offline | crash, restart, reconnect, media replay | Real-device + flight mode + killed app |
| Schedule | timezones, DST, conflicting assignments | Property-based date tests; UK locale |
| Providers | retries, signatures, idempotency | Simulated timeout, duplicate/out-of-order webhook |
| AI extraction | speech note fidelity, uncertain part nos | Ground-truth annotated cases |
| AI tool use | prompt injection, wrong tenant, stale approval | Red-team and policy regression fixtures |
| UI | routes, empty/loading/error, accessibility | Browser and device interaction, not only snapshots |
| Migrations | integrity and rollback/read compatibility | Staging fixtures, schema assertions |
| Performance | representative datasets, median/slow devices | Instrumented cold/warm loads and network failures |

## End-to-end acceptance scenarios

### E2E-01 Real job cross-platform

Given owner creates booked gas-service job in Core, assigned engineer sees it in mobile; starts travel, arrives, adds note, photo, time and materials, signs off; office sees matching events and evidence with correct timestamps. All values come from persistent backend, not mocks. User A from other tenant cannot access.

### E2E-02 Offline durability

Engineer captures 15 notes and 20 photos offline; kills app; restarts after 8 hours; syncs on intermittent network. All 35 entries remain matched to job once, with original timestamps and correct media. Missing/failed sync visible; user can retry without duplication.

### E2E-03 Money accuracy

Quote with labour/material/discount/VAT accepted by customer, job completes with authorised variation, approved invoice issues and 2 partial payments confirm. Calculate exact pence, statuses and audit; duplicates no-ops; no optimistic paid state.

### E2E-04 Missed access

Engineer cannot get in; records reason/photo; trip not marked successful, attendance correctly attributed; office alerted and authorised rebooking; customer informed if policy permits.

### E2E-05 Unqualified or unsafe work

Expired credential and missing permit prevent restricted assignment/start; only defined legitimate overrides allowed with reason; no AI bypass; audit and alert.

### E2E-06 Voice phone with no slots

Customer calls after hours; Voice identifies correct trade and contact, finds no legitimate slots, promises none, records callback task and notifies office with source transcript. A second duplicate webhook creates no second job.

### E2E-07 Automation and disputed invoice

Follow-up workflow planned; client replies disputed; reminder task automatically suspended; no repetitive message; owner sees dispute and evidence.

### E2E-08 Tenant/link isolation

Client link belongs to one quote, expires, revoked upon decision. Cannot enumerate other quotes or reveal exact engineer coordinates. Repeat with URL mutation and API direct access.

### E2E-09 Failure/resilience

Accounting service 503, email delivery fail and model timeout happen during same job. Core records business facts, retains outbox, makes failures visible; prevents repeated charge/message and human can recover.

### E2E-10 Calendar edge cases

UTC timestamps from Core display UK local time, across BST/GMT change and late-night boundaries. Daily counts, invoice dates, schedules and certificate due dates do not drift by one day.

## Field usability sessions

Recruit at least one owner, one office scheduler and several working engineers from different trades; observe without coaching. Tasks: dispatch new call, locate prior job evidence, check in, log material, capture voice note, complete offline, review invoice. Track taps, abandoned steps, time, comprehension and errors. Test outdoors/daylight and slow/midrange phone. Ask 'What would you have done before Ardent?' to separate genuine saved work from novelty.

## Baseline and post-pilot outcome metrics

- Missed call/enquiry to first meaningful response (median/p90).
- Enquiry conversion to booked job, with channel attribution.
- Quote turnaround and acceptance rate by trade/service type.
- Completed-to-invoiced elapsed days/hours.
- Uninvoiced completed job value, by age and cause.
- Invoice payment days; due/overdue totals, accounting sync failures.
- Engineer admin minutes per job, manual double entries removed.
- Failed appointment/access rate and callout rework.
- Mobile sync success/p95 delay, unsynced media count, customer-reported missing records.
- Gross margin per job with honest allocation/uncertainty; don't mislabel cashflow as profit.
- AI metrics: extraction exactness, booking truthfulness, human escalation, unauthorised action attempts, operating cost per handled call and per approved action.

## Metrics guardrails

No invented 'hours saved'. Baseline the firm's current process with logs, surveys or time studies. Pilot cohort should use matched comparison periods and record seasonal effects and business changes. `Recovered revenue` requires clear causal definition. Sample KPIs in demos remain labelled illustration. The owner dashboard should allow users to inspect underlying records.

## Release and incident gates

- Define minimum supported device/browser and dependency versions.
- Run unit + integration + browser/device + security negative tests before PR ready.
- Feature flags support controlled rollouts and rollback; config changes audited.
- Monitor post-release for degraded sync, double sends, finance mismatch, model overbudget and excessive retries.
- Have incident playbooks for customer data leak, missed emergency call, wrong invoice, false status, lost offline media and credential compromise.
- Hold rollout on severity-one security or financial integrity issues, regardless of UI polish.

## Evidence in every PR

Provide: before/after behaviour, screenshots or screen recording, exact test commands/results, schema changes, RLS impact, performance impact, demo account/fixture, conflicts, feature flag and rollback path. Clearly distinguish what a test passed from what still lacks real-world verification.


---

# 13. Business model, pilots and Ardent managed delivery

## Business context [CONFIRMED USER DIRECTION]

Ardent is a premium AI infrastructure and technology company for real businesses. Trade businesses are an initial profitable vertical, especially plumbing/heating, electrical, building services and other operational companies. Buyers may prefer a fully deployed solution to maintaining software themselves. The service business is a feature: Ardent maps operations, integrates systems, trains staff, manages the platform, measures impact and continues improving it. Do not present it as a bargain CRM SaaS product with arbitrary silver/gold/platinum upsells.

## Offer architecture [PROPOSED]

**Ardent Core / Operations:** a subscription to dependable field + office operational software, configured by industry and role.  
**Ardent Deployed:** discovery, data migration, integrations, workflow configuration, AI agent provisioning, training and managed go-live.  
**Ardent Embedded:** custom workflows, technical lead/forward-deployed engineering, governance and long-term platform optimisation.  
**Ardent Voice / Agents:** usage-aware add-on or bundled outcome-based service for approved automation, with transparent provider cost and limitations.  
**Ardent Compute / Private:** bespoke hosting/compute/security for clients needing it, not a blanket default for plumbing firms.

Avoid separate codebases for every package. Services can use the same audited platform with configuration, adapters and optional custom modules.

## Pricing hypothesis (not validated, do not publish as final)

Previous strategy discussion proposed exploratory price bands: Core roughly **£299–£999/month**, Deployed roughly **£2,500–£10,000 setup plus £750–£2,500/month**, Embedded bespoke **£15,000+ setup and £3,000+/month**. These are example willingness-to-pay hypotheses, NOT market-verified prices or approved tariffs. Voice costs, call minutes, model usage, messages, mapping, payments, support SLA, storage, compliance/legal costs and delivery staff require a fully loaded margin model before offering customers.

For early customers consider high-touch deployment so the team observes workflows and proves the value. Avoid trying to close hundreds of low-usage accounts before the product spine is robust.

## First ICP and pilot criteria

**Pilot focus:** three UK plumbing/heating or adjacent operational firms, ideally 5–30 vans, at least one office/dispatcher, a measurable quote/invoice backlog, existing software/data to migrate or integrate, and owners willing to share baseline process metrics. Mix recurring maintenance and reactive emergency work to test both workflows. Do not claim recruitment or signed pilots unless verified.

**Selection criteria:** genuine operational pain, owner access, engineer buy-in, enough weekly job volume to test, accountable data controller and willingness to pilot without inappropriate reliance on unfinished AI safety features.

## Pilot offer and implementation playbook

1. **Discovery:** observe calls, dispatch, field day, quote approval, accounting and complaint flow. Map current tech stack and data ownership.
2. **Baseline:** missed enquiries, admin hours, quote cycle, unbilled completions, payment lag, satisfaction, provider spend and typical gross margin.
3. **Data plan:** create safe tenant, permission matrix, import/mapping plan and rollback path. Avoid live production secrets in demos.
4. **Minimum vertical slice:** one real job end-to-end with offline field evidence and accurate office invoice statuses.
5. **Training:** owner (exception dashboard), office (enquiry/dispatch and money), engineer (next job and evidence), finance (review/reconcile). Short scenario-based sessions.
6. **Shadow operations:** run parallel with old system for defined period when appropriate, reconcile discrepancies daily; no silent double billing.
7. **Controlled go-live:** limited users/jobs first, support channel, incident handling and success metrics.
8. **Review:** weekly quantitative and qualitative check, prioritised fixes, customer decision to expand.
9. **Expansion:** Voice, agents and automation only after core data reliability, permissions and human approvals proven.
10. **Operational partnership:** monitoring, configuration, periodic process review and measured improvement.

## Sales narrative

**Before Ardent:** missed calls, scattered notes, engineer paperwork, uncertain job profit, invoicing delays and office chasing.  
**With Ardent:** jobs captured, properly assigned, documented once, ready to invoice and easy to understand, with explicit accountable automation.

Do not promise zero admin, autonomous compliance, guaranteed revenue gain or a live feature that is still simulated. Demonstrate the exact workflow using a realistic customer story rather than generic 'AI will revolutionise your business'.

## Packaging and trust

- Transparent deployment responsibility, provider usage and support.
- Clear data ownership/export and no opportunistic lock-in.
- Distinguish software subscription, managed support and custom engineering.
- Written approval boundaries for automated calls/messages, payment actions, provider account changes and certificate production.
- Product access by useful business needs rather than arbitrary seat paywalls that defeat field adoption (commercial hypothesis; validate economics).

## Unit economics / operating model questions

What is the real cost per inbound voice minute? What percentage of calls needs a human? How much engineer onboarding per site? Which API integrations require expensive vendor contracts? How many support hours for 20-van customer? Can product gross margin support Deployed/Embedded staffing? What failure/support response time is contractually promised? What is the acquisition path: direct sales, trade association/referrals, accounting partners, distributor channel? Record answers from pilot, don't invent them.

## Strategic growth

Stage 1 prove trades operation. Stage 2 expand to multi-trade, maintenance and property portfolio work. Stage 3 reuse Ardent's voice/agent/orchestration/compute toolkit with selected customers outside trades. This protects the broader AI infrastructure thesis while funding it through concrete, repeatable products and managed deployments.


---

# 14. Decision register, assumptions and unresolved questions

## Established decisions and constraints [CONFIRMED USER DIRECTION]

| ID | Decision / constraint | Consequence |
|---|---|---|
| D-01 | Ardent is a premium AI infrastructure/systems business, not merely trades CRM | Product must coexist with wider Voice/Agents/Compute/Private/Embedded services |
| D-02 | Target real, profitable operational businesses including plumbing, heating, electrical and other trades | Use realistic job and finance workflows |
| D-03 | Worker-first: fast, minimal paperwork, no jargon or bloated interfaces | Mobile workflow must be exceptionally simple |
| D-04 | Keep established Ardent visual identity and coherent, premium design | Do not casually switch logos or copy Haumea styling |
| D-05 | User welcomes reuse of SiteSentriq parts; products do not have to stay rigidly separate | Extract useful components after safety and dependency review |
| D-06 | Claude is actively building Ardent now | Additive integration, no destructive reset or overwrite |
| D-07 | Handover must contain complete vision, PRD, roadmap and detailed operating insight | This pack is a living source for project planning |

## Repository facts [REPO-OBSERVED, check current branch HEAD]

| ID | Fact | Implication |
|---|---|---|
| R-01 | Core implementation on separate Claude branch, with dark tokens and mock data | Don't claim persisted app before adapter/backend is verified |
| R-02 | Mobile implementation on separate Claude branch, uses shared Core contracts and mock data | Contract-first integration; field device QA required |
| R-03 | Homepage on separate Claude branch | Preserve current branded work; avoid automatic redesign |
| R-04 | SiteSentriq source imported into Ardent public repository; original private | Exposure review P0 and selective reuse only |
| R-05 | Core owns type/client/token contracts, Mobile has sync script | Choose canonical ownership/migration deliberately |
| R-06 | Current combined JobStatus includes invoice/paid | Eventual lifecycle split may be prudent, but not a blind breaking change |
| R-07 | SiteSentriq docs mark AI copilot planned rather than implemented | New Ardent agents should not assume existing agent back-end |

## Proposed decisions pending technical/product review

| ID | Proposal | Reason | Acceptance prerequisite |
|---|---|---|---|
| P-01 | First sellable version is end-to-end Core + Field + invoice/revenue visibility | Proves daily value, leverages existing prototypes | Reality check of active branches and pilot need |
| P-02 | Supabase/Postgres with tenant RLS as shared data source | Fits SiteSentriq experience | ADR evaluating existing Ardent backend decision |
| P-03 | Split job, quote, invoice and payment state machines | Avoid conflicting financial semantics | Migration compatibility/tests |
| P-04 | Typed AI tools and L0–L3 action policies | Safety and repeatability | Security design and evaluation suite |
| P-05 | Offline durable write queue as launch gate | Protects engineers and evidence | Device tests, model/storage choices |
| P-06 | Revenue Engine after real data integration, Voice after approvals | Fast measurable return with control | Pilot data and provider economics |
| P-07 | Selective reuse of SiteSentriq doc/queue/accounting logic | Faster engineering, avoid FM bloat | Provenance/dependency/security tests |
| P-08 | Pilot three UK firms with 5–30 vans | Focus iteration and measure benefit | Customer recruitment and commercial validation |
| P-09 | Offer pricing bands are preliminary hypotheses | Commercial planning only | Costs, buyer interviews, competition |

## Open technical questions for next agent (do not block safe inventory)

1. What changed in each active Claude branch after the 18 October connector snapshot? Are there active PRs or uncommitted local changes?
2. Does Ardent already have a newer backend or authenticated tenant implementation not in the inspected branches?
3. Which branch is canonical for integration and what is the PR dependency graph?
4. Is Ardent intended to be public and was publication of the private SiteSentriq source authorised? What exposure, if any, has occurred?
5. Which existing SiteSentriq modules are portable without importing its entire Supabase schema/edge-function tree?
6. Is the shared Core client contract about to change, and does mobile sync still match current owners?
7. Which providers for phone/SMS, accounting and payment have been commercially chosen or credentialled?
8. What are the user's exact MVP release criteria, deployment targets and target UK customer contracts? Avoid inventing answers.
9. Which roles need supported offline operation vs online-only approvals?
10. Which regulatory certificate templates have been verified by qualified professionals?
11. What default retention/call consent and location-sharing policies are appropriate for pilot firms?
12. How will the platform distinguish real outcomes from test/demonstration activity in UI and reporting?

## Known tensions and how to resolve

**The light UI concept vs current dark Core:** maintain current dark tokens; use the montage for *features/layout inspiration only*.  
**SiteSentriq is feature rich vs Ardent mobile simplicity:** reuse infrastructure, not unnecessary FM menus.  
**AI autonomy vs trust:** side-effect policy, previews, consent, auditable human sign-off.  
**Fast launch vs safety:** avoid launching real payments/regulated certificates until correct provider and evidence flow proven.  
**Broad infrastructure ambition vs focused product:** use the trades vertical as the first commercial proving ground, architecture modular enough for later industries.  
**Different Claude branches vs 'one package':** document one product vision but make branch integration a planned, controlled change.

## Change control

Future modifications should add a dated decision entry with author, reason, affected modules, tests, migration risk and approval. If an existing repo implementation contradicts this handover, record conflict rather than silently overriding it. If the user has already approved a decision in another active Claude session, that latest explicit approval supersedes an unapproved proposal in this package.

## Handover completion criteria

Agent reports a coherent product map, exact branch status, security risks, safe integration plan, first additive PR scope, tests and outstanding human decisions. The pack is useful only if it **reconciles with code**. Treat attractive descriptions without working evidence as ideas, not shipped product.
