---
title: Contracts & SLAs
description: Set response and fix targets per contract, track breaches automatically, and total service credits.
---

# Contracts & SLAs

A **contract** records your service agreement with a client. On top of it you can set
**SLA targets** — and the system then tracks them on every job automatically.

## Setting SLA targets

1. Open a **contract** → the **Service levels (SLA)** section.
2. For each priority (low, medium, high, urgent), set:
   - **Respond (min)** — how long you have to attend.
   - **Fix (min)** — how long you have to resolve.
   - **Credit / breach (£)** — the service credit owed if you miss it.
3. Save.

## How targets get onto jobs

When a job is created for that client (from anywhere — the office, a portal call-out, a
PPM plan, the mobile app), the matching contract's targets are **stamped onto the job at
that moment**. Those deadlines are frozen — editing the contract later never rewrites a
past job's targets, so they stand as evidence.

## Tracking on the job

The job header shows a live **SLA chip**:

- **On track** — within target, plenty of time.
- **At risk** — inside the last quarter of the window, with a countdown.
- **Response breached / Fix breached** — target missed.
- **SLA met** — completed within target.

"Response met" is detected automatically from real activity — engineer **arrival**, a
**QR proof-of-presence scan**, or job completion. You don't tick a box; the work does it.

## Service-credit summary

Back on the contract, the **Period performance** panel lets you pick a date range and see:

- **SLA jobs** in the period
- **Response breaches** and **Fix breaches**
- **Service credits accrued** (breaches × the credit-per-breach you set)

This is the "deductions" number FM clients ask for — produced automatically instead of by
hand.
