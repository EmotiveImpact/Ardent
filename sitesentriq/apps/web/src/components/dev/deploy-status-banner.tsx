// src/components/dev/deploy-status-banner.tsx
//
// Banner that surfaces the latest production deploy status from
// GitHub. Renders in three placements:
//   - 'health'    — subtle inline banner on /dashboard/health
//   - 'dashboard' — top-of-dashboard banner, gated to super_admin
//   - 'dev'       — fixed-bottom-right pill in import.meta.env.DEV
//
// Hidden states (returns null):
//   - state === 'success'
//   - response is `unconfigured` (no GITHUB_TOKEN on the edge)
//   - user has dismissed this specific commit SHA
//
// Dismissal is per-SHA via localStorage key `dismissedDeploy:<sha>`.
// A new bad deploy with a new SHA re-shows the banner.

import { useEffect, useState } from 'react'
import { Button } from '@haumea/ui'
import { AlertTriangle, Loader2, X, ExternalLink } from 'lucide-react'
import {
  useLatestDeployStatus,
  FAILURE_STATES,
  IN_PROGRESS_STATES,
  type BannerPlacement,
  type DeployStatus,
} from '@/lib/deploy-status'

interface DeployStatusBannerProps {
  placement: BannerPlacement
}

const DISMISS_KEY = 'dismissedDeploy:'

function isDismissed(sha: string | undefined): boolean {
  if (!sha || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DISMISS_KEY + sha) === '1'
  } catch {
    return false
  }
}

function dismiss(sha: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISMISS_KEY + sha, '1')
  } catch {
    /* localStorage might be disabled — ignore */
  }
}

function shortSha(sha: string | undefined): string {
  return sha ? sha.slice(0, 7) : 'unknown'
}

interface BannerVisualProps {
  status: DeployStatus
  placement: BannerPlacement
  onDismiss: () => void
}

/** Full-width banner used on dashboard + health. */
function FullBanner({ status, placement, onDismiss }: BannerVisualProps) {
  const isFailure = FAILURE_STATES.includes(status.state ?? 'unknown')
  const Icon = isFailure ? AlertTriangle : Loader2
  const title = isFailure
    ? `Latest production deploy failed (commit ${shortSha(status.commit_sha)})`
    : `Deploying commit ${shortSha(status.commit_sha)}…`
  const subtitle = isFailure
    ? status.description ?? 'Check the build logs before pushing more changes.'
    : status.description ?? `${status.environment ?? 'production'} deploy in progress.`

  // Tone:
  //   failure → status-overdue (red) — this is loud because it's blocking.
  //   pending → brand-* teal accent — informational, not alarming.
  const containerClass = isFailure
    ? 'border-status-overdue/40 bg-status-overdue/10 text-status-overdue'
    : 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300'

  const handleClick = () => {
    if (status.target_url) window.open(status.target_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      role={isFailure ? 'alert' : 'status'}
      aria-live={isFailure ? 'assertive' : 'polite'}
      data-placement={placement}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${containerClass}`}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={`shrink-0 ${isFailure ? '' : 'animate-spin'}`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-label font-semibold">{title}</div>
        <div className="text-caption opacity-80 truncate">{subtitle}</div>
      </div>
      {status.target_url ? (
        <Button
          size="sm"
          variant={isFailure ? 'danger' : 'primary'}
          onPress={handleClick}
        >
          <ExternalLink size={14} aria-hidden="true" />
          View logs
        </Button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss deploy status banner"
        className="shrink-0 rounded-md p-1 hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

/** Tiny fixed-bottom-right pill used in dev mode. Click expands to
 *  the same content but stays clickable. */
function DevPill({ status, onDismiss }: BannerVisualProps) {
  const [expanded, setExpanded] = useState(false)
  const isFailure = FAILURE_STATES.includes(status.state ?? 'unknown')
  const Icon = isFailure ? AlertTriangle : Loader2

  const pillClass = isFailure
    ? 'bg-status-overdue text-white'
    : 'bg-brand-500 text-white'

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={`Deploy status: ${status.state}`}
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 text-micro font-semibold shadow-lg ${pillClass} hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white`}
      >
        <Icon
          size={12}
          aria-hidden="true"
          className={isFailure ? '' : 'animate-spin'}
        />
        Deploy: {isFailure ? 'failed' : status.state}
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      <FullBanner
        status={status}
        placement="dev"
        onDismiss={() => {
          setExpanded(false)
          onDismiss()
        }}
      />
    </div>
  )
}

export function DeployStatusBanner({ placement }: DeployStatusBannerProps) {
  const { data } = useLatestDeployStatus()
  const [dismissedSha, setDismissedSha] = useState<string | null>(null)

  // Hydrate dismissed state once we know the SHA. Done in an effect
  // because localStorage isn't available during SSR-style initial
  // renders (we're SPA but staying defensive).
  useEffect(() => {
    if (data?.commit_sha && isDismissed(data.commit_sha)) {
      setDismissedSha(data.commit_sha)
    } else {
      setDismissedSha(null)
    }
  }, [data?.commit_sha])

  if (!data) return null
  if (data.unconfigured) return null
  if (!data.state) return null
  if (data.state === 'success' || data.state === 'inactive') return null

  const isInteresting =
    FAILURE_STATES.includes(data.state) || IN_PROGRESS_STATES.includes(data.state)
  if (!isInteresting) return null
  if (data.commit_sha && data.commit_sha === dismissedSha) return null

  const onDismiss = () => {
    if (data.commit_sha) {
      dismiss(data.commit_sha)
      setDismissedSha(data.commit_sha)
    }
  }

  if (placement === 'dev') {
    return <DevPill status={data} placement={placement} onDismiss={onDismiss} />
  }

  return <FullBanner status={data} placement={placement} onDismiss={onDismiss} />
}

export default DeployStatusBanner
