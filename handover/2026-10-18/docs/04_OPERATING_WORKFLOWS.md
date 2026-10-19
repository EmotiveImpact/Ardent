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
