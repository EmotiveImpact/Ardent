# 14. Decision register, assumptions and unresolved questions

## Established decisions and constraints [CONFIRMED USER DIRECTION]

| ID | Decision / constraint | Consequence |
|---|---|---|
| D-01 | Ardent is a premium AI infrastructure/systems business, not merely trades CRM | Product must coexist with wider Voice/Agents/Compute/Private/Embedded services |
| D-02 | Target real, profitable operational businesses including plumbing, heating, electrical and other trades | Use realistic job and finance workflows |
| D-03 | Worker-first: fast, minimal paperwork, no jargon or bloated interfaces | Mobile workflow must be exceptionally simple |
| D-04 | Keep established Ardent visual identity and coherent, premium design | Do not casually switch logos or copy Haumea styling |
| D-05 | User welcomes reuse of SiteSentriq parts; products do not have to stay rigidly separate | Extract useful components after safety and dependency review |
| D-06 | Claude is actively building Ardent now | Additive integration, no destructive reset or overwrite |
| D-07 | Handover must contain complete vision, PRD, roadmap and detailed operating insight | This pack is a living source for project planning |

## Repository facts [REPO-OBSERVED, check current branch HEAD]

| ID | Fact | Implication |
|---|---|---|
| R-01 | Core implementation on separate Claude branch, with dark tokens and mock data | Don't claim persisted app before adapter/backend is verified |
| R-02 | Mobile implementation on separate Claude branch, uses shared Core contracts and mock data | Contract-first integration; field device QA required |
| R-03 | Homepage on separate Claude branch | Preserve current branded work; avoid automatic redesign |
| R-04 | SiteSentriq source imported into Ardent public repository; original private | Exposure review P0 and selective reuse only |
| R-05 | Core owns type/client/token contracts, Mobile has sync script | Choose canonical ownership/migration deliberately |
| R-06 | Current combined JobStatus includes invoice/paid | Eventual lifecycle split may be prudent, but not a blind breaking change |
| R-07 | SiteSentriq docs mark AI copilot planned rather than implemented | New Ardent agents should not assume existing agent back-end |

## Proposed decisions pending technical/product review

| ID | Proposal | Reason | Acceptance prerequisite |
|---|---|---|---|
| P-01 | First sellable version is end-to-end Core + Field + invoice/revenue visibility | Proves daily value, leverages existing prototypes | Reality check of active branches and pilot need |
| P-02 | Supabase/Postgres with tenant RLS as shared data source | Fits SiteSentriq experience | ADR evaluating existing Ardent backend decision |
| P-03 | Split job, quote, invoice and payment state machines | Avoid conflicting financial semantics | Migration compatibility/tests |
| P-04 | Typed AI tools and L0–L3 action policies | Safety and repeatability | Security design and evaluation suite |
| P-05 | Offline durable write queue as launch gate | Protects engineers and evidence | Device tests, model/storage choices |
| P-06 | Revenue Engine after real data integration, Voice after approvals | Fast measurable return with control | Pilot data and provider economics |
| P-07 | Selective reuse of SiteSentriq doc/queue/accounting logic | Faster engineering, avoid FM bloat | Provenance/dependency/security tests |
| P-08 | Pilot three UK firms with 5–30 vans | Focus iteration and measure benefit | Customer recruitment and commercial validation |
| P-09 | Offer pricing bands are preliminary hypotheses | Commercial planning only | Costs, buyer interviews, competition |

## Open technical questions for next agent (do not block safe inventory)

1. What changed in each active Claude branch after the 18 October connector snapshot? Are there active PRs or uncommitted local changes?
2. Does Ardent already have a newer backend or authenticated tenant implementation not in the inspected branches?
3. Which branch is canonical for integration and what is the PR dependency graph?
4. Is Ardent intended to be public and was publication of the private SiteSentriq source authorised? What exposure, if any, has occurred?
5. Which existing SiteSentriq modules are portable without importing its entire Supabase schema/edge-function tree?
6. Is the shared Core client contract about to change, and does mobile sync still match current owners?
7. Which providers for phone/SMS, accounting and payment have been commercially chosen or credentialled?
8. What are the user's exact MVP release criteria, deployment targets and target UK customer contracts? Avoid inventing answers.
9. Which roles need supported offline operation vs online-only approvals?
10. Which regulatory certificate templates have been verified by qualified professionals?
11. What default retention/call consent and location-sharing policies are appropriate for pilot firms?
12. How will the platform distinguish real outcomes from test/demonstration activity in UI and reporting?

## Known tensions and how to resolve

**The light UI concept vs current dark Core:** maintain current dark tokens; use the montage for *features/layout inspiration only*.  
**SiteSentriq is feature rich vs Ardent mobile simplicity:** reuse infrastructure, not unnecessary FM menus.  
**AI autonomy vs trust:** side-effect policy, previews, consent, auditable human sign-off.  
**Fast launch vs safety:** avoid launching real payments/regulated certificates until correct provider and evidence flow proven.  
**Broad infrastructure ambition vs focused product:** use the trades vertical as the first commercial proving ground, architecture modular enough for later industries.  
**Different Claude branches vs 'one package':** document one product vision but make branch integration a planned, controlled change.

## Change control

Future modifications should add a dated decision entry with author, reason, affected modules, tests, migration risk and approval. If an existing repo implementation contradicts this handover, record conflict rather than silently overriding it. If the user has already approved a decision in another active Claude session, that latest explicit approval supersedes an unapproved proposal in this package.

## Handover completion criteria

Agent reports a coherent product map, exact branch status, security risks, safe integration plan, first additive PR scope, tests and outstanding human decisions. The pack is useful only if it **reconciles with code**. Treat attractive descriptions without working evidence as ideas, not shipped product.
