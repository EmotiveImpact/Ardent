import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import { AlertTriangle, Home, RotateCcw, MessageSquare, Copy, Check } from 'lucide-react'
import { Sentry, logError, showFeedbackDialog } from '@/lib/observability'

/**
 * True when the error looks like a Vite/Rolldown lazy-chunk failure.
 * After a deploy, open tabs reference chunk hashes that no longer exist;
 * React surfaces these as `ChunkLoadError` or with messages like
 * "Failed to fetch dynamically imported module". Recovery = reload.
 */
export function isChunkLoadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; message?: string }
  if (e.name === 'ChunkLoadError') return true
  if (typeof e.message !== 'string') return false
  // Patterns covered:
  // - "Loading chunk N failed" — classic webpack
  // - "Failed to fetch dynamically imported module" — Vite/Rolldown
  // - "Importing a module script failed" — Safari
  // - "Failed to fetch" — general network blip on the chunk request
  // - "'text/html' is not a valid JavaScript MIME type" / "not allowed by Strict
  //    MIME Type Checking" — what the browser says when a stale chunk URL hits
  //    the SPA fallback and gets index.html back. We tightened the Vercel
  //    rewrite in v0.21.6 so missing chunks 404 cleanly, but this catch is
  //    defence-in-depth for environments without that rewrite + the historic
  //    user tabs that loaded before that change.
  // - "MIME type ('text/html')" / "expected a JavaScript-or-Wasm module script"
  //   — alternative Chromium phrasing of the same issue.
  return /(?:Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch|not a valid JavaScript MIME type|Strict MIME Type Checking|expected a JavaScript|expected.+module script|MIME type \(['"]text\/html)/i.test(
    e.message,
  )
}

interface Props {
  children: ReactNode
  /** Optional override fallback */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Where the "Go to dashboard" button should send the user */
  homePath?: string
}

interface State {
  error: Error | null
  eventId: string | null
  copied: boolean
}

/**
 * Top-level error boundary for route trees. Catches React render errors,
 * forwards them to Sentry via `logError`, captures the resulting `eventId`
 * and surfaces it in the fallback UI as a copyable reference. The "Report
 * feedback" button opens Sentry's user feedback dialog tied to the same
 * eventId so support can see the user's note attached to the original event.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, eventId: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Chunk-load failures are the #1 cause of "stuck on Something went wrong"
    // after a deploy: the user's open tab has an old index.html that references
    // chunk hashes that no longer exist. React's lazy() throws ChunkLoadError;
    // re-rendering reuses the same failed import from module cache so the
    // "Try again" button is useless. Detect + force a single hard reload
    // (guarded by sessionStorage so a genuinely broken chunk doesn't reload-loop).
    if (isChunkLoadError(error)) {
      if (typeof window !== 'undefined' && !window.sessionStorage.getItem('__chunk_reload__')) {
        window.sessionStorage.setItem('__chunk_reload__', String(Date.now()))
        window.location.reload()
        return
      }
      // Already reloaded once and still broken — clear the flag so a manual
      // refresh later can reload again, and fall through to the normal UI.
      try {
        window.sessionStorage.removeItem('__chunk_reload__')
      } catch {
        /* sessionStorage can throw in some Safari private modes — ignore */
      }
    }
    // Capture via Sentry directly so we get the eventId back. logError() also
    // ships it for any other configured sinks.
    const eventId = Sentry.captureException(error, {
      contexts: {
        react: { componentStack: info.componentStack ?? undefined },
      },
    })
    this.setState({ eventId })
    logError(error, { componentStack: info.componentStack })
  }

  reset = () => {
    this.setState({ error: null, eventId: null, copied: false })
  }

  goHome = () => {
    const path = this.props.homePath ?? '/dashboard'
    // Hard reload prevents reusing broken state.
    window.location.href = path
  }

  copyEventId = async () => {
    if (!this.state.eventId) return
    try {
      await navigator.clipboard.writeText(this.state.eventId)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 2000)
    } catch {
      // Clipboard API can fail under permissions — silently ignore.
    }
  }

  openFeedback = () => {
    if (this.state.eventId) showFeedbackDialog(this.state.eventId)
  }

  render() {
    const { error, eventId, copied } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset)
    }

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <AppCard
          role="alert"
          padding="lg"
          className="max-w-md w-full text-center"
        >
          <div className="space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-status-overdue/10 flex items-center justify-center">
            <AlertTriangle className="text-status-overdue" size={22} aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-[16px] font-semibold text-text-primary tracking-[-0.01em]">
              Something went wrong
            </h2>
            <p className="text-label text-text-secondary">
              We hit an unexpected error rendering this page. Try again, or head back to the dashboard.
            </p>
          </div>
          {error.message && (
            <pre className="text-micro text-text-muted font-mono bg-surface-elevated rounded-md p-3 text-left overflow-x-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          )}
          {eventId && (
            <button
              type="button"
              onClick={this.copyEventId}
              className="w-full text-left text-micro font-mono text-text-muted bg-surface-elevated rounded-md p-2.5 flex items-center gap-2 hover:bg-surface-elevated/80 transition-colors"
              aria-label="Copy support reference"
            >
              {copied ? (
                <Check size={12} className="text-brand-500 shrink-0" aria-hidden="true" />
              ) : (
                <Copy size={12} className="text-text-muted shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                Reference: <span className="text-text-secondary">{eventId.slice(0, 8)}</span>
                <span className="text-text-muted"> — copy this when contacting support</span>
              </span>
            </button>
          )}
          <div className="flex gap-2 justify-center flex-wrap">
            <Button size="sm" variant="primary" onPress={this.reset}>
              <RotateCcw size={14} aria-hidden="true" />
              Try again
            </Button>
            <Button size="sm" variant="outline" onPress={this.goHome}>
              <Home size={14} aria-hidden="true" />
              Go to dashboard
            </Button>
            {eventId && (
              <Button size="sm" variant="ghost" onPress={this.openFeedback}>
                <MessageSquare size={14} aria-hidden="true" />
                Report feedback
              </Button>
            )}
          </div>
          </div>
        </AppCard>
      </div>
    )
  }
}
