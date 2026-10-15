# Haumea

Multi-tenant facilities management SaaS — clients, properties, assets, compliance, PPM, scheduling, jobs, quotes, invoices, documents, analytics, and a customer portal — all on a single Supabase backend with row-level multi-tenancy.

> **Status:** Pre-1.0 (current `0.28.2`). MVP feature surface is built and live in production. The latest wave (v0.28.0) is the **Trust & Compliance wave** (merged to `master`, `adde1b5`) — built from competitive research on the UK/IE field-service incumbents and aimed at the **UK compliance moat** the mid-market doesn't own: **subcontractor compliance gating** (a DB dispatch gate that blocks assigning a non-compliant subbie), a **contract SLA engine** (stamped response/fix targets + service-credit maths), **permit-to-work** (DB-gated job starts), a **golden-thread Building Information Pack** export (Building Safety Act handover), **QR proof-of-presence**, **per-use no-login subcontractor work links**, a **UK statutory cert library** (EICR/CP12/LOLER/L8/BS 5839), an **accounting-sync visibility** panel, a **composable dashboard**, and an **atomic offline failed-access** fix — migrations 00114–00122 live, two new edge functions deployed, board-reviewed + hardened. See **[FEATURES.md](./FEATURES.md)** for the full capability map + selling points. Earlier waves: v0.27.0 security-board hardening + PPM repair + notification/reporting/mobile delivery; v0.26.0 the V1 customer backlog (9 items, migrations 00097–00104) + adversarial bug sweep + mobile rebuild + prod deploy; v0.21.x security hardening + cron + offline queue; v0.20.0 Continuous Compliance Score + public Trust URL. See [CHANGELOG.md](./CHANGELOG.md) for release-by-release detail and [docs/internal/TRUST_COMPLIANCE_WAVE_PLAN.md](./docs/internal/TRUST_COMPLIANCE_WAVE_PLAN.md) for the wave plan + status.
>
> **Note:** v0.28.2 is **fully deployed** — backend (migrations through 00126 + 43 edge functions) and the web front-end both live in production. Two adversarial review passes landed on 2026-08-05. **v0.28.1** closed an unauthenticated cross-org report-runner, a world-readable signature bucket and two portal-scoping gaps (all runtime-verified), plus a shared-query-key cache collision, several timezone day-key bugs and 47 nested `<a><button>` controls. **v0.28.2** (run through Codex, then independently re-verified) closed a cross-tenant ETA-token binding hole, added server-side authorization to the Stripe checkout/portal endpoints, stopped the Stripe webhook acknowledging failed writes, and cleared more UTC day-key drift. See [CHANGELOG.md](./CHANGELOG.md) and [docs/internal/BUGS_AND_FIXES.md](./docs/internal/BUGS_AND_FIXES.md).

---

## Pending operator actions

Things only the project owner can do (not in code). Keep ticked off as items are completed.

| Action | Status | Where | Why |
|---|---|---|---|
| ~~Set vault secret `service_role_jwt`~~ | ✅ **DONE (v0.21.3)** | Supabase SQL Editor | Secret set + cron-path verified end-to-end. Nightly recompute fires at 02:00 UTC starting tonight. |
| Enable HIBP leaked-password protection | ⏳ **BLOCKED — Pro plan only** | Project Settings → Billing → Upgrade | Management API returned HTTP 402 on attempted PATCH: HIBP requires Pro plan (~$25/mo). One advisor WARN will remain "by-design" on Free plan until upgrade. |
| ~~Production deploy live~~ | ✅ **DONE (v0.21.3, re-shipped v0.26.0)** | Vercel | App live at https://sitesentriq-web.vercel.app — anyone can sign up + hit the real Supabase backend. v0.26.0 redeployed the web app + `job-completion-email` (v8) to surface the V1 backlog. |
| Redeploy 10 edge functions (June-8 bug fixes) | ⏳ **PENDING** | Supabase CLI (from disk) | 10 functions (incl. Stripe/Xero/QuickBooks) carry v0.26.0 bug-fix updates and run ~3-day-old versions in prod. Deferred to a CLI-from-disk deploy (needs a Supabase access token) rather than hand-transcribing payment functions through the MCP. Not V1-facing. |
| Point `sitesentriq.com` at the Vercel deploy | ⏳ **PENDING** | DNS provider | When you own the domain, add an A/CNAME record pointing to Vercel + add the domain in Vercel project settings → Domains. The Vercel deploy then becomes `sitesentriq.com`. |
| Seed 3+ demo Trust URLs | ⏳ **PENDING** | After domain is live | Populate `/trust/demo-fm`, `/trust/example-hospitality`, `/trust/sample-retail` so prospects get a live link in sales emails. RPC exists: `public.seed_sample_data(<org_id>)`. |
| Run 5 customer-discovery calls | ⏳ **STRATEGIC GAP** | See [docs/sales/](./docs/sales/) | The deferred item nothing else closes. Five UK FM operator conversations using the discovery interview guide. Not coding work. |

### Architectural acceptances (closed — will not be fixed)
- `organisations_insert_authenticated WITH CHECK (true)` — accepted DoS-via-org-creation lever, not closing.
- `org-branding` bucket public — intentional (org logos rendered in transactional emails).
- `anon EXECUTE` on SECURITY DEFINER functions — function bodies already auth-check; defence-in-depth concern only.

### Recently completed (for posterity)
- ✅ Vault secret `service_role_jwt` set; cron-helper round-trip verified (request_id 2 → HTTP 200, 2 orgs scored, snapshot 2026-05-18) — **v0.21.3**
- ✅ 10 edge functions redeployed via multipart API (the curl-PATCH-with-body shape doesn't produce a bootable bundle; multipart-POST file upload does) — **v0.21.3**
- ✅ `isServiceRoleJwt()` pattern hardened across 9 functions — was brittle string-equality against `SUPABASE_SERVICE_ROLE_KEY` env var (breaks on key rotation), now checks JWT role claim only (verify_jwt=true gateway already validated signature) — **v0.21.3**
- ✅ Password policy hardened on Free plan (12-char minimum + lower/upper/digit required, was 6 + no rules) — **v0.21.2**
- ✅ Accidental `api` schema + Data-API misconfiguration reverted — **v0.21.2**
- ✅ Migrations 00063 + 00064 applied LIVE (cron schedules + 22-function `search_path` hardening) — **v0.21.1**
- ✅ Mobile image compression + offline photo blob queue + `expo-image-manipulator` installed — **v0.21.1**
- ✅ Wave F codemod (169 callsites migrated to foundational primitives) — **v0.21.1**
- ✅ 3 mega-files split into 18 focused components (3891 → 894 LOC, -77%) — **v0.21.1**
- ✅ Tier 0 security wave (5 RLS + 6 buckets + 7 edge functions + 2 SECURITY DEFINER views, all live) — **v0.21.0**

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite 8** + Rolldown/Rollup | Fast HMR, modern ES output, easy PWA wiring |
| UI | **React 19** + React Router 7 | SPA, eager dashboard shell, lazy child routes |
| Component library | **HeroUI v3** | React Aria primitives, compound + sibling composition, full a11y by default |
| Styling | **Tailwind CSS v4** + custom `@theme` tokens | Design system in CSS vars, theme-switchable at runtime |
| Forms | **React Hook Form** + **Zod** | Schema-first validation, integrates with HeroUI `<TextField>` via plain register-spread |
| Tables | **TanStack Table** + custom `<DataTable>` shell | Sort / pagination / row-selection, Tailwind-styled |
| Data fetching | **TanStack Query** (with IndexedDB persistence) | Cache, background refetch, optimistic updates, offline replay |
| Backend | **Supabase** — Postgres, Auth, Storage, Realtime, Edge Functions | Single platform; RLS provides multi-tenancy |
| Charts | **Recharts** | Line/area/bar/radial — chunk-split out of the main bundle |
| Maps | **Leaflet** | Property maps; chunk-split (~190 KB) |
| Icons | **Lucide React** | Consistent stroke-style icon set |
| Payments | **Stripe** | Subscriptions + invoice collect-later |
| Email | **Resend** | Transactional + invoice reminders |
| Error monitoring | **Sentry** (when DSN set) | Front-end + breadcrumb instrumentation around Supabase calls |
| PWA | `vite-plugin-pwa` (Workbox) | `autoUpdate` strategy, offline app shell, custom install prompt |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       BROWSER (SPA)                            │
│                                                                │
│   React 19 + React Router                                      │
│         │                                                      │
│         ├──> AuthProvider — bounded session/profile boot       │
│         │                                                      │
│         ├──> RealtimeProvider — wss subscriptions across       │
│         │       13 tables, scoped by organisation_id           │
│         │                                                      │
│         ├──> TanStack Query                                    │
│         │       (PersistQueryClientProvider → IndexedDB)       │
│         │                                                      │
│         └──> HeroUI v3 + Tailwind v4 (theme via CSS vars)      │
└────────────────────────────────────────────────────────────────┘
         │  HTTPS PostgREST   │  WSS Realtime    │  Edge Functions
         ▼                    ▼                  ▼
┌────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                  │
│                                                                │
│   Postgres ◄─ Row-Level Security (organisation_id() filter)    │
│       │                                                        │
│       ├── profiles, organisations          (tenancy)           │
│       ├── clients, properties, assets      (CRM)               │
│       ├── compliance_items, certificates   (compliance)        │
│       ├── maintenance_plans, jobs          (PPM + reactive)    │
│       ├── engineers, subcontractors        (workforce)         │
│       ├── quotes, invoices, payments       (billing)           │
│       ├── documents, notes, timeline_events                    │
│       └── ON DELETE CASCADE / SET NULL across the graph        │
│                                                                │
│   supabase_realtime publication on 13 tables                   │
│   Auth (GoTrue) + Storage (S3-compatible) + Edge Functions     │
└────────────────────────────────────────────────────────────────┘
```

### Multi-tenancy

Every business table carries `organisation_id uuid` and an RLS policy of the form `organisation_id = organisation_id()` where `organisation_id()` is a `STABLE` SQL function that reads the caller's `auth.uid()` → `profiles.organisation_id`. No application-level filtering is needed; the database refuses cross-tenant reads.

### Realtime invalidation

`useRealtimeSubscriptions` (mounted once at the dashboard layout) subscribes to one private Supabase Realtime Broadcast topic per organisation: `org:<organisation_id>:changes`. Database triggers emit INSERT / UPDATE / DELETE messages to that topic, and the client patches TanStack Query caches immediately before refetching active queries. Postgres Changes subscriptions remain as a fallback. The result: when one user deletes or edits a row, every connected browser in that organisation updates without a manual reload. There is no app-wide polling loop; selected live counters own their own polling only when they need it.

Dev/debug/super-admin users can open the topbar realtime pill to inspect the active app version, Broadcast/Postgres Changes channel status, the last received event, and the exact TanStack Query keys invalidated by that event.

### Cache persistence

TanStack Query results are persisted to IndexedDB via `@tanstack/query-async-storage-persister` under key `haumea-query-cache`. On reload the cache rehydrates instantly so first paint shows last-known data while stale queries revalidate on mount or reconnect. A `buster` keyed to `APP_VERSION` evicts the entire cache on deploy so stale data can never outlive a release.

---

## Repository layout

```
apps/
├── web/                          # Main Vite SPA, visible app version 0.18.2
│   ├── src/
│   │   ├── main.tsx              # QueryClient + persister + ThemeProvider
│   │   ├── App.tsx               # Top-level React Router config
│   │   ├── index.css             # Tailwind v4 layers + @theme tokens
│   │   ├── routes/               # Dashboard, jobs, reports, portal, settings, etc.
│   │   ├── components/           # layout + shared UI
│   │   ├── hooks/                # Query hooks + realtime subscriptions
│   │   ├── contexts/             # Auth/Theme/Realtime/Sidebar providers
│   │   ├── lib/                  # Supabase, observability, notifications, PDF, audit
│   │   └── types/                # App-local domain types
│   ├── public/                   # PWA icons, push service worker, static assets
│   ├── e2e/                      # Playwright tests
│   └── vite.config.ts            # PWA, Sentry, aliasing, manual chunks
├── marketing/                    # Separate Vite marketing site
│   └── src/                      # Home, pricing, features, about, contact
└── mobile/                       # Expo field app
    ├── app/                      # Expo Router screens
    ├── components/
    ├── hooks/
    └── lib/

packages/
├── types/                        # Shared database/domain types
├── utils/                        # Runtime-safe helpers: cn, date/currency, CSV
└── ui/                           # Shared web UI primitives

supabase/
├── migrations/                   # SQL migrations
└── seed.sql                      # Test fixture
```

---

## Local development

### Prereqs

- Node `^20.19.0` or `>=22.13.0`
- npm 10+
- A Supabase project (or set `VITE_SUPABASE_URL=https://placeholder.supabase.co` for DEV_MODE which mocks data layer)

### `.env`

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...                  # safe to ship
VITE_SENTRY_DSN=                               # optional
```

Service-role keys are never used in the client and never committed; they live in Supabase Edge Functions / CI secrets only.

### Commands

```bash
npm install                  # one-time, from the repo root
npm run dev:web              # main app at http://localhost:5174
npm run dev:marketing        # marketing site at http://localhost:5175
npm run dev:mobile           # Expo mobile app
npm run lint:all             # web + marketing eslint
npm run typecheck:all        # web + marketing + mobile + shared packages
npm run test:all             # web Vitest + shared utils tests
npm run build:all            # web PWA build + marketing build
npm run check:all            # full release gate: lint, typecheck, test, build
npm run bundle:audit         # built asset budget check
npm run smoke:realtime-delete # live Supabase realtime DELETE smoke test
```

The realtime smoke command requires a real Supabase project and test
credentials. It creates one temporary job in the signed-in user's organisation,
deletes that same job, and verifies a second Supabase client receives the
org-scoped `jobs` DELETE Broadcast event.

```bash
SITESENTRIQ_SMOKE_EMAIL="tester@example.com" \
SITESENTRIQ_SMOKE_PASSWORD="..." \
npm run smoke:realtime-delete
```

### Database / migrations

Migrations are SQL files in `supabase/migrations/` numbered `000NN_description.sql`. They're applied to the live project via the Supabase Management API (no local Supabase CLI required for routine work).

```bash
# Apply a migration to the live project
export SUPABASE_ACCESS_TOKEN=sbp_...
python3 -c "import json;print(json.dumps({'query': open('supabase/migrations/000NN_x.sql').read()}))" \
  | curl -sS -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d @- https://api.supabase.com/v1/projects/<project-ref>/database/query
```

---

## Configuration & deployment status

The application code, all migrations, and all edge functions are **deployed and live** on the production Supabase project (`vphjwvleffuwwgbjxups`, `eu-west-2`, Postgres 17). Each integration goes live the moment its env vars are set in **Supabase Dashboard → Edge Functions → Secrets**.

To check the live status at any time, visit `/dashboard/settings/health` (Settings → Integrations health). The page calls the `integrations-health` edge function and shows a green / amber / gray chip per integration, with the missing env-var names listed inline.

### Required environment variables

Set these in **Supabase Dashboard → Edge Functions → Secrets** (server-side; never committed to the repo):

| Integration | Required env vars | What it powers | How to obtain |
|---|---|---|---|
| **Browser Web Push** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Browser push notifications via the existing `send-push` edge function | `npx web-push generate-vapid-keys --json` |
| **Outbound email (Resend)** | `RESEND_API_KEY` (+ optional `FROM_EMAIL`) | Site invites, invoice reminders, weekly digest, **auto job-completion emails**, **contract-renewal alerts**, **monthly Statement-of-Compliance PDFs** | resend.com → API Keys |
| **Public origin (for ICS / Trust URL)** | `PUBLIC_APP_ORIGIN` | Fully-qualified URLs in the `public-job-eta-ics` calendar feed and the Trust URL builder | Set to e.g. `https://app.haumea.io` |
| **Statement PDF rendering (optional)** | `BROWSERLESS_TOKEN` | Renders the monthly Statement-of-Compliance to PDF. Without it the function emails the HTML version instead (graceful fallback). | browserless.io → API Keys |
| **Stripe billing** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Subscription checkout, customer portal, webhook ingestion | Stripe Dashboard → Developers → API keys / Webhooks |
| **Google Calendar sync** | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Per-user two-way calendar sync (each user OAuths after this is set) | Google Cloud Console → APIs & Services → Credentials |
| **AI suggestions** | `OPENAI_API_KEY` **OR** `ANTHROPIC_API_KEY` | Compliance suggestions, auto-assign hints, knowledge-base search | Either provider's console |
| **Mobile push (Expo)** | None — auto-configures | Engineer push notifications on iOS / Android | The first time any engineer signs in to the mobile app, their device registers automatically. `EXPO_ACCESS_TOKEN` is optional (higher rate limits + Expo dashboard analytics). |
| **Slack workspace alerts** | None — per-org OAuth install | Slack notifications for compliance / actions / quotes | Each organisation installs Slack from `/dashboard/integrations/slack` (uses `slack-oauth` edge function). |

### Recommended cron schedules

Three edge functions are cron-driven. None of them poll on their own — they need a `pg_cron` schedule set once in **Supabase Dashboard → Database → Cron Jobs**.

```sql
-- Daily contract renewal alerts (0.19.0)
select cron.schedule(
  'notify-renewals', '0 9 * * *',
  $$ select net.http_post(
    url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/notify-renewals',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>"}'::jsonb
  ) $$
);

-- Daily Continuous Compliance Score recompute (0.20.0)
-- 01:15 UTC: late enough that yesterday's last-minute updates have settled.
select cron.schedule(
  'compute-compliance-scores', '15 1 * * *',
  $$ select net.http_post(
    url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/compute-compliance-scores',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);

-- Monthly Statement-of-Compliance PDF (0.20.0)
-- 06:00 UTC on the 1st of each month, after the previous month's last score.
select cron.schedule(
  'generate-statement-of-compliance', '0 6 1 * *',
  $$ select net.http_post(
    url := 'https://vphjwvleffuwwgbjxups.supabase.co/functions/v1/generate-statement-of-compliance',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_JWT>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);
```

`notify-renewals` walks all active contracts, finds any crossing 0 / 7 / 30 / 60-day thresholds, and drops in-app notifications + emails (when `RESEND_API_KEY` is set) to the org's `support_email`. A `contract_renewal_notifications` table dedupes so the team isn't spammed daily for the same contract. `compute-compliance-scores` walks every active org and upserts a row in `compliance_score_snapshots` (idempotent on `(organisation_id, snapshot_date)`). `generate-statement-of-compliance` aggregates the prior month's snapshots, renders branded HTML, optionally PDFs via Browserless, uploads to storage, and emails the org's `support_email`.

### Currently deployed edge functions (live)

The 5 edge functions added in 0.19.0 plus the 4 added in 0.20.0 are all `ACTIVE` on the production project:

| Function | `verify_jwt` | Purpose |
|---|---|---|
| `job-completion-email` | true | (0.19.0) Auto-sent when a job flips to `completed`. Fires from both `useUpdateJob.onSuccess` (web admin) and mobile `checkOut()`. |
| `send-expo-push` | true | (0.19.0) Mobile push fan-out alongside the existing browser `send-push`. Both are invoked in parallel by `dispatchPush`. |
| `integrations-health` | true | (0.19.0) Manifest of which integrations are configured. Powers `/dashboard/settings/health`. |
| `notify-renewals` | true | (0.19.0) Daily cron walks contracts at threshold-crossings and drops alerts. Dedup table prevents repeat sends. |
| `public-job-eta` | **false** | (0.19.0) Public, token-gated. The customer's ETA tracking link hits this with no auth. PII-minimised on purpose. |
| `compute-compliance-scores` | true | (0.20.0) Daily cron walks every active org, calculates the Continuous Compliance Score + 4 sub-metrics, upserts a row in `compliance_score_snapshots`. Idempotent per `(organisation_id, day)`. |
| `public-job-eta-ics` | **false** | (0.20.0) Self-updating RFC-5545 ICS calendar feed for customer ETA tracking. Stable UID `eta-{token}@haumea.io`; SEQUENCE only bumps on shape change. Supports both `?token=` and `/<token>` path forms (path form lets calendar apps subscribe with no apikey header). |
| `public-trust-score` | **false** | (0.20.0) Public Trust URL backend (`/trust/<slug>`). Service-role read of snapshots + organisations. PII-minimal (org name + logo + score + breakdown only). 404 on disabled, 410 on no-snapshots-yet. CDN-cached for a minute. |
| `generate-statement-of-compliance` | true | (0.20.0) Monthly cron. Renders branded HTML, optionally PDFs via Browserless (graceful HTML-only fallback when `BROWSERLESS_TOKEN` is unset), uploads to storage, emails the org's `support_email` via Resend. |

Plus all the pre-existing functions (`send-email`, `send-push`, `stripe-checkout`, `stripe-portal`, `stripe-webhook`, `auto-assign-job`, `generate-certificate`, `slack-oauth`, `slack-post-notification`, `gdpr-export`, `gdpr-delete`, `xero-*`, `quickbooks-*`, `google-calendar-sync`, `weekly-digest`, etc.) are deployed and active.

### Recently applied migrations

| ID | Description |
|---|---|
| `00046_expo_push_tokens` | (0.19.0) Multi-device per user, RLS to owner. Powers mobile push fan-out. |
| `00047_contract_renewal_notifications` | (0.19.0) Dedup table for the renewal-watch cron. UNIQUE on (contract_id, threshold_days). |
| `00048_job_eta_tokens` | (0.19.0) Public ETA tracking tokens. RLS lets the FM team read/issue/revoke; public lookups go through the service-role edge function exclusively. |
| `00049_jobs_eta_window` | (0.19.0) `eta_earliest_at` + `eta_latest_at` columns on jobs with a CHECK constraint enforcing both-null OR both-set-AND-latest-≥-earliest. |
| `00050_auto_assign_required_parts` | (0.19.0) `required_parts jsonb` on `auto_assignment_rules` — drives the new van-stock readiness axis on the scheduler engine. |
| `00051_compliance_score_snapshots` | (0.20.0) Daily snapshot table for the Continuous Compliance Score. Idempotent on `(organisation_id, snapshot_date)`. Shape supports Trust URL + monthly Statement reuse out of the same source of truth. |
| `00052_job_eta_tokens_sequence` | (0.20.0) `ics_sequence` + `ics_last_hash` on `job_eta_tokens` so RFC-5545 SEQUENCE bumps are monotonic and only fire when the ETA shape changes (calendar clients then treat the re-pull as UPDATE, not duplicate). |
| `00053_trust_url` | (0.20.0) `trust_url_slug` + `trust_url_enabled` + `show_breakdown` + `show_history` on organisations. Partial-unique index protects the slug namespace only for orgs that have actually published. |
| `00054_statement_of_compliance` | (0.20.0) Statement-of-Compliance table + RLS + storage bucket. Idempotent on `(organisation_id, period_start)`. |

---

## Design system

CSS custom properties in `apps/web/src/index.css` under `@theme` (Tailwind v4 syntax). Five themes ship today:

| Theme | id | Default? | Notes |
|---|---|---|---|
| Light | `light` | ✅ default | Clean white surfaces, grey-900 text |
| Dark | `dark` | | Refined minimal dark |
| Midnight | `midnight` | | Deep OLED black |
| Glass | `glass` | | Frosted glassmorphism |
| Luxe | `luxe` | | Rich gradient warmth |

Theme switcher lives in **Settings → Appearance**. Storage key: `localStorage.haumea_theme`. Inline `<script>` in `index.html` applies the saved theme before the first paint to avoid FOUC.

### Token cheatsheet

Use these instead of raw colour classes (`bg-blue-500` etc. are forbidden):

```
Surfaces:    bg-surface-page  bg-surface-card  bg-surface-elevated  bg-surface-sidebar
Text:        text-text-primary  text-text-secondary  text-text-muted  text-text-accent
Borders:     border-border-subtle  border-border-default  border-border-strong
Brand:       brand-50…900     (warm orange #e8772e)
Accent:      bg-accent text-accent-foreground (primary action colour)
Status:      status-compliant   status-due-soon   status-overdue   status-non-compliant
Metric:      metric-emerald  metric-amber  metric-rose  metric-violet  …
```

---

## Component conventions

- **HeroUI v3 first.** Coverage is currently ~79% of TSX files (148 / 187). The remaining files are either intentionally raw (e.g. `<DataTable>` wraps TanStack Table directly because HeroUI Table is row-only) or queued for future migration waves. Top components in use: `Button` (101 sites), `Spinner` (73), `Chip` (72), `Card` (39), `TextField` / `Input` / `Label` / `FieldError` (34 each), `Modal` (14), `Tabs` (11), `AlertDialog` (5).
- **Forms** use React Hook Form + Zod. Pattern: `<TextField isInvalid={!!errors.x}><Label/><Input {...register('x')} /><FieldError>{errors.x?.message}</FieldError></TextField>`.
- **Data fetching** uses TanStack Query hooks named `use-<entity>.ts`. Mutations call `queryClient.invalidateQueries({ queryKey: [<entity>] })` on success; realtime invalidates the same keys for free.
- **Routing** is React Router v7. The dashboard shell is imported eagerly to avoid a second full-screen shell loader after auth; child pages stay code-split with local dashboard Suspense. During `/dashboard/*` navigation the sidebar/topbar remain mounted and only the main content outlet shows a page skeleton. Same-origin internal anchors are also protected by `SpaNavigationGuard`, which routes them through React Router so internal app clicks do not trigger full document reloads.
- **Tests**: Vitest + React Testing Library. Component tests render with a `QueryClientProvider` wrapper. 248 web + 19 utils + 43 mobile tests pass green.

---

## Realtime + cache architecture

A short read of [apps/web/src/contexts/realtime-context.tsx](apps/web/src/contexts/realtime-context.tsx) and [apps/web/src/hooks/use-realtime-subscriptions.ts](apps/web/src/hooks/use-realtime-subscriptions.ts) is recommended before touching anything cache- or sync-related. The high-level contract:

1. **Boot**: `AuthProvider` caps `getSession()` at 4s and profile/org resolution at 5s so a slow auth/profile request cannot leave the app on an infinite spinner.
2. **Realtime auth**: `supabase.ts` forwards the JWT into the realtime client (`realtime.setAuth(...)`) and re-applies it on sign-in / refresh.
3. **Mount**: `useRealtimeSubscriptions` waits for `orgId`, then joins `org:<orgId>:changes` as a private Broadcast channel and also opens Postgres Changes fallback channels.
4. **Event**: each Broadcast/Postgres payload patches list caches for DELETE/UPDATE and triggers `invalidateQueries` for the table key + any aggregate keys (`dashboard`, `analytics`).
5. **Revalidation**: stale queries revalidate on mount/reconnect. The app deliberately avoids global polling and refetch-on-focus storms.
6. **Persistence**: a `PersistQueryClientProvider` writes successful cache snapshots to IndexedDB under key `haumea-query-cache` with a `buster` keyed to `APP_VERSION`. On deploy, the buster changes and old caches are evicted automatically.

---

## PWA

The PWA is configured with `registerType: 'autoUpdate'`, `skipWaiting`, and `clientsClaim`. The service worker precaches the app shell and serves it offline.

A one-time eviction script in `index.html` (`haumea_sw_evicted_v1`) unregisters legacy `prompt`-strategy service workers from earlier deployments and deletes the IndexedDB query cache, then reloads. This runs once per browser; afterwards `autoUpdate` handles every future deploy automatically.

---

## Project documentation

| File | Purpose |
|---|---|
| [README.md](./README.md) | This file — entry point for new contributors |
| [docs/architecture-map.md](./docs/architecture-map.md) | Runtime map: shell, routes, hooks, Supabase, realtime, and performance contract |
| [CHANGELOG.md](./CHANGELOG.md) | Release-by-release detail, oldest-first at the bottom |
| [CLAUDE.md](./CLAUDE.md) | Instructions to the AI agent loop driving Phase 2 build-out |
| [PROGRESS.md](./PROGRESS.md) | Master Phase 2 task list with status |
| [BLOCKERS.md](./BLOCKERS.md) | Issues skipped during the loop, with context to resolve later |
| [AGENTS.md](./AGENTS.md) | Notes on the Claude-driven sub-agent workflows |
| [facilities_os_prd.md](./facilities_os_prd.md) | Product requirements doc |

---

## Recent themes (2026-Q2)

For the full picture see [CHANGELOG.md](./CHANGELOG.md). Headline items:

- **0.20.0 The Board Wave** (this release) — 23 commits across 7 waves shipped in one autonomous run after a board-driven 6-agent audit. **Continuous Compliance Score** (`914fde7`) — the first Vanta-style trust-grade compliance number for UK FM, calculated nightly from compliance status (40%) + PPM on-time (25%) + job pass-rate (25%) + open-critical-action health (10%), rendered as a dashboard hero tile. **Public Trust URL** (`/trust/<slug>`, `239d659`) — no-login verification page for insurers/auditors/board, with the 30-day sparkline and 4-metric breakdown. **Monthly Statement-of-Compliance PDF** (`cd8db3a`) — branded PDF emailed on the 1st of each month, the artifact a FM lead forwards to insurer/lender. **Self-updating ICS calendar feed for ETA tracking** (`e32e7cb`) — customer subscribes once, the VEVENT updates itself as the engineer's window narrows and auto-completes on arrival. **The Critical 5** (`6dbe770` `bc8de05` `daec3a9` `1dc9155` `77cbfc0`) — onboarding routing, quote→job conversion carrying client_id + line items, mobile service report submission, Mark Paid actually writing a payments row, deep-linkable notifications + dedicated page. **Three foundational UI primitives + codemods**: `AppCard` (4-part codemod, 38+ files), `FormSelect` / `FormSelectController` (50-file, 119-select codemod), `DataTable` on HeroUI Table (19-file, 26-table codemod) — every list page and form select in the app now flows through one accessible compound primitive. **Wave C polish sweep** — 12 items including HeroUI `ConfirmDialog` for destructive actions, deep-linkable `?filter=unassigned` jobs, lazy-loaded `PortfolioMap` (~180 KB off first nav), context value memoisation. **Wave G quality completion** — heading-order fixes + status icons + file-input labels + focus traps + skip links (`07bd1a4`), public-page theme repaint (8 surfaces — track / trust / auth — all painted onto theme tokens, no more dark-mode breakage on the customer's first impression, `256a67c`), skeleton-everywhere migration (50+ loaders, `a303b3e`). 4 migrations + 4 edge functions deployed live. Web tests grew 138 → 181, mobile 10/10, ui 10/10.
- **0.19.0 Sprint 1+2+3** — 24 commits across one autonomous run. **Customer-facing differentiation**: auto job-completion email with branded HTML + photos + signature, compliance cert auto-mint on `outcome='pass'` (gas_safety / EICR / FRA — never on a fail), contracts renewal-watch alerts at 0/7/30/60-day thresholds with dedup. **Pull-ahead features**: public unauthenticated ETA tracking links (`/track/<token>`, no login, PII-minimised), customer arrival windows (`eta_earliest_at`/`eta_latest_at` editor, Amazon's "10 stops away" pattern), customer portal branded as "Client Hub", PO right-side quick-capture drawer (Linear pattern), mobile Expo push end-to-end (multi-device per user, parallel fan-out with web push), mobile engineer notes (offline-queued into the existing `notes` table), van-stock as the 6th axis on the auto-assign engine. **Hardening pass**: mobile vitest suite (10 tests, caught a real `[object Object]` bug in the offline queue), client-side image compression on call-out uploads (6–8 MB → 200–500 KB), billing-edit validation, **rolldown chunk-name collision fix saving 88 KB gzipped on every cold load**, analytics date-range filter + median/p90 resolution-time stats. **Caught 3 real bugs in production code via the new tests**. 5 migrations + 5 edge functions deployed live. Web tests grew 58 → 138, mobile 0 → 10.
- **Wave 17 perf** — TanStack Query persisted to IndexedDB; global polling removed; realtime publication migration applied; dashboard KPI aggregation moved server-side; dashboard shell imported eagerly; lazy child pages use local Suspense; sidebar route prefetch covers the deep dashboard routes.
- **Loading cleanup** — auth boot is bounded, duplicate initial-session profile fetches are ignored, missing profiles fail closed to `AccessDenied`, and page-load transitions / route fade animations are removed.
- **Design-system consolidation** — HeroUI v3 token bridge, theme-aware focus rings, shared filter/select/search primitives, and broad status/accent token sweeps keep the UI consistent across the five shipped themes.
- **Wave 17 polish** (today) — sidebar nav categories default to collapsed on first visit (route-driven auto-open keeps current section visible); icon-only sidebar gets dark-chip tooltips on hover (no arrow, rectangular); HeroUI `<Tabs.Tab>` labels forced `white-space: nowrap` globally so multi-word labels like "In Progress" never stack; coloured left-edge accent bars removed from Smart Insights cards; **every `<thead>` in the app standardised on `bg-surface-card`** (white in light theme, theme-appropriate elsewhere) — was previously a mix of `bg-surface-page` / `bg-surface-elevated` / bare across 22 files; **primary buttons retemed to dark navy `#1b1f2e` in the light theme** (matches sidebar) — only CTAs and focus rings change, orange brand accents on text/links preserved; **HeroUI v3 `<Checkbox>` rolled out across every list page (Wave 17D complete)** — the row-select pattern lives in a single `<TableCheckbox>` primitive at [apps/web/src/components/shared/table-checkbox.tsx](apps/web/src/components/shared/table-checkbox.tsx) used by DataTable + 7 standalone-table routes (clients, invoices, compliance, subcontractors, engineers, jobs, actions), with full indeterminate-state support for "some-but-not-all" select-all; **page-mount fade animations killed** so pages reveal instantly with no transition; **uniform white form inputs across the app (Wave 17E)** — 24-file `bg-surface-page → bg-surface-card` sweep + new shared [`<SearchInput>`](apps/web/src/components/shared/search-input.tsx) primitive for every list page (10 files migrated) + a global CSS safety net so future raw inputs default white automatically; **`<FilterSelect>` primitive (Wave 17F)** at [apps/web/src/components/shared/filter-select.tsx](apps/web/src/components/shared/filter-select.tsx) replacing bespoke `filterSelectClass` constants on compliance / assets / portal-documents (6 selects); **focus rings retoned to accent token** across ~30 files — `focus:ring-brand-500` → `focus:ring-accent` so the ring colour follows the active theme automatically.
- **Wave 17C** — `<AlertDialog>` migration for destructive confirmations (bulk delete type-to-confirm).
- **Wave 17B** — Form components migrated to HeroUI v3 (`<TextField>` + `<Input>` + `<Label>` + `<FieldError>`) across 28 files.
- **Wave 16** — Sidebar / topbar polish; brand-mark + Wordmark lockup.
- **Earlier waves (12–15)** — Multi-tenancy hardening, mobile field ops, GDPR exports, branding, accounting integrations, audit log.

---

## License

Proprietary — © Haumea Facilities OS Ltd. All rights reserved.
