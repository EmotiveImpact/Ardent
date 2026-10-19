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
