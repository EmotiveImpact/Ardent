# Codex review prompt — Haumea (SiteSentriq)

Paste the block below into Codex (or run `codex exec "$(cat docs/internal/CODEX_REVIEW_PROMPT.md)"`
from the repo root). It is written to be self-contained.

---

You are doing an adversarial code review of a production multi-tenant SaaS monorepo.
Your job is to find **real, demonstrable defects** and fix them. You are not writing new
features and you are not restyling code.

## Repo

`/Users/augustusedem/SiteSentriq` — npm workspaces monorepo, branch `master`.

- `apps/web` — Vite + React 19 + React Router SPA. TanStack Query + TanStack Table,
  React Hook Form + Zod, Tailwind v4, Radix-based `@haumea/ui`. This is the main surface.
- `apps/mobile` — Expo + expo-router, offline-first (AsyncStorage replay queue).
- `apps/marketing` — separate Vite marketing site.
- `packages/{types,utils,ui}` — shared.
- `supabase/` — 125 migrations + 43 Deno edge functions. Postgres with RLS.

Multi-tenancy: every tenant table is scoped by `organisation_id = public.organisation_id()`.
Portal (customer-facing) users are additionally scoped by `public.is_portal_client()` /
`public.my_client_id()`. Roles: `super_admin, org_admin, manager, scheduler, finance,
engineer, auditor, client_admin, tenant_user`.

## Environment — read this first, it will save you an hour

- Node must satisfy `^20.19.0 || >=22.13.0`. The machine default (`v22.22.3`) is correct.
  **Do not** switch to Volta's 22.12.0 — it is below the floor.
- If `node_modules` is empty, run `npm install` at the workspace root first. Nothing
  builds without it.
- To type-check edge functions you **must** set `DENO_NO_PACKAGE_JSON=1`, e.g.
  `DENO_NO_PACKAGE_JSON=1 deno check --no-lock supabase/functions/<name>/index.ts`.
  Without it, a populated root `node_modules` makes Deno try to resolve npm deps from it
  and every function fails with a misleading "Could not find a matching package" error.

## Verification gate — must be green before you finish

```bash
npm run typecheck:all      # web + marketing + mobile + packages
npm run lint:all
npm run test:all           # 245 web + 19 utils
npm run build:all
npm run check:no-raw-type  # design-token budget; must not exceed baseline
cd apps/mobile && npx tsc --noEmit && npx vitest run   # 43 tests
```

## Hard constraints

1. **Do not deploy the front-end** (no `vercel …`). Do not push to git unless asked.
2. **Do not apply Supabase migrations** or run destructive SQL. If a fix needs schema or
   RLS changes, write the migration file as the next number in `supabase/migrations/` and
   say so — do not execute it.
3. **Do not report or "fix" these** — they are known and accepted:
   - 10 edge functions failing `deno check` strict mode with
     `SupabaseClient<any,"public",any>` vs `<unknown,never,GenericSchema>` (TS2345).
     Known supabase-js generics class; they deploy and run fine.
   - The residuals already tracked in `docs/internal/ROADMAP.md` §A2 (subcontractor-job
     pre-upload metadata, invoice idempotency key, `sla_*_met_at` lockdown,
     `job_eta_tokens` revoke column, quickbooks/slack raw error passthrough).
4. **Confirm before you claim.** Do not report anything you have not verified by reading
   the actual code. No speculative findings. If you assert a runtime behaviour, test it —
   don't reason about it from memory. (A prior reviewer claimed React 19 "rejects at
   runtime" for nested `<a><button>`; it is actually a dev-only warning, stripped in
   production, and the browser does not restructure the DOM. That kind of unverified
   claim wastes real time.)
5. Match the surrounding code's style, comment density, and idiom. Comments should explain
   *why*, and the codebase's convention is to note what the bug was when a fix is subtle.

## What to hunt

Ranked. Depth beats breadth — a short list of confirmed defects is worth far more than a
long list of maybes.

**1. Tenant isolation and authorization (highest value).**
- Edge functions that trust a body-supplied `organisation_id` / `user_id` / `client_id`
  instead of deriving it from the JWT.
- Any path using the **service-role key** that is reachable by an unauthenticated or
  wrong-role caller. Service role bypasses RLS, so each such path needs its own explicit
  tenant/ownership check. Note `verify_jwt = true` is **not** an authorization check — the
  anon key shipped in the browser bundle is a validly-signed project JWT.
- RLS policies missing a command (a table with SELECT+INSERT policies but no UPDATE/DELETE
  guard), or a policy granted to `public`/`anon` where it should be `authenticated`.
  Remember `as restrictive` narrows rows but does **not** remove the command.
- Token-auth surfaces (`subcontractor-job`, `public-job-eta`, `calendar-feed`, trust URLs):
  expiry checked? revocation checked and **fail-closed** on a missing row? can a token for
  record A reach record B?
- `SECURITY DEFINER` functions under `set search_path = ''` must schema-qualify **every**
  reference or they fail at runtime.

**2. Data correctness.**
- **Timezone/date bucketing — this repo has a documented systemic bug class.** Rules:
  a `date` column is a string, never round-trip it through a `Date`; a `timestamptz`
  column must be matched with a half-open local range (`.gte(day).lt(nextDay)`), never
  `.eq(day)` or `.lte(lastDay)`; and never derive a local day key from
  `toISOString()` — use `toLocalYmd()` from `@/lib/time-tracking/compute`.
- Money and rounding; percentage math; divide-by-zero; `||` used where `??` is meant
  (a falsy-but-valid `0` silently becoming a fallback).
- Filter/sort predicates that silently drop rows.

**3. React / TanStack Query state bugs.**
- Query keys that don't include every input the queryFn depends on — and, importantly,
  **two different queries sharing one key with different row shapes** (the cache is global
  and persisted to IndexedDB for 24h, so this cross-contaminates pages).
- `useEffect([object, reset])` hydration that re-runs on a background refetch and wipes
  in-progress user input. Correct pattern: hydrate keyed on the record **id**.
- Unguarded async races (an in-flight request resolving after a newer one and overwriting
  it), stale closures, missing cleanup.
- Optimistic updates that don't roll back on error.

**4. Robustness.**
- Supabase calls that discard `error`, `.single()` where `.maybeSingle()` is meant,
  unpaginated `listUsers`/`select` that silently truncate at a page boundary.
- Handlers returning 200 on a failed write; scheduled jobs that advance their cursor past
  a failure and silently consume the period.
- Webhook handlers that can double-apply or apply out of order.

**5. Accessibility**, only where it's a genuine defect (nested interactive elements,
missing labels on real controls, focus traps). Do not do a styling pass.

## Method

1. Read `docs/internal/BUGS_AND_FIXES.md` first — it records the bug classes this codebase
   actually has, and re-finding a fixed bug is wasted effort.
2. Grep for the risky patterns, then **read the suspicious files in full** to confirm.
3. Fix what you confirm. Keep each fix minimal and focused.
4. Re-run the gate. Everything must be green.
5. Commit in coherent batches with a message that states what the bug was and how it
   would have failed — not just what changed.

## Report

For each finding: `file:line`, one sentence on the defect, a **concrete failure
scenario** (specific inputs → specific wrong output), and what you changed. Rank
most-severe first. State plainly what you looked at and found clean — and if you found
nothing in a category, say so rather than padding the list.
