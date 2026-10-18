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

- `src/data/types.ts` holds the domain model (Operator, Customer, Site, Job, Quote, Invoice, TimeEntry, Material). Ardent Core owns the canonical shapes; this file mirrors them until Core publishes a shared package.
- `src/data/client.ts` is the only thing screens call. It currently points at `src/data/mock.ts`; pointing it at Core's API is a one-line change.
- `src/theme/tokens.ts` mirrors Core's design tokens as plain values, ready to be replaced by Core's shared export.
