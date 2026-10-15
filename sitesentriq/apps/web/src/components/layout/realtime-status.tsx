import { Wifi, WifiOff } from 'lucide-react'
import type {
  RealtimeConnectionStatus,
  RealtimeEventSnapshot,
} from '@/hooks/use-realtime-subscriptions'
import { featureFlags } from '@/lib/feature-flags'

interface Props {
  status: RealtimeConnectionStatus
  /** Optional online-user count (renders adjacent presence dot+count) */
  presenceCount?: number
  perTable?: Record<string, RealtimeConnectionStatus>
  lastEvent?: RealtimeEventSnapshot | null
  appVersion?: string
  showDiagnostics?: boolean
}

/**
 * Compact topbar pill: pulse dot (green=connected, amber=reconnecting,
 * red=offline) plus an optional, demoted presence indicator. Hidden when idle
 * (e.g. dev mode without Supabase).
 *
 * The presence count is intentionally low-key: a single dot + number in muted
 * text. It only renders when more than one user is online (a "1 online" pill
 * is just you and adds noise) and can be killed entirely via the
 * `presencePill` feature flag.
 */
function statusLabel(status: RealtimeConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'reconnecting':
      return 'Reconnecting'
    case 'offline':
      return 'Offline'
    case 'idle':
    default:
      return 'Idle'
  }
}

function statusDotClass(status: RealtimeConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'bg-status-compliant'
    case 'connecting':
    case 'reconnecting':
      return 'bg-status-due-soon'
    case 'offline':
      return 'bg-status-overdue'
    case 'idle':
    default:
      return 'bg-text-muted'
  }
}

function formatEventTime(event: RealtimeEventSnapshot | null | undefined) {
  if (!event) return 'None yet'
  const date = new Date(event.at)
  if (Number.isNaN(date.getTime())) return event.at
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function orderRealtimeEntries(perTable: Record<string, RealtimeConnectionStatus> | undefined) {
  const entries = Object.entries(perTable ?? {})
  return entries.sort(([left], [right]) => {
    if (left === 'broadcast') return -1
    if (right === 'broadcast') return 1
    return left.localeCompare(right)
  })
}

export function RealtimeStatusPill({
  status,
  presenceCount,
  perTable,
  lastEvent,
  appVersion,
  showDiagnostics = false,
}: Props) {
  if (status === 'idle') {
    return null
  }

  const dot = (() => {
    switch (status) {
      case 'connected':
        return { color: 'bg-status-compliant', label: 'Live', icon: <Wifi size={10} /> }
      case 'connecting':
      case 'reconnecting':
        return {
          color: 'bg-status-due-soon',
          label: status === 'connecting' ? 'Connecting' : 'Reconnecting',
          icon: <Wifi size={10} />,
        }
      case 'offline':
      default:
        return { color: 'bg-status-overdue', label: 'Offline', icon: <WifiOff size={10} /> }
    }
  })()

  const isLive = status === 'connected'

  // Show the presence indicator only when:
  //  1. The kill-switch flag is on (default),
  //  2. We actually have a count, and
  //  3. There's more than one user (a count of 1 is just yourself — chat-app theatre).
  const showPresence =
    featureFlags.presencePill &&
    typeof presenceCount === 'number' &&
    presenceCount > 1
  const statusEntries = orderRealtimeEntries(perTable)
  const version = appVersion?.split('@').pop() ?? appVersion

  return (
    <div className="hidden md:flex items-center gap-2">
      {/* Connection pulse — useful, stays prominent */}
      {showDiagnostics ? (
        <details className="relative">
          <summary
            className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border-default bg-surface-elevated px-2 py-1 text-micro font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary [&::-webkit-details-marker]:hidden"
            title={`Realtime: ${dot.label.toLowerCase()}`}
          >
            <span className="relative flex h-2 w-2">
              {isLive && (
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-status-pulse ${dot.color}`}
                />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${dot.color}`} />
            </span>
            <span>{dot.label}</span>
          </summary>

          <div className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-lg border border-border-default bg-surface-card p-3 text-left shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-border-default pb-2">
              <div>
                <p className="text-caption font-semibold text-text-primary">Realtime diagnostics</p>
                <p className="mt-0.5 text-micro text-text-muted">
                  Version {version ?? 'unknown'}
                </p>
              </div>
              <span className="rounded-md bg-surface-page px-2 py-0.5 text-micro font-medium text-text-secondary">
                {statusLabel(status)}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              <div>
                <p className="text-[10px] font-semibold uppercase text-text-muted">
                  Last event
                </p>
                {lastEvent ? (
                  <div className="mt-1 rounded-md border border-border-default bg-surface-page p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-caption font-medium text-text-primary">
                        {lastEvent.table} {lastEvent.eventType}
                      </span>
                      <span className="text-micro text-text-muted">{formatEventTime(lastEvent)}</span>
                    </div>
                    <p className="mt-1 text-micro text-text-secondary">
                      Source: {lastEvent.source === 'broadcast' ? 'Broadcast' : 'Postgres Changes'}
                    </p>
                    {lastEvent.keys.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {lastEvent.keys.map((key) => (
                          <span
                            key={key}
                            className="rounded border border-border-default bg-surface-card px-1.5 py-0.5 text-[10px] text-text-muted"
                          >
                            {key}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 rounded-md border border-border-default bg-surface-page px-2 py-1.5 text-micro text-text-muted">
                    No realtime event received in this session.
                  </p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase text-text-muted">
                  Channels
                </p>
                <div className="mt-1 max-h-52 overflow-y-auto rounded-md border border-border-default">
                  {statusEntries.length === 0 ? (
                    <p className="px-2 py-1.5 text-micro text-text-muted">Connecting...</p>
                  ) : (
                    statusEntries.map(([name, channelStatus]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between gap-2 border-b border-border-default px-2 py-1.5 last:border-b-0"
                      >
                        <span className="truncate text-micro font-medium text-text-secondary">{name}</span>
                        <span className="flex items-center gap-1.5 text-micro text-text-muted">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(channelStatus)}`} />
                          {statusLabel(channelStatus)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </details>
      ) : (
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-default bg-surface-elevated text-micro font-medium text-text-secondary"
          title={`Realtime: ${dot.label.toLowerCase()}`}
        >
          <span className="relative flex h-2 w-2">
            {isLive && (
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-status-pulse ${dot.color}`}
              />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${dot.color}`} />
          </span>
          <span>{dot.label}</span>
        </div>
      )}

      {/* Presence — demoted to a single subtle dot + count, no pill chrome */}
      {showPresence && (
        <span
          className="inline-flex items-center gap-1 text-micro text-text-muted"
          title={`${presenceCount} users online`}
          aria-label={`${presenceCount} users online`}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-text-muted/70" aria-hidden="true" />
          <span>{presenceCount}</span>
        </span>
      )}
    </div>
  )
}

// Backwards-compat re-export so existing imports keep working
export { RealtimeStatusPill as RealtimeStatusIndicator }
