# Web App Review — apps/web

Scope: confirm the latest web additions are sound and hunt for bugs. Mobile (`apps/mobile`) reviewed read-only; the uncommitted tree changes are all mobile and were ignored. Date: 2026-06-07.

---

## (a) Per-recent-feature: what it does + is it complete

| Commit | Feature | What it does | Complete / correct? |
|---|---|---|---|
| **f125c01** | mobile read views, on-site capture, release hardening | Touches `apps/mobile` **only** — no `apps/web` or `packages/*` files. | N/A to web. Out of scope. |
| **2d60a78** | branded PDFs, shared EmptyState, mobile pass | `lib/pdf.ts`: invoice/quote/PO now render a branded doc — navy/orange brand band, shared `documentShell`/`documentHeader`, fixed page footer with `counter(page)/counter(pages)`, brand-accented tables, HTML-escaped. New `@haumea/ui` `<EmptyState>` + `DataTable.emptyState` prop. | PDF half: **complete and correct** (all interpolated user strings pass through `escapeHtml`). EmptyState half: **half-finished on web** — see Bug #3. The new `@haumea/ui` `EmptyState` and `DataTable.emptyState` prop are **dead code**; web still imports the older `components/shared/empty-state.tsx`. |
| **3039cdd** | report-builder PDF actually prints; harden `openPrintableHtml` | Report "PDF" button switched from `downloadBlob(...'.html')` (downloaded raw HTML) to `openPrintableHtml`. `openPrintableHtml` rewritten to print via an off-screen `srcdoc` iframe (no popup, no MIME-sniff-as-text), with `window.open` fallback + `afterprint`/60s cleanup. | Print mechanism: **correct & robust**. But the report HTML it now prints is built **without HTML-escaping** cell values — see Bug #1 (XSS). |
| **2c6e32c / caf2650 / 4aee46e / a8ea90a / 5d6cd55** | dashboard layout fixes | Pure CSS/Tailwind + small markup tweaks to KPI grid, compliance-score card, statement-of-compliance pulse, trend chart reorder. | **Complete, low-risk.** No logic/data changes. |
| **8842637** | stop duplicate compliance PPM jobs + stale quote-convert (audit) | (1) Schedule dedup now keys compliance jobs on `compliance_item_id` (stamped on generated jobs) instead of mismatched title. (2) Both convert hooks now invalidate `['quotes', id]` so the detail page status flips to `converted` and the Convert button disappears. Adds `compliance_item_id` to `Job` type. | **Correct.** Verified internal consistency: compliance loop keys on `itemId` (`use-schedule-generation.ts:101`), generated jobs store `compliance_item_id` (:214), job map reads it (:80). `compliance_item_id` column exists since migration 00081. |
| **d95086e** | floating bulk-action bar flash + wrap | Centring moved from `-translate-x-1/2` to auto-margins (`left-0 right-0 mx-auto w-fit`) so the new Y-only `animate-rise` keyframe no longer fights the centring transform; `flex-nowrap` + `overflow-x-auto` instead of `flex-wrap`. | **Correct.** Clean CSS-only fix. |

---

## (b) Check-suite results (run from repo root)

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck:web` (`tsc -b`) | **PASS** (exit 0) | clean |
| `npm run lint:web` (`eslint .`) | **PASS** (0 errors) | 1 pre-existing warning: `routes/jobs/[id].tsx:103` — `useEffect` missing dep `job` (not from recent commits) |
| `npm run test:web` (vitest) | **PASS** — 25 files / 187 tests | 1 benign jsdom log: `HTMLCanvasElement getContext` not implemented (no canvas pkg) |
| `npm run build:web` (vite) | **PASS** — built, PWA precache generated | No mobile file caused any web check to fail. |

All four web checks are green.

---

## (c) Prioritized bug list

### CONFIRMED

**Bug #1 — [HIGH] Stored XSS / markup injection in report-builder PDF**
- File: `apps/web/src/routes/reports/builder/index.tsx:225-227, 241`; root cause in `apps/web/src/lib/reports/query.ts` `formatCell` (:214-232) / `cellDisplay` (:239-249).
- Symptom: report cell values and embedded relation names are interpolated straight into `<td>`/`<th>` HTML with **no escaping** (`formatCell` returns raw `String(value)`). A client/asset/property/quote name containing `<`, `>`, `&`, or a `<script>`/`<img onerror>` payload will corrupt the table or **execute script** when the report is printed — the HTML is mounted in a same-origin `srcdoc` iframe by `openPrintableHtml`, so injected script runs in the app origin.
- Why it matters now: 3039cdd changed this button from *downloading* an `.html` file (inert) to *rendering* it in an iframe — turning a latent issue into a live execution path.
- Note: `lib/pdf.ts` does this correctly (has `escapeHtml`); the report builder simply doesn't reuse it.
- Suggested fix: run every interpolated value (cell display + field labels, even though labels are currently static) through an `escapeHtml` before building `ths`/`trs`/`name`/`description`. Export `escapeHtml` from `lib/pdf.ts` and reuse.

### SUSPECTED

**Bug #2 — [MED] "Draft Invoice" on an already-converted quote can spawn duplicate invoices with identical `invoice_number`**
- Files: `apps/web/src/routes/quotes/[id].tsx:287-317` (the `status === 'converted'` branch) + `apps/web/src/hooks/use-quotes.ts:335` (`invoice_number: INV-${quote.quote_number}`).
- Symptom: once a quote is `converted`, the page still shows a "Draft Invoice" button with no terminal guard. Each press creates a **new** invoice, all hardcoded to `INV-{quote_number}`. There is **no unique constraint** on `invoices.invoice_number` (verified — `00001_initial_schema.sql:355` is `text not null`, only non-unique indexes on org/client/status). So repeated presses silently create duplicate draft invoices with the same number rather than erroring.
- The audit comment ("no double-charge risk because the user still sends manually") is true for *charging*, but the duplicate drafts are a data-integrity / reconciliation problem and the colliding number breaks any "find invoice by number" assumption.
- Suggested fix: either add a `unique (organisation_id, invoice_number)` constraint (so the 2nd attempt fails → graceful `onError` toast) and/or disable/hide "Draft Invoice" once an invoice already exists for the quote (query `invoices` by `quote_id`).

**Bug #3 — [LOW] New `@haumea/ui` EmptyState + `DataTable.emptyState` prop are dead code (half-finished feature)**
- Files: `packages/ui/src/empty-state.tsx`, `packages/ui/src/index.ts` (export), `apps/web/src/components/shared/data-table.tsx:21,37,176-181`.
- Symptom: 2d60a78 added a shared `EmptyState` and a `DataTable.emptyState` prop "for list bodies", but **no web route imports the `@haumea/ui` EmptyState** and **no `DataTable` is given an `emptyState` prop** (grep: 0 hits for `emptyState=` and 0 imports of EmptyState from `@haumea/ui`). Web continues to use the older `apps/web/src/components/shared/empty-state.tsx`. The new component/prop add API surface but deliver no behavior change.
- Latent risk if it *is* wired later: the `DataTable` early-return `if (data.length === 0 && emptyState) return <div>{emptyState}</div>` (data-table.tsx:176-181) **drops the table header, the toolbar, and bulk-selection chrome** — a list filtered to zero rows would lose its column headers and any filter UI living inside the table. Acceptable only if callers render those outside the table.
- Suggested fix: either wire the new EmptyState into list routes (and confirm the early-return doesn't hide needed chrome) or remove the unused export/prop to avoid drift with the existing shared component.

### VERIFIED-OK (potential concerns that checked out clean)

- **Quote-line writes vs migration 00088:** `useCreateQuote` (`use-quotes.ts:100-117`) inserts into `quote_lines` with `cost_price`/`markup_percent`/`tax_rate`/`total`/`sort_order` — all columns exist (00043 adds the commercial three). The `fos_quote_lines_after_change` trigger fires `fos_recalculate_quote_totals`, which 00088 re-qualifies to `public.quotes`/`public.quote_lines` under the hardened empty `search_path`. **Post-00088 the insert succeeds.** Any residual failure is surfaced gracefully: `throw lineError` → `onError` → `toast.error(error.message …)` (line 137-139), and the orphaned quote is rolled back (line 114). The web UI handles it correctly.
- **`status = 'converted'` updates:** both convert hooks set quotes to `converted`; the `quotes_status_check` CHECK was widened to include `'converted'` in migration 00043 (:97-98), so the update won't violate the constraint. (Even if it did, it's best-effort with `console.warn`, not a hard failure.)
- **Convert-twice race:** convert buttons are gated on `quote.status === 'approved'` and disabled while `isPending`; both navigate away on success and 8842637 added `['quotes', id]` invalidation so a user who stays sees the button disappear. Good. (The separate `converted`-state "Draft Invoice" button is Bug #2, a different path.)
- **PDF NaN/£0 subtotal:** `generateInvoicePdf` guards VAT% with `subtotal > 0 ? … : 0` (`pdf.ts:138`); the convert-to-invoice path derives `subtotal = total − tax` (`use-quotes.ts:342`) and the portal path uses `tax = max(0, total − subtotal)` (`portal/invoices.tsx:69-71`). No NaN.
- **Schedule job invalidation:** `useGenerateJobsFromSchedule` invalidates `['jobs']`, which prefix-matches the schedule's `['jobs','year',…]` key. Refreshes correctly.
- **`openPrintableHtml` robustness:** off-screen `srcdoc` iframe, `afterprint` + 60s fallback cleanup, `window.open` fallback on `print()` throw. Sound. (Its only weakness is the *content* it's handed by the report builder — Bug #1.)

---

## (d) Things that look half-finished

1. **`@haumea/ui` EmptyState + `DataTable.emptyState`** — added but never adopted (Bug #3). Two parallel empty-state implementations now coexist.
2. **`DataTable.emptyState` early-return** (data-table.tsx:176-181) — renders a bare `<div>` that omits header/toolbar/selection chrome; unfinished/unsafe if adopted as-is.
3. **Report-builder HTML generation** — shares the *print* mechanism (`openPrintableHtml`) with `lib/pdf.ts` but **not** its escaping discipline. Consolidating onto a shared escaped builder is the obvious follow-up.

---

### Recommended fix order
1. **Bug #1** (report PDF XSS) — confirmed, security, live execution path. Fix first.
2. **Bug #2** (duplicate invoice numbers) — data integrity; add unique constraint + guard the button.
3. **Bug #3 / half-finished EmptyState** — cleanup / wire-up; low risk.
