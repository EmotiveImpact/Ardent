/**
 * GPS Check-in panel for field engineers.
 *
 * Renders three buttons (Start travel → Check in → Start work / Pause) and the
 * current sub-status pill (Travel / On site / Working / Completed).
 * Compares device coords to the site's lat/lng (Haversine, no deps) and gates
 * "Check in" with a confirm-anyway prompt when out of radius.
 *
 * Wraps the geolocation call in a privacy-consent gate stored in localStorage
 * keyed by the engineer's user id.
 */
import { useMemo, useState } from 'react'
import { AlertDialog, Button, Chip, Spinner } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import { CheckCircle2, Compass, MapPin, Navigation, Pause, Play, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  DEFAULT_ARRIVAL_RADIUS_M,
  formatDistance,
  haversineMetres,
  isOnSite,
} from '@/lib/field-ops/distance'
import {
  geoFailureLabel,
  getCurrentLocation,
  isGeolocationSupported,
} from '@/lib/field-ops/geolocation'
import type { GeoSample } from '@/lib/field-ops/geolocation'
import { getGpsConsent, setGpsConsent } from '@/lib/field-ops/consent'
import { useFieldEvents, useInsertFieldEvent } from '@/lib/field-ops/hooks'
import { deriveStage, STAGE_LABELS } from '@/lib/field-ops/types'
import type { FieldStage } from '@/lib/field-ops/types'
import { supabase } from '@/lib/supabase'
import { JOB_STATUSES } from '@/lib/constants'

const STAGE_CHIP_COLOR: Record<FieldStage, 'default' | 'accent' | 'warning' | 'success'> = {
  not_started: 'default',
  travelling: 'accent',
  arrived: 'warning',
  working: 'warning',
  completed: 'success',
}

interface GpsCheckInProps {
  jobId: string
  organisationId: string
  engineerId: string | undefined
  property: { latitude?: number | null; longitude?: number | null; address?: string | null } | null | undefined
  /** Called after a successful "arrived" event so the parent can refresh job. */
  onArrived?: () => void
}

interface DialogProps {
  open: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}

// Wave 17C — these consent / confirm prompts now use HeroUI <AlertDialog>.
// The local Dialog wrapper preserves the existing API so the three callsites
// below stay clean.
function Dialog({ open, title, children, onClose, primaryLabel, onPrimary, secondaryLabel, onSecondary }: DialogProps) {
  return (
    <AlertDialog.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDismissable
      isKeyboardDismissDisabled={false}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[400px]">
          <AlertDialog.Header>
            <AlertDialog.Icon status="accent" />
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <div className="text-label text-text-secondary space-y-2">{children}</div>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            {secondaryLabel && (
              <Button variant="tertiary" onPress={onSecondary ?? onClose}>
                {secondaryLabel}
              </Button>
            )}
            <Button variant="primary" onPress={onPrimary}>
              {primaryLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}

export function GpsCheckIn({
  jobId,
  organisationId,
  engineerId,
  property,
  onArrived,
}: GpsCheckInProps) {
  const { data: events } = useFieldEvents(jobId)
  const insertEvent = useInsertFieldEvent()
  const stage = useMemo(() => deriveStage(events), [events])

  const sitePoint = useMemo(() => {
    // Use nullish checks, NOT truthiness — longitude 0 (the Greenwich meridian,
    // i.e. much of London/UK) is falsy, so `!longitude` would silently disable
    // the "you're not at the site" distance gate for those properties.
    const lat = property?.latitude
    const lng = property?.longitude
    if (lat == null || lng == null) return null
    const latN = Number(lat)
    const lngN = Number(lng)
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null
    return { lat: latN, lng: lngN }
  }, [property?.latitude, property?.longitude])

  const [pending, setPending] = useState<'travel' | 'arrive' | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<'travel' | 'arrive' | null>(null)
  const [outOfRadius, setOutOfRadius] = useState<{ distance: number; sample: GeoSample } | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualPendingAction, setManualPendingAction] = useState<'travel' | 'arrive' | null>(null)

  function ensureConsentThen(action: 'travel' | 'arrive') {
    const value = getGpsConsent(engineerId)
    if (value === 'granted') {
      void runAction(action)
      return
    }
    if (value === 'declined') {
      setManualPendingAction(action)
      setManualOpen(true)
      return
    }
    setPendingAction(action)
    setConsentOpen(true)
  }

  async function runAction(action: 'travel' | 'arrive') {
    if (!isGeolocationSupported()) {
      setManualPendingAction(action)
      setManualOpen(true)
      return
    }
    setPending(action)
    const result = await getCurrentLocation()
    setPending(null)

    if (!result.ok) {
      toast.error(geoFailureLabel(result.failure))
      setManualPendingAction(action)
      setManualOpen(true)
      return
    }

    if (action === 'travel') {
      await commitTravel(result.sample)
      return
    }

    if (sitePoint) {
      const d = haversineMetres(result.sample, sitePoint)
      if (!isOnSite(result.sample, sitePoint)) {
        setOutOfRadius({ distance: d, sample: result.sample })
        return
      }
    }
    await commitArrive(result.sample, false)
  }

  async function commitTravel(sample: GeoSample | null) {
    await insertEvent.mutateAsync({
      organisation_id: organisationId,
      job_id: jobId,
      engineer_id: engineerId,
      event_type: 'travel_started',
      geo: sample,
      metadata: sample ? null : { manual: true },
    })
    toast.success('Travel started')
  }

  async function commitArrive(sample: GeoSample | null, manual: boolean) {
    await insertEvent.mutateAsync({
      organisation_id: organisationId,
      job_id: jobId,
      engineer_id: engineerId,
      event_type: 'arrived',
      geo: sample,
      metadata: manual ? { manual: true } : null,
    })

    try {
      await supabase
        .from('jobs')
        .update({ status: JOB_STATUSES.IN_PROGRESS, arrived_at: new Date().toISOString() })
        .eq('id', jobId)
    } catch (e) {
      console.warn('[gps-check-in] failed to update job', e)
    }

    toast.success('Checked in on site')
    onArrived?.()
  }

  const haveSiteCoords = !!sitePoint
  const stageColor = STAGE_CHIP_COLOR[stage]

  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="px-5 pt-5 pb-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-brand-500" />
          <h3 className="text-body font-semibold text-text-primary">On-site check-in</h3>
        </div>
        <Chip variant="soft" color={stageColor} size="sm">{STAGE_LABELS[stage]}</Chip>
      </div>

      <div className="p-5 space-y-3">
        {!haveSiteCoords && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-surface-page border border-border-subtle">
            <ShieldAlert size={14} className="text-text-muted flex-shrink-0 mt-0.5" />
            <p className="text-caption text-text-muted">
              No site coordinates on record for this property — distance verification is disabled.
              You can still check in manually.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() => ensureConsentThen('travel')}
            isDisabled={pending !== null || stage === 'completed'}
          >
            {pending === 'travel' ? <Spinner size="sm" /> : <Navigation size={14} />}
            Start travel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={() => ensureConsentThen('arrive')}
            isDisabled={pending !== null || stage === 'arrived' || stage === 'working' || stage === 'completed'}
          >
            {pending === 'arrive' ? <Spinner size="sm" /> : <MapPin size={14} />}
            Check in on site
          </Button>
          {stage === 'arrived' && (
            <Button
              variant="primary"
              size="sm"
              onPress={async () => {
                await insertEvent.mutateAsync({
                  organisation_id: organisationId,
                  job_id: jobId,
                  engineer_id: engineerId,
                  event_type: 'working_started',
                  geo: null,
                })
                try {
                  await supabase
                    .from('jobs')
                    .update({ working_started_at: new Date().toISOString() })
                    .eq('id', jobId)
                } catch (err) {
                  console.warn('[gps-check-in] failed to set working_started_at', err)
                }
                toast.success('Started work')
              }}
            >
              <Play size={14} />
              Start work
            </Button>
          )}
          {stage === 'working' && (
            <Button
              variant="outline"
              size="sm"
              onPress={async () => {
                await insertEvent.mutateAsync({
                  organisation_id: organisationId,
                  job_id: jobId,
                  engineer_id: engineerId,
                  event_type: 'paused',
                  geo: null,
                })
                toast.success('Paused')
              }}
            >
              <Pause size={14} />
              Pause
            </Button>
          )}
        </div>

        {stage === 'completed' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-surface-page border border-border-subtle">
            <CheckCircle2 size={14} className="text-status-compliant flex-shrink-0 mt-0.5" />
            <p className="text-caption text-text-secondary">
              Job completed and signed off — see the on-site activity log below.
            </p>
          </div>
        )}
      </div>

      <Dialog
        open={consentOpen}
        title="Field mode uses your location"
        primaryLabel="Continue with GPS"
        onPrimary={() => {
          setGpsConsent(engineerId, 'granted')
          setConsentOpen(false)
          if (pendingAction) void runAction(pendingAction)
          setPendingAction(null)
        }}
        secondaryLabel="Don't use location"
        onSecondary={() => {
          setGpsConsent(engineerId, 'declined')
          setConsentOpen(false)
          if (pendingAction) {
            setManualPendingAction(pendingAction)
            setManualOpen(true)
          }
          setPendingAction(null)
        }}
        onClose={() => { setConsentOpen(false); setPendingAction(null) }}
      >
        <p>
          Field mode uses your location to verify on-site arrival and check-in distance.
          Location is stored only when you take an action (start travel, check in, capture
          signature). Continue?
        </p>
      </Dialog>

      <Dialog
        open={!!outOfRadius}
        title="You're not at the site"
        primaryLabel="Check in anyway"
        onPrimary={async () => {
          if (!outOfRadius) return
          await commitArrive(outOfRadius.sample, false)
          setOutOfRadius(null)
        }}
        secondaryLabel="Cancel"
        onSecondary={() => setOutOfRadius(null)}
        onClose={() => setOutOfRadius(null)}
      >
        {outOfRadius && (
          <p>
            You're <span className="font-semibold text-text-primary">{formatDistance(outOfRadius.distance)}</span> from
            the site (radius {DEFAULT_ARRIVAL_RADIUS_M}m). Check in anyway?
          </p>
        )}
      </Dialog>

      <Dialog
        open={manualOpen}
        title="Confirm site arrival manually"
        primaryLabel="Confirm manually"
        onPrimary={async () => {
          const action = manualPendingAction
          setManualOpen(false)
          setManualPendingAction(null)
          if (action === 'travel') await commitTravel(null)
          if (action === 'arrive') await commitArrive(null, true)
        }}
        secondaryLabel="Cancel"
        onSecondary={() => { setManualOpen(false); setManualPendingAction(null) }}
        onClose={() => { setManualOpen(false); setManualPendingAction(null) }}
      >
        <p>
          Location is unavailable. Confirm you are at{' '}
          <span className="font-semibold text-text-primary">
            {property?.address || 'the site'}
          </span>{' '}
          to log this manually.
        </p>
      </Dialog>
    </AppCard>
  )
}

export default GpsCheckIn
