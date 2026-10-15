// Strategic 2 / S2 — Helpers for the auto-updating customer calendar URL.
//
// The public-job-eta-ics edge function exposes a VCALENDAR feed at
//   {VITE_SUPABASE_URL}/functions/v1/public-job-eta-ics/<token>
//
// The token in the path (instead of a query param) lets calendar
// clients subscribe with a clean header-less URL — Google Calendar,
// Apple Calendar, and Outlook all paste an https/webcal URL with no
// way to add an `apikey` header. The function is deployed with
// verify_jwt:false so this works.
//
// We expose two URL builders:
//   buildIcsUrl(token)     → https://… for clients that resolve https
//   buildWebcalUrl(token)  → webcal://… for one-tap import on macOS/iOS
//
// Pure functions only — no React, no fetching. The component layer
// owns clipboard/toast UX.

const SUPABASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_SUPABASE_URL?: string } }).env?.VITE_SUPABASE_URL) ||
  'https://placeholder.supabase.co'

/**
 * Build the public ICS subscription URL for an ETA token.
 *
 * Uses the path-param form (NOT ?token=…) so calendar clients that
 * paste the URL verbatim don't need to set an `apikey` header.
 *
 * The token is already URL-safe base64 (chars: A-Z a-z 0-9 - _) so
 * encodeURIComponent is a no-op for valid tokens, but we still call
 * it to be defensive against callers passing arbitrary strings.
 */
export function buildIcsUrl(token: string): string {
  const base = SUPABASE_URL.replace(/\/$/, '')
  return `${base}/functions/v1/public-job-eta-ics/${encodeURIComponent(token)}`
}

/**
 * Same URL with the `webcal://` protocol — when the customer taps
 * this on macOS, iOS, or iPadOS the OS opens Calendar.app and offers
 * a one-tap "Subscribe" action. On other platforms the protocol is
 * ignored and most browsers fall through to the default handler
 * (which is usually Google Calendar on Android / desktop Chrome).
 */
export function buildWebcalUrl(token: string): string {
  return buildIcsUrl(token).replace(/^https?:\/\//, 'webcal://')
}
