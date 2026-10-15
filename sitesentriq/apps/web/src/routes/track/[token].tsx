// Sprint 3 / D2 — Public, unauthenticated ETA tracking page.
//
// This page is mounted OUTSIDE the dashboard auth shell so it works
// without a Supabase session — it's the link an FM admin texts to a
// customer ("Hi, your engineer is on the way: app.haumea.com/track/<token>").
//
// What's NOT here:
//   - Sign-in / nav / sidebar — none of it
//   - Anything that calls supabase.auth.* — the public-job-eta edge
//     function is invoked via plain fetch (anon key in header) so the
//     page doesn't try to look up a current user
//   - PII beyond what the customer needs — the edge function already
//     filters at the response layer; the page just renders what comes back
//
// What IS here:
//   - Status banner (scheduled / travelling / on site / completed / cancelled)
//   - ETA window when present
//   - Engineer first name when assigned
//   - Property name (the customer already knows their own address)
//   - A LIVE Leaflet map while the engineer is travelling — the marker
//     glides to each new position as it arrives (lazy-loaded so Leaflet
//     stays out of the entry chunk)
//   - Auto-refresh every 15s while travelling, slower otherwise, and
//     polling STOPS entirely once the visit is completed/cancelled (no
//     point hammering the endpoint when nothing more will change)

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { CheckCircle2, Clock, MapPin, Truck, XCircle, Calendar, RefreshCw } from 'lucide-react'

// Leaflet is heavy — lazy-load it so it only downloads once the customer
// actually has a live position to plot. Keeps the /track entry chunk lean.
const TrackMap = lazy(() => import('@/components/track/track-map'))

interface EtaResponse {
  status: 'scheduled' | 'travelling' | 'on_site' | 'completed' | 'cancelled' | string
  property_name: string | null
  engineer_first_name: string | null
  scheduled_date: string | null
  eta_window: { earliest_at: string; latest_at: string } | null
  completed_date: string | null
  show_live_position: boolean
  engineer_position: { lat: number; lng: number; accuracy_m: number | null; captured_at: string } | null
}

interface ErrorResponse {
  error: 'token_not_found' | 'token_expired' | 'invalid_token' | 'lookup_failed' | 'job_not_found' | string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/**
 * Plain fetch — bypassing the @supabase/supabase-js client so this page
 * doesn't bring in the whole auth + realtime stack just to read one
 * token. Smaller bundle for the public route.
 */
async function fetchEta(token: string): Promise<EtaResponse | ErrorResponse> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { error: 'lookup_failed' }
  }
  const url = `${SUPABASE_URL}/functions/v1/public-job-eta?token=${encodeURIComponent(token)}`
  try {
    // Hard 8s timeout so a stalled edge function never leaves the public
    // tracking page (the parcel-tracker for FM customers) on a spinner
    // forever. Stalls now surface as { error: 'lookup_failed' }.
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // The anon key is required by Supabase's edge-function gateway
        // even when verify_jwt is false — without it you get a 401 from
        // the gateway before the function is invoked.
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      signal: AbortSignal.timeout(8_000),
    })
    const body = (await res.json().catch(() => null)) as EtaResponse | ErrorResponse | null
    if (!body) return { error: 'lookup_failed' }
    return body
  } catch {
    return { error: 'lookup_failed' }
  }
}

// Status banners are mapped onto the canonical status-* tokens so they
// remain legible across light, dark, midnight, glass, and luxe themes.
// Scheduled is a neutral/info state and reuses the brand-soft accent
// (warm orange tint) — semantically "booked, no urgency yet".
const STATUS_META: Record<
  string,
  { label: string; icon: typeof Truck; tint: string; copy: string }
> = {
  scheduled: {
    label: 'Scheduled',
    icon: Calendar,
    tint: 'bg-accent/10 text-text-accent ring-accent/30',
    copy: "We've booked your visit. We'll let you know when the engineer is on the way.",
  },
  travelling: {
    label: 'On the way',
    icon: Truck,
    tint: 'bg-status-due-soon/10 text-status-due-soon ring-status-due-soon/30',
    copy: 'Your engineer is on the way. This page updates automatically.',
  },
  on_site: {
    label: 'On site',
    icon: MapPin,
    tint: 'bg-status-compliant/10 text-status-compliant ring-status-compliant/30',
    copy: "Your engineer is on site and starting work.",
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    tint: 'bg-status-compliant/10 text-status-compliant ring-status-compliant/30',
    copy: 'This visit has been completed. You should have received a summary email.',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    tint: 'bg-status-overdue/10 text-status-overdue ring-status-overdue/30',
    copy: 'This visit has been cancelled. Your facilities team will be in touch.',
  },
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return iso
  }
}

function ErrorState({ kind }: { kind: ErrorResponse['error'] }) {
  const copy =
    kind === 'token_expired'
      ? 'This tracking link has expired. Please contact your facilities team for an updated link.'
      : kind === 'token_not_found' || kind === 'invalid_token'
        ? "We couldn't find this tracking link. Please double-check the URL or contact your facilities team."
        : 'Something went wrong loading this page. Please try again in a few minutes.'
  return (
    <div className="min-h-screen bg-surface-page grid place-items-center p-6">
      <div className="max-w-md w-full bg-surface-card rounded-2xl shadow-sm border border-border-default p-8 text-center">
        <XCircle size={36} className="text-status-overdue mx-auto mb-4" strokeWidth={1.5} />
        <h1 className="text-[18px] font-semibold text-text-primary mb-2">Link unavailable</h1>
        <p className="text-body text-text-secondary leading-relaxed">{copy}</p>
      </div>
    </div>
  )
}

export default function PublicEtaPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<EtaResponse | null>(null)
  const [err, setErr] = useState<ErrorResponse['error'] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastFetched, setLastFetched] = useState<number | null>(null)

  // Refresh cadence — fast (15s) while travelling so the live map feels
  // genuinely live, slower otherwise. `null` means "stop polling".
  const refreshIntervalMs = useMemo<number | null>(() => {
    if (!data) return 15_000
    if (data.status === 'completed' || data.status === 'cancelled') return null
    if (data.status === 'travelling') return 15_000
    if (data.status === 'on_site') return 60_000
    return 30_000 // scheduled — watch for the engineer setting off
  }, [data])

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load(showSpinner = false) {
      if (showSpinner) setRefreshing(true)
      const result = await fetchEta(token!)
      if (cancelled) return
      if ('error' in result) {
        setErr(result.error)
        setData(null)
      } else {
        setErr(null)
        setData(result)
      }
      setRefreshing(false)
      setLastFetched(Date.now())
    }

    void load()
    // Don't arm an interval at all when we've reached a terminal state.
    if (refreshIntervalMs === null) {
      return () => {
        cancelled = true
      }
    }
    const interval = setInterval(() => void load(true), refreshIntervalMs)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [token, refreshIntervalMs])

  if (!token) return <ErrorState kind="invalid_token" />
  if (err) return <ErrorState kind={err} />
  if (!data) {
    return (
      <div className="min-h-screen bg-surface-page grid place-items-center p-6">
        <div className="text-text-muted text-body inline-flex items-center gap-2">
          <Clock size={16} className="animate-pulse" />
          Loading…
        </div>
      </div>
    )
  }

  const meta = STATUS_META[data.status] ?? {
    label: data.status,
    icon: Clock,
    tint: 'bg-surface-elevated text-text-secondary ring-border-default',
    copy: '',
  }
  const Icon = meta.icon

  return (
    <div className="min-h-screen bg-surface-page px-4 py-10">
      <div className="max-w-md mx-auto space-y-6">
        {/* Status card */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-border-default overflow-hidden">
          <div className={`${meta.tint} ring-1 ring-inset px-6 py-5 flex items-center gap-3`}>
            <Icon size={22} strokeWidth={1.8} />
            <div>
              <p className="text-micro font-medium uppercase tracking-[0.04em] opacity-80">
                Visit status
              </p>
              <p className="text-[18px] font-semibold leading-tight">{meta.label}</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p className="text-body text-text-secondary leading-relaxed">{meta.copy}</p>

            {/* Property */}
            {data.property_name && (
              <div>
                <p className="text-micro font-medium uppercase tracking-[0.04em] text-text-muted">
                  Site
                </p>
                <p className="text-[15px] font-medium text-text-primary mt-0.5">
                  {data.property_name}
                </p>
              </div>
            )}

            {/* Engineer */}
            {data.engineer_first_name && (
              <div>
                <p className="text-micro font-medium uppercase tracking-[0.04em] text-text-muted">
                  Engineer
                </p>
                <p className="text-[15px] text-text-primary mt-0.5">{data.engineer_first_name}</p>
              </div>
            )}

            {/* Scheduled date */}
            {data.scheduled_date && data.status === 'scheduled' && (
              <div>
                <p className="text-micro font-medium uppercase tracking-[0.04em] text-text-muted">
                  Booked for
                </p>
                <p className="text-[15px] text-text-primary mt-0.5">
                  {formatDate(data.scheduled_date)}
                </p>
              </div>
            )}

            {/* ETA window */}
            {data.eta_window && (
              <div>
                <p className="text-micro font-medium uppercase tracking-[0.04em] text-text-muted">
                  Arrival window
                </p>
                <p className="text-[15px] font-medium text-text-primary mt-0.5">
                  {formatTime(data.eta_window.earliest_at)} –{' '}
                  {formatTime(data.eta_window.latest_at)}
                </p>
              </div>
            )}

            {/* Completed */}
            {data.completed_date && data.status === 'completed' && (
              <div>
                <p className="text-micro font-medium uppercase tracking-[0.04em] text-text-muted">
                  Completed
                </p>
                <p className="text-[15px] text-text-primary mt-0.5">
                  {formatDate(data.completed_date)} at {formatTime(data.completed_date)}
                </p>
              </div>
            )}

            {/* Live map — only while travelling AND we have a fresh fix.
                The marker glides to each new position as polling brings
                fresh data in. Lazy-loaded so Leaflet stays out of the
                entry chunk. */}
            {data.show_live_position && data.engineer_position && (
              <div className="space-y-2">
                <Suspense
                  fallback={
                    <div
                      className="rounded-xl border border-border-default bg-surface-elevated grid place-items-center"
                      style={{ height: '260px' }}
                    >
                      <span className="text-caption text-text-muted inline-flex items-center gap-2">
                        <MapPin size={14} className="animate-pulse" />
                        Loading map…
                      </span>
                    </div>
                  }
                >
                  <TrackMap
                    engineer={{
                      lat: data.engineer_position.lat,
                      lng: data.engineer_position.lng,
                      accuracyM: data.engineer_position.accuracy_m,
                    }}
                  />
                </Suspense>
                <div className="inline-flex items-center gap-1.5 text-caption text-text-muted">
                  <Truck size={13} className="text-status-due-soon" />
                  <span>
                    Live position updated {formatTime(data.engineer_position.captured_at)}
                  </span>
                </div>
              </div>
            )}

            {/* Travelling but no fresh GPS fix yet — reassure rather than
                show a blank space. The engineer's phone may not have sent
                a position in the last few minutes. */}
            {data.status === 'travelling' && !data.engineer_position && (
              <div className="bg-status-due-soon/10 ring-1 ring-status-due-soon/30 rounded-lg px-4 py-3 flex items-center gap-2">
                <MapPin size={16} className="text-status-due-soon" />
                <p className="text-label text-text-primary">
                  Live location will appear here shortly.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Refresh footer — small, polite, non-spinning unless actually
            refreshing. Customers don't need a giant "REFRESH" button. */}
        <div className="text-center text-caption text-text-muted inline-flex items-center justify-center gap-1.5 w-full">
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
          <span>
            {lastFetched
              ? `Updated ${formatTime(new Date(lastFetched).toISOString())}`
              : 'Updating…'}
          </span>
        </div>
      </div>
    </div>
  )
}
