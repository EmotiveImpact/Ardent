/**
 * Tap to Pay, where the phone can't do it: the web build (the clickable
 * prototype). Metro picks terminal.native.tsx on a phone instead; both files
 * give the same shape, so screens never care which one they got.
 *
 * The demo never needs this: its payments are pretend, and the wrap-up screen
 * shows a pretend tap without Stripe.
 */
import type { ReactNode } from 'react';

import type { TapToPay } from '@/data/types';

/** Where a tap has got to, for the words on screen. */
export type TapStage = 'starting' | 'connecting' | 'waiting' | 'confirming';

export type TapResult = { ok: true } | { ok: false; cancelled?: boolean; reason: string };

export interface TapOptions {
  /** A fresh payment from the engine, for when Stripe asks for a new connection token. */
  fresh: () => Promise<TapToPay>;
  /** The firm's name, shown on the Tap to Pay screen. */
  merchant: string;
  onStage: (stage: TapStage) => void;
}

export interface TapTerminal {
  /** This build can take a tap with Stripe Terminal. */
  available: boolean;
  /** One line on why it can't, when it can't. */
  reason?: string;
  /** Connect the phone as a reader if it isn't yet, then collect and confirm the payment. */
  take(t: TapToPay, opts: TapOptions): Promise<TapResult>;
  /** Stop waiting for a tap. */
  cancel(): Promise<void>;
}

const REASON = 'Tap to Pay works in the Ardent app on a phone, not in a browser.';

/** Wraps the app so the Terminal hooks have what they need. Nothing to do here. */
export function TapProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useTapToPay(): TapTerminal {
  return {
    available: false,
    reason: REASON,
    take: async () => ({ ok: false, reason: REASON }),
    cancel: async () => undefined,
  };
}
