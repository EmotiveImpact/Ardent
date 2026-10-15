# Haumea — Field Engineer App: Feature Audit & Integration Map

_Last audited: 2026-06-07. Scope: `apps/mobile` (Expo) ↔ `apps/web` (dashboard), shared Supabase backend (`vphjwvleffuwwgbjxups`)._

This is the answer to two questions: **what does the engineer app actually do today**, and **is the mobile app genuinely talking to the web app**. Built features are struck through; planned/gap features are listed open.

---

## 1. Quick answers to your specific questions

- **Where is "Check In"?** It lives **inside an active job**, not as a standalone tracker. Open a job (`app/job/[id].tsx`) → **Check In** captures GPS once, writes a `field_events` row (`type = 'arrived'`) and flips the job to `in_progress`. **Check Out** writes `field_events` (`working_completed'`) and stamps `jobs.completed_date`. So it's two **point-in-time stamps per visit**, tied to a job.

- **Can you track engineers' movement?** **Yes — now wired (2026-06-07).** Previously the web **Engineer Tracker** (`use-engineer-tracker.ts`) read `engineer_locations` for live GPS but nothing on the phone wrote that table, so it always showed _"No live tracker data."_ The mobile app now streams GPS into `engineer_locations` (`apps/mobile/lib/location-tracker.ts`): tap **"On My Way"** to broadcast `travelling` en route, check-in auto-switches to `on_site`, check-out / leaving the screen stops it. It mirrors the web `useRecordEngineerLocation` RPC + insert exactly, so the existing Tracker lights up with a live dot, movement status and ETA. See §4.

---

## 2. Built features (shipped in the mobile app)

### Auth & shell
- ~~Engineer login (Supabase Auth, secure-store session)~~
- ~~Bottom tab nav: Today · Jobs · Schedule · Assets · Compliance · Profile~~
- ~~Brand: "Haumea", orange #e8772e / navy #0f1225~~
- ~~Offline banner + offline write queue (`lib/offline-queue`)~~

### Jobs (the core of the app)
- ~~Today screen — today's assigned visits~~
- ~~Jobs list — all assigned jobs, status-coloured cards~~
- ~~Schedule screen — forward-looking jobs grouped by day (Today / Tomorrow / date)~~
- ~~Job detail — full visit workflow:~~
  - ~~**Check in** (GPS → `field_events 'arrived'` + job → in_progress)~~
  - ~~**Check out** (`field_events 'working_completed'` + `jobs.completed_date`)~~
  - ~~**Photos** → Supabase Storage + `job_photos`~~
  - ~~**Signatures** (customer + engineer) via signature canvas~~
  - ~~**Service report** (outcome: pass / fail / incomplete / revisit / n_a + notes) → `service_reports`~~
  - ~~**Notes** → `notes` (offline-queued)~~
  - ~~**Time entries** (travel / on_site / admin / break, billable toggle) → `time_entries`~~
  - ~~**Raise defect/action** (title, priority, due date, optional asset) → `actions`~~

### Reference data (read-only on mobile)
- ~~Assets list (joined to property name) — `assets`~~
- ~~Compliance items list (ordered by next due) — `compliance_items`~~
- ~~Profile screen~~

### Live tracking (new — 2026-06-07)
- ~~**Live location streaming** → `engineer_locations` (feeds the web Engineer Tracker)~~
- ~~"On My Way" travel broadcast (`travelling`) → auto-`on_site` on check-in → stop on check-out~~

### Platform plumbing
- ~~Push token registration → `expo_push_tokens`~~
- ~~Push deep-linking (tap notification → open the job)~~
- ~~EAS build profiles (dev / preview / production)~~
- ~~Monorepo Metro config (single React copy, web preview works)~~

---

## 3. Planned / not-yet-built (the gap list)

### High priority — directly requested
- [x] ~~**Live location tracking** — periodic GPS → `engineer_locations` so the web Engineer Tracker shows a live position + ETA + movement status.~~ **Done 2026-06-07** (`apps/mobile/lib/location-tracker.ts`).
- [ ] **Travel capture** — write `travel_records` (travel time/distance per visit) so the web travel reporting has mobile-sourced data, not just manual web entry. _(Location stream now exists; deriving travel minutes from it is the remaining step.)_

### Medium priority — workflow completeness
- [ ] **Parts / materials used on a job** — schema is murky (only `stock_items` / `stock_movements` exist; no job-parts join table). Needs a backend decision before UI.
- [ ] **Quotes on mobile** — raise/expand a quote from the field (complex line-items; deferred).
- [ ] **Asset detail on mobile** — tap an asset → service history, linked compliance, QR scan-to-open.
- [ ] **Compliance proof capture** — attach a cert/photo against a compliance item from the field.
- [ ] **Failed-access flow** — one-tap "couldn't get in" → status `failed_access` + reason + photo.

### Lower priority — polish
- [ ] Job-level chat / message thread with the office.
- [ ] In-app notifications inbox (today only push + deep-link).
- [ ] Map view of the day's jobs (route order).
- [ ] Profile: availability / working-hours self-service.

---

## 4. Live movement tracking — was the one gap, now closed

> **Status: CLOSED (2026-06-07).** The mobile producer below is now built.
> `apps/mobile/lib/location-tracker.ts` streams GPS into `engineer_locations`
> (foreground `watchPositionAsync`, every ~30s/50m, Balanced accuracy), wired
> into the job screen: **On My Way** → `travelling`, check-in → `on_site`,
> check-out / unmount → stop. It prefers the `record_engineer_location` RPC with
> a direct-insert fallback — byte-for-byte the web writer's shape — so the
> existing Tracker renders it with zero web changes. Live data only (stale fixes
> aren't offline-queued); best-effort (never blocks the field UI).

**What existed before the fix:**

| Layer | Component | Table | Direction |
|---|---|---|---|
| Web | `use-engineer-tracker.ts`, `engineer-location-panel.tsx`, `routes/engineer-tracker` | **reads** `engineer_locations`, `travel_records` | consumer |
| Web | `use-engineer-locations.ts` (`useRecordEngineerLocation`) | **writes** `engineer_locations` | producer (but never called from a phone) |
| Mobile | `useJob().checkIn/checkOut` | writes `field_events`, updates `jobs` | producer |

**The break:** the web Tracker's data source (`engineer_locations`) has **no mobile writer**. The phone only drops two `field_events` pins per visit. So the consumer is built, the producer is built, but they're on opposite ends and not connected.

**The fix (small, well-scoped):**
1. Add a mobile background/foreground location task (`expo-location`) that, while a job is `in_progress`, posts to `engineer_locations` every N seconds/meters: `{ engineer_id, current_job_id, lat, lng, movement_status, eta_at, recorded_at }`.
2. Mirror the exact insert shape of the web `useRecordEngineerLocation` so the existing Tracker reads it unchanged.
3. Offline-queue the writes like the other mobile mutations.
4. (Optional) compute `travel_records` from the location stream on check-in.

No web changes required — the Tracker already renders whatever lands in `engineer_locations`.

---

## 5. Mobile ↔ Web write/read map (what's actually shared)

**Mobile writes → Web reads:**

| Table | Mobile writes | Web reads |
|---|---|---|
| `field_events` | check-in/out, visit events | job timeline / audit |
| `jobs` (update) | status, completed_date | jobs board, scheduler |
| `job_photos` | visit photos | job detail gallery |
| `service_reports` | outcome + notes | job detail, reports |
| `notes` | visit notes | job timeline |
| `time_entries` | labour/travel time | time tracking, invoicing |
| `actions` | raised defects | actions/defects module |
| `expo_push_tokens` | device token | push send (edge fn) |
| `engineer_locations` | ✅ **live GPS stream** (`lib/location-tracker.ts`) | **Engineer Tracker (live dot)** |
| `travel_records` | ❌ nothing (next: derive from location stream) | travel reports (web-entered only) |

**Web writes → Mobile reads:** jobs/assignments, `assets`, `compliance_items`, properties — the phone reads these as its work list and reference data.

**Verdict:** the two apps **are** genuinely integrated on one Supabase backend — **9 tables** flow phone→web today (8 + `engineer_locations`). The integration is real, not mocked. With live tracking now wired, the only remaining mobile-sourced data gap is **travel capture** (`travel_records`), which can be derived from the new location stream.
