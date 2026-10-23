/**
 * Tap to Pay on the engineer's own phone, through Stripe Terminal
 * (@stripe/stripe-terminal-react-native). The customer taps their card or
 * phone on the back of the engineer's phone; over £100 they may be asked for
 * their PIN on the engineer's screen, which Stripe's own sheet handles.
 *
 * The Terminal SDK is a native module: it is only in Ardent's own app build,
 * never in Expo Go, and the package reads the native module the moment it
 * loads. So it is required here only when the native module is there, and
 * every other case falls back to the QR code with a one-line reason.
 *
 * How a tap goes:
 * 1. The screen asks the engine for a payment (payments.tap): Stripe's
 *    payment, its client secret, a connection token and the firm's location.
 * 2. The token provider hands Stripe that connection token. If Stripe asks
 *    again once it has been used, the provider asks the engine for a fresh
 *    payment and uses its token and payment from then on.
 * 3. First time: initialise the SDK, then connect this phone as a Tap to Pay
 *    reader at the firm's location (easyConnect discovers and connects).
 * 4. Retrieve the payment by its client secret, collect the tap, confirm it.
 *    The engine hears the result from Stripe's webhook, so the screen then
 *    reads the invoice again.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { ReactNode } from 'react';
import { NativeModules, Platform } from 'react-native';
import type * as StripeTerminal from '@stripe/stripe-terminal-react-native';

import type { TapToPay } from '@/data/types';

import type { TapOptions, TapResult, TapStage, TapTerminal } from './terminal';

export type { TapOptions, TapResult, TapStage, TapTerminal };

type Sdk = typeof StripeTerminal;

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** The package, when this build has its native module. Loaded once, never in Expo Go. */
const sdk: Sdk | undefined = (() => {
  if (!NativeModules.StripeTerminalReactNative) return undefined;
  try {
    return require('@stripe/stripe-terminal-react-native') as Sdk;
  } catch {
    return undefined;
  }
})();

const UNAVAILABLE = inExpoGo ? 'Tap to Pay needs the Ardent app itself, not Expo Go.' : 'This build of Ardent was made without Tap to Pay.';

/**
 * The payment in hand and its connection token. The token is handed over
 * twice at most (the provider checks it once while starting up, then Stripe
 * uses it to connect) and only while it is fresh; after that a new payment
 * is asked for.
 */
const held: { t?: TapToPay; handed: number; at: number; fresh?: () => Promise<TapToPay> } = { handed: 0, at: 0 };
const TOKEN_FRESH_MS = 4 * 60_000;

async function tokenProvider(): Promise<string> {
  if (held.t && held.handed < 2 && Date.now() - held.at < TOKEN_FRESH_MS) {
    held.handed++;
    return held.t.connectionToken;
  }
  if (!held.fresh) throw new Error('No payment in hand to connect with');
  const t = await held.fresh();
  held.t = t;
  held.handed = 1;
  held.at = Date.now();
  return t.connectionToken;
}

/** Stripe's error codes, in the engineer's words. Anything else uses Stripe's own message. */
const WORDS: Record<string, string> = {
  TAP_TO_PAY_UNSUPPORTED_DEVICE: "This phone can't take Tap to Pay.",
  TAP_TO_PAY_UNSUPPORTED_ANDROID_VERSION: "This phone's Android is too old for Tap to Pay.",
  TAP_TO_PAY_UNSUPPORTED_PROCESSOR: "This phone can't take Tap to Pay.",
  TAP_TO_PAY_NFC_DISABLED: 'Turn NFC on in the phone settings to take a tap.',
  TAP_TO_PAY_DEVICE_TAMPERED: "Tap to Pay won't run on this phone as it is set up.",
  TAP_TO_PAY_INSECURE_ENVIRONMENT: "Tap to Pay won't run on this phone as it is set up.",
  TAP_TO_PAY_DEBUG_NOT_SUPPORTED: "Tap to Pay won't run while the phone's developer options are on.",
  TAP_TO_PAY_LIBRARY_NOT_INCLUDED: UNAVAILABLE,
  TAP_TO_PAY_READER_MERCHANT_BLOCKED: 'Stripe has stopped Tap to Pay for the firm. Ask the office.',
  LOCATION_SERVICES_DISABLED: 'Turn location on to take a card.',
  CONNECTION_TOKEN_PROVIDER_ERROR: "Couldn't reach Ardent to start the tap. Check the signal.",
};

type Failure = { code?: string; message?: string };
const fail = (e: Failure | undefined, fallback: string): TapResult =>
  e?.code === 'CANCELED' ? { ok: false, cancelled: true, reason: 'Cancelled' } : { ok: false, reason: (e?.code && WORDS[e.code]) || e?.message || fallback };

/** Wraps the app so the Terminal hooks work. Without the native module it only passes its children through. */
export function TapProvider({ children }: { children: ReactNode }) {
  if (!sdk) return <>{children}</>;
  const { StripeTerminalProvider } = sdk;
  return (
    <StripeTerminalProvider tokenProvider={tokenProvider} logLevel="error">
      <>{children}</>
    </StripeTerminalProvider>
  );
}

const unavailable: TapTerminal = {
  available: false,
  reason: UNAVAILABLE,
  take: async () => ({ ok: false, reason: UNAVAILABLE }),
  cancel: async () => undefined,
};

// Whether the SDK is here never changes while the app runs, so the hook below
// always calls the same hooks in the same order.
export const useTapToPay: () => TapTerminal = sdk ? useStripeTap : () => unavailable;

function useStripeTap(): TapTerminal {
  const s = sdk!;
  const term = s.useStripeTerminal();

  const take = async (t: TapToPay, opts: TapOptions): Promise<TapResult> => {
    held.t = t;
    held.handed = 0;
    held.at = Date.now();
    held.fresh = opts.fresh;
    const stage = (x: TapStage) => opts.onStage(x);
    try {
      stage('starting');
      if (Platform.OS === 'android') {
        const p = await s.requestNeededAndroidPermissions({
          accessFineLocation: { title: 'Location', message: 'Card payments need your location, as the card networks ask for it.', buttonPositive: 'Allow' },
        });
        if (p.error) return { ok: false, reason: 'Taking a card needs location. Allow it in the phone settings.' };
      }
      if (!term.getIsInitialized()) {
        const init = await term.initialize();
        if (init.error) return fail(init.error, "Couldn't start Tap to Pay.");
      }
      const reader = await term.getConnectedReader().catch(() => undefined);
      if (!reader) {
        if (!t.locationId) return { ok: false, reason: 'Stripe needs a location for the firm before Tap to Pay works. Ask the office.' };
        stage('connecting');
        const c = await term.easyConnect({
          discoveryMethod: 'tapToPay',
          // Stripe test mode connects a pretend reader, so the whole flow can be tried with no real card.
          simulated: t.test,
          locationId: t.locationId,
          merchantDisplayName: opts.merchant,
          tosAcceptancePermitted: true,
          autoReconnectOnUnexpectedDisconnect: true,
        });
        if (c.error) return fail(c.error, "Couldn't get the phone ready to take a tap.");
      }
      // Connecting may have asked for a fresh payment: use the one in hand now.
      const now = held.t ?? t;
      const found = await term.retrievePaymentIntent(now.clientSecret);
      if (found.error) return fail(found.error, "Couldn't find the payment at Stripe.");
      stage('waiting');
      const collected = await term.collectPaymentMethod({ paymentIntent: found.paymentIntent });
      if (collected.error) return fail(collected.error, "The tap didn't go through.");
      stage('confirming');
      const confirmed = await term.confirmPaymentIntent({ paymentIntent: collected.paymentIntent });
      if (confirmed.error) return fail(confirmed.error, "The card was tapped but the payment didn't go through.");
      return { ok: true };
    } catch (e) {
      return fail(e as Failure, "Tap to Pay stopped. Use the QR code instead.");
    }
  };

  return {
    available: true,
    take,
    cancel: async () => {
      await term.cancelCollectPaymentMethod().catch(() => undefined);
    },
  };
}
