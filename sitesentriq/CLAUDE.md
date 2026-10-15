# Facilities OS

## Repo layout (npm workspaces monorepo as of 2026-04-28)

```
SiteSentriq/                  ← workspace root
├── package.json              ← workspaces: ["apps/*", "packages/*"]
├── apps/
│   ├── web/                  ← Vite + React Router dashboard SPA (haumea-web)
│   │   ├── src/routes/       ← dashboard + auth + portal pages
│   │   └── (vite, tsconfig*, public, e2e, playwright config)
│   ├── marketing/            ← Vite marketing site (haumea-marketing) — separate deploy
│   │   ├── src/pages/        ← home, features, pricing, about, contact
│   │   └── (own vite config, own tsconfig)
│   └── mobile/               ← Expo + React Native (haumea-mobile)
│       └── app/, hooks/, lib/, components/, app.json
├── packages/                 ← shared packages (workspaces)
│   ├── types/                ← @haumea/types — Database row + domain types
│   ├── utils/                ← @haumea/utils — pure helpers (cn, formatDate, ...)
│   └── ui/                   ← @haumea/ui — web primitives (HeroUI v3 wrappers)
├── supabase/                 ← migrations + seed (shared backend, not in any app)
├── docs/, references/, brand-source/
└── README.md, CHANGELOG.md, CLAUDE.md, etc.
```

Run from the workspace root:
- `npm run dev:web` — start the web Vite server
- `npm run dev:mobile` — start the Expo metro bundler
- `npm run build:web` — production build of the web app (outputs to apps/web/dist/)
- `npm run lint:web` / `npm run test:web` / `npm run tsc:web`

## Goal
Complete the full MVP application. Phase 1 scaffolding is done. Phase 2 must fill all PRD feature gaps and polish the design.

## Stack (web — apps/web)
- Build tool: Vite
- Framework: React 19 + React Router (SPA)
- UI: HeroUI (formerly NextUI) + Tailwind CSS v4
- Data fetching: TanStack Query + Supabase JS client
- Tables: TanStack Table
- Forms: React Hook Form + Zod
- Charts: Recharts
- Icons: Lucide React
- Database: Postgres via Supabase
- Auth: Supabase Auth
- File storage: Supabase Storage
- Realtime: Supabase Realtime
- Multi-tenancy: Supabase Row Level Security
- Server logic: Supabase Edge Functions
- Payments: Stripe
- Email: Resend

## Design System
- See **docs/DESIGN.md** for the full design philosophy: tokens, button/input/card/table patterns, and "what goes where". Follow it for all UI.
- **Sidebar**: Dark navy (#0f1225) with warm orange active state
- **Brand/Primary**: Warm orange (#e8772e) — use `brand-*` tokens
- **Surfaces**: Light gray bg (#f8fafc), white cards (#ffffff)
- **Status colors**: Compliant=#10b981, Due Soon=#f59e0b, Overdue=#ef4444, Non-Compliant=#dc2626
- **Typography**: Gray-900 for headings, gray-600 for body, gray-400 for muted
- **Buttons**: Use HeroUI Button with `color="primary"` for primary actions, default for secondary
- **Cards**: White background, subtle border or shadow, no colored backgrounds
- **Tables**: Use HeroUI Table component — not raw HTML tables
- **Badges/Chips**: Use HeroUI Chip for status indicators
- CSS custom properties are defined in src/index.css under @theme

## Phase 2 Build Order
Read PROGRESS.md for the full task list. Build in this order:

### Block A: Design Polish (tasks 16-20)
1. Replace all hardcoded color classes across ALL pages with brand/status tokens from the design system
2. Convert all raw HTML tables to HeroUI Table component
3. Add empty state illustrations and breadcrumbs to all pages
4. Ensure responsive layouts on all pages

### Block B: Core Feature Gaps (tasks 21-46)
5. Client management enhancements (site managers, regions)
6. Asset detail completions (compliance tab, service history, maintenance links)
7. Compliance type categories + proof upload via Supabase Storage
8. PPM auto-job generation + fixed/rolling schedule modes
9. Scheduler time windows + engineer availability
10. Document upload via Supabase Storage + version tracking
11. Quote-to-job conversion + portal approval workflow
12. Invoice PDF generation + email reminders via Resend
13. Client portal site switcher + actions view
14. All notification types + email integration
15. Auto-trigger timeline events on CRUD operations
16. Complete analytics dashboards with real data
17. Settings: notification prefs + user invite emails

### Block C: Should Have Features (tasks 47-48)
18. Contracts and service agreements module
19. Actions/defects module

## Loop Protocol
1. Read PROGRESS.md to see what is done
2. Pick the next incomplete task
3. Implement it fully — data layer, UI, and integration
4. Run `npm run build` to verify no compile errors
5. Fix any errors before moving on
6. Update PROGRESS.md — mark task complete, add timestamp and summary
7. Repeat until all tasks are done

## Rules
- Never stop because something is hard — skip and log to BLOCKERS.md
- Never ask for confirmation or clarification
- If a dependency is missing, install it with npm
- Use the design system colors consistently — never use raw blue-500, green-500, etc. Use brand-*, status-*, navy-*, surface-* tokens
- Use HeroUI components: Button, Card, Table, Input, Select, Modal, Dropdown, Tabs, Badge, Chip, Avatar, Spinner
- All forms must use React Hook Form + Zod validation
- All data fetching must use TanStack Query with loading/error states
- Use Supabase JS client for all database operations
- Use React Router for all routing — lazy load route components
- Keep the code simple — no over-engineering
- After finishing all tasks, do a final full build check

## Verify Command
```bash
npm run build && echo "BUILD SUCCESS" || echo "BUILD FAILED"
```

## Project Structure
```
src/
  main.tsx
  App.tsx
  index.css              # Design system tokens (@theme)
  routes/
    auth/
    dashboard/
    clients/
    properties/
    assets/
    compliance/
    maintenance/
    scheduler/
    jobs/
    reports/
    documents/
    quotes/
    invoices/
    analytics/
    settings/
    portal/
    contracts/           # NEW — service agreements
    actions/             # NEW — defects/actions
  components/
    layout/
      sidebar.tsx        # Dark navy themed
      topbar.tsx         # White with brand accents
      portal-layout.tsx
    shared/
  hooks/
  lib/
    supabase.ts
    auth.ts
    utils.ts
    constants.ts
  types/
supabase/
  migrations/
  seed.sql
```
