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
- **Today** (`app/today.tsx`): the day's run sheet, headline numbers (jobs, quotes out, money owed) and the current mode chip, which takes you back to the mode picker.

## How it connects to Ardent Core

- `src/data/core/` is a straight copy of Core's shared data model and mock records (`core/src/data/model.ts`, `mock.ts`). Core owns them; refresh with `scripts/sync-core.sh` (reads `../core`, or pass a git ref) and never edit the copies by hand.
- `src/data/types.ts` re-exports Core's model and adds the few mobile-only shapes (working mode, a job joined with its customer and site, the day summary).
- `src/data/client.ts` is the only thing screens call. It currently reads Core's mock data as engineer Dan Mercer; pointing it at Core's API is a one-line change.
- `src/theme/tokens.ts` mirrors Core's `:root` tokens (colours, radius) and fonts (Geist, Geist Mono for numbers). Michroma is the one mobile addition, used for mode names and headlines.
