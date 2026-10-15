import { useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@haumea/ui'
import { Building2 } from 'lucide-react'
import { AppCard } from '@haumea/ui'
import { useAuth } from '@/hooks/use-auth'

/**
 * Shown when a confirmed account passes the auth guard but has no
 * organisation resolved (profile/org lookup timed out during boot — see
 * auth-context.tsx fetchProfile / AUTH_PROFILE_TIMEOUT_MS). Most of the time
 * this is transient: the DB was briefly slow (a cold start, or load from a
 * migration/deploy) and the bounded boot lookup gave up.
 *
 * So before showing the user an alarming message, we SILENTLY RETRY the
 * lookup a few times via refreshProfile() (which has no boot timeout). If the
 * org resolves, ProtectedRoute re-renders with it and this screen unmounts on
 * its own — the user sees a brief "reconnecting" spinner and nothing more.
 * Only if every retry fails do we fall back to the manual recovery actions.
 */
const RETRY_BACKOFFS_MS = [600, 1200, 2400]

export function WorkspaceSetupPending() {
  const { signOut, refreshProfile, profile } = useAuth()
  const [phase, setPhase] = useState<'retrying' | 'failed'>('retrying')
  const startedRef = useRef(false)

  useEffect(() => {
    // Guard against React 18 StrictMode double-invoke in dev.
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    void (async () => {
      for (const backoff of RETRY_BACKOFFS_MS) {
        await new Promise((resolve) => setTimeout(resolve, backoff))
        if (cancelled) return
        try {
          await refreshProfile()
        } catch {
          // Swallow and keep trying — a failed attempt is just another retry.
        }
        // If refreshProfile resolved the org, the context updates,
        // ProtectedRoute renders the app, and THIS component unmounts —
        // which flips `cancelled` true via the cleanup below, ending the loop.
        if (cancelled) return
      }
      // Exhausted every silent retry and we're still mounted (no org) → surface
      // the manual recovery screen.
      if (!cancelled) setPhase('failed')
    })()

    return () => {
      cancelled = true
    }
  }, [refreshProfile])

  // An existing member whose org merely failed to LOAD shouldn't be told their
  // "setup" didn't finish — that's misleading. Only a brand-new account with no
  // org assigned yet is genuinely mid-setup.
  const hasAssignedOrg = !!profile?.organisation_id
  const heading = hasAssignedOrg
    ? "We couldn't load your workspace"
    : "We couldn't finish setting up your workspace"
  const body = hasAssignedOrg
    ? "Your account is fine — we just had trouble reaching your workspace. This is usually a brief connection blip."
    : 'Your account is confirmed, but we hit a snag finishing your workspace setup. This is usually temporary.'

  if (phase === 'retrying') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-page px-4">
        <AppCard padding="lg" className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-elevated border border-border-subtle">
            <Building2 size={32} className="text-brand-600" />
          </div>
          <h1 className="mb-2 text-2xl font-semibold text-text-primary">
            Reconnecting to your workspace…
          </h1>
          <p className="mb-6 text-text-muted">
            One moment — just re-establishing your session.
          </p>
          <div className="flex justify-center">
            <Spinner size="md" />
          </div>
        </AppCard>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page px-4">
      <AppCard padding="lg" className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-elevated border border-border-subtle">
          <Building2 size={32} className="text-brand-600" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-text-primary">{heading}</h1>
        <p className="mb-6 text-text-muted">
          {body} Try again in a moment, or sign out and back in.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Button
            variant="primary"
            className="w-full"
            onPress={() => window.location.reload()}
          >
            Try again
          </Button>
          <button
            type="button"
            onClick={() => {
              void signOut()
            }}
            className="text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            Sign out
          </button>
        </div>
      </AppCard>
    </div>
  )
}
