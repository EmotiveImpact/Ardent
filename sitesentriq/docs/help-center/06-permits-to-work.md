---
title: Permits to work
description: Flag high-risk jobs as permit-to-work, request and issue permits, and block work until a permit is in place.
---

# Permits to work

For high-risk work (hot works, confined space, working at height, electrical isolation,
roof access, excavation), SiteSentriq can **stop a job from starting until a permit is
issued** — enforced in the database, not just on screen.

## Flagging a job

Mark a job as permit-to-work either:

- on the **New job** form (the *Permit to work* checkbox), or
- on the job's **Permit to work** panel (the *Requires permit* toggle).

Only an **admin or scheduler** can set or clear this flag.

## The permit lifecycle

A permit moves through: **requested → issued → active → closed** (or cancelled / rejected).

1. **Request** — anyone on the job (or the engineer from the field) can request a permit
   of a given type, optionally linking an approved RAMS.
2. **Issue** — an **admin or scheduler** issues it, adding conditions and validity dates.
3. **Active** — when the engineer starts the job, the issued permit becomes active
   automatically.
4. **Close** — once the work is done, close the permit.

## The gate

A job flagged permit-to-work **cannot move to *in progress* without an issued permit.**
If someone tries to start it (on web or on the mobile app), they get a clear message:
*"This job is flagged permit-to-work — issue a permit before starting work."*

## On the mobile app

The engineer's job screen shows a **permit banner**:

- *Permit to work: active / issued* — good to go.
- *Permit required — none issued. Check-in is blocked until the office issues one.*

If no permit exists, the engineer can tap **Request a permit** from the field and pick a
type. The office still issues it.

## Building handover

Issued permits are included in the property's
[Building Information Pack export](./07-building-pack.md).
