# Haumea Updates V1 — build plan

Source: customer feedback doc *"Haumea Updates -V1"* (Irish FM operator). This
plans every item into data-model + scope + steps + effort, so it can be
prioritised before any code is written.

**Screenshot note:** the lighter screenshots (Portfolio summary, Compliance
Score) are **live Haumea**. The tan/beige screenshots (Task View with statuses
*Not ready / Pending external / Contractor review / Performed*, `T-04000`
numbers, "Service Group") are the customer's **current FSM tool**, shown as a
*reference* for what they want Haumea to replicate.

Effort key: **S** ≈ ≤½ day · **M** ≈ 1–3 days · **L** ≈ 1 week+.

## ✅ Progress (2026-06)

**Wave A complete — all applied to prod + verified:**
- **#2 Task numbers** — `H-101` per-org sequence + trigger + backfill (migration
  00097). Shown on web jobs list/detail + mobile. DONE.
- **#8 Client info** — primary contact (client) + on-site access manager phone +
  primary technician (property) (migration 00098). Forms + detail pages. DONE.
- **#6 Quote widgets** — Service Quotes + Defect Quotes dashboard widgets already
  existed (`DashboardQuoteTypeWidgets`). DONE (deploy delivers it).
- **#4 Service Group** — `jobs.service_group` (migration 00099) + SERVICE_GROUPS
  list + jobs-list column + new-job select. DONE (edit-on-existing-jobs is a
  small follow-up).

**Wave B complete — applied to prod + verified:**
- **#1 Status expansion** — added not_ready / ready / pending_external /
  contractor_review / performed / rejected (migration 00100); web chips, filter
  tabs, bulk options, detail dropdown + KPI filters; mobile status maps. DONE.
- **#3 Parent/child tasks** — jobs.parent_job_id (migration 00101) + a
  JobLinkedTasks card on the job detail (parent + sub-tasks + link control). DONE.
- **#5 Engineer management** — already fully built (engineers new/[id] CRUD +
  document management). DONE (deploy delivers it).

**Wave C complete — applied to prod + verified:**
- **#7 Property numbers + client billing** — auto `P-123` per-org numbers
  (migration 00102, trigger + backfill); client-level billing already existed.
  DONE.
- **#9 Compliance cert forms** — cert_completions table (00103) + templates
  (Fire&Alarm, Emergency Lighting, Extinguisher, Access Control); mobile capture
  (CertForm, offline-queued) + web review (JobCertForms). DONE.

**ALL 9 BACKLOG ITEMS COMPLETE.** Migrations 00097–00103 applied to prod.

### Gap-closing pass (finishing the partial items properly)
- **#4** — Service Group now editable on existing jobs: a job-detail editor + a
  bulk "Service Group" action + mobile JobCard display.
- **#9** — mobile CertForm gained an asset picker; certs now feed the
  customer-facing completion email ("Compliance checks completed" section).
- **#3** — the defect-quote→parent-task loop (migration 00104 quotes.job_id):
  "Raise quote from this job" prefills + links; convert→job sets parent_job_id.
- **#8** — wired the orphaned primary_contact_phone (name + number).
- **Tests** — added V1 feature contract tests (web 7, mobile 2) — statuses,
  service groups, cert templates. 248 tests total, all green.

### Remaining (genuinely needs YOU, or is lower-value)
- **#1 status semantics** — current behaviour: `performed`/`rejected` are
  "closed" (excluded from open/overdue KPIs); only `completed` fires the
  customer email/certificate. Defensible, but confirm it matches your workflow.
- **#7 consolidated invoicing** — a literal "one invoice spanning multiple
  properties" generator is not built (existing client-level billing + property
  numbers cover the stated need).
- **Deploy** — everything is in prod DB + committed code; the customer's
  front-end + the job-completion-email edge fn still need a redeploy to surface.
- **Mobile runtime** — CertForm/status maps typecheck + build, but unverified on
  a physical device.

---


---

## 0. The "Errors Showing" crash — ALREADY FIXED, needs a deploy 🟢

The error *"Cell count must match column count. Found 6 cells and 0 columns"*
(ref `04809b47`) is React-Aria's table engine. It was eliminated in commit
**`070269c` (2026-06-06)** — every dynamic table migrated to native HTML, which
can't throw it. Verified: **zero** React-Aria tables remain in the codebase.
**Action: deploy current `master` to the customer's instance. No code change.**

---

## 1. Task status options — expand the workflow · S–M
- **Want:** the richer status set from their current tool — *Not ready,
  Scheduled, Revisit, In progress, Pending external, Rejected, Contractor
  review, Performed, Ready* (+ keep Completed/Failed access).
- **Now:** `JOB_STATUSES` = scheduled, due, in_progress, completed, incomplete,
  failed_access, revisit (`apps/web/src/lib/constants.ts:34`). Mobile mirrors a
  subset; the DB `jobs.status` has a CHECK constraint.
- **Steps:** (a) agree the final status list + meaning of each; (b) migration to
  widen the `jobs.status` CHECK constraint; (c) update `JOB_STATUSES` + the
  status colour/label maps (web + mobile); (d) update any status-driven logic
  (overdue/completed filters, analytics, completion side-effects) for the new
  values. **Decision needed: the exact list + which are "open" vs "closed".**

## 2. Task numbers `H-101` (currently `T-04000`) · S
- **Want:** human task IDs like `H-101` instead of `T-04000`.
- **Now:** `jobs` has **no `job_number` column** (verified) — the tan `T-04000`
  is their old tool. Haumea shows the UUID/short id today.
- **Steps:** migration adding `jobs.job_number text` + a per-org sequence (or a
  `BEFORE INSERT` trigger formatting `H-<n>`); backfill existing jobs; surface
  it on the list, detail, mobile, and PDFs. **Decision: prefix (`H-`?), zero-pad
  width, per-org vs global numbering.**

## 3. Parent / Child task linking · M
- **Want:** link related tasks so a **defect quote** associates to its parent
  task (e.g. a service visit spawns a defect → quote → remedial task).
- **Now:** no relationship column on `jobs`.
- **Steps:** migration `jobs.parent_job_id uuid references jobs(id)`; UI to set a
  parent + show children on the detail page; thread it through quote→job so a
  defect quote created from a task carries the parent; RLS unaffected (same org).
  Pairs naturally with item 6 (defect-quote widget).

## 4. Service Group category column · S–M
- **Want:** a "Service Group" column/grouping on the task list (Emergency & Exit
  Lighting, Fire Detection Alarms & Components, …) with Scheduled/Due.
- **Now:** `compliance_type` + `COMPLIANCE_TYPES`/`COMPLIANCE_TYPE_LABELS` exist;
  jobs have **no `service_group`** column. Their groups are finer-grained than
  our compliance types.
- **Steps:** decide whether "service group" = a relabel of `compliance_type`, a
  new lookup table, or derived from the asset category. Then add the column to
  the jobs/scheduler list + sort/filter. **Decision: source of the grouping.**

## 5. Engineer create/manage function · M
- **Want:** create + manage engineers in-app.
- **Now:** `engineers` table EXISTS; `engineers/index.tsx` + `engineers/[id].tsx`
  list/detail exist. Likely missing a create/invite flow + edit.
- **Steps:** audit the existing engineers module; add a create/invite form
  (React Hook Form + Zod), edit, deactivate; tie to auth (invite → profile with
  role `engineer`). Reuse the user-invite pattern from settings.

## 6. Dashboard: Service Quote + Defect Quote widgets · M
- **Want:** two quote widgets on the dashboard + room for custom widgets.
- **Now:** `QUOTE_TYPES` already distinguishes `service_quote` / `defect_quote`;
  analytics hooks + the Compliance Score widget exist (the design language is
  there — `image4`).
- **Steps:** two `useQuotes({ quote_type })`-backed summary widgets (counts +
  value by status); slot into the dashboard grid; optionally a lightweight
  "add widget" config. Low risk — data already exists.

## 7. Client → Property → Task billing model · M–L
- **Want:** 1 client → many properties, **billed under one billing form** but
  each property keeps a **separate number** (`P-123` … `P-524`).
- **Now:** client→property→job model exists; `clients.billing_email` exists;
  **`properties` has no `property_number`** (verified). No consolidated billing.
- **Steps:** (a) migration `properties.property_number` (per-client sequence,
  like item 2); (b) a consolidated invoice flow that bills multiple properties
  of one client on a single invoice while line items keep the property number;
  (c) surface property numbers across the portal + PDFs. **Decision: numbering
  scheme + whether one invoice spans properties or one-per-property grouped.**

## 8. Client Info fields · S–M
- **Want:** primary contact name & number (client) + billing card, on-site
  access manager (per property), primary technician.
- **Now:** `clients` has only `billing_email` (no contact name/phone);
  `properties` has no `site_manager`/`primary_technician` (verified).
- **Steps:** migration adding the fields (`clients.primary_contact_name/phone`,
  `properties.site_manager_name/phone`, `properties.primary_technician_id ->
  engineers`); add to the client/property forms + detail + portal Contact page.
  Straightforward CRUD once columns exist.

## 9. Compliance cert forms (engineer-completable) · L
- **Want:** structured forms for **Fire & alarm system, Emergency Lighting, Fire
  Extinguisher, Access Control** that an engineer completes when a task is done,
  tied to each property's **asset list**, feeding the **service report**.
- **Now:** `service_reports`, `compliance_items`, `assets` exist; certificate
  generation exists (`lib/certificates`). No per-discipline structured checklists.
- **Steps:** a form-template model (fields per cert type) + a completion record
  linked to job + asset; mobile + web capture; render into the service report /
  certificate. Largest item — design the template schema first. Builds on the
  existing certificate pipeline.

---

## Recommended sequencing

**Wave A — quick wins (a few days):** #2 task numbers, #8 client info fields,
#6 quote widgets, #4 service group column. Mostly additive columns + UI; high
visible value, low risk.

**Wave B — workflow (a week):** #1 status expansion, #3 parent/child tasks,
#5 engineer management. These define the task lifecycle the customer expects.

**Wave C — billing + forms (1–2 weeks):** #7 client→property billing & numbers,
#9 compliance cert forms. Largest data-model + UX work; do last with the model
decisions settled.

## Decisions needed before building
1. **#1** final status list + which are open vs closed.
2. **#2/#7** numbering schemes (prefix, padding, per-org/per-client).
3. **#4** what "Service Group" maps to (relabel compliance_type / new lookup /
   asset category).
4. **#7** consolidated billing shape (one invoice across properties vs grouped).
5. **#9** which cert types first + the form-template structure.
