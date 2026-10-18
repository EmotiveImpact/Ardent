# Ardent Claude Handoff Addendum

Version 0.2 | 18 October 2026 | Draft for review

## Purpose and authority

Use this addendum alongside **Ardent-Intelligence-Operating-Framework-v0.2.md**. Turn that framework into a small, testable implementation plan within the existing Ardent codebase. Preserve real code and working product behaviour. Do not restart the project or replace established components solely to match a preferred stack.

This review draft grants no blanket policy approval, production access, deployment or merge authority. Resolve consequential decisions before dependent implementation.

## Establish the implementation baseline

Repository: https://github.com/EmotiveImpact/Ardent

The supplied source-reviewed branch map is:

- Core: `claude/project-thread-cunjer` — observed commit `42f8ced`
- Mobile: `claude/project-thread-kbo579` — observed commit `340f73b`
- Homepage: `claude/project-thread-jpboda` — observed commit `d65546d`
- SiteSentriq: `claude/project-thread-vzm2xt` — observed commit `944327b`

Verify repository, exact branches and current heads before implementation; record differences from reviewed commits. Do not guess missing references or merge automatically.

ArdentClient currently uses mock data, not a live backend. Inspect contracts, fixtures, tests and SiteSentriq dependencies before proposing integration. Keep homepage work separate unless needed.

Inventory contracts, mocks and enforcement gaps.

## Preserve the five package structure

Core covers business operations, customers, jobs, scheduling and finance; its office interface is descriptive, not a separate product. Field covers engineer mobile and offline work. Voice covers intelligent call handling, enquiries and bookings. Agents covers business automation, approvals and intelligent assistants. Intelligence covers revenue, profitability and operational insights. Shared, unnamed infrastructure underpins all five. Core is not merely that backend. Agents orchestrates permitted workflows; Intelligence analyzes sourced records. Model services may be shared.

Evaluate SiteSentriq reuse before replacement. Sequence the roadmap from the first reliable slice to Voice handling, broader Agents workflows and Intelligence insights, preserving package boundaries.

For calls: Voice optionally retains authorized audio in private object storage only after applicable notice or consent and retention decisions. Recording and transcription are separate choices. Create a source-linked transcript, summary and customer or unresolved-caller enquiry record; Core routes it to staffed operations; Agents proposes or executes authorized workflow; Field receives assignments and returns evidence; Intelligence produces sourced insights. Resolve unknown callers without cross-customer disclosure. Suggested availability and callback requests are not confirmed bookings: confirm only after the scheduling transaction succeeds, and reconcile unknown outcomes.

## First delivery boundary

Implement one vertical slice: Field spoken job update → human review → validated completion → Core office invoice DRAFT.

A worker captures a permitted job update. Extraction produces an evidence-linked draft; a human reviews it. Server checks validate evidence, state and qualified sign-off. Core receives an invoice draft using approved commercial inputs.

Do not add invoice sending, payment collection, autonomous dispatch or general customer messaging to this slice. Customer acknowledgement must remain separate from qualified technical or safety sign-off. The model cannot supply a missing professional certification.

## Module contracts

Keep contracts provider-independent and adapt existing interfaces.

1. **Bounded context:** authenticated actor, tenant, task, permitted record identifiers, record versions, policy version and minimum relevant evidence. Retrieval must authorize before returning content. Include provenance and reported, verified or inferred status. Exclude unrelated commercial or personal information.
2. **Typed proposal:** proposed report fields or action, target records, evidence references, unresolved items and expected versions. Validate against a schema. Treat transcripts, attachments and tool results as untrusted data; embedded instructions cannot change permissions or policies.
3. **Validated command:** a server-owned command gateway independently checks identity, tenant scope, role, schema, business constraints, evidence gates, approval and current state. Reject stale versions and unauthorized transitions. Model confidence is not authorization.
4. **Event and audit:** persist the accepted transition and durable outbox event atomically. Record actor, source, command identifier, relevant versions, approval and observed execution result. Consumers deduplicate using stable identifiers. Protect audit history from ordinary editing without storing unnecessary raw content or private model reasoning.

Keep Core and Field on the same authoritative job model. Distinguish visits, reports, jobs and drafts; visit completion must not close unresolved jobs.

## Execution and memory safeguards

Bind approvals to the tenant, approver, exact action, targets, material input digest, relevant versions, expiry and allowed use. Recheck permission at execution. Changes to material evidence, scope, destination, amount or state require renewed review; approval for a draft does not permit sending.

Use stable idempotency keys and explicit attempt states. Retry transient failures with bounded backoff. An external timeout may mean the action succeeded: reconcile by provider reference or read-back before retrying. If the result cannot be established, pause for review and display “outcome unknown.” Never claim universal exactly-once delivery.

Scope memory to tenant, site, job or user. Store provenance, access scope, timestamps, verification status and retention class. Corrections must supersede incorrect information and invalidate derived summaries and caches. Do not turn a model inference into a verified business fact. Apply tenant boundaries to database access, retrieval, cached data, attachments and background workers.

## Acceptance evidence required

Provide executable tests and recorded results against the implementation commit, using non-production fixtures:

- Cross-tenant record and attachment requests disclose nothing.
- A stale report or expired approval cannot complete a job.
- Injected instructions in a transcript cannot expand access or trigger export.
- Duplicate events and concurrent workers cannot create duplicate invoice drafts.
- An uncertain external outcome enters reconciliation, not blind retry or false success.
- An unclear quantity stays unresolved and blocks dependent validation where required.
- An offline edit cannot silently overwrite newer server data or replay stale approval.
- Customer acknowledgement cannot satisfy a qualified sign-off requirement.
- A successful reviewed flow creates the Core office draft with traceable inputs and no sending or payment side effects.

Include test commands, outcomes, limitations and a walkthrough. Identify unimplemented scenarios; mocked success is not production evidence.

## Decisions and review checkpoint

Authentication, model provider, offline-sync design, retention periods and final infrastructure remain open. TypeScript API, Neon Postgres, private S3-compatible storage and a durable queue are proposed options, not migration instructions. Confirm pilot job category, required evidence, reviewer roles and commercial source of truth first.

Present changes, reuse decisions, unresolved choices, tests and rollback before dependent implementation. Preserve current behaviour; migrations and deployment need appropriate approval.
