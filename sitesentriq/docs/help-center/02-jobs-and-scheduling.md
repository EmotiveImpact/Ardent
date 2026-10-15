---
title: Jobs & scheduling
description: Create and assign jobs, use the scheduler, track job status, and see the engineer's field record.
---

# Jobs & scheduling

A **job** is a unit of work at a property — a reactive call-out, a PPM visit, or a service.

## Creating a job

1. Go to **Jobs → New job** (or raise one from a quote, a compliance item, or a portal call-out).
2. Pick the property, give it a title and description, set a **priority** and **service group**.
3. Optionally flag it as [permit-to-work](./06-permits-to-work.md) or out-of-hours.
4. Save. The job gets a human-readable number like **H-101**.

When you create a job, the system automatically:
- Stamps **SLA deadlines** on it if the client has a [contract with SLA targets](./05-sla-and-contracts.md).
- Generates it from a maintenance plan, if it's a PPM job (fixed or rolling schedule).

## Assigning the work

- **Engineers** — assign one or more engineers (crews are supported). Open the job and
  use the engineer assignment panel.
- **Subcontractors** — use the **Subcontractor** panel. If the subcontractor isn't
  compliant, the assignment is blocked — see [Subcontractors](./04-subcontractors.md).

## The scheduler

**Scheduler** gives you a drag-and-drop calendar. Drag a job onto an engineer and a time
slot; the scheduler respects engineer availability and time windows.

## Job status

Jobs move through a status workflow — for example: *pending → scheduled → in progress →
performed → contractor review → completed* (plus *failed access*, *cancelled*, etc.).
You can filter the jobs list by status, change status in bulk, and the status drives KPIs.

> A job flagged **permit-to-work** can't move to *in progress* until a permit is issued.

## Parent & child tasks

If a visit turns up a defect, you can raise a follow-up (a defect quote or a child job)
linked to the original — so the remedial work traces back to where it was found.

## The field record

Once an engineer works the job on the [mobile app](./10-mobile-app.md), the job page shows:
- **Engineer notes** and **parts/materials** used (with line totals).
- A **timeline** of on-site activity — travel, arrival, QR check-in ("proof of presence"),
  work, signature.
- Photos, signatures, and any completed certificates.

## Customer ETA link

You can send the customer a **live tracking link** so they can see "your engineer is on
the way" with an ETA window — no login required for them.
