# 09. Brand, design system and interaction specification

## Existing Ardent Core design tokens [REPO-OBSERVED]

Canonical file: `core/tokens/tokens.ts`. These values exist in source and should be preserved as the starting point:

| Token | Value | Meaning |
|---|---|---|
| `bg` | `#070707` | True dark application backdrop |
| `surface` | `#121212` | Panels |
| `inset` | `#0b0b0b` | Deep wells |
| `raised` | `#1d1d1d` | Hover/controls |
| `line` | `#1c1c1c` | Table row separators |
| `lineStrong` | `#2e2e2e` | Stronger dividers |
| `fg` | `#f2f2f2` | Main text |
| `fgMuted` | `#9a9a9a` | Secondary text |
| `fgFaint` | `#5f5f5f` | Tertiary text, avoid for essential information |
| `ember` | `#ff6a1a` | Restrained brand accent |
| `ok` | `#22c55e` | Confirmed/success state |
| `warn` | `#f59e0b` | Attention |
| `danger` | `#ef4444` | Risk/failed |
| `info` | `#3b82f6` | Informational state |
| `violet` | `#8b5cf6` | Auxiliary state only |

Typography: **Michroma** wordmark/display, **Geist** body and UI, **Geist Mono** for quantities, money, job references, serials/postcodes. Spacing uses a four-point grid, radii primarily 6–14 px. Existing Core rule: cards/buttons generally no decorative borders; use tonal surfaces and meaningful table dividers.

**CONFLICT RESOLUTION:** Earlier light-coloured UI collage is a concept only; it does not supersede these source tokens. Marketing pages may use a separate editorial visual language if previously established; their design should be reviewed against the user's approved direction, not forcibly made all black.

## Product character

**Functional precision, not generic SaaS.** The console should resemble a dependable operational instrument: quiet typography, unusually good hierarchy, consistent status semantics and low visual noise. Important numbers prominent, supporting explanations compact, actions always obvious. Avoid neon rainbows, ornamental gradients, giant abstract AI shapes, excessive card borders or meaningless animations.

Mobile should be confident and tactile, slightly larger than desktop, with clear state and haptic feedback. Do not recreate desktop dashboard miniaturised into a phone screen.

## Semantic status hierarchy

- Active/current action: ember sparingly.
- Completed/safely confirmed: green.
- Needs attention: amber; must include reason text.
- Blocked/error: red; must offer recovery path and show affected job.
- Informational: blue only where needed.
- Unknown/stale/offline: neutral text/icon; never pretend it is success.

Status never relies on colour alone; each state has descriptive text and icon with accessible label. Show last verified sync/refresh time where states are important.

## Interaction components to standardise

1. **Metric tile:** label, period, value, movement/benchmark where meaningful, source drill-down, data freshness; no vanity counts without action.
2. **Exception row:** urgency, affected record, why, evidence, owner, recommended action, dismiss reason, last updated.
3. **Job card:** reference, customer/site, trade, scheduled range, current phase, engineer, exception marker, next action.
4. **Schedule block:** colour encodes work state only, not engineer identity; drag/drop preview shows validity and conflicts.
5. **Record detail:** stable title, action bar, sticky context, chronological evidence and structured tabs only if needed.
6. **Activity entry:** user/agent/system attribution and actual event vs upload time, attachments, immutable audit link.
7. **Approval tray:** before/after diff, side effects, source evidence, expiry, accept/reject, reason, explicit audit.
8. **Connection/sync status:** provider, last success, current attempt, exact error, retry with dedupe semantics.
9. **Voice capture control:** clear recording/pause/stop/consent, editable draft, upload state and confidence flags.
10. **Empty state:** explain what belongs here and provide the single next useful action.

## Suggested desktop shells

Left rail: Ardent wordmark, Operations, Enquiries, Jobs, Schedule, Customers, Money, Crew, Intelligence, plus lower settings/help. Organise by actual job-to-be-done; advanced FM features can live in scoped subsections. Top contextual row: organisation selector where relevant, global search, connected/sync indicators, notifications and user. Main content: queue and record-first layout. Side assistant appears only in context rather than permanently displacing work.

## Mobile field patterns

- Full-height dark shell and current operational state, next job prominently displayed.
- Critical action near thumb zone, preferably one primary button at a time (Set off / Arrived / Pause / Finish).
- Tall readable touch targets; photograph and note capture from any job stage.
- Clear segmented job evidence and review stage; avoid bouncing between screens for every material.
- Voice input can pre-populate fields, but all parsed information remains editable before formal submission.
- 'Saved locally' and 'Synced with office' treated as different states.
- Offline status survives navigation; connectivity loss never resets current job content.
- Time clocks display elapsed with server-confirmed record when available; guard against overlapping entries.

## Motion and sound

Limit motion to status transitions, drawers and feedback. Respect reduced-motion preference. Haptics useful on mobile arrival, save and confirmed completion; do not celebrate when a record is only queued. Audible alerts reserved for genuinely urgent matters and allow per-role configuration.

## Responsive and accessibility

Desktop planning targets: 1440 wide, 1280 standard, 1024 compact; mobile 320–430 effective width and varied system font scaling. Tests include 200% zoom, keyboard-only, screen readers, high contrast, direct sunlight for field mobile. Use accessible modals, validation on submit as well as inline, 44 px target sizes where feasible, no nested links/buttons.

## Brand marketing consistency

Parent Ardent should look premium and credible. Earlier user preference: retain the Ardent logo, mix established corporate direction with human trade imagery, maintain breathing space, do not pack every capability onto one page. Use real operational scenarios and honest proof. Ardent marketing can serve bespoke infrastructure buyers while the trades product page focuses on specific workflows and people. Naming/offer architecture should be visually distinct from internal app navigation.

## Visual QA gates

- Compare core/mobile screens against present approved branch screenshots before any redesign.
- Preserve shared token sync; document any deliberate platform exception.
- No placeholder/synthetic data portrayed as live customers or transactions.
- Functional interactions tested at real viewport widths and with error/empty states.
- Visual legibility, state semantics and action priority approved by product owner.
