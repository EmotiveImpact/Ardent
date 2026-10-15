# Blockers

Items logged here were skipped during autonomous build. Review and resolve manually if needed.

## Wave 6A — Test Infrastructure (2026-04-25)

- **Missing components / hooks referenced by the original test plan**:
  `EmptyState`, `Sparkline`, `AnimatedCounter`, `TrendChip`, `SavedViews`,
  `useKeyboardShortcuts`, `useAutosaveDraft`, `useInsights`, `feature-flags`
  (under `src/lib/`) — none of these exist in the current codebase. Tests for
  these were replaced with equivalent-coverage tests against the components
  and hooks that *do* exist:
  `Breadcrumbs`, `Skeleton` family, `ConfirmDialog`, `CommandPalette`,
  `useClients`, `useFavourites`, `auth-context`, plus pure-function tests
  for `lib/utils`, `lib/permissions`, and `lib/schedule-utils`.
- **`<CommandPalette />` tests skipped pending API rewrite** — RESOLVED in
  Wave 13B (2026-04-26). Suite now expanded from 6 skipped → 11 passing,
  covers universal-search hits, recents, keyboard nav, and toggle behaviour.
- **Missing portal `raise-call-out` route** — replaced with `/portal/contact`
  smoke test.
- **Missing portfolio Map / Leaflet view** — replaced with a properties list
  smoke test.
- **Playwright Chromium install failed with ENOSPC** in this worktree
  (host disk had only ~500 MiB free). `npx playwright test --list` succeeds,
  config and specs compile cleanly, and the install step is wired into CI
  where disk space is not a concern.

## Wave 17 perf — migration apply needs Supabase credential (2026-04-27) — RESOLVED

- **RESOLVED 2026-04-27**: User shared a fresh personal access token,
  migration applied via Supabase Management API `/database/query`
  (HTTP 201), edge function redeployed via `supabase functions deploy`.
  Smoke tests confirm `dashboard_kpis()` returns 558 bytes, `me()`
  returns null for anon (correct), and `check-deploy-status` now
  responds 401 "Invalid token" instead of BOOT_ERROR/503 — the boot
  problem is gone.

- **Original entry**: Migration `00039_dashboard_kpis_rpc.sql` and the
  modernised `check-deploy-status` edge function are in the repo
  (commit `5d361a4`) but the live Supabase project hasn't been updated.
  The code carries fallback paths so the app keeps working unchanged
  until they're applied — but the dashboard-data-loads-fast win only
  kicks in once the RPCs exist.
- **Why I couldn't auto-apply**: `.env` only contains the public anon key.
  The previous session's `sb_secret_…` / management tokens weren't
  written to disk before context compaction wiped them, and the
  Supabase CLI's cached keychain token belongs to a different account
  (`supabase projects list` works but doesn't include `vphjwvleffuwwgbjxups`).
- **To apply via the CLI** (assumes you have a personal access token from
  https://supabase.com/dashboard/account/tokens):

  ```bash
  export SUPABASE_ACCESS_TOKEN=sbp_xxxxx
  supabase link --project-ref vphjwvleffuwwgbjxups
  supabase db push                              # applies 00039
  supabase functions deploy check-deploy-status # redeploys the modernised fn
  ```
- **Or paste the token back into chat** and I'll run the same three
  commands here.

---

## 🔴 CRITICAL SECURITY — client_admin portal has no client-level scoping (2026-06)

- **What**: `/portal` (Client Hub, served to `client_admin`) is isolated only by
  `organisation_id`, not by client. `profiles` has no `client_id`, so a
  `client_admin` for Client A can read every other client's quotes, invoices,
  properties and line-item pricing in the same FM org (cross-tenant IDOR). Full
  analysis + the ready-to-apply RLS in **docs/SECURITY_PORTAL_CLIENT_SCOPING.md**.
- **Why I couldn't auto-fix it**:
  1. Needs a data-model decision — one client per portal user (`profiles.client_id`)
     vs many (`profile_clients` join). Recommended: one-per-user.
  2. Needs a **backfill** mapping each existing `client_admin` → its client, which
     is operational knowledge not present in the schema. Applying the RLS before
     backfill fails closed and would lock those users out of their own data.
  3. It's a production access-control change — needs explicit sign-off, not a
     silent `db push`.
- **To proceed**: confirm the model, backfill `profiles.client_id` for every
  `client_admin`, then apply the migration in the doc (audit the full list of
  portal-reachable tables first). I can write the final migration + the
  defence-in-depth hook changes once the model + backfill are confirmed.

---

## 🟠 Notification preferences are not honoured (feature gap, 2026-06)

- **What**: The Notifications settings screen (`apps/web/src/routes/settings/index.tsx`)
  toggles per-category in-app/email prefs and toasts "saved", but only writes
  `localStorage`. No dispatch path reads them: `createNotification` /
  `createBulkNotifications` (`apps/web/src/lib/notifications.ts`) always insert
  the in-app row and always fan out Slack + Web/Expo push; the Resend crons don't
  check either. So an opted-out user still receives everything.
- **Why I couldn't auto-fix it**: honouring a *recipient's* opt-out requires
  *server-side* prefs (dispatch is triggered by the acting user / crons, not the
  recipient's device). That means a prod schema change + multi-surface wiring:
  1. `alter table profiles add column notification_preferences jsonb default '{}'`.
  2. settings screen writes to that column (keep localStorage as a cache).
  3. `createNotification`/`createBulkNotifications` fetch the recipient's prefs
     and gate the in-app insert + Slack + push per `notification_type`.
  4. the email crons/edge fns apply the same gate before Resend.
  Shipping only a localStorage check would give false confidence (it can't gate
  the server-side fan-out). Needs the migration applied to prod + sign-off.

---

## 🟠 Marketing contact form discards every submission (2026-06)

- **What**: `apps/marketing/src/pages/contact.tsx` onSubmit fakes a 1.5s delay
  then shows "message received" — it makes NO network call. The marketing app
  has no Supabase client / backend by design, so every lead is silently lost
  while the user is told they'll get a reply. (The home page email capture
  redirect prefill IS now fixed.)
- **Why I couldn't auto-fix it**: it needs a destination decision + infra — where
  should leads go? Options: a new Supabase Edge Function that emails via Resend
  (the web app already has `apps/web/src/lib/email.ts` + edge fns), a CRM/webhook,
  or a form service. Picking one and wiring + deploying it is a product/infra
  call. Once you choose, the fix is: POST the validated payload, only show
  success on a 2xx, and surface an error state on failure.

## 🟠 Client portal quote approval performs operator-only actions (2026-06)

- **What**: `apps/web/src/routes/portal/quote-detail.tsx` (client_admin portal)
  approves a quote via the operator hooks `useUpdateQuote` (broad quotes UPDATE)
  and `useConvertQuoteToJob` (INSERTs a job) — directly from the client surface.
  `client_admin` is read-only on quotes in `lib/permissions.ts`, and the
  equivalent tenant/site flow was deliberately hardened to a SECURITY DEFINER RPC
  (`tenant_set_quote_decision`, migration 00074) that only sets status. The
  client portal never got that treatment, and RLS is org-scoped only, so the DB
  doesn't block it.
- **Why I couldn't auto-fix it**: needs a SECURITY DEFINER RPC (prod migration)
  mirroring `tenant_set_quote_decision` that only records approved/rejected, plus
  a decision on WHERE the quote→job conversion should happen (server-side on
  approval, or deferred to the FM operator). This is the same client_admin
  authorization area as the portal RLS blocker above — best decided together.

---

## ✅ RESOLVED — Offline failAccess split-outcome (fixed 2026-06-10, trust wave W1-T2)

- **Was**: `failAccess` enqueued two independent offline actions (jobs status
  update + notes insert) that could split across drain passes.
- **Fix**: single transactional RPC `public.record_failed_access` (migration
  00114, SECURITY INVOKER, replay-idempotent via client-stamped `p_note_id`) +
  a new `rpc` offline-action kind — one queue entry, one transaction, atomic
  by construction. The groupId option was rejected: it can't roll back a
  member that already succeeded in an earlier pass.
- **Verified**: 8 new mobile tests (36/36 green) + a rolled-back live
  transactional test (status+note land together; replay converges; missing
  job → 42501). An "Atomicity rule" comment in offline-queue.ts now governs
  future dependent write pairs (the remaining multi-action enqueues are
  individually safe: best-effort / idempotent / convergent).

## ✅ RESOLVED — cycle-6 security migrations (verified applied 2026-06-10)

- `00094_tenant_callout_org_binding.sql` — **LIVE**: `jobs_insert_tenant_callout`
  WITH CHECK contains the org-binding subselect (verified via pg_policy).
- `00095_tenant_quote_decision_state_guard.sql` — **LIVE**:
  `tenant_set_quote_decision` prosrc contains `status in ('draft', 'sent')`
  (verified via pg_proc). The legit caller (`useRaiseCallout`) supplies
  `organisation_id: profile.organisation_id`, compatible with the binding.
Applied by an earlier security wave; this section had gone stale.
