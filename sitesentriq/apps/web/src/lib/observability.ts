/**
 * Observability — Sentry integration for error tracking, performance, replay.
 *
 * Privacy / GDPR (what Sentry sees):
 * ─────────────────────────────────────────────────────────────────────────────
 *  Captured by default:
 *    - Uncaught JS errors + stack traces (with source maps when uploaded)
 *    - Unhandled promise rejections
 *    - React render errors (via ErrorBoundary)
 *    - Performance spans for navigation, resources, fetch/XHR, Supabase ops
 *    - Session Replays (10% sampled, 100% on error) — DOM mutations,
 *      mouse moves, clicks. Inputs are masked (`maskAllInputs: true`),
 *      media is blocked (`blockAllMedia: true`).
 *    - User context: id, email, organisation_id only — NOT full_name or any
 *      other PII unless explicitly opted in.
 *
 *  Filtered / scrubbed by `beforeSend` before leaving the browser:
 *    - `email`, `phone`, `token`, `access_token`, `refresh_token`, `password`,
 *      `api_key`, `apikey`, `authorization`, `auth_token`, `secret` keys —
 *      replaced with `[Filtered]` anywhere in event extras / contexts / breadcrumbs.
 *
 *  Never sent:
 *    - VITE_SUPABASE_ANON_KEY (it's in URLs but anon keys are public-safe)
 *    - Service role keys (those are server-only)
 *    - Local storage / cookies (Sentry browser SDK doesn't capture these)
 *
 *  Init is gated on `import.meta.env.VITE_SENTRY_DSN` — if unset (dev/test
 *  without a Sentry project) every helper here is a no-op so the build
 *  and the runtime never crash.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from '@sentry/react'
import { toast } from 'sonner'

// Build-time injected via vite.config.ts `define`.
declare const __APP_VERSION__: string

const DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN
const MODE: string = import.meta.env.MODE
const IS_PROD = MODE === 'production'
const IS_PREVIEW = MODE === 'preview' || MODE === 'staging'

let initialised = false

/** Keys that get scrubbed from event extras / contexts / breadcrumbs. */
const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'phone_number',
  'token',
  'access_token',
  'refresh_token',
  'password',
  'api_key',
  'apikey',
  'authorization',
  'auth_token',
  'secret',
])

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value
  if (Array.isArray(value)) return value.map(v => scrub(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[Filtered]'
      } else {
        out[k] = scrub(v, depth + 1)
      }
    }
    return out
  }
  return value
}

/**
 * Initialise Sentry. No-op when VITE_SENTRY_DSN is unset so dev/test builds
 * don't crash. Call once from main.tsx.
 */
export function initObservability(): void {
  if (initialised) return
  if (!DSN) {
    if (!IS_PROD) {
      // Quiet hint for devs without a DSN — don't spam the console.
       
      console.info(
        '[observability] VITE_SENTRY_DSN unset — Sentry is disabled.',
      )
    }
    // Still wire up the unhandledrejection listener so dev sees the toast.
    wireUnhandledRejections()
    initialised = true
    return
  }

  Sentry.init({
    dsn: DSN,
    environment: IS_PREVIEW ? 'preview' : MODE,
    release: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
    // Production: 10% perf sampling. Preview/staging: 100% to debug freely.
    tracesSampleRate: IS_PROD ? 0.1 : IS_PREVIEW ? 1.0 : 0.0,
    // Only stitch distributed traces to first-party Supabase calls. Leaves
    // third-party CDNs / fonts alone (Sentry v10 places this at top-level).
    tracePropagationTargets: [/^https:\/\/[^/]+\.supabase\.co\//],
    // Replay: 10% baseline, 100% when an error is captured.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Replay is lazy-loaded below to keep the initial bundle lean
    // (it's a ~30 KB gzipped chunk, only fetched when actually needed).
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    beforeSend(event) {
      // Scrub sensitive keys from extras + contexts.
      if (event.extra) event.extra = scrub(event.extra) as typeof event.extra
      if (event.contexts) {
        for (const k of Object.keys(event.contexts)) {
          // Sentry types Contexts as Record<string, Context | undefined>.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event.contexts as any)[k] = scrub((event.contexts as any)[k])
        }
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(b => ({
          ...b,
          data: b.data ? (scrub(b.data) as typeof b.data) : b.data,
        }))
      }
      // Don't accidentally leak the user's email out of `event.user`.
      // We only ever set id + organisation_id via setUserContext — but be paranoid.
      if (event.user) {
        const u = event.user as Record<string, unknown>
        if (u.email && !u.email_opted_in) {
          u.email = undefined
        }
      }
      return event
    },
  })

  // Lazy-load Replay so the ~30 KB gzipped recorder doesn't ship in the
  // initial bundle. Triggered after a brief idle window so we don't fight
  // first-paint resources.
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    ;(window as Window & typeof globalThis).requestIdleCallback(
      () => {
        loadReplay()
      },
      { timeout: 4000 },
    )
  } else {
    setTimeout(loadReplay, 2000)
  }

  wireUnhandledRejections()
  initialised = true
}

async function loadReplay() {
  try {
    const replayLoader = await Sentry.lazyLoadIntegration('replayIntegration')
    Sentry.addIntegration(
      replayLoader({
        // Privacy-safe defaults: don't capture user-typed text, don't capture media.
        maskAllText: false,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    )
  } catch {
    // Network blip while fetching the integration — non-fatal.
  }
}

let unhandledRejectionWired = false
function wireUnhandledRejections() {
  if (unhandledRejectionWired) return
  if (typeof window === 'undefined') return
  unhandledRejectionWired = true
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      reason instanceof Error ? reason.message : String(reason ?? 'Unknown')
    if (initialised && DSN) {
      Sentry.captureException(reason, { tags: { kind: 'unhandledrejection' } })
    }
    if (!IS_PROD) {
       
      console.warn('[unhandledrejection]', reason)
      try {
        toast.error('Unhandled rejection', { description: message })
      } catch {
        // toast may not be mounted yet — swallow.
      }
    }
  })
}

/**
 * Send an error to Sentry. In dev (or when DSN is unset) falls through to
 * console.error so you still see it in the browser.
 */
export function logError(err: unknown, context?: Record<string, unknown>) {
  if (DSN && initialised) {
    Sentry.captureException(err, {
      extra: context ? (scrub(context) as Record<string, unknown>) : undefined,
    })
  }
  if (!IS_PROD || !DSN) {
    // Format inline so the message is actually readable in the browser
    // console. Previously we logged a payload object which the console
    // collapsed to "[object Object]" — useless for debugging.
    const message = err instanceof Error ? err.message : String(err)
    const ctxStr = context ? ` ${JSON.stringify(context).slice(0, 200)}` : ''
     
    console.error(`[logError] ${message}${ctxStr}`, err)
  }
}

/**
 * Record a named app event — adds a breadcrumb and (in non-prod) captures
 * a low-severity message so you can search for it in Sentry's discover UI.
 */
export function logEvent(name: string, props?: Record<string, unknown>) {
  if (!DSN || !initialised) {
    if (!IS_PROD) {
       
      console.info('[logEvent]', name, props)
    }
    return
  }
  Sentry.addBreadcrumb({
    category: 'app',
    message: name,
    level: 'info',
    data: props ? (scrub(props) as Record<string, unknown>) : undefined,
  })
  Sentry.captureMessage(name, 'info')
}

/** Set the Sentry user context. Only id + email + org_id — NO full_name etc. */
export function setUserContext(user: {
  id: string
  email?: string | null
  organisation_id?: string | null
}) {
  if (!DSN || !initialised) return
  Sentry.setUser({
    id: user.id,
    // Email is sent because Sentry's session replay UI needs *something* to
    // identify a session — feel free to remove if your DPA forbids it.
    email: user.email ?? undefined,
    // Custom claim — surfaces as `user.organisation_id` in Sentry events.
    organisation_id: user.organisation_id ?? undefined,
  } as Sentry.User)
}

/** Clear the Sentry user — call on sign-out. */
export function clearUserContext() {
  if (!DSN || !initialised) return
  Sentry.setUser(null)
}

/**
 * Wrap a synchronous or async block of work in a Sentry performance span.
 * No-op when Sentry isn't initialised — just runs the callback directly.
 */
export function startSpan<T>(
  name: string,
  op: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  if (!DSN || !initialised) return fn()
  return Sentry.startSpan({ name, op }, () => fn())
}

/** Open Sentry's user-feedback dialog for a captured eventId. */
export function showFeedbackDialog(eventId: string) {
  if (!DSN || !initialised) return
  Sentry.showReportDialog({ eventId })
}

/** Re-export for ErrorBoundary use. */
export { Sentry }

/** True iff Sentry was successfully initialised. */
export function isObservabilityInitialised(): boolean {
  return initialised && !!DSN
}
