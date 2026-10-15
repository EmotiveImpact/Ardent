/**
 * On-site activity timeline for a job.
 *
 * Reads the append-only `field_events` rows for a job and renders a vertical
 * timeline with arrival distance, working duration, and signature thumbnail.
 *
 * Visible to ops managers + clients (read-only).
 */
import { useEffect, useMemo, useState } from 'react'
import { Chip, Spinner } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import { TimelineSkeleton } from '@/components/shared/skeletons'
import {
  Activity,
  CheckCircle2,
  MapPin,
  Navigation,
  Pause,
  PenLine,
  Play,
  ScanLine,
} from 'lucide-react'
import { useFieldEvents } from '@/lib/field-ops/hooks'
import { createSignatureSignedUrl } from '@/lib/field-ops/client'
import type { FieldEvent, FieldEventType } from '@/lib/field-ops/types'
import { FIELD_EVENT_LABELS } from '@/lib/field-ops/types'
import { formatDistance, haversineMetres } from '@/lib/field-ops/distance'

const EVENT_ICON: Record<FieldEventType, React.ComponentType<{ size?: number; className?: string }>> = {
  travel_started: Navigation,
  arrived: MapPin,
  working_started: Play,
  paused: Pause,
  resumed: Play,
  working_completed: CheckCircle2,
  signature_captured: PenLine,
  qr_checkin: ScanLine,
}

const EVENT_COLOR: Record<FieldEventType, 'default' | 'accent' | 'warning' | 'success'> = {
  travel_started: 'accent',
  arrived: 'warning',
  working_started: 'warning',
  paused: 'default',
  resumed: 'warning',
  working_completed: 'success',
  signature_captured: 'success',
  qr_checkin: 'success',
}

interface OnSiteActivityProps {
  jobId: string
  property?: { latitude?: number | null; longitude?: number | null } | null
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function durationFrom(start: string | null, end: string | null) {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms <= 0) return null
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function getMetadata(event: FieldEvent, key: string): string | undefined {
  const value = event.metadata?.[key]
  return typeof value === 'string' ? value : undefined
}

export function OnSiteActivity({ jobId, property }: OnSiteActivityProps) {
  const { data: events, isLoading } = useFieldEvents(jobId)

  const sitePoint = useMemo(() => {
    if (!property?.latitude || !property?.longitude) return null
    return { lat: Number(property.latitude), lng: Number(property.longitude) }
  }, [property?.latitude, property?.longitude])

  const sorted = useMemo(() => {
    if (!events) return [] as FieldEvent[]
    return [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [events])

  const workingStart = sorted.find((e) => e.event_type === 'working_started')
  const workingEnd = sorted.find((e) => e.event_type === 'working_completed')
  const workingDuration = durationFrom(
    workingStart?.created_at ?? null,
    workingEnd?.created_at ?? null,
  )

  const signatureEvent = [...sorted].reverse().find((e) => e.event_type === 'signature_captured')
  const signaturePath = signatureEvent ? getMetadata(signatureEvent, 'signature_path') : undefined
  const customerName = signatureEvent ? getMetadata(signatureEvent, 'customer_name') : undefined

  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!signaturePath) {
        setThumbUrl(null)
        return
      }
      const url = await createSignatureSignedUrl(signaturePath, 60 * 30)
      if (!cancelled) setThumbUrl(url)
    }
    void load()
    return () => { cancelled = true }
  }, [signaturePath])

  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="px-5 pt-5 pb-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-brand-500" />
          <h3 className="text-body font-semibold text-text-primary">On-site activity</h3>
        </div>
        {workingDuration && (
          <Chip variant="soft" color="accent" size="sm">
            Worked {workingDuration}
          </Chip>
        )}
      </div>
      <div className="p-5">
        {isLoading ? (
          <TimelineSkeleton items={3} />
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Activity size={28} strokeWidth={1.5} className="mb-2" />
            <p className="text-label">No on-site activity yet</p>
            <p className="text-micro mt-1">Events will appear here as the engineer checks in.</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {sorted.map((e) => {
              const Icon = EVENT_ICON[e.event_type]
              const color = EVENT_COLOR[e.event_type]
              let detail: React.ReactNode = null
              if (e.event_type === 'arrived' && sitePoint && e.latitude && e.longitude) {
                const d = haversineMetres({ lat: Number(e.latitude), lng: Number(e.longitude) }, sitePoint)
                detail = <span>{formatDistance(d)} from site centre</span>
              }
              if (e.event_type === 'signature_captured') {
                detail = (
                  <span>
                    Signed by <span className="font-medium text-text-primary">{customerName || 'Customer'}</span>
                  </span>
                )
              }
              if (e.event_type === 'qr_checkin' && e.metadata) {
                const meta = e.metadata as { entity_type?: string; raw?: string }
                detail = (
                  <span>
                    Scanned {meta.entity_type === 'asset' ? 'asset QR' : 'site QR'}
                    {meta.raw ? <span className="text-text-muted"> ({String(meta.raw).slice(0, 24)})</span> : null}
                  </span>
                )
              }
              if (e.metadata && (e.metadata as Record<string, unknown>).manual) {
                detail = (
                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] bg-surface-page text-muted-foreground">
                    manual
                  </span>
                )
              }
              return (
                <li key={e.id} className="flex items-start gap-3">
                  <span
                    className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center bg-surface-page border border-border-subtle`}
                  >
                    <Icon size={13} className="text-text-secondary" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-label font-medium text-text-primary">
                        {FIELD_EVENT_LABELS[e.event_type]}
                      </p>
                      <Chip variant="soft" color={color} size="sm">
                        {e.event_type.replace(/_/g, ' ')}
                      </Chip>
                    </div>
                    <p className="text-micro text-text-muted mt-0.5">
                      {formatTime(e.created_at)}
                      {detail && <span className="ml-2">— {detail}</span>}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        {signaturePath && (
          <div className="mt-5 pt-5 border-t border-border-subtle">
            <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-2">
              Customer signature
            </p>
            {thumbUrl ? (
              <a
                href={thumbUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block border border-border-default rounded-lg overflow-hidden hover:border-brand-500 transition-colors"
              >
                <img
                  src={thumbUrl}
                  alt="Customer signature"
                  className="block w-48 h-auto object-contain bg-surface-page"
                />
              </a>
            ) : (
              <div className="flex items-center gap-2 text-caption text-text-muted">
                <Spinner size="sm" />
                Loading signature…
              </div>
            )}
          </div>
        )}
      </div>
    </AppCard>
  )
}

export default OnSiteActivity
