# Blockers — items that need external config/credentials, not code

These are NOT code bugs. Each is a feature whose code path is correct/guarded but
which can't be fully enabled until an external account, key, or DNS record is set up.
The app degrades gracefully for every item below (no crash, no broken core flow).

## Mobile push notifications — needs an EAS projectId
- **What:** `expo-notifications` `getExpoPushTokenAsync()` requires an EAS
  `projectId`. The code (`apps/mobile/lib/notifications.ts`) now resolves it from
  `Constants.expoConfig?.extra?.eas?.projectId` and **skips registration gracefully**
  (logs a warning, returns null) when it's absent — instead of throwing
  `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID`.
- **To enable:** run `eas init` in `apps/mobile/` (requires an Expo account). That
  writes `expo.extra.eas.projectId` into `app.json`. After that, tokens register and
  the `expo_push_tokens` table populates. Also wire
  `addNotificationResponseReceivedListener` for tap-to-navigate if desired.
- **Status:** BLOCKED on an Expo/EAS account + `eas init`.

## Card-up-front billing — needs a Stripe secret key
- **What:** the billing/subscription gate needs a live/test `sk_…` Stripe key for the
  edge functions. Without it the checkout/portal calls can't run.
- **Status:** BLOCKED on a Stripe `sk_test_` (or live) key.

## Custom-domain transactional email — needs Resend DNS verification
- **What:** sending from `@sitesentriq.com` requires the domain verified in Resend
  (SPF/DKIM DNS records on sitesentriq.com). Until then, mail uses the shared/sandbox
  sender.
- **Status:** BLOCKED on DNS verification of sitesentriq.com in Resend.

## Leaked-password (HIBP) protection — Supabase Pro plan
- **What:** Supabase Auth's "reject known-breached passwords" (HaveIBeenPwned) toggle
  is gated to the Pro plan.
- **Status:** BLOCKED on a Supabase Pro plan.
