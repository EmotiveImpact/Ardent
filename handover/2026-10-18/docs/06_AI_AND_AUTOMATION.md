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
