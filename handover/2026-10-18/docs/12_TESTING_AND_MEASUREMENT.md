# 12. Quality, evaluation and commercial measurement

## Quality hierarchy

1. **Truthfulness of operational state**: no data loss, false billing, double payment, impossible booking or misleading AI completion.
2. **Security/permission correctness**: isolation and proof of who could do what.
3. **Worker usability**: ability to perform complete job in real field conditions.
4. **Reliability/performance**: offline, high volume, provider outage and recovery.
5. **Visual quality/accessibility**: true to existing design and usable for all roles.

## Test matrix by layer

| Layer | What to test | Examples / method |
|---|---|---|
| Domain/state | Allowed transitions and irreversible effects | Double taps, partial invoice, return visit, permit failure |
| Finance | Pence, VAT, rounding, partial settlement, adjustment | Table tests, provider test fixtures |
| Auth/RLS | Role/tenant boundaries | Direct API/RPC/storage negative tests |
| Mobile offline | crash, restart, reconnect, media replay | Real-device + flight mode + killed app |
| Schedule | timezones, DST, conflicting assignments | Property-based date tests; UK locale |
| Providers | retries, signatures, idempotency | Simulated timeout, duplicate/out-of-order webhook |
| AI extraction | speech note fidelity, uncertain part nos | Ground-truth annotated cases |
| AI tool use | prompt injection, wrong tenant, stale approval | Red-team and policy regression fixtures |
| UI | routes, empty/loading/error, accessibility | Browser and device interaction, not only snapshots |
| Migrations | integrity and rollback/read compatibility | Staging fixtures, schema assertions |
| Performance | representative datasets, median/slow devices | Instrumented cold/warm loads and network failures |

## End-to-end acceptance scenarios

### E2E-01 Real job cross-platform

Given owner creates booked gas-service job in Core, assigned engineer sees it in mobile; starts travel, arrives, adds note, photo, time and materials, signs off; office sees matching events and evidence with correct timestamps. All values come from persistent backend, not mocks. User A from other tenant cannot access.

### E2E-02 Offline durability

Engineer captures 15 notes and 20 photos offline; kills app; restarts after 8 hours; syncs on intermittent network. All 35 entries remain matched to job once, with original timestamps and correct media. Missing/failed sync visible; user can retry without duplication.

### E2E-03 Money accuracy

Quote with labour/material/discount/VAT accepted by customer, job completes with authorised variation, approved invoice issues and 2 partial payments confirm. Calculate exact pence, statuses and audit; duplicates no-ops; no optimistic paid state.

### E2E-04 Missed access

Engineer cannot get in; records reason/photo; trip not marked successful, attendance correctly attributed; office alerted and authorised rebooking; customer informed if policy permits.

### E2E-05 Unqualified or unsafe work

Expired credential and missing permit prevent restricted assignment/start; only defined legitimate overrides allowed with reason; no AI bypass; audit and alert.

### E2E-06 Voice phone with no slots

Customer calls after hours; Voice identifies correct trade and contact, finds no legitimate slots, promises none, records callback task and notifies office with source transcript. A second duplicate webhook creates no second job.

### E2E-07 Automation and disputed invoice

Follow-up workflow planned; client replies disputed; reminder task automatically suspended; no repetitive message; owner sees dispute and evidence.

### E2E-08 Tenant/link isolation

Client link belongs to one quote, expires, revoked upon decision. Cannot enumerate other quotes or reveal exact engineer coordinates. Repeat with URL mutation and API direct access.

### E2E-09 Failure/resilience

Accounting service 503, email delivery fail and model timeout happen during same job. Core records business facts, retains outbox, makes failures visible; prevents repeated charge/message and human can recover.

### E2E-10 Calendar edge cases

UTC timestamps from Core display UK local time, across BST/GMT change and late-night boundaries. Daily counts, invoice dates, schedules and certificate due dates do not drift by one day.

## Field usability sessions

Recruit at least one owner, one office scheduler and several working engineers from different trades; observe without coaching. Tasks: dispatch new call, locate prior job evidence, check in, log material, capture voice note, complete offline, review invoice. Track taps, abandoned steps, time, comprehension and errors. Test outdoors/daylight and slow/midrange phone. Ask 'What would you have done before Ardent?' to separate genuine saved work from novelty.

## Baseline and post-pilot outcome metrics

- Missed call/enquiry to first meaningful response (median/p90).
- Enquiry conversion to booked job, with channel attribution.
- Quote turnaround and acceptance rate by trade/service type.
- Completed-to-invoiced elapsed days/hours.
- Uninvoiced completed job value, by age and cause.
- Invoice payment days; due/overdue totals, accounting sync failures.
- Engineer admin minutes per job, manual double entries removed.
- Failed appointment/access rate and callout rework.
- Mobile sync success/p95 delay, unsynced media count, customer-reported missing records.
- Gross margin per job with honest allocation/uncertainty; don't mislabel cashflow as profit.
- AI metrics: extraction exactness, booking truthfulness, human escalation, unauthorised action attempts, operating cost per handled call and per approved action.

## Metrics guardrails

No invented 'hours saved'. Baseline the firm's current process with logs, surveys or time studies. Pilot cohort should use matched comparison periods and record seasonal effects and business changes. `Recovered revenue` requires clear causal definition. Sample KPIs in demos remain labelled illustration. The owner dashboard should allow users to inspect underlying records.

## Release and incident gates

- Define minimum supported device/browser and dependency versions.
- Run unit + integration + browser/device + security negative tests before PR ready.
- Feature flags support controlled rollouts and rollback; config changes audited.
- Monitor post-release for degraded sync, double sends, finance mismatch, model overbudget and excessive retries.
- Have incident playbooks for customer data leak, missed emergency call, wrong invoice, false status, lost offline media and credential compromise.
- Hold rollout on severity-one security or financial integrity issues, regardless of UI polish.

## Evidence in every PR

Provide: before/after behaviour, screenshots or screen recording, exact test commands/results, schema changes, RLS impact, performance impact, demo account/fixture, conflicts, feature flag and rollback path. Clearly distinguish what a test passed from what still lacks real-world verification.
