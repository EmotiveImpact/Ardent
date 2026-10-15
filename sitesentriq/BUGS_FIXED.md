# Bugs Fixed — log

A running record of bugs found and how they were fixed. Newest at the top of each
section. Use this for context: many of these were **systemic** (one root cause →
many symptoms), so when something looks "off" check whether it's an instance of a
class already documented here.

Conventions: **Symptom** → what the user saw · **Cause** → the real reason ·
**Fix** → what changed.

---

## Systemic Tailwind / design-token bugs

These were the highest-leverage: a single token/config gap broke many things at once.

### tailwind-merge stripped text colour
- **Symptom:** primary buttons rendered with invisible (gray-900-on-navy) text; chips lost status colours.
- **Cause:** the custom font-size scale (`text-micro … text-headline`) wasn't known to `tailwind-merge`, so `cn()` treated `text-caption` and `text-[var(--accent-foreground)]` as conflicting and dropped the colour.
- **Fix:** built `cn` from `extendTailwindMerge` registering the scale as a `font-size` group. `packages/ui/src/radix/primitives.tsx`.

### `@haumea/ui` not scanned by Tailwind
- **Symptom:** danger buttons transparent, modal backdrops didn't dim, status tints missing — but only after a spike file (that referenced the same classes from `apps/web/src`) was deleted.
- **Cause:** the component package is symlinked under `node_modules`; Tailwind ignores that, so arbitrary utilities used **only** inside `@haumea/ui` were never generated.
- **Fix:** `@source "../../../packages/ui/src/**/*.{ts,tsx}"` in `apps/web/src/index.css`.

### Unregistered semantic colours (dead utilities)
Pattern: a token was defined as `--x` but **not** in Tailwind's `--color-*` namespace, so `bg-x`/`text-x`/`ring-x` were invalid classes that silently did nothing (fell back to `currentColor` or transparent).
- **`accent`** (~200 uses): thick **dark** focus rings (fell back to currentColor), accent text/borders missing → registered `--color-accent` (+ `-soft`, `-soft-foreground`). `index.css`.
- **`foreground` / `background`** (21 uses): floating bulk-select bars rendered **transparent** (the `bg-foreground text-background` inverted pattern) → registered `--color-foreground` / `--color-background`.
- **`muted-foreground`, `overlay-foreground`**: text/tooltip text fell back to currentColor → registered.
- **`bg-muted`** (22 uses, made the report builder look flat): `--muted` is a *text* gray, wrong as a surface → repointed all `bg-muted` to `bg-surface-page`.
- Detection method: a scanner that diffs every color utility used in source against what Tailwind actually generated in the built CSS.

### Pointer cursor missing on buttons
- **Symptom:** buttons/menus/tabs showed the arrow cursor, not a pointer.
- **Cause:** Tailwind v4 Preflight sets `button { cursor: default }`; HeroUI used to override it, the migration didn't.
- **Fix:** base-layer rule restoring `pointer` on buttons + ARIA interactive roles; `not-allowed` for disabled. `index.css`.

---

## HeroUI v3 → Radix migration

### HeroUI Table "0 columns" crash
- **Symptom:** crashes at `/dashboard/jobs`, `/dashboard/reports/builder`, `/dashboard/compliance/statements`: "Cell count must match column count. Found N cells and 0 columns."
- **Cause:** HeroUI v3-beta's react-aria Table throws on cache-warm mount with dynamic columns (deterministic).
- **Fix:** converted **all 48 tables** to plain semantic HTML; native `<input>` checkboxes.

### Native `<select>` dropdowns rendered dark on light theme
- **Symptom:** the option popup was a dark/charcoal panel on a light page.
- **Cause:** native `<select>` popups are OS-drawn using `color-scheme`; can't be themed.
- **Fix:** backed `FilterSelect`/`FormSelect` with a Radix `Select` rendering a tokened popover (`surface-card`). `packages/ui/src/radix/select.tsx`. **Gotcha:** Radix reserves the empty string as a value — `value=""` options crashed it; mapped `''` to a sentinel.

### PDFs "just showed code"
- **Symptom:** exporting a PDF opened a tab of raw HTML.
- **Cause:** `window.open('') + document.write` was MIME-sniffed as text.
- **Fix (final):** print via an off-screen iframe (`openPrintableHtml`). See PDF section.

---

## Dashboard layout

- **Statement-of-Compliance card empty space / bunched content** — the card stretched to match the taller Compliance Score card but content stayed top-pinned. Fix: body `flex-1 justify-center` + a score-range visual bar.
- **Statement card header wrapped to 2 lines** — long uppercase title + "Generate now" button competed for one row in the narrow 1/3 card. Fix: icon-only generate button + tighter tracking + `whitespace-nowrap`. (Then matched the Compliance Score card's button to it.)
- **Grid columns didn't align down the page** — top card row used `gap-5`, KPI grid used `gap-3`, so column tracks didn't line up. Fix: unify all dashboard grids to `gap-5`.
- **Icon tiles read as "grey/off"** — `bg-accent-soft` (cool navy-grey in the light theme) wrapped an orange `text-text-accent` icon. Fix: warm `bg-brand-500/10` tiles app-wide (reports, timeline, saved-views, audit, properties).
- **Sidebar vs topbar header height mismatch** — sidebar header `h-16` (64px) vs topbar `h-14` (56px), so their bottom borders didn't meet. Fix: both `h-14`.
- **Sidebar scrolled with the page (regression)** — the desktop `<aside>` had `sticky top-0 h-screen` and was correct, but a *prior* commit (`2d60a780`) added `html, body { overflow-x: hidden }` to `index.css`. `position: sticky` breaks when **any** ancestor establishes a scroll container, and `overflow-x: hidden` on `html/body` forces `overflow-y: auto` — silently turning the document into the scroll container and detaching every sticky descendant. Fix: removed the rule from `html/body` entirely and moved the horizontal-overflow guard onto the content column as `overflow-x-clip` (`clip` does **not** establish a scroll container, so sticky still resolves against the viewport). `index.css`, `routes/dashboard/layout.tsx`.
- **Topbar didn't pin on scroll** — `<header>` had a solid background + bottom border but no sticky. Fix: `sticky top-0 z-30` (safe because the content-column guard is `overflow-x-clip`, not `hidden` — `clip` doesn't create a scroll container). `components/layout/topbar.tsx`.

## Floating bulk-action bar
- **Flashed left → centre on appear** — it centred with `-translate-x-1/2` AND animated with a transform keyframe; the two transforms fought for a frame. Fix: centre via **auto-margins** (`left-0 right-0 mx-auto w-fit`), animate Y-only (`animate-rise`). `bulk-action-bar.tsx`, `data-table.tsx`, `clients/index.tsx`.
- **Wrapped to 2 lines** — `flex-wrap` + `max-w-[90vw]`. Fix: `flex-nowrap` + `overflow-x-auto` + `shrink-0` children (scrolls on tiny screens instead of wrapping).

## PDF export
- **"PDF" button downloaded an `.html` file** (report builder) — it called `downloadBlob(...'.html')` instead of printing. Fix: route it through `openPrintableHtml`.
- **`openPrintableHtml` unreliable** — `window.open(blobURL)` is blocked when not in a fresh user gesture (after an `await`) and sometimes MIME-sniffed as text. Fix: print via an off-screen **iframe** (`srcdoc`), with a `window.open` fallback. Now exported + shared by every PDF path.
- **PDFs were unbranded** — plain table print. Fix: shared `documentShell`/`documentHeader` with a SiteSentriq wordmark header band, fixed page footer (date + page numbers via CSS `@page` counters), brand-accented tables. Consistent across invoice/quote/PO.

---

## Logic bugs (from the read-only audit)

### HIGH — duplicate compliance PPM jobs on every schedule regeneration
- **Symptom:** clicking "Generate Jobs" repeatedly created duplicate compliance jobs; visits never showed as "scheduled".
- **Cause:** the dedup keyed compliance jobs on `job.title`, but generated jobs use a *different* title (`"<name> - Scheduled Visit"`) and never stored `compliance_item_id`, so the match always failed. (Maintenance plans were safe — they key on `maintenance_plan_id`, which *is* stored.)
- **Fix:** select + stamp `jobs.compliance_item_id` (column exists since migration `00081`, FK in `00041`), key the dedup on it, and add `compliance_item_id` to the `Job` type. `hooks/use-schedule-generation.ts`, `packages/types/src/index.ts`.

### MED — converting a quote left the detail page stale (double-convert)
- **Symptom:** after converting a quote to invoice/job, the quote-detail page still showed the old status with the Convert button live — you could convert again (second invoice/job).
- **Cause:** both convert hooks invalidated only `['quotes']` (the list), not `['quotes', id]` (the detail).
- **Fix:** invalidate the detail key too in both hooks. `hooks/use-quotes.ts`.

### Investigated, NOT a bug
- Audit suggested copying `tax_rate` onto converted invoice lines — **rejected**: invoices use a single header-level tax rate; `invoice_lines` has no per-line tax column, so it would error. Header tax/subtotal is set correctly from the quote.

---

## Mobile (field engineer app)

### Engineer movement tracking was never wired (web Tracker permanently empty)
- **Symptom:** the web **Engineer Tracker** always showed _"No live tracker data is available for this engineer yet."_ — you could not see engineers moving.
- **Cause:** the web consumer (`use-engineer-tracker.ts`) reads `engineer_locations`, and a web *producer* existed (`useRecordEngineerLocation`), but **nothing on the phone ever wrote that table** — mobile only dropped point-in-time `field_events` ('arrived'/'working_completed'). Producer and consumer were both built but never connected across the two apps.
- **Fix:** added `apps/mobile/lib/location-tracker.ts` — a foreground `watchPositionAsync` stream into `engineer_locations`, mirroring the web writer's RPC + insert shape exactly. Wired into `app/job/[id].tsx`: **On My Way** → `travelling`, check-in → `on_site`, check-out / screen-unmount → stop. No web changes needed; the Tracker now renders a live dot + ETA.

### Profile role badge still teal after the orange rebrand
- **Symptom:** the role chip on the mobile Profile screen had a teal background (`#f0fdf9` / `#99f5de`) with orange text — a colour clash, leftover from the pre-rebrand teal palette.
- **Fix:** repointed the badge to brand-orange tints (`rgba(232,119,46,0.10)` / `0.30`). `app/(tabs)/profile.tsx`.

### Native libs unusable in JSX — `'SegmentedControl' cannot be used as a JSX component`
- **Symptom:** after adding `@react-native-segmented-control/segmented-control` + `@react-native-community/datetimepicker`, every usage threw TS2786 `cannot be used as a JSX component` / TS2607, and `onChange` params were implicit `any`.
- **Cause (two layers):** (1) `apps/mobile` carried its own **stale `@types/react ~18.3.12`** (devDeps) while React is 19 → a second `@types/react` copy (18.3.28) distinct from the root's 19.2.x, so the library's `React.Component` instance type didn't match the app's `JSX.ElementClass`. (2) Even after deduping to one v19 copy, the segmented-control package's bundled `.d.ts` types its default export as `Constructor<NativeMethods> & typeof Component`, which React 19's stricter JSX collapses to just `NativeMethods` (no `render`).
- **Fix:** (1) removed the stale devDeps pin and set `@types/react` to `~19.2.0` so npm hoists a **single** copy across the monorepo (`apps/mobile/package.json`). (2) added a one-line typed wrapper `components/ui/Segmented.tsx` re-casting the control to `ComponentType<SegmentedControlProps & { style? }>`; all call sites import `{ Segmented as SegmentedControl }`. The DateTimePicker error cleared with the types bump alone.

### Mobile app felt like "branded web", not native iOS (design rebuild)
- **Symptom:** every screen hand-painted a navy header, the tab bar had 6 items, and every choice was a custom pill-chip — it read as a cross-platform web app, not iOS.
- **Fix:** per `MOBILE_DESIGN_REVIEW.md` — tabs cut 6→3 (Today / Jobs / Reference) with nested native Stacks for real **large-title headers**; Profile moved off the bar to a **top-right avatar** (`components/ui/HeaderAvatar`); Assets+Compliance folded into a segmented **Reference** tab; Schedule folded into Jobs as a segmented control; native **SegmentedControl** (time-kind, report outcome, defect priority, job segments), native **DateTimePicker** (defect due date), native **Switch** (billable), **ActionSheetIOS** (photo source + asset picker), and **haptics** on check-in/out, photo capture, report submit, and selection changes. Lighter chrome; leftover teal badges → brand orange.

### FIXED — customer + engineer signatures shared one column
- **Symptom:** both signature slots rendered `job.signature_url`, so customer and engineer signatures displayed identically.
- **Cause:** `jobs` had a single `signature_url` column; `saveSignature('engineer')` and `('customer')` both wrote it, and both rendered it.
- **Fix:** migration `00090_engineer_signature.sql` adds `jobs.engineer_signature_url`; `saveSignature('engineer')` now writes that column and the engineer slot renders it (customer keeps `signature_url` + `customer_signature_at`). `Job` type gained the field. `hooks/useJobs.ts`, `app/job/[id].tsx`, `packages/types`. **CONFIRMED APPLIED (2026-06-07)** via the Dashboard SQL editor — the MCP `apply_migration` had been timing out because the project's **Disk IO Budget was depleted** (compute-tier throttle to ~5 MB/s → statements canceled by `statement_timeout`), NOT a transport/DB-health issue. Running the one-liner in the dashboard (browser → DB, different path) succeeded. Engineer signatures now persist correctly.

## Security

### HIGH — stored XSS in the report-builder PDF export
- **Symptom:** exporting a custom report to PDF could execute arbitrary script — a malicious client / asset / property name (rendered into the report) would run as code.
- **Cause:** `routes/reports/builder/index.tsx` built the printable HTML by interpolating the report name/description, header labels, and **raw cell values** (`cellDisplay` → `String(value)`, unescaped) straight into `<td>`/`<th>`. Harmless while it was a downloaded `.html` file, but commit `3039cdd` switched PDF printing to a **same-origin `srcdoc` iframe**, so that markup now executes in the app origin → stored XSS via tenant data.
- **Fix:** exported the existing `escapeHtml` from `lib/pdf.ts` and wrapped every interpolated value (name, description, header labels, and `String(cellDisplay(...) ?? '')` cells) in it. `lib/pdf.ts`, `routes/reports/builder/index.tsx`. (Found by the web review team; web typecheck/build still green.)

## Data integrity

### MED — a converted quote could spawn duplicate invoices
- **Symptom:** on a quote with status `converted`, the "Draft Invoice" button could be pressed repeatedly (or invoiced after a convert-to-job), each press creating a NEW invoice all numbered `INV-{quote_number}`. `invoices.invoice_number` had no unique constraint.
- **Fix (app layer — verified):** `useConvertQuoteToInvoice` is now **idempotent on `invoices.quote_id`** — if an invoice already exists for the quote it returns that one instead of creating another. The quote-detail page (`routes/quotes/[id].tsx`) uses a new `useInvoiceForQuote` hook to show a **"View Invoice"** link instead of the draft/convert buttons when an invoice already exists, and the convert mutation invalidates `['invoice_for_quote', id]`. 188/188 web tests pass (added an idempotency test to `use-quotes-convert.test.tsx`).
- **Fix (DB backstop):** migration `00089_invoice_uniqueness.sql` adds `unique (organisation_id, invoice_number)` + a partial `unique (quote_id) where quote_id is not null`. Pre-checked safe (0 existing duplicates on either dimension). **CONFIRMED APPLIED on the live DB (2026-06-07)** — both indexes verified present in `pg_indexes` after the MCP SQL transport recovered (it had been intermittently timing out). (Found by the web review team; ref WEB_REVIEW.md #2.)

## Performance — Disk IO budget depletion (DB throttling)

### Project throttled to ~5 MB/s; every tooled query timed out
- **Symptom:** the Supabase MCP `execute_sql`/`apply_migration` timed out for hours ("connection terminated due to connection timeout"); the dashboard warned the **Disk IO Budget** was depleting. Metadata APIs (get_project/get_logs) worked — so the DB was `ACTIVE_HEALTHY`, just IO-throttled. Postgres logs: 52× "canceling statement due to statement timeout".
- **Cause:** `pg_stat_statements` showed **~75% of total DB time was Supabase Realtime** — the WAL reader ran **340k+ times** because the `supabase_realtime` publication carried ~17 tables and the web client opened a `postgres_changes` channel for **16** of them. Every write to any published table (across the org) is processed by Realtime. Heavily amplified by the dev session (web dashboard + Expo-Web holding all 16 subscriptions open for hours while the seed agent wrote rows + multiple dev servers).
- **Fix:** trimmed Realtime to the **6 hot operational tables** (jobs, compliance_items, actions, invoices, quotes, timeline_events) on BOTH sides — the client subscription map (`apps/web/src/hooks/use-realtime-subscriptions.ts`, 16→6) and the server publication (migration `00091_trim_realtime_publication.sql`, dropped 11 cold reference tables). Cold tables now stay fresh via TanStack refetch-on-focus + staleTime. Stopped the leftover dev servers. The IO throttle eased immediately (the MCP became responsive again). Secondary contributors (`me()` 1.8k calls, `pg_timezone_names` 155× — mostly Studio/MCP introspection) were dev-amplified and left as-is. If real usage grows, bump Compute for a larger IO baseline.

## Database

### HIGH — every quote-line write threw `relation "quotes" does not exist`
- **Symptom:** inserting/updating any `quote_lines` row errored with `relation "quotes" does not exist` — quote-line creation was broken in the real app (found while seeding demo data).
- **Cause:** **live-vs-repo drift.** The repo's `00058` defines `public.fos_recalculate_quote_totals()` with `search_path = ''` AND schema-qualified tables (`public.quotes`, `public.quote_lines`) — correct. But the LIVE function had drifted to the pre-`00058` body (UNqualified `update quotes` / `from quote_lines`) while still carrying `set search_path = ''`. With an empty search_path, unqualified names resolve to nothing → the AFTER trigger on `quote_lines` threw on every write.
- **Fix:** migration `00088_fix_quote_totals_search_path.sql` — re-asserts the qualified body (and the sibling `fos_quote_lines_after_change`) with the hardened empty search_path **preserved** (qualify tables, don't loosen security). Applied to the live DB via Supabase `apply_migration` (returned success). Runtime insert re-verification was blocked by an intermittent MCP SQL transport outage at the time; the create-or-replace itself applied cleanly and matches the proven `00058` form.

## Notes / gotchas worth remembering
- **Stale HMR "X is not defined":** during long edit sessions, Vite's hot-reload module graph can corrupt (often after adding an import mid-edit), surfacing `useRef`/`AnimatePresence` "is not defined" at runtime. **Not a code bug** (tsc/build/tests pass). Fix: stop dev server → `rm -rf apps/web/node_modules/.vite` → restart. Production builds are immune (no HMR).
- **Vercel monorepo deploy:** deploy from the **repo root** (root `vercel.json` installs at root so npm workspaces link `@haumea/*`), not from `apps/web`. App-level `.npmrc` carries `legacy-peer-deps=true` for `vite-plugin-pwa` vs Vite 8.
- See also `docs/DESIGN.md` (design source-of-truth) and the memory file `tailwind-merge-custom-font-size.md`.
