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
