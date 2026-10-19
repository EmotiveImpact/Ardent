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
