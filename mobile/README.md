# Ardent Field

The engineer's phone app for Ardent: what a tradesperson opens on the van, on site or on call. Expo (React Native) with expo-router, TypeScript and Reanimated. It talks to the Ardent engine, or runs the engine itself on the demo firm.

## Run it

```bash
cd mobile
npm install
npx expo start        # scan the QR with a dev build or Expo Go (SDK 58), or press i / a / w
```

With no engine address the app runs the demo: the engine runs inside the app on the sample firm, and the sign-in screen offers "Try it as" Dan, Kofi, Ryan or Tom. To sign in to a real engine, give a dev build its address:

```bash
EXPO_PUBLIC_ARDENT_ENGINE=https://engine.example.com npx expo start
```

The clickable prototype is the web export in demo mode: `scripts/build-prototype.sh <out-dir>` builds it into a folder that can be hosted under any sub-path.

## Screens

- **Sign in** (`app/sign-in.tsx`): email and password against the engine, restored on launch. In the demo, pick someone to try it as.
- **Start the day** (`app/start.tsx`): on shift, workshop or off shift. Swipe or tap to choose, hold to commit; the light behind the screen follows the mode.
- **Today** (`app/today.tsx`): the run sheet in time order, next job up top, finished jobs dimmed, and the one thing to do next docked at the bottom.
- **Job** (`app/job/[id].tsx`): set off, arrived, pause and back on it, each moving the job, your status and the travel or tools clock together. Checks, materials, photos and notes. Hold to finish.
- **Couldn't get in** (`app/no-access/[id].tsx`): a reason, a photo that shows it and an optional note. The job is paused for the office.
- **Wrap-up** (`app/wrap/[id].tsx`): review, the customer's signature, the invoice with VAT, then take payment or leave it for them to pay later. See Taking payment below.
- **My week** (`app/week.tsx`): what's coming up and your hours.
- **Me** (`app/me.tsx`): profile, registrations and when they run out, what's waiting to send, sign out. In the demo, pretend there's no signal and reset the demo.

## Working without signal

Everything an engineer does is a change on the phone first (`src/sync/actions.ts`). The screen moves at once and the change joins a queue (`src/sync/field.ts`) that is saved on the phone with the day it was made against.

- Each change gets its request id when it is made and keeps it through every retry, so the engine applies it once.
- Changes go in the order they were made. A failure waits and tries again, backing off from 2 seconds to 2 minutes.
- If the engine turns a change down (not allowed, not valid, not found), it is set aside on Me with the reason, and the ones after it still go. Try again or let it go.
- Records made offline carry a local id until the engine gives them a real one; later changes that point at them are rewritten (`src/sync/apply.ts`).
- Photos are shrunk (1600px long edge, JPEG) and kept on the phone, recorded on the job, and their image sent when there's signal. The phone's copy is cleared once it's up.
- The chip at the top says "All sent" or how many changes are waiting.

## Taking payment

When the firm takes payments through Ardent (its own Stripe account), wrap-up offers, best first (`src/components/TakePayment.tsx`, `src/payments/`):

- **Tap to Pay**: the customer taps their card or phone on the back of the engineer's phone. Hold to confirm the amount; over £100 they may be asked for their PIN on the engineer's screen. Needs signal.
- **Pay on your own phone**: a QR code the customer scans and pays with their own signal. With no signal on the engineer's phone the code carries the invoice, signed with the engineer's key, and the engine raises the invoice from it.
- **Text them the link**: queued, and sent the moment the phone has signal.
- Cash, bank transfer or pay later, recorded by hand as before.

Whether the firm takes payments, Stripe test mode and the engineer's signing key come with the day (`payments.get`), so they are on the phone with no signal. A firm that doesn't take payments yet keeps the plain list. In the demo there is no Stripe: the tap and the customer paying are pretend buttons.

Tap to Pay uses Stripe Terminal (`@stripe/stripe-terminal-react-native`), which only runs in Ardent's own app build. `src/payments/terminal.native.tsx` loads it only when its native module is there; the web build (`terminal.tsx`) and Expo Go fall back to the QR code. A real tap also needs Apple's Tap to Pay entitlement on Ardent's developer account and an iPhone XS or later, or an Android phone with NFC. It is switched off in `app.json` (`tapToPayCheck: false`) so iOS builds still sign; once Apple grants it, set `tapToPayCheck` to `true` and the plugin adds the entitlement.

## Shared code

`scripts/sync-core.sh` copies Ardent's shared code in so Metro never reaches outside `mobile/` (reads the repo from disk, or pass a git ref). Never edit the copies by hand.

- `src/engine/`: the engine files the one `Connection` needs (`engine/src/connect.ts` and what it imports).
- `src/kit/`: the design kit from `engine/kit`: tokens, states, formats and wording. `src/theme/tokens.ts` re-exports it and maps fonts to the loaded families (Michroma display, Geist reading, Geist Mono for every number).
- `src/data/core/`: Core's data model. `src/data/types.ts` re-exports it and adds the few Field-only shapes.
