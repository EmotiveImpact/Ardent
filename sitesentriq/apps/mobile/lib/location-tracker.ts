// Live engineer-location tracking.
//
// THE GAP THIS CLOSES: the web Engineer Tracker (apps/web/src/hooks/
// use-engineer-tracker.ts) reads `engineer_locations` for a live position +
// movement status, but nothing on the phone ever wrote that table — only
// point-in-time `field_events` ('arrived'/'working_completed') existed. So the
// tracker always showed "No live tracker data". This module is the missing
// producer: while a visit is active it streams GPS into `engineer_locations`,
// mirroring the web writer's shape exactly so the tracker renders unchanged.
//
// Design notes:
//  - FOREGROUND only. Background location needs extra entitlements + an
//    always-on prompt; a field engineer with the job open is the realistic
//    window. Tracking auto-stops on check-out / screen unmount.
//  - SINGLE active watch. Only one job is "active" at a time; starting a new
//    track replaces any prior one so we never run two GPS streams.
//  - Live data, not durable. A stale GPS fix replayed minutes later is
//    meaningless, so we do NOT offline-queue these writes (unlike notes /
//    reports). Offline → we simply skip; the next fix on reconnect catches up.
//  - Best-effort. Tracking must NEVER crash or block the field UI; every write
//    failure is logged, swallowed, and the visit continues.

import * as Location from 'expo-location'
import { supabase } from './supabase'

export type MovementStatus = 'available' | 'travelling' | 'on_site' | 'offline'

// engineer_locations.engineer_id is matched against engineers.id by the web
// tracker (use-engineer-tracker.ts), falling back to profile_id. The phone only
// holds the auth/profile id, so resolve the engineers row once and cache it.
let engineerIdCache: { profileId: string; engineerId: string } | null = null

async function resolveEngineerId(profileId: string): Promise<string> {
  if (engineerIdCache?.profileId === profileId) return engineerIdCache.engineerId
  try {
    const { data } = await supabase
      .from('engineers')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle()
    const engineerId = (data as { id?: string } | null)?.id ?? profileId
    engineerIdCache = { profileId, engineerId }
    return engineerId
  } catch {
    // No engineers row / transient error → fall back to the profile id. The
    // tracker also keys on profile_id, so the dot can still appear.
    return profileId
  }
}

interface WritePayload {
  profileId: string
  organisationId: string
  currentJobId?: string | null
  latitude: number
  longitude: number
  accuracyMetres?: number | null
  movementStatus: MovementStatus
  etaAt?: string | null
}

// One position write. Prefers the `record_engineer_location` RPC (exactly what
// the web's useRecordEngineerLocation calls), falling back to a direct insert
// when the RPC isn't present in the schema cache — field-for-field identical to
// the web fallback so RLS + columns behave the same.
async function writeLocation(p: WritePayload): Promise<void> {
  const engineerId = await resolveEngineerId(p.profileId)

  const { error } = await supabase.rpc('record_engineer_location', {
    p_engineer_id: engineerId,
    p_current_job_id: p.currentJobId ?? null,
    p_latitude: p.latitude,
    p_longitude: p.longitude,
    p_accuracy_metres: p.accuracyMetres ?? null,
    p_movement_status: p.movementStatus,
    p_eta_at: p.etaAt ?? null,
  })
  if (!error) return

  // Only fall through to the raw insert when the RPC genuinely isn't there.
  if (!/record_engineer_location|schema cache|does not exist/i.test(error.message)) {
    console.warn('[location-tracker] RPC failed (continuing):', error.message)
  }

  const { error: insertError } = await supabase.from('engineer_locations').insert({
    engineer_id: engineerId,
    organisation_id: p.organisationId,
    current_job_id: p.currentJobId ?? null,
    latitude: p.latitude,
    longitude: p.longitude,
    accuracy_metres: p.accuracyMetres ?? null,
    movement_status: p.movementStatus,
    eta_at: p.etaAt ?? null,
  })
  if (insertError) console.warn('[location-tracker] insert failed (continuing):', insertError.message)
}

// ─── Active-watch singleton ──────────────────────────────────────────
interface TrackContext {
  profileId: string
  organisationId: string
  currentJobId: string
  movementStatus: MovementStatus
  etaAt?: string | null
}

let activeWatch: Location.LocationSubscription | null = null
let activeContext: TrackContext | null = null

async function pushFromCoords(coords: Location.LocationObjectCoords): Promise<void> {
  if (!activeContext) return
  await writeLocation({
    profileId: activeContext.profileId,
    organisationId: activeContext.organisationId,
    currentJobId: activeContext.currentJobId,
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMetres: coords.accuracy ?? null,
    movementStatus: activeContext.movementStatus,
    etaAt: activeContext.etaAt ?? null,
  })
}

export interface StartResult {
  ok: boolean
  reason?: 'permission' | 'error'
}

/**
 * Begin streaming this engineer's location for a job. Replaces any existing
 * track. Emits an immediate fix, then updates every ~30s or 50m of movement
 * (Balanced accuracy — good enough for a map dot, easy on the battery).
 */
export async function startTracking(ctx: TrackContext): Promise<StartResult> {
  await stopTracking() // guarantee a single active stream

  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') return { ok: false, reason: 'permission' }

  activeContext = ctx

  // Immediate first ping so the dot appears without waiting for the interval.
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    await pushFromCoords(loc.coords)
  } catch {
    // GPS warm-up / services off — the watch below will catch the next fix.
  }

  try {
    activeWatch = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 50 },
      (loc) => {
        void pushFromCoords(loc.coords)
      },
    )
  } catch {
    activeContext = null
    return { ok: false, reason: 'error' }
  }

  return { ok: true }
}

/** Switch the broadcast status mid-track (e.g. 'travelling' → 'on_site' on arrival). */
export function setMovementStatus(status: MovementStatus): void {
  if (activeContext) activeContext.movementStatus = status
}

/** True while a location stream is live. */
export function isTracking(): boolean {
  return activeWatch !== null
}

/**
 * Stop streaming. Optionally send one final fix with `finalStatus`
 * (e.g. 'available' after check-out) so the tracker reflects "left site"
 * rather than freezing on the last on-site position.
 */
export async function stopTracking(finalStatus?: MovementStatus): Promise<void> {
  const ctx = activeContext
  if (activeWatch) {
    activeWatch.remove()
    activeWatch = null
  }
  if (finalStatus && ctx) {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      await writeLocation({
        profileId: ctx.profileId,
        organisationId: ctx.organisationId,
        currentJobId: ctx.currentJobId,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracyMetres: loc.coords.accuracy ?? null,
        movementStatus: finalStatus,
        etaAt: null,
      })
    } catch {
      // Best-effort final fix; ignore failures.
    }
  }
  activeContext = null
}
