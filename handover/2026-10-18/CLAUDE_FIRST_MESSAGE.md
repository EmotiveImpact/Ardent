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
