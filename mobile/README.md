# Ardent mobile

The field app for Ardent: what a tradesperson opens on the van, on site or on call. Expo (React Native) with expo-router, TypeScript and Reanimated.

## Run it

```bash
cd mobile
npm install
npx expo start        # scan the QR with Expo Go (SDK 58), or press i / a / w
```

## What's here

- **Opening screen** (`app/index.tsx`): pick your working mode (On Site, En Route, On Call, Workshop, Off Shift). Tap a mode or swipe up and down to cycle; the light behind the screen moves with it. Hold the bar at the bottom to go in.
- **Job** (`app/job/[id].tsx`): the job in the field. Call or navigate to site, access notes, travel and on-the-tools clocks, compliance checks, before/during/after photos, materials (logged and removed on site) and notes. The bottom button walks the job through Set off, Arrived, then Pause or hold to finish; each step moves the job, the operator's state and the clock together (`src/data/jobs.ts`).
- **Today** (`app/today.tsx`): the day's run sheet (tap a job to open it), headline numbers (jobs, quotes out, money owed) and the current mode chip, which takes you back to the mode picker.

## How it connects to Ardent Core

Core owns the shared contract. `scripts/sync-core.sh` copies it in (reads `../core`, or pass a git ref); never edit the copies by hand.

- `src/data/core/` holds Core's data model, `ArdentClient` interface and mock records.
- `src/theme/core/tokens.ts` holds Core's framework-neutral design tokens; `src/theme/tokens.ts` re-exports them and maps fonts to the loaded React Native family names (Michroma display, Geist, Geist Mono for every number).
- `src/data/mock.ts` implements Core's `ArdentClient` in memory over the mock records, signed in as operator `opr_01` (Dan Mercer). `src/data/client.ts` exports the one `ardent` client the app uses plus field queries (today's jobs, day summary); swapping in Core's Supabase client is a one-line change there.
- `src/data/types.ts` re-exports Core's model and adds the few mobile-only shapes.
- Picking a mode on the opening screen writes the operator's state through `operators.setState`.
