# Mobile Product Vision — Haumea Field-Engineer App

**Author:** Mobile PM + UX
**Date:** 2026-06-07
**Stack:** Expo SDK 54 · React Native 0.81 · expo-router v6 · Supabase (`vphjwvleffuwwgbjxups`)
**Brand:** warm orange `#e8772e` · navy `#0f1225`
**Audience:** the field engineer (the person holding the phone in the rain with one glove off), and the engineers who build for them.

This is the product/UX vision for a best-in-class field-engineer app. It assumes the design direction in `MOBILE_DESIGN_REVIEW.md` (native iOS shell, large-title headers, segmented controls, haptics, 3 tabs + avatar — **already implemented**) and the integration map in `ENGINEER_APP.md`. It builds **on top** of that: what the app should _become_, screen by screen, gap by gap, tied to real Supabase tables so it is buildable, not fantasy.

The north star: **an engineer should be able to run their entire working day from this app without ever phoning the office or opening a laptop** — and the office should see everything they do, live, with zero double-entry.

---

## 1. The engineer's day — jobs-to-be-done

The engineer doesn't think in tabs. They think in a sequence of moments. Each moment is a "job to be done"; each maps to a surface in the app. This is the spine the whole IA hangs off.

| # | Moment | What the engineer needs | App surface (today / proposed) | Key tables |
|---|--------|------------------------|-------------------------------|------------|
| 1 | **Wake / start shift** | "What's my day? How many jobs, where, how far?" | **Today** tab — greeting, count, remaining/done stats. _Add: first-job ETA, total drive time, map-of-day button._ | `jobs`, `engineer_assignments`, `properties` |
| 2 | **Plan the route** | "What order do I drive these in? What's the optimal route?" | _MISSING_ → **Map / route view** (button on Today, or a Schedule map mode). | `jobs`, `properties` (lat/lng) |
| 3 | **Travel to job 1** | "Navigate there. Tell the office I'm on my way + my ETA." | Job detail → **On My Way** (already streams `engineer_locations`). _Add: one-tap Apple/Google Maps nav, ETA auto-share, call-site button._ | `engineer_locations`, `field_events` |
| 4 | **Arrive on site** | "Check in. Prove I'm here (GPS). Pull up what I'm dealing with." | Job detail → **Check In** (GPS → `field_events 'arrived'`, job → in_progress). | `jobs`, `field_events`, `engineer_locations` |
| 5 | **Can't get in** | "Nobody home / no key / site closed. Log it and move on without a 'completion'." | _MISSING_ → **Failed-access flow** (status `failed_access` + reason + photo). | `jobs`, `field_events`, `job_photos` |
| 6 | **Understand the asset** | "Which boiler/AHU/extinguisher? When was it last serviced? Any open faults?" | Reference → Assets (read-only list today). _Add: **asset detail** + **QR scan-to-open**, service history, linked compliance._ | `assets`, `service_reports`, `compliance_items`, `actions` |
| 7 | **Check the paperwork** | "What's the RAMS / method statement / permit for this site? Any cert I need to read?" | _MISSING_ → **Documents / certs viewer** + **H&S / RAMS sign-off**. | `documents`, (new) `job_safety_signoffs` |
| 8 | **Do the work** | "Take before/after photos. Note what I found. Log the parts I fitted." | Job detail → Photos, Notes (built). _Add: **photo annotation**, **parts used**, **dynamic checklist**._ | `job_photos`, `notes`, (new) `job_parts` ↔ `stock_movements`, `service_reports.checklist` |
| 9 | **Hit a problem / find a defect** | "This needs a follow-up / a quote. Raise it now while I'm looking at it." | Job detail → **Raise defect** (built, → `actions`). _Add: quick-quote stub, photo on the defect._ | `actions`, (later) `quotes` |
| 10 | **Sign off** | "Get the customer's signature. File the outcome (pass/fail/revisit). Send their report." | Job detail → Service report + signatures (built). _Add: **distinct customer vs engineer signature**, sign-off name/role capture._ | `service_reports`, `jobs.signature_url`, completion email edge fn |
| 11 | **Log my time** | "Travel + on-site minutes, billable or not." | Job detail → Time entry (built, → `time_entries`). _Add: **auto-suggest from check-in/out timestamps**._ | `time_entries`, `field_events` |
| 12 | **Check out** | "Mark it done. Stop broadcasting my location. Move to the next." | Job detail → Check Out (built). | `jobs`, `field_events`, `engineer_locations` |
| 13 | **Hear from the office** | "Job got added/moved/cancelled. Office messaged me." | Push only today (deep-links to job). _Add: **notifications inbox** + **job chat**._ | (new) `job_messages`, `notifications`, `expo_push_tokens` |
| 14 | **End of day** | "How many did I do? How many hours? Anything outstanding?" | _MISSING_ → **day summary** (on Today, end-of-day card) + **timesheet summary** (Profile). | `time_entries`, `jobs`, `service_reports` |
| 15 | **Manage myself** | "Book leave / set availability. See my earnings/stats. Update profile." | Profile (account only today). _Add: **availability**, **earnings/stats**, **timesheet**._ | (new) `engineer_availability`, `time_entries`, `engineers` |

**The shape of the day in one line:** Today → (Map) → travel/On-my-way → Check in → asset+paperwork → work (photos/notes/parts/checklist) → defects → sign-off → time → Check out → repeat → end-of-day summary.

Everything that follows serves making each of those 15 moments fast, one-handed, and offline-proof.

---

## 2. Information architecture — 4 tabs + profile avatar

The user wants **4 tabs + a top-right profile avatar**. The dev is currently shipping **3 tabs** (Today · Jobs · Reference) + avatar. The design review argued 3 is cleanest. Both are defensible — here's the call.

### Recommendation: **4 tabs — Today · Jobs · Map · Reference** + avatar

The 4th tab should be **Map**, not Schedule.

**Why not Schedule as the 4th tab:** Schedule is the same dataset as Jobs (`useJobs`), already folded into the Jobs "Upcoming" segment. Re-promoting it to a tab re-creates the exact redundancy the review removed (Today/Jobs/Schedule = three views of one list). Adding it back would be a regression.

**Why Map earns the 4th slot:** A field engineer's #1 unmet need is _spatial_ — "where are my jobs and what's the smart order to drive them?" That is a genuinely distinct mental model from a list (it answers "route", not "what's next"), it's a daily-flow destination (not a lookup), and it has no good home inside another tab. It's the single highest-value _new_ surface for a driving engineer. Promoting it to a tab is the right call **once it exists**; until then, ship the 3-tab layout the dev has and gate Map behind P1.

### The four tabs

| # | Tab | Icon | Contains | Justification |
|---|-----|------|----------|---------------|
| 1 | **Today** | `CalendarDays` | Default landing. Greeting, today's jobs, remaining/done stats, **next-job ETA**, **map-of-day shortcut**, **end-of-day summary** card. | "Now." The engineer's home base — 90% of mornings start here. |
| 2 | **Jobs** | `Briefcase` | Full queue with segmented control: **Upcoming** (day-grouped, ex-Schedule) · **All** · **Completed**. _Add a status filter menu and search._ | "All my work." Schedule lives here as the Upcoming segment — same data, one place. |
| 3 | **Map** | `Map` | The day's jobs as pins in route order; tap a pin → job sheet; route line + drive-time totals; **live "my position"** dot; one-tap turn-by-turn handoff to Apple/Google Maps. | "Route." The distinct spatial JTBD; the highest-value new daily surface for a driving engineer. |
| 4 | **Reference** | `BookMarked` | Segmented: **Assets** · **Compliance** · **Documents**. Searchable. Tap → detail. **QR-scan** entry point. | "Look something up." Cold reference data; not daily-flow but indispensable on site. Documents joins the family. |
| — | **Profile** | avatar (top-right header) | Account, **timesheet summary**, **availability/leave**, **earnings/stats**, notification prefs, sign out. | iOS convention: account behind a top-right avatar, off the tab bar. |

**Migration path (honors what's already built):**
- **Now (P0, done):** 3 tabs `Today · Jobs · Reference` + avatar. Correct and shippable.
- **P1:** add **Map** as the 4th tab → reaches the user's requested 4. Add **Documents** as a third segment inside Reference.
- The IA never needs to churn again: Today/Jobs/Map/Reference are the four durable JTBD — _now_, _all my work_, _route_, _look it up_.

> If the team wants to stay at 3 tabs, Map can live as a mode-toggle inside Jobs ("List / Map") — but a dedicated tab is the better answer for a driving engineer and satisfies the explicit 4-tab ask.

---

## 3. What's missing — prioritized gap list

Effort key: **S** ≈ ≤1 day · **M** ≈ 2–4 days · **L** ≈ 1 sprint+. Each gap states _what / why it matters to the engineer / data source / effort_.

### P0 — finish the core visit loop (the app is "rich" only when these exist)

| Gap | What | Why it matters | Data source | Effort |
|-----|------|----------------|-------------|--------|
| **Failed-access flow** | One-tap "Couldn't get in" on job detail → reason picker (no access / no key / site closed / customer cancelled / unsafe) + optional photo → status `failed_access`, log `field_events`, stop location share. | The single most common non-completion. Today the engineer has no honest button — they either fake a completion or phone the office. | `jobs.status='failed_access'`, `field_events`, `job_photos`, `notes` | **S** |
| **Site & customer contacts + call/navigate** | Job detail contact card: site contact name + **tap-to-call**, **tap-to-navigate** (opens Apple/Google Maps to the property address), client phone. | An engineer arriving at a locked gate needs to call _now_ and navigate _now_ — not hunt for a number. | `properties` (address, contact fields), `clients`, `jobs` | **S** |
| **Distinct customer vs engineer signatures** | Two separate capture pads writing to two slots, + capture sign-off **name + role** for the customer. | Current code renders the _same_ `signature_url` for both (confirmed in review §4) — a compliance/audit bug. Customer sign-off without a name is legally thin. | `jobs.signature_url` (+ new `engineer_signature_url`), `jobs.customer_signature_name/role/at` | **S/M** (needs 1 column) |
| **Maps deep-link / navigation** | "Navigate" buttons everywhere there's an address (job card, job detail, map pin). | Field work _is_ driving. Removing the copy-paste-into-Maps friction saves minutes per job. | client-side (`Linking` → `maps://` / `comgooglemaps://`) | **S** |
| **Auto-suggested time entry** | After check-out, pre-fill an `on_site` time entry from `arrived_at`→`completed_date` and a `travel` entry from the location stream; engineer confirms/edits. | Engineers under-log time because typing it is tedious; this turns timesheets from a chore into a one-tap confirm. | `field_events`, `jobs.arrived_at/completed_date`, `engineer_locations`, `time_entries` | **M** |

### P1 — the "rich app" tier (depth the user explicitly asked for)

| Gap | What | Why it matters | Data source | Effort |
|-----|------|----------------|-------------|--------|
| **Map / route view (the 4th tab)** | Today's jobs as ordered pins, route line, drive-time totals, live position, tap-pin → job sheet, "Navigate next". | The spatial JTBD; turns a list of addresses into a drivable day. Highest-value new surface. | `jobs`, `properties` (lat/lng), `engineer_locations`; `react-native-maps` | **L** |
| **Parts / materials used on a job** | Add-parts UI: search `stock_items`, set qty → write a `job_parts` row + decrement stock via `stock_movements`. Show running parts list on the job. | Parts fitted on site that never get recorded = lost revenue + wrong stock counts. This is the biggest _money_ gap. | **needs schema:** new `job_parts(job_id, stock_item_id, qty, unit_cost)` join + `stock_movements` (issue); `stock_items` for the picker | **L** (backend decision first — flagged in `ENGINEER_APP.md`) |
| **Asset detail + QR scan-to-open** | Tap an asset → detail (make/model/serial/install, status, last service, **service history**, **linked compliance**, **open actions**). Scan a QR/asset tag → jump straight to that asset's detail or pre-select it on the current job. | On site the engineer is _at_ a specific unit; they need its history in 2 taps, and scanning beats scrolling a 200-asset list. | `assets`, `service_reports`, `compliance_items`, `actions`; `expo-camera` barcode scanner | **M** |
| **Job chat with the office** | Per-job message thread (engineer ↔ dispatcher), push-notified, photo attach. | Replaces the WhatsApp/phone-tag that currently happens off-system and out of the audit trail. | **new** `job_messages(job_id, sender_id, body, attachment_url, created_at)`; `expo_push_tokens` | **M/L** |
| **Notifications inbox** | A real inbox (bell in header or Profile) listing job-assigned / moved / cancelled / message / approval events, read state, deep-link. | Push is ephemeral — miss it and it's gone. An inbox is the durable record of "what changed for me today." | `notifications` (web already has this concept) + `expo_push_tokens` | **M** |
| **Documents / certs viewer** | Reference → Documents segment: site documents, RAMS, prior certs; in-app PDF/image viewer; filter by property. | Engineers need the method statement / permit / last cert _before_ they touch the asset — H&S and quality depend on it. | `documents`, Supabase Storage; `expo-document-viewer` / WebView PDF | **M** |
| **H&S / RAMS checklist + sign-off** | Pre-work safety checklist (dynamic, per job type) the engineer ticks + signs before "Check In" completes; risk-assessment acknowledgement. | Liability and real-world safety. A serious FM app cannot let work start without a documented safety step. | **new** `job_safety_signoffs` + `service_reports.checklist` (jsonb, already nullable) | **M** |
| **Photo annotation** | Draw/arrow/text on a captured photo before upload (circle the corroded valve). | "A photo of a fault" → "a photo that _shows_ the fault." Dramatically improves the report's usefulness to the office and customer. | `job_photos` (annotated image uploaded); `@terrylinla/react-native-sketch-canvas` or skia | **M** |
| **Photo lightbox** | Tap a thumbnail → full-screen pinch-zoom viewer with delete. | Current gallery is 88px thumbs with no zoom (review §4) — can't verify a photo on site. | `job_photos`; `react-native-image-viewing` | **S** |
| **Compliance proof capture** | From a compliance item (or job) → attach a cert photo/PDF + mark complete + set next-due. | Lets the engineer _close_ a compliance task in the field, not just read it. Closes the read-only gap on Reference. | `compliance_items` (update `last_completed`/`status`), Storage, `documents` | **M** |

### P2 — self-service & polish

| Gap | What | Why it matters | Data source | Effort |
|-----|------|----------------|-------------|--------|
| **Timesheet summary** | Profile → this-week hours, billable vs non, by-day breakdown, submit-for-approval. | Engineers want to see their own hours add up; reduces payroll disputes. | `time_entries` | **M** |
| **Earnings / job stats** | Profile → jobs completed this week/month, first-time-fix rate, avg on-site time, simple gamified streak. | Motivation + transparency; makes the app feel like _theirs_. | `jobs`, `service_reports`, `time_entries` | **M** |
| **Availability / leave** | Profile → set working hours, request leave / mark unavailable. Feeds the web scheduler. | Closes the loop so dispatch stops booking jobs into the engineer's day off. | **new** `engineer_availability`, `leave_requests`; `engineers` | **M/L** |
| **Quotes from the field** | Convert a defect into a draft quote (line items) for office approval. | Captures upsell at the moment of discovery. Deferred — complex line-items. | `quotes`, `actions` | **L** |
| **Offline robustness hardening** | Extend the existing AsyncStorage queue to cover _every_ mutation (reference data cached for offline read; conflict/version handling; queue visibility UI "3 items waiting to sync"). | Engineers work in basements and rural sites with no signal; "it'll sync later" must be trustworthy and _visible_. | `lib/offline-queue` (exists), all mutation tables | **M** (ongoing) |
| **Dynamic per-job-type checklist** | Service report carries a structured checklist driven by job/asset type (e.g. a gas safety checklist vs a fire-door inspection). | Standardizes quality; gives the office structured data, not just free-text notes. | `service_reports.checklist` (jsonb, already exists), job/asset type | **M/L** |

---

## 4. Screen-by-screen UX spec — the hero screens

Design language throughout: **native iOS shell** — large-title headers on tab roots, system-material/translucent bars, segmented controls for fixed choices, action sheets for source/asset pickers, native date/switch controls, 8pt grid, iOS type ramp, **haptics on every load-bearing action**. Brand = accent (orange selected segments, orange primary CTAs, navy tab bar/primary buttons); chrome stays neutral. (All per `MOBILE_DESIGN_REVIEW.md`.)

### 4.1 Today (tab 1)

**Purpose:** "What's my day, right now?" Land here every morning.

**Layout (top → bottom):**
1. **Native large title** "Today"; right slot = **profile avatar** (initials circle, ~32pt). No custom navy header.
2. **Greeting subhead** — "Good day, {firstName}" + long date. (Built.)
3. **Day-glance card** — three stats on the 8pt grid: **Remaining · Completed · Drive time** (drive time = sum of leg estimates). Tapping it scrolls to the list. _Add a 4th micro-stat: "Next at HH:MM · {site}"._
4. **"View on map" button** (orange, pill) → Map tab focused on today. _(P1.)_
5. **Job list** — `JobCard`s in time order. Each card already shows title, property, client, time, priority strip.
   - _Add to JobCard:_ a **distance/ETA chip** ("12 min · 4.2 mi"), a **status-aware leading affordance** (next job gets an orange "NEXT" tag), and a **swipe action** (swipe right → "On My Way"; swipe left → "Navigate").
6. **End-of-day summary card** (appears after the last job is done or after ~17:00): "{n} jobs done · {h}h logged · {k} defects raised · {m} reports filed." A satisfying close to the day. _(P2.)_
7. **Empty state** — "All clear for today" with the positive orange check (built; keep the positive-state color).

**Microinteractions / haptics:**
- Pull-to-refresh with brand tint (built).
- Card press → `selectionAsync()`; swipe-action commit → `impactAsync(Light)`.
- Completed jobs animate to a subdued/checked style (cross-fade, not a jump).

### 4.2 Job Detail (`job/[id]`) — the workhorse

This is where the engineer spends 80% of their time. It must be a **progressive, top-to-bottom workflow** that mirrors the visit, with the _next logical action_ always the most prominent thing on screen. Today it's a long scroll of equal-weight sections; the upgrade is **stateful prominence** — the sticky primary CTA changes as the visit progresses.

**Header:** native, standard (non-large) title = job title, native back chevron left, overflow `•••` right → "Navigate / Call site / Share / Failed access".

**Sticky bottom action bar (new — the single biggest UX win):** one primary button whose label/color reflects visit state:
- not arrived → **On My Way** (orange outline) + **Check In** (navy, primary)
- on site → **Submit & Check Out** (green, primary)
- completed → collapses to a "Completed ✓" pill.
This means the right action is always one thumb-reach away, regardless of scroll position.

**Sections (scroll body), in visit order:**

1. **Status + title row** — `StatusBadge` + job title (built).
2. **Info card** — Property (with address), Client, Scheduled date/time, Description (built). **Add: contact sub-row** with **Call site** (tap-to-call) and **Navigate** (maps deep-link) buttons. _(P0)_
3. **Safety / RAMS strip** _(P1)_ — collapsed "Safety check required before you start" → expands a checklist + acknowledge. Gates Check In until acknowledged for job types that require it.
4. **Documents strip** _(P1)_ — "3 documents for this site" → opens viewer (RAMS, last cert, permit).
5. **Asset(s) card** _(P1)_ — assets linked to this property/job, each → asset detail; **Scan asset** button to confirm you're at the right unit.
6. **Notes** — multi-line, offline-queued, one row per save (built). _Add a quick-note voice-to-text mic._
7. **Service report** — outcome **segmented control** (Pass/Fail/Incomplete/Revisit/N/A) with outcome-colored tint, notes, "Submit" / "Submit & check out" (built). _Add: structured checklist (P2); ensure signature is captured first._
8. **Parts used** _(P1)_ — "Add part" → search `stock_items` action sheet → qty stepper → list of fitted parts with running cost; writes `job_parts` + `stock_movements`.
9. **Time** — `TimeEntryForm`: kind (segmented Travel/On site/Admin/Break), duration, billable **native Switch** (built). _Add: pre-filled suggestion from check-in/out timestamps (P0)._
10. **Raise a defect** — title, **priority segmented**, **native date picker** due date, optional **asset action-sheet picker**, **+ photo on the defect** (built core; add photo). Writes `actions`.
11. **Check-In / Out** — timestamp readout + the buttons (now lifted into the sticky bar). **Live-location banner** when sharing (built). **Failed-access** entry point here too (P0).
12. **Photos** — "Add Photo" → action sheet Take/Library (built). _Add: **annotation** before upload (P1), **lightbox** on tap (P1), before/after grouping._
13. **Signatures** — **two distinct pads** (customer + engineer), customer captures **name + role**; render two distinct images (fix the shared-`signature_url` bug). _(P0)_

**Microinteractions / haptics (built where noted, extend the rest):**
- Check-in success → `notificationAsync(Success)` (built); failure → `Error` (built).
- Photo captured → `impactAsync(Light)` (built); report/defect/time submit → `Success` (built).
- Segment change → `selectionAsync()` (built).
- _Add:_ sticky CTA respects keyboard (lifts above it); successful sign-off plays a brief confetti/check animation; "Failed access" uses a destructive-styled action sheet.

### 4.3 Schedule (lives inside Jobs → "Upcoming")

Not a separate tab. Inside **Jobs**, the segmented control is **Upcoming · All · Completed** (built). "Upcoming" is the day-grouped forward schedule with iOS grouped-list **section headers** ("Today / Tomorrow / Mon 22 Jun") (built).

**Upgrades:**
- **Status filter** as a header menu (`•••` → All / Scheduled / In progress / Revisit) or a search-scope bar.
- **Search** (native `headerSearchBarOptions`) over title / property / client.
- Each day group header shows a **mini drive-time total** for that day.
- Sticky "**N jobs this week**" footer.
- Swipe actions on cards (Navigate / On My Way) consistent with Today.

### 4.4 Reference (tab 4)

**Purpose:** "Look something up." Cold reference, searchable, two taps to detail.

**Layout:**
1. Native large title "Reference" + avatar right.
2. **Segmented control: Assets · Compliance · Documents** (Documents new, P1). (Assets/Compliance built.)
3. Native **search bar** (`headerSearchBarOptions`) scoped to the active segment.
4. **Scan button** (header right, next to avatar, or a floating action) → camera QR/barcode → resolve to asset detail. _(P1)_

**Assets segment:**
- List: name, category chip, property, status badge. Category filter as a horizontal iOS filter-chip row (correct for unbounded counts — restyle off navy).
- Tap → **Asset detail** _(P1)_: header (name/category/status), spec card (make/model/serial/install date), **Service history** (from `service_reports` joined via jobs), **Linked compliance** (`compliance_items` where `asset_id`=this), **Open actions** (`actions` where `asset_id`=this), and "Raise defect against this asset" CTA.

**Compliance segment:**
- List ordered by `next_due`, status badge (Compliant/Due soon/Overdue), property. (Built.)
- Tap → **Compliance detail**: type, frequency, last completed, next due, status; **"Attach proof + mark complete"** (P1) → photo/PDF → updates `last_completed`/`status`, files to `documents`.

**Documents segment (P1):**
- Grouped by property; each row = doc name, type, date; tap → in-app viewer (PDF/image). Filter by property; pull the property in scope from the engineer's job set.

**Microinteractions:** segment change `selectionAsync()`; scan success `notificationAsync(Success)`; status badges use the design-system status colors (Compliant `#10b981`, Due soon `#f59e0b`, Overdue `#ef4444`).

### 4.5 Map (tab 3 — new, P1)

**Purpose:** "What's the smart order to drive my day?"

**Layout:**
- Full-bleed `react-native-maps`; **numbered pins** in route order (auto-ordered by a simple nearest-neighbour or just scheduled time), a **route polyline**, the engineer's **live position** dot (from the same `engineer_locations` stream).
- **Bottom sheet** (native, detented) listing the day's jobs in order; tap a row or a pin → **job preview card** (title, time, status, **Navigate** + **Open job**).
- Header chips: total **drive time** + **distance**; toggle Today / Tomorrow.
- "**Navigate to next**" primary button hands off to Apple/Google Maps turn-by-turn.

**Data:** `jobs` + `properties.lat/lng` (ensure properties carry coordinates; geocode on the web side if missing), `engineer_locations` for the live dot.

### 4.6 Profile (avatar → pushed/modal)

Account + self-service, off the tab bar (built as avatar). Sections: **Account** (name/role/email, avatar), **This week** (timesheet summary — hours, billable split, submit), **Stats** (jobs done, first-time-fix, streak), **Availability** (working hours, request leave), **Notifications** (per-type prefs), **App** (offline queue status "N waiting to sync", version), **Sign out** (native Alert, built). _Fix the leftover teal role badge → brand tokens (review §4)._

---

## 5. Prioritized roadmap

Tied to the gaps in §3. Each release leaves the app shippable.

### P0 — "Complete the honest visit loop" (next, ~1 sprint)
The visit can't be trusted until these exist. All are S/M and mostly use existing tables.
1. **Failed-access flow** (`jobs.status`, `field_events`, photo). _S_
2. **Site/customer contacts + tap-to-call + Navigate deep-links** (job card, job detail, overflow). _S_
3. **Distinct customer vs engineer signatures** + customer name/role (fix the shared-`signature_url` bug; add `engineer_signature_url` column). _S/M_
4. **Sticky stateful CTA bar** on job detail (On My Way / Check In / Submit & Check Out). _S_
5. **Photo lightbox** (tap-to-zoom). _S_
6. **Auto-suggested time entry** from check-in/out timestamps. _M_

_Outcome: an engineer can run a real visit — including the ones that go wrong — end to end, correctly, with the office seeing the truth._

### P1 — "The rich app" (the user's ask, ~2 sprints)
6. **Map / route tab** → reaches the requested **4 tabs**. _L_
7. **Asset detail + QR scan-to-open** (service history, linked compliance, open actions). _M_
8. **Parts/materials used** (needs the `job_parts` schema decision first — flag to backend). _L_
9. **Documents viewer** as Reference's 3rd segment + **H&S/RAMS checklist** gating check-in. _M each_
10. **Notifications inbox** + **job chat** (durable comms, in the audit trail). _M/L_
11. **Photo annotation** + **compliance proof capture**. _M each_

_Outcome: the app the user pictured — spatial, asset-aware, paperwork-complete, two-way with the office._

### P2 — "Self-service & delight" (ongoing)
12. **Timesheet summary** + **earnings/stats** on Profile. _M each_
13. **Availability / leave** self-service feeding the web scheduler. _M/L_
14. **Offline hardening** (cache reference data for offline read, visible sync queue, conflict handling). _M_
15. **Dynamic per-job-type checklists** (structured `service_reports.checklist`). _M/L_
16. **Quotes from the field** (defect → draft quote). _L_

_Outcome: the engineer manages their whole working life in-app; the office gets structured, trustworthy data with zero double-entry._

---

## Appendix — new/changed tables this vision implies

Everything else reuses existing tables (per `ENGINEER_APP.md`). New backend work, smallest-first:

| Need | Change | Notes |
|------|--------|-------|
| Distinct engineer signature | add `jobs.engineer_signature_url` (nullable) | P0; today both sign-offs collide on `signature_url`. |
| Failed access | none (reuse `jobs.status='failed_access'`, `field_events`, `job_photos`) | P0; schema already supports the status. |
| Parts used | new `job_parts(job_id, stock_item_id, qty, unit_cost, created_by)` + `stock_movements` issue rows | P1; the one true schema gap. Decide before UI. |
| Job chat | new `job_messages(job_id, sender_id, body, attachment_url, created_at, read_at)` | P1/L. |
| Notifications inbox | reuse/extend web `notifications` + `expo_push_tokens` | P1. |
| H&S sign-off | new `job_safety_signoffs(job_id, engineer_id, checklist jsonb, acknowledged_at)` or reuse `service_reports.checklist` | P1. |
| Availability/leave | new `engineer_availability`, `leave_requests` | P2; feeds web scheduler. |
| Property coordinates | ensure `properties.lat/lng` populated (geocode on web) | P1 prerequisite for Map. |

**Bottom line:** the foundation is genuinely strong — 9 tables already flow phone→web, the native shell and offline queue exist. The gap between "functional" and "best-in-class" is the **P0 honest-visit loop** (failed access, contacts/navigate, real dual signatures, sticky CTA) and the **P1 rich tier** (Map tab, asset detail + QR, parts, documents/RAMS, chat/inbox). Ship P0 next; it's mostly S/M on tables that already exist.
