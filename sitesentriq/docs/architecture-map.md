# Architecture Map

This is the working map for Haumea / SiteSentriq. It explains how the app boots, where features live, how data flows, and what must stay true for the product to remain fast.

## Runtime Flow

```text
index.html
  -> apps/web/src/main.tsx
    -> ThemeProvider
    -> PersistQueryClientProvider
    -> AuthProvider
    -> App router
      -> public/auth routes
      -> DashboardLayout
        -> RealtimeProvider
        -> lazy dashboard child routes
      -> PortalLayout / SiteLayout / Field routes
```

The dashboard shell is intentionally imported eagerly. It gives signed-in users the app frame immediately after auth resolves, while the heavier child pages remain lazy-loaded and are caught by a local `Suspense` boundary inside `<main>`. During `/dashboard/*` navigation the sidebar and topbar stay mounted; only the page outlet swaps to a section-level skeleton while a route chunk loads. `SpaNavigationGuard` is mounted inside `BrowserRouter` so same-origin internal anchors across the app are routed through React Router before the browser can perform a full document navigation.

## Layer Map

| Layer | Main files | Responsibility |
|---|---|---|
| App boot | `apps/web/src/main.tsx`, `apps/web/src/App.tsx` | Providers, router, persisted query cache, route splitting |
| Auth | `apps/web/src/contexts/auth-context.tsx`, `apps/web/src/lib/supabase.ts` | Supabase session, profile/org lookup, tenant-user fallback, realtime JWT wiring |
| Layout | `apps/web/src/components/layout/*` | Dashboard/sidebar/topbar, portal shell, site shell, field shell |
| Routes | `apps/web/src/routes/*` | Page-level UI and workflow composition |
| Data hooks | `apps/web/src/hooks/use-*.ts`, selected `apps/web/src/lib/**/hooks.ts` | TanStack Query reads/mutations, loading/error states, invalidation |
| Domain services | `apps/web/src/lib/**` | Notifications, audit, reports, certificates, integrations, billing, SLA, branding |
| Backend | `supabase/migrations`, `supabase/functions` | Postgres schema/RLS, storage policies, edge functions, realtime publication |
| Shared UI | `apps/web/src/components/shared/*` | Data table, filters, modals, empty states, skeletons, breadcrumbs |

## Data Flow

1. Route components call TanStack Query hooks.
2. Hooks call Supabase JS, RPCs, or edge functions.
3. Mutations optimistically patch obvious local changes, then invalidate their entity query keys on success.
4. Supabase Realtime Broadcast triggers patch/invalidate the same keys when another browser changes data.
5. Persisted successful query results hydrate from IndexedDB on reload.
6. Stale queries revalidate on mount or reconnect.

There is no global polling loop. If a screen needs polling, the hook that owns that screen must opt in locally and document why. Postgres Changes remains wired as a fallback, but the org-scoped Broadcast channel is the source of truth for instant cross-browser DELETE events.

## Loading Contract

| Concern | Current contract |
|---|---|
| Auth boot | `getSession()` capped at 4s; profile/org resolution capped at 5s |
| Duplicate auth event | Supabase duplicate `INITIAL_SESSION` is ignored after the explicit boot path |
| Missing profile | Dashboard route guard fails closed to `AccessDenied` instead of spinning forever |
| Dashboard shell | Eager import, no route-transition wrapper |
| Child pages | Lazy imports, dashboard-local Suspense fallback in `<main>` only |
| Internal navigation | Same-origin app links are intercepted by `SpaNavigationGuard` and handled by React Router, preserving the current shell |
| Route chunks | Sidebar hover/focus prefetch uses `src/lib/route-prefetch.ts` |
| Query cache | IndexedDB key `haumea-query-cache`, buster `APP_VERSION`, successful queries only |
| Live updates | One private org Broadcast channel patches/invalidates TanStack Query keys; Postgres Changes remains as fallback |
| Live diagnostics | Topbar realtime pill exposes channel state and last event to dev/debug/super-admin users |

## Feature Ownership Map

| Area | Routes | Hooks / services | Backend surface |
|---|---|---|---|
| CRM | `clients`, `properties` | `use-clients`, `use-properties`, notes/timeline helpers | clients, properties, areas, contacts |
| Assets | `assets` | `use-assets`, compliance/job/document hooks | assets, asset documents, service history |
| Compliance | `compliance` | `use-compliance`, certificate generation | compliance_items, certificates, storage |
| PPM / jobs | `maintenance`, `jobs`, `scheduler` | `use-maintenance-plans`, `use-jobs`, scheduling helpers | maintenance_plans, jobs, engineers |
| Commercial | `quotes`, `invoices` | quote/invoice hooks, Stripe helpers, PDF/email services | quotes, quote_lines, invoices, payments |
| Documents | `documents` | document hooks and upload helpers | documents, versions, Supabase Storage |
| Actions | `actions` | action hooks, realtime action toast | actions, timeline_events |
| Analytics | `dashboard`, `analytics`, `insights` | dashboard RPC hooks, analytics hooks | `dashboard_kpis()`, analytics tables/views |
| Settings | `settings`, `dashboard/settings/*` | branding, SLA, billing, integrations, SSO | organisations, profiles, integrations |
| Client portal | `portal` | portal hooks and approval flows | client-scoped RLS policies |
| Tenant portal | `site` | `apps/web/src/lib/site-portal/hooks.ts` | property_contacts, tenant-scoped RLS |
| Field app | `field` | field ops sync, time tracking, job updates | jobs, photos, signatures, time entries |

## Supabase Map

Core tenancy is `organisations -> profiles`. Business rows carry `organisation_id` and are protected by RLS policies that compare against the caller's profile organisation. Tenant portal access is narrower: `property_contacts` maps an auth user to a single property and tenant RLS policies expose only that property's records.

Primary operational tables:

```text
organisations, profiles
clients, properties, areas, assets
compliance_items, certificates
maintenance_plans, jobs, engineers, subcontractors
quotes, quote_lines, invoices, payments
documents, notes, timeline_events, actions
property_contacts, notification_subscriptions
```

Edge functions are grouped by job:

| Group | Functions |
|---|---|
| Comms | `send-email`, `send-push`, `weekly-digest`, `slack-post` |
| Billing/accounting | Stripe billing functions, Xero/QuickBooks sync functions |
| Reports/certs | certificate/report/PDF generation functions |
| Auth/portal | `site-invite`, `site-accept-invite`, SSO/tenant helpers |
| Ops | auto-assignment, calendar sync, deploy/status helpers |

## Adding A Feature

1. Add or reuse the route under the correct domain folder.
2. Put Supabase access behind a TanStack Query hook.
3. Use HeroUI primitives and design tokens, not raw color classes.
4. Add loading, empty, and error states on the page.
5. Add or update RLS and storage policies with the migration.
6. Add realtime invalidation keys if the feature changes live dashboard data.
7. Keep heavy charts, maps, and editors out of the dashboard shell.
8. Update `PROGRESS.md`, `CHANGELOG.md`, and this map when ownership changes.

## Performance Rules

- Do not import Recharts, Leaflet, PDF generation, or rich editors into `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, or `DashboardLayout`.
- Prefer RPCs for dashboard/analytics aggregates instead of downloading whole tables.
- Avoid app-wide polling. Org-scoped Realtime Broadcast plus targeted query invalidation is the default.
- Use the topbar realtime diagnostics before adding new logging or subscriptions when investigating live-update lag.
- Keep route-level skeletons local so `/dashboard/*` navigation never wipes the sidebar/topbar frame.
- Use React Router navigation primitives for internal links. The app-wide guard is a safety net, not a replacement for route-aware code.
- Bump `package.json` version when a release changes persisted query shapes or app boot behavior.
