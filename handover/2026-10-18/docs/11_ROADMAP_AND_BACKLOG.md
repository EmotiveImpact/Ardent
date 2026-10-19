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
