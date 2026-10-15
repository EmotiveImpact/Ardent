# Mobile Design Review — Haumea Field-Engineer App

**Scope:** `apps/mobile` (Expo SDK 54, React Native 0.81, expo-router v6). Native iOS feel ("SwiftUI-like") audited against Apple HIG and human-centred design principles.
**Reviewer role:** Senior product designer.
**Date:** 2026-06-07

This is a structured design critique with a phased, engineer-pickup action plan. No feature code is included — only file-level pointers and concrete library/component recommendations.

---

## 1. Summary — Top Recommendations

The app is functionally rich and the visual language (navy `#0f1225` + orange `#e8772e`) is coherent. But it currently reads as a **cross-platform "branded web" app, not a native iOS app**. Every screen paints its own navy header bar, every choice is a custom pill-chip, and the tab bar is overloaded. The five highest-leverage moves:

1. **Cut the tab bar from 6 → 4.** HIG recommends 3–5 tabs. Fold `Assets` + `Compliance` into one **Reference** tab and move **Profile off the tab bar** to a top-right avatar button (iOS convention). _(`app/(tabs)/_layout.tsx`)_
2. **Adopt native navigation headers with large titles** instead of the hand-rolled navy `<View style={styles.header}>` on every screen. This single change does more for "native feel" than any other. _(all `(tabs)/*.tsx` + `job/[id].tsx`)_
3. **Replace custom pill-chip choosers with native selection controls** — segmented controls for 2–5 fixed options (time-entry kind, report outcome, defect priority), action sheets / native menus for the asset picker, and a wheel date picker for the defect due date. _(`TimeEntryForm.tsx`, `RaiseDefectForm.tsx`, `job/[id].tsx`)_
4. **Add haptics** on the load-bearing field actions — check-in, check-out, photo capture, report submit, defect raise. Field engineers act with the phone in one hand and gloves on; tactile confirmation matters. (`expo-haptics` is not currently installed.)
5. **Standardise spacing/type on an 8pt grid and the iOS type ramp.** The app mixes 10/11/12/13/14/18/20/24px sizes ad hoc and several touch targets fall under the 44pt minimum (back button, filter chips, checkbox).

Everything else in this document supports these five.

---

## 2. Navigation

### 2.1 Tab bar — concern #1 (6 items → reduce)

**Current** _(`app/(tabs)/_layout.tsx`)_ — 6 tabs, dark navy bar, 10px labels:

| # | Tab | Icon | Route |
|---|-----|------|-------|
| 1 | Today | `CalendarDays` | `index` |
| 2 | Jobs | `Briefcase` | `jobs` |
| 3 | Schedule | `CalendarRange` | `schedule` |
| 4 | Assets | `Package` | `assets` |
| 5 | Compliance | `ShieldCheck` | `compliance` |
| 6 | Profile | `User` | `profile` |

**Problems**
- 6 tabs exceed the HIG 3–5 range; on a small iPhone the 10px labels and crammed icons reduce tap accuracy.
- **Today, Jobs, and Schedule are three views of the same dataset** (`useJobs`). That's redundant cognitive load for the primary user (an engineer who mostly cares about "what's next").
- **Assets and Compliance are reference/lookup surfaces**, not daily-flow destinations — they don't deserve equal billing with the work queue.
- **Profile is a settings/account surface** — by iOS convention it belongs in the top-right, not the tab bar (see §2.3).

**Recommended — 4 tabs:**

| # | Tab | Icon | Contains |
|---|-----|------|----------|
| 1 | **Today** | `CalendarDays` | The default landing — today's jobs + remaining/completed stats (as-is). |
| 2 | **Jobs** | `Briefcase` | The full queue with the filter row **plus** an upcoming/Schedule segment (see note). |
| 3 | **Reference** | `BookMarked` / `Search` | A grouped list → Assets and Compliance as two sections or a top segmented control. |
| 4 | **More** _(or move Profile here)_ | `MoreHorizontal` | Optional. If you keep Profile off the bar (recommended), you may not need this 4th tab at all → **3 tabs**. |

**Two viable shapes — pick one:**

- **Option A (recommended) — 3 tabs + avatar:** `Today` · `Jobs` · `Reference`, with **Profile as a top-right avatar button** on every screen. Cleanest, most iOS-native. Schedule becomes a segmented control _inside_ Jobs ("Today / Upcoming / All") since it's the same data.
- **Option B — 4 tabs:** `Today` · `Jobs` · `Reference` · `Schedule`, Profile still moved to the avatar. Keep this only if user research shows engineers treat the day-grouped Schedule as a distinct mental model from the flat Jobs list.

**Justification:** Today = "now", Jobs = "all my work", Reference = "look something up". That maps to the three real jobs-to-be-done. Assets + Compliance share a card layout, a status-chip pattern, and a "browse my sites' records" intent — folding them into **Reference** with a segmented control at the top (`Assets | Compliance`) is a natural consolidation and reuses the existing card components verbatim.

### 2.2 Headers — adopt native large-title navigation

Right now **every screen disables the native header** (`headerShown: false` in `_layout.tsx` line 9 and root `_layout.tsx` line 41) and hand-paints a navy bar with a 20px bold title. This is the single biggest "not native" tell.

**Recommended:**
- Turn the **native stack/tabs header back on** and use **large titles** (`headerLargeTitle: true`) for the top-level tab screens (Today, Jobs, Reference). Large titles that collapse on scroll are the defining iOS navigation gesture.
- Keep the brand by tinting the header (`headerTintColor` = orange for actions, large-title text in `COLORS.text` on a system-material background) rather than a full navy fill. A full-bleed navy bar on every screen is heavy and un-iOS; reserve navy for the tab bar and primary buttons.
- Use the native header's **right slot for the avatar** (§2.3) and the **left slot for back** on `job/[id]` (replacing the custom `ArrowLeft` `TouchableOpacity`, which is also a sub-44pt target — `backButton` padding is only 4px).
- The day-grouped Schedule headings ("Today / Tomorrow / Mon 22 Jun") are good — keep them as **section headers** (iOS grouped-list style) within the Jobs "Upcoming" segment.

### 2.3 Profile placement — concern #2

**Recommendation: yes — move Profile OFF the tab bar to a top-right avatar/initials button (no text label).** This is standard iOS (Mail, Settings-adjacent account entry points, most modern apps put account behind a top-right avatar).

- Render the existing **initials avatar** (already computed in `profile.tsx` lines 18–23) as a ~32pt circular button in the **native header right slot** on Today / Jobs / Reference.
- Tapping it pushes the Profile screen as a **pushed detail** (or a sheet, `presentation: 'modal'`), not a tab.
- No label — the avatar is self-explanatory and labels in the header add noise.
- This frees a tab slot, directly satisfying concern #1, and matches the user's "restrained navigation" goal.

**Header look per screen (target):**
- **Today / Jobs / Reference:** large title, system-material background, avatar top-right, no custom navy `View`.
- **Job detail (`job/[id]`):** standard (non-large) title showing the job title, native back chevron left, optional overflow (`•••`) right for "Share / Open in Maps".
- **Profile:** large title "Profile", standard back; drop the custom navy header `View` (lines 40–42).

---

## 3. Component / Control Swaps — concern #3

The app currently expresses **every choice as a custom `TouchableOpacity` pill** with a manual selected-state style. This is consistent internally but feels like web. Below: each selection surface mapped to a native-feeling control. None of these libraries are installed yet — see §6 for the install/phasing.

| Screen / File | Field | Current | Recommended native control | Library / Component |
|---|---|---|---|---|
| `components/jobs/TimeEntryForm.tsx` (L117–131) | **Time-entry kind** (Travel / On site / Admin / Break — 4 fixed) | Pill-chip row, custom selected style | **Segmented control** (single-select, ≤5 options) | `@react-native-segmented-control/segmented-control` _or_ `@expo/ui` `Picker` (segmented variant) |
| `components/jobs/TimeEntryForm.tsx` (L143–154) | **Billable** toggle | Custom square checkbox | **Native switch** | RN `Switch` (system styling) or `@expo/ui` `Switch` |
| `components/jobs/TimeEntryForm.tsx` (L134–141) | **Duration** free-text ("90 / 1h30 / 1:30") | `TextInput` + regex parser | Keep text entry, but consider a **wheel duration picker** for hours:minutes | `@expo/ui` picker / `@react-native-picker/picker` |
| `app/job/[id].tsx` (L698–724) | **Service-report outcome** (Pass / Fail / Incomplete / Revisit / N/A — 5 fixed) | Wrapping pill-chip row | **Segmented control** (5 = the practical max; if cramped, use a **menu/action sheet**) | `@react-native-segmented-control/segmented-control`; fallback `ActionSheetIOS` |
| `components/jobs/RaiseDefectForm.tsx` (L120–136) | **Defect priority** (Low / Medium / High — 3 fixed) | Pill-chip row | **Segmented control** (3 options is the ideal segmented case) | `@react-native-segmented-control/segmented-control` |
| `components/jobs/RaiseDefectForm.tsx` (L139–147) | **Due date** (typed `YYYY-MM-DD`) | `TextInput` + manual validation | **Wheel/inline date picker** — never make a field engineer type a date | `@react-native-community/datetimepicker` _or_ `@expo/ui` `DateTimePicker` |
| `components/jobs/RaiseDefectForm.tsx` (L161–182) | **Asset picker** (0–N, data-driven, can be long) | Pill-chip wrap (grows unbounded) | **Action sheet** (short list) or **pushed select-list / native menu** (long list) | `ActionSheetIOS` (built-in) / `@expo/ui` `ContextMenu` / `expo-router` pushed picker screen |
| `app/(tabs)/jobs.tsx` (L42–62) | **Status filter** (All / Scheduled / In Progress / Completed) | Horizontal scroll pill-chips on navy | **Segmented control** under a large title, _or_ a native **search-scope bar** | `@react-native-segmented-control/segmented-control` |
| `app/(tabs)/assets.tsx` (L62–85) | **Category filter** (data-driven, many) | Horizontal scroll pill-chips | Keep horizontal scroller (correct for unbounded counts) but restyle as **iOS filter chips** (subtle, not navy) — or a native menu "Filter ▾" | RN `Pressable` + system colors / `@expo/ui` menu |
| `app/(tabs)/profile.tsx` (L27–36), `job/[id].tsx` (L331–358) | Sign-out / Check-out confirmations | `Alert.alert` | Good — `Alert` is native. Keep. For Check-out, consider an **action sheet** with the destructive role styled red. | `ActionSheetIOS` for multi-option |
| `app/job/[id].tsx` (L884–893) | **Add photo** (Take / Library) | Two side-by-side buttons | **Single "Add Photo" → action sheet** ("Take Photo / Choose from Library / Cancel") — the canonical iOS pattern | `ActionSheetIOS` |

### Which library to standardise on for the "SwiftUI feel"

Two complementary choices, in priority order:

1. **`@react-native-segmented-control/segmented-control`** — the Apple `UISegmentedControl`. This is the workhorse: it instantly natives the kind / outcome / priority / filter selectors above. Small, stable, the single highest ROI control swap.
2. **`@expo/ui`** (Expo's SwiftUI/Jetpack-Compose primitives — `Picker`, `Switch`, `DateTimePicker`, `ContextMenu`, `Host`) — this is the most direct route to the user's stated **"SwiftUI-like"** goal because the components are literally SwiftUI views bridged to RN. It's still evolving, so treat it as the P1 "deepen the native feel" layer, with the segmented-control package as the dependable P0.
3. **`ActionSheetIOS`** and **`Switch`** are built into React Native — zero new dependency — and should be used immediately for the photo-source picker, asset picker, and billable toggle.
4. **`@react-native-community/datetimepicker`** for the defect due date — non-negotiable; typing `YYYY-MM-DD` on site is a usability failure.

> Note on `@expo/ui` controls: they generally need to be hosted (e.g. inside an `<Host>`), so budget a small integration spike. Segmented-control and `ActionSheetIOS` have no such constraint — do those first.

---

## 4. HIG Polish Checklist

A surface-by-surface audit against Apple HIG and human-centred principles.

### Spacing & layout
- [ ] **Adopt an 8pt grid.** Current paddings mix 4/5/6/8/10/12/13/14/16/20px. Normalise to 4/8/12/16/20/24. (Most screens already use 16 — extend it everywhere.)
- [ ] Screen content padding is consistently 16 — good. Keep card gaps on the grid (currently 10px → 12px).
- [ ] **Safe-area:** `SafeAreaView` from `react-native-safe-area-context` is used on every screen — good. But the custom navy header sits _inside_ the safe area, so on notch devices the brand bar starts below the status bar rather than bleeding behind it (a native header would handle this correctly). Moving to native headers fixes this for free.

### Typography
- [ ] **Map to the iOS type ramp** (Large Title 34 / Title 22–28 / Headline 17 semibold / Body 17 / Subhead 15 / Footnote 13 / Caption 11–12). Current bodies at 12–14px are slightly small for a gloves-on field context; bump primary body to ~15–17.
- [ ] **Support Dynamic Type** (`allowFontScaling` is on by default — verify layouts don't break at larger accessibility text sizes; the wrapping chip rows and 10px tab labels are the risk areas).
- [ ] Replace `textTransform: 'uppercase'` micro-labels (11px section headers) sparingly — iOS grouped-list headers are uppercase/footnote, so this is acceptable for section headers but avoid it for interactive labels.

### Touch targets (44pt minimum) — **several misses**
- [ ] **Job-detail back button** (`job/[id].tsx` L1012–1014) — `padding: 4` around a 20px icon ≈ 28pt. Below 44pt. (Fixed by native header back.)
- [ ] **Filter chips** (`jobs.tsx`, `assets.tsx`) — `paddingVertical: 6` → ~30pt tall. Raise to ≥44pt hit area (use `hitSlop` if visual size must stay small).
- [ ] **Billable checkbox** (`TimeEntryForm.tsx`) — 22×22 → far under 44pt; the row is tappable which helps, but the visual control is tiny. A native `Switch` solves both size and feel.
- [ ] **Tab bar height 60 / paddingBottom 8** — verify it respects the home-indicator inset; a native tab bar handles this automatically.

### System materials / blur
- [ ] No use of system materials anywhere. The tab bar and (future) headers should use **translucent system material with blur** (`expo-blur` `BlurView`, or simply the default native bar translucency) so content scrolls subtly beneath — a hallmark of native iOS. Currently bars are flat opaque navy.

### Large-title navigation headers
- [ ] Not used — see §2.2. This is the top "make it feel native" item alongside the tab reduction.

### Haptics — concern #4 (currently absent)
- [ ] Install `expo-haptics` and fire on:
  - **Check-in success** (`job/[id].tsx` `handleCheckIn`, ~L322) → `notificationAsync(Success)`.
  - **Check-out / job complete** (`handleCheckOut`, ~L349) → `notificationAsync(Success)`.
  - **Photo captured** (`uploadPhoto`) → `impactAsync(Light)`.
  - **Report submitted / defect raised / time logged** → `notificationAsync(Success)`; failures → `notificationAsync(Error)`.
  - **Segmented-control / selection changes** → `selectionAsync()`.
  These confirmations matter more than usual because engineers operate the phone one-handed, outdoors, often without looking.

### Empty states
- [ ] Already present and good: Today ("All clear for today"), Jobs, Schedule, Assets, Compliance all have icon + title + subtitle. Keep this pattern. Minor: the icons use a mix of `COLORS.brand` (Today) and `#cbd5e1` (others) — standardise (muted gray icon + one-line action is the iOS norm; reserve color for positive "all done" states like Today).

### Brand within a neutral iOS surface — concern #4
- [ ] **Reduce the navy.** Today, the navy header appears on **every** screen, which makes the app feel heavy and "branded-web". On iOS, chrome should be neutral (system background/materials) and **brand should accent, not dominate**: orange for primary buttons, selected segments, links, and the active tab; navy reserved for the tab bar and primary CTAs. Let the content surface be the neutral `#f8fafc` / white it already is.
- [ ] Orange `#e8772e` on white passes contrast for large text/buttons but **verify the orange-on-navy and orange small-text combos** (e.g. the orange count badges, `roleText`, `sigBtnText`) meet WCAG AA (≥4.5:1 for body). Several small-orange-on-light usages are borderline.
- [ ] The role badge in `profile.tsx` (L175–192) uses leftover **teal** (`#f0fdf9` / `#99f5de` background) with orange text — a rebrand miss. Align to brand tokens.

### Consistency / smaller items
- [ ] **Photo gallery** uses a horizontal `ScrollView` of 88px thumbs with no tap-to-zoom — add a lightbox/full-screen viewer (native expectation).
- [ ] **Customer vs Engineer signature** both render `job.signature_url` (`job/[id].tsx` L911 & L926) — they show the _same_ image for both roles. Likely a bug worth confirming; from a design standpoint two distinct captures should show two distinct images.
- [ ] **Pull-to-refresh** uses `RefreshControl` with brand tint — good, native.
- [ ] **`StatusBar style="light"`** is hard-coded (root `_layout.tsx` L40). Once headers go light/material, this needs to be `dark` or `auto` or the status-bar glyphs vanish on light backgrounds.

---

## 5. Phased Action Plan (P0 / P1 / P2)

Ordered for engineering pickup. Each item references real files.

### P0 — Native shell & highest-leverage feel (1 sprint)
1. **Reduce tabs to 3 (+ avatar)** — merge Assets + Compliance into a **Reference** tab with a top segmented control; remove the Profile tab. _(`app/(tabs)/_layout.tsx`; new `reference.tsx` reusing `assets.tsx`/`compliance.tsx` cards)_
2. **Move Profile to a top-right avatar button** in the native header. _(`profile.tsx` avatar → header right slot)_
3. **Enable native navigation headers with large titles** on Today/Jobs/Reference; native back on `job/[id]`. Remove the custom navy header `View`s. Fix `StatusBar` style accordingly. _(`_layout.tsx` files + every `(tabs)/*.tsx`, `job/[id].tsx`)_
4. **Add `expo-haptics`** on check-in, check-out, photo capture, report submit, defect raise. _(`job/[id].tsx`, the three forms)_
5. **Photo source → single "Add Photo" `ActionSheetIOS`** (Take / Library / Cancel). _(`job/[id].tsx` L884–893)_ — zero new deps.

### P1 — Native selection controls (1 sprint)
6. **Segmented controls** for time-entry kind, report outcome, defect priority, and the Jobs status filter. _(`TimeEntryForm.tsx`, `job/[id].tsx` outcome row, `RaiseDefectForm.tsx`, `jobs.tsx`)_ — add `@react-native-segmented-control/segmented-control`.
7. **Native date picker** for defect due date. _(`RaiseDefectForm.tsx`)_ — add `@react-native-community/datetimepicker`.
8. **Native `Switch`** for the billable toggle. _(`TimeEntryForm.tsx`)_ — built-in.
9. **Asset picker → action sheet / pushed select list.** _(`RaiseDefectForm.tsx`)_
10. **Spacing/type normalisation** to the 8pt grid + iOS type ramp; fix sub-44pt targets (filter chips `hitSlop`, checkbox). _(global StyleSheets)_

### P2 — Depth & polish (ongoing)
11. **`@expo/ui` SwiftUI primitives** spike — migrate pickers/switches/menus to true SwiftUI-bridged components for the closest native feel; host setup required.
12. **System materials / blur** on tab bar + headers (`expo-blur`), translucent so content scrolls beneath.
13. **Dynamic Type** pass — verify chip rows, tab labels, and cards survive large accessibility text sizes.
14. **Photo lightbox** (tap-to-zoom full-screen viewer).
15. **Contrast audit** of all orange-on-light / orange-on-navy small text; fix the leftover **teal role badge** in `profile.tsx`.
16. **Reduce navy chrome** — let neutral system surfaces dominate; brand accents only.
17. **Confirm/triage the dual-signature bug** (customer + engineer rendering the same `signature_url`). _(`job/[id].tsx` L911, L926)_

---

## Appendix — Library quick-reference

| Need | Library | Installed? | Notes |
|---|---|---|---|
| Segmented control | `@react-native-segmented-control/segmented-control` | No | P0/P1 workhorse; `UISegmentedControl`. |
| SwiftUI-bridged primitives | `@expo/ui` | No | Closest to "SwiftUI feel"; needs `<Host>`; treat as P2. |
| Date/time picker | `@react-native-community/datetimepicker` | No | Wheel/inline native picker. |
| Action sheets | `ActionSheetIOS` | Built-in (RN) | Photo source, asset picker, check-out confirm. |
| Switch | `Switch` | Built-in (RN) | Billable toggle. |
| Haptics | `expo-haptics` | No | Check-in/out, capture, submit. |
| Blur / materials | `expo-blur` | No | Translucent bars (P2). |

**Environment:** Expo SDK 54, RN 0.81.5, expo-router 6, react-native-safe-area-context 5.6 (good), lucide-react-native for icons. No native-UI selection libraries currently present — the chip-everywhere pattern is a consequence of that gap, and closing it is the core of the "make it native" work.
