# Codex brief — make the Haumea mobile app functional for field engineers

You are working on the **mobile app** of a production Facilities-Management platform.
The owner's assessment: *"it's not where it needs to be and we need the app functional
for engineers."* Your job is to close the gaps that stop a field engineer running a job
end to end on their phone.

## Repo

`/Users/augustusedem/SiteSentriq` — npm workspaces monorepo, branch `master`.
Work in **`apps/mobile`** (Expo SDK 54, expo-router 6, React Native 0.81, offline-first).

- `app/` — screens (expo-router). `app/job/[id].tsx` is the job hub (~2.2k lines).
- `hooks/useJobs.ts` — all job mutations. `lib/offline-queue.ts` — the replay queue.
- Shared Supabase backend with `apps/web`. Migrations in `supabase/migrations` (through 00126).
- The web app is the reference for intended capability: `apps/web/src/routes/jobs/`,
  and the `engineer` role in `apps/web/src/lib/permissions.ts`.

## Environment

- Node v22.22.3 is correct (engine floor `^20.19.0 || >=22.13.0`). Don't switch.
- Gate: `cd apps/mobile && npx tsc --noEmit && npx vitest run` (43 tests must stay green).
- Bundle check: `npx expo export --platform ios --output-dir /tmp/expo-check` must succeed.
- Deps were just aligned to SDK 54 — **do not** run `expo install --fix` again, and
  **do not** touch `@types/react` (pinned at ~19.2 on purpose: dropping to 19.1 breaks
  native lib JSX typing — there's a documented SegmentedControl fix depending on it).

## Hard constraints

1. **Do not apply Supabase migrations.** Everything below is achievable with the EXISTING
   schema — verify with `information_schema` reads if unsure, don't assume from migration
   files (two migrations can define the same table; the live DB is the authority).
2. Do not deploy anything. Do not push. Commit locally in coherent batches.
3. **Confirm before you claim.** Read the actual code. If you assert a runtime behaviour,
   verify it. A prior review claimed the `job_parts` table was broken by a schema
   collision between `00009` and `00092` — **that was checked against the live DB and is
   FALSE**: the live table has `description`/`unit_cost`/`added_by` and the mobile insert
   at `hooks/useJobs.ts:510` matches it exactly. Don't "fix" it.
4. Match the existing style: the codebase comments *why*, and notes what the bug was when
   a fix is subtle. Offline-capable writes go through `enqueue()`, never a bare insert.
5. Keep it simple — no new state libraries, no architecture rewrites.

## The work, in priority order

### 1. Offline read cache (the single biggest gap)

AsyncStorage currently holds only the auth session, theme, and mutation queue. **Every read
is a live query.** An engineer who cold-starts the app in a basement or a rural site sees an
empty job list — no address, no contact number, no job detail. Every other offline
guarantee is worthless if they can't see the job when they arrive.

Cache, keyed per user, with a visible "last updated" and stale indicator:
my-jobs list, job detail, property address + contact phone, and the job's documents list.
Refresh on focus/reconnect; serve cache instantly on cold start.

### 2. Status dead-ends — no assigned job may be a CTA-less screen

`00100_job_status_expansion.sql` defines ~15 statuses. Mobile only ever produces
`in_progress` and `completed`. A job in `ready`, `pending_external`, `contractor_review`,
`incomplete`, or `in_progress` with a null `arrived_at` currently renders **no call to
action at all** (`app/job/[id].tsx:870`). Give every reachable status a sensible action,
and add on-hold / awaiting-parts / incomplete / revisit. Read the CHECK constraint from the
live DB and only emit values it allows.

### 3. Fix the offline split-outcome bugs

`lib/offline-queue.ts` documents an atomicity rule that two call sites violate:
- `checkOut` (`hooks/useJobs.ts:195-199`) enqueues the `jobs` update and the
  `job-completion-email` invoke as **independent** actions. If the update fails and the
  invoke succeeds, the edge function sees `status != completed`, no-ops, is marked success
  and removed — **the customer completion email is never sent.**
- `saveSignature` (`:448-452`) enqueues `storage_upload` then `jobs.update`. If the upload
  dead-letters and the update lands, `engineer_signature_url` points at a nonexistent object.
- `recordFieldEvent` (`:156-160`) is fire-and-forget, so a check-in can land with **no GPS
  evidence**, invisibly.

Also: there are **three different offline gates** — `shouldQueue()` in `useJobs`
(which also queues when `pendingCount > 0`), `deviceOffline()` in `app/job/[id].tsx:86`,
and *nothing* in `lib/qr.ts:88`. The latter two can land **ahead of older queued actions**,
reordering writes. Unify on one gate.

### 4. Sync visibility and safety

- Dead-lettered actions are invisible: poison actions only `console.warn`
  (`lib/offline-queue.ts:386`) and nothing calls `deadLetterCount()` (`:408`). A completed
  check-out can vanish after 8 drains with **zero** signal. Surface a pending/failed sheet
  with a retry.
- `useAuth.ts:79` calls `clearOfflineQueue()` **before** `signOut()` — signing out at the
  end of a no-signal day silently destroys the whole day's work. Keep the shared-device
  behaviour but confirm first when the queue is non-empty.
- Chat send failures are invisible: `useJobMessages.ts:129` sets `error` but
  `app/job-chat/[id].tsx:62` only renders it when the thread is empty.

### 5. Job checklist (`job_tasks`)

The table exists with org CRUD (`00010_client_feedback.sql`) and the web renders it as the
job checklist (`apps/web/src/components/jobs/job-overview-tab.tsx:302`). Mobile never
references it, so a 20-point PPM is run off paper. Add it to the job hub, tickable offline.

### 6. Smaller, high-value

- **Defect photos** — `RaiseDefectForm.tsx:78` captures no image. A defect without evidence
  is a disputed defect. `job_photos` already supports it.
- **"On My Way" tells the customer nothing** — `app/job/[id].tsx:569` only starts the GPS
  stream; it never writes `jobs.expected_arrival_at` (00015) or the ETA window (00049),
  which is exactly what the client portal renders.
- **Photo type is hardcoded** to `'general'` (`app/job/[id].tsx:422`) — before/after/issue
  is unreachable.
- **QR check-in can hang** — `app/scan.tsx:48` awaits `recordQrCheckin` before
  `router.back()` with no timeout and no offline pre-check.
- **Version is hardcoded** `1.0.0` in `constants/config.ts:3` and the profile screen;
  `app.json` says `1.0.0` while `package.json` says `0.28.2`. Single-source it.

## Scope control

Do 1–4 first and make them solid; they are what make the app *trustworthy* in the field.
Then 5 and 6 as far as you get. **Do not start 10 things and finish none.** If you run out
of room, stop at a green gate and say clearly what's done and what isn't.

Do NOT build: expenses/mileage (no table exists), accept/decline-job (needs a product
decision), or a timesheet week view.

## Report

For each change: what an engineer can now do that they couldn't, the file(s), and how you
verified it. Then the gate output. Be explicit about anything you left unfinished or
couldn't verify — an honest gap list is worth more than a claim of completeness.
