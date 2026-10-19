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
