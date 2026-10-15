# Haumea — Mobile Field-Engineer App: Feature Outline

_Last updated: 2026-06-07. App: `apps/mobile` (Expo). Shared Supabase backend (`vphjwvleffuwwgbjxups`)._

The mobile app is the **field engineer's tool** — what an engineer uses on-site. The web app (`apps/web`) is the **office dashboard**. They share one Supabase database.

---

## Stack
- **Expo SDK 54** + **React Native 0.81** + **expo-router** (file-based navigation, native stacks).
- **HeroUI Native** + **Uniwind** (Tailwind-v4-for-RN) — the component + styling system. Genuinely native iOS controls where it matters (`SegmentedControl`, `ActionSheetIOS`, native date picker, `Switch`).
- **Supabase** JS client — auth, Postgres (RLS multi-tenant), Storage, RPC.
- **expo-location** (GPS), **expo-camera** (QR + photos), **expo-haptics**, **react-native-maps**, **react-native-signature-canvas**.
- **Offline queue** — field writes are queued to AsyncStorage when offline and drained on reconnect.

## Navigation (5 tabs + pushed screens)
**Bottom tabs:** Today · Jobs · Schedule · Reference · Profile.
**Header:** navy app-bar, title + a **notifications bell** (unread badge) top-right.
**Pushed screens:** Job Detail, Asset Detail, QR Scanner, Notifications, Map, Job Chat.

---

## Built features

### Auth & shell
- ~~Engineer login (Supabase Auth, secure-store session)~~
- ~~Offline banner + offline write queue (drains on reconnect)~~
- ~~Push-notification token registration + tap-to-open-job deep linking~~

### Today (tab)
- ~~Personalised greeting + date~~
- ~~Today's stats (Remaining / Completed)~~
- ~~Quick-action tiles (Start next job, Navigate, Log time, Add photo)~~
- ~~Today's job cards (time, status chip) → tap into Job Detail~~
- ~~"Map" link → day map~~

### Jobs (tab)
- ~~Full work queue with a segmented filter: All / In Progress / Completed~~

### Schedule (tab)
- ~~Forward-looking jobs grouped by day (Today / Tomorrow / date) with per-day counts~~

### Reference (tab)
- ~~Segmented Assets ⇄ Compliance~~
- ~~Assets register (category filter, status, tap → Asset Detail)~~
- ~~Compliance items (status, due dates)~~
- ~~"Scan asset QR" → opens the scanned asset~~

### Profile (tab)
- ~~Avatar + account info + role + version + sign out~~

### Job Detail — the workhorse screen
- ~~Job hero (title, status, priority) + property / client / scheduled info~~
- ~~**Contact actions**: tap-to-call the client + Navigate to site (opens Maps)~~
- ~~**"On My Way"** → broadcasts live `travelling` location~~
- ~~**Check In** (GPS) → `in_progress` + auto `on_site` live tracking~~
- ~~**Live-location pill** ("On site since 09:00 · office tracking you") with Stop~~
- ~~**Failed access** flow ("Couldn't get in?" → reason + notes → status `failed_access`)~~
- ~~**Photos** → camera/library (action sheet) → Supabase Storage~~
- ~~**Signatures** — customer + engineer, captured separately (distinct columns)~~
- ~~**Service report** — outcome (Pass/Fail/Incomplete/Revisit/N-A, segmented) + notes~~
- ~~**Time** — log travel/on-site/admin/break, billable toggle~~
- ~~**Parts** — log materials used (description, qty, optional £ cost)~~
- ~~**Raise a defect** — title, priority, due date, optional asset~~
- ~~**Notes** — chronological engineer notes~~
- ~~**Sticky CTA** — one contextual primary button (Check In → Check Out)~~
- ~~**Check Out & Complete** → stamps completion + fires the customer email~~

### Asset Detail (pushed)
- ~~Asset hero + details (make/model/serial/install date/location/notes) + its open defects~~
- ~~Reached by tapping an asset OR scanning its QR~~

### Map (pushed)
- ~~Native map with a pin per open job (colored by status) + your live location~~
- ~~Fit-to-markers, per-job bottom card → Open job / Navigate, pager~~

### Notifications (pushed)
- ~~In-app inbox (unread badge in every header), mark read / mark all, tap-through~~

### Documents / RAMS (on Job Detail)
- ~~View certs, manuals & RAMS attached to the job / property / asset~~
- ~~Open from the private `documents` Storage bucket (signed URLs)~~

### Job chat (pushed)
- ~~Message thread with the office, per job ("Message office" icon in the Job Detail header)~~
- ~~Engineer ⇄ office bubbles, send + 10s polling (deliberately NOT realtime — protects the DB IO budget)~~

### Live engineer tracking
- ~~GPS streamed to `engineer_locations` while a job is active → feeds the web Engineer Tracker~~

---

## Planned / not yet built
- [ ] Photo annotation / lightbox zoom
- [ ] Compliance proof capture from the field
- [ ] Document upload from the field (currently view-only)
- [ ] Earnings / job-stats summary
- [ ] Availability / working-hours self-service
- [ ] Health & safety / RAMS sign-off checklist

---

## Mobile ↔ Web integration (what flows phone → office)
Mobile **writes**, web **reads** (and vice-versa) via the shared DB:

| Table | Mobile writes | Web reads |
|---|---|---|
| `jobs` (status/dates) | check-in/out, complete, failed-access | jobs board, scheduler |
| `field_events` | arrival/departure events | job timeline |
| `engineer_locations` | live GPS stream | **Engineer Tracker (live dot)** |
| `job_photos` | site photos | job gallery |
| `service_reports` | outcome + notes | reports, customer email |
| `time_entries` | labour/travel time | timesheets, invoicing |
| `job_parts` | materials used | (office costing) |
| `actions` | raised defects | actions module |
| `notes` | engineer notes | timelines |
| `job_messages` | engineer chat | (office reply — web UI is a follow-up) |
| `expo_push_tokens` | device token | push send |
| `notifications` | (read + mark-read) | created by office events |

Web **writes → mobile reads:** job assignments, `assets`, `compliance_items`, `properties`, `documents`.

---

## Design system (mobile)
- Brand: orange `#e8772e` (primary/interactive, used sparingly), navy `#0f1225` (app bar + tab bar).
- Surfaces: page `#f5f7fa`, white cards (`rounded-2xl`, border `#e6e9ef`), no left-edge status spines (flat cards; status via chips).
- Native controls, haptics on key actions, 8pt spacing, iOS type ramp. See `MOBILE_DESIGN_REVIEW.md` (critique) + `mobile-design-decisions` memory (locked direction: HeroUI Native, Design-1+2 hybrid).
