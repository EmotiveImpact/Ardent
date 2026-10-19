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
