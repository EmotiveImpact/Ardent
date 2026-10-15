import { createClient } from '@supabase/supabase-js'
import { instrumentSupabase } from '@/lib/supabase-instrumentation'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'

// Default per-request timeout. The audit found that ~every hook except
// useJobs trusted the browser's eventual TCP timeout (10+ minutes), so a
// single stalled request — Supabase pause/wake, cold edge function,
// slow region — would leave consumer `isLoading` true forever and the
// route stuck on a Skeleton. With this in place a stalled request fails
// fast with AbortError after PER_REQUEST_TIMEOUT_MS, which TanStack
// Query surfaces as an error state the existing fallbacks handle.
const PER_REQUEST_TIMEOUT_MS = 12_000

const supabaseFetch: typeof fetch = (input, init) => {
  // Long-poll realtime/SSE endpoints intentionally hold the connection
  // open — never put a wall-clock cap on them.
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (/\/(realtime\/|functions\/v1\/.*\/stream)/i.test(url)) {
    return fetch(input, init)
  }
  const callerSignal = init?.signal
  if (callerSignal && (callerSignal as AbortSignal & { any?: unknown }).any !== undefined) {
    // Defer to the caller's signal — they're already managing cancellation.
    return fetch(input, init)
  }
  const timeoutSignal = AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS)
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal
  return fetch(input, { ...init, signal })
}

const rawClient = createClient(supabaseUrl, supabaseAnonKey, {
  // Realtime — explicit config so RLS-filtered channels (the ones we
  // use) reliably receive the user's JWT. supabase-js v2 normally wires
  // this automatically via the shared GoTrue session, but being explicit
  // makes the intent obvious and protects against subtle setup drift.
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    fetch: supabaseFetch,
  },
})

// Forward auth state into realtime — when the user signs in / their
// JWT refreshes, push the new token into the realtime client so
// existing channels can receive RLS-filtered events without reconnect.
rawClient.auth.onAuthStateChange((event, session) => {
  if (session?.access_token) {
    rawClient.realtime.setAuth(session.access_token)
    if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_REALTIME === 'true') {
      console.debug('[realtime] auth →', event, '— token applied')
    }
  }
})

// Race protection: at module load, the realtime client doesn't yet
// have a JWT (onAuthStateChange listeners only fire on subsequent
// changes/INITIAL_SESSION). Pull the existing session and apply it
// synchronously so the very first channel subscription succeeds.
rawClient.auth.getSession().then(({ data: { session } }) => {
  if (session?.access_token) {
    rawClient.realtime.setAuth(session.access_token)
    if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_REALTIME === 'true') {
      console.debug('[realtime] boot — token applied from cached session')
    }
  } else {
    if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_REALTIME === 'true') {
      console.debug('[realtime] boot — no cached session, anonymous subscriptions only')
    }
  }
})

// Wrap with Sentry instrumentation — slow-query breadcrumbs + error logging.
// No-op when Sentry isn't initialised, so dev/test work unchanged.
export const supabase = instrumentSupabase(rawClient)
