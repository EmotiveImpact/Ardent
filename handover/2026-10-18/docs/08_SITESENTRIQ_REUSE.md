# 08. Selective reuse from SiteSentriq (Haumea)

## Decision

**CONFIRMED USER DIRECTION:** The user is happy for Ardent to reuse parts of SiteSentriq and does not need a strict product separation. The objective is to accelerate Ardent, not copy every part of a different product. Both repositories are controlled in the same GitHub account, but Ardent's public visibility makes reuse governance urgent.

## Evidence from SiteSentriq docs [REPO-OBSERVED]

`FEATURES.md` and `README.md` describe multi-tenant facilities software with jobs, scheduling, clients/properties/assets, compliance, PPM, quotes, invoicing, Xero/QuickBooks integrations, document versions, customer portal and field mobile. `ENGINEER_APP.md` describes actual mobile↔web data mappings and tracking. `MOBILE_PRODUCT_VISION.md` contains worker-first user journeys. Source/README assert Supabase RLS, offline queue and mobile delivery. Claims are not independently audited in this handover.

- Private source: https://github.com/EmotiveImpact/SiteSentriq
- Imported snapshot (public Ardent): https://github.com/EmotiveImpact/Ardent/tree/claude/project-thread-vzm2xt/sitesentriq
- Core feature map: `sitesentriq/FEATURES.md`
- Field engineering notes: `sitesentriq/ENGINEER_APP.md`, `sitesentriq/MOBILE_PRODUCT_VISION.md`
- Security notes: `sitesentriq/SECURITY.md`
- Positioning: `sitesentriq/docs/POSITIONING.md`

## Reuse decision matrix

| Capability | SiteSentriq candidate | Recommendation for Ardent | Risk / conditions |
|---|---|---|---|
| Organisation/tenant patterns | PostgreSQL, RLS, roles | **Study / adapt** | Never copy grants blindly; new role semantics |
| Customers/sites/assets | Portfolio hierarchy | **Adapt strongly** | Simplify defaults for domestic trade workflows |
| Job/visit scheduling | Calendar, assignments, states | **Reuse patterns and tested logic** | Current Ardent Core model differs; map carefully |
| Field note/photos/time/signature | Expo mobile + backend contracts | **Selective reuse** | Expo SDK, React and schema divergence; sync reliability audit |
| Offline durable queue | Replay/idempotency queue | **High-value extract candidate** | Retest device/storage and per-tenant keys |
| Quotes/invoices | Documents, lines, accounting sync | **Selective reuse** | Tax/refund/approval semantics and duplicate issue risk |
| Certificates/safety workflows | CP12/EICR/LOLER/fire/RAMS/PTW | **Adapt as modules** | Competent engineer legal review; avoid false certifications |
| Subcontractor invite + gating | Document checks/no-login links | **Adapt for P1** | Scope access, expiry, abuse prevention |
| PPM and service renewals | Recurrence and auto jobs | **Reuse scheduling logic later** | Different tenancy and trade schedule rules |
| Customer portal | Portfolio and booking views | **Reuse UX/workflow ideas** | Simplify customer experience; test token scopes |
| SLA engine | Contract targets + credits | **Reuse selectively for B2B** | Too complex for domestic MVP; contractual accuracy |
| Document storage/versioning | Private buckets, versions, exports | **Strong candidate** | Retention, attachment ownership, signed URL expiry |
| Accounting sync log/retry | Provider errors and recoverable status | **High-value candidate** | New provider credentials, external ID semantics |
| Dashboard/report builder | Composable panels, reports | **Inspiration / selected components** | Avoid importing full CAFM dashboard density |
| Golden thread building pack | Building Safety Act exports | **Defer for non-FM trades MVP** | Sector-specific complexity/legal claims |
| Public trust score / tender pack | FM-specific differentiator | **Defer** | Different buyer expectations |
| AI compliance copilot | Docs explicitly mark unbuilt | **Do not assume reusable feature exists** | Concept only; build separately behind policies |
| Brand/visual style | Orange/navy Haumea theme | **Do not copy** | Ardent owns dark/ember design tokens |

## Technical due diligence before extracting code

1. Identify exact file/module, dependencies, data tables, database functions/triggers and tests. Beware of copying a hook that relies on dozens of RLS policies and edge functions.
2. Determine licensing/attribution/third-party asset rights, and whether any source is intended to remain private. Preserve commit source attribution and licence notes.
3. Review security assumptions: tenant identifiers, storage paths, privileged endpoints, signed links, service-role use, auth bypass/fail-open, location sharing and data exports.
4. Map domain semantics explicitly (FM property/contract/asset vs domestic customer/site/job). Prefer adapters to renaming underlying SiteSentriq tables haphazardly.
5. Compare frameworks and package versions. Current Ardent Mobile uses Expo 58; SiteSentriq's prior mobile docs refer to Expo 54. Native modules, migrations and dependency drift must be tested.
6. Characterise existing functionality with tests before porting. Include regressions for duplicate sync, lost photo, multi-tenant access, attachments and provider retry.
7. Extract a cohesive unit into an Ardent-owned module with typed interfaces and comprehensive acceptance tests. Do not make Ardent runtime depend on imported whole `sitesentriq/` application.

## Proposed first reuse slices

**Slice R1: customer/site/asset reference model**, but only once Core owner approves field mapping. Outcome: engineering app can retrieve legitimate service history and address safely.  
**Slice R2: offline write queue and evidence capture**, starting from existing Ardent mobile gaps; the highest field reliability value.  
**Slice R3: invoice sync status/retry and document metadata**, only after provider integration decisions.  
**Slice R4: sector-specific certificates, PPM and subcontractor gates** when pilot needs prove demand.

## Acceptance bar for reuse

- A specific user problem is solved and no duplicate implementation left behind.
- Independently testable and maintainable without importing unrelated FM infrastructure.
- No leaked private config, production data, embedded credentials or proprietary dependencies beyond permissions.
- Existing Ardent Core UI, shared contracts and mobile modes remain working.
- Cross-tenant and offline tests pass; file provenance documented.
- PR names origin, licences, notable semantic deviations and operational risks.

## SiteSentriq relationship options (decision deferred)

(a) Reference/import selected code, (b) shared independently versioned packages, (c) expose public API to integrate a running SiteSentriq installation. All are technically viable; choose by ownership and stability. The user does not demand corporate/product separation, so avoid organisational theory debates. Implement the lowest-friction option with clear build boundaries and source security.
