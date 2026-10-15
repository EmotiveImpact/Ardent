/**
 * Thin promise wrapper around `navigator.geolocation.getCurrentPosition`.
 * Defensive — handles the case where geolocation is unavailable (SSR, embedded
 * webviews) or the user has denied permission.
 */

export type GeoSample = {
  lat: number
  lng: number
  accuracyM: number
  timestamp: number
}

export type GeoFailure =
  | { kind: 'unsupported' }
  | { kind: 'permission_denied' }
  | { kind: 'unavailable' }
  | { kind: 'timeout' }
  | { kind: 'unknown'; message: string }

export type GeoResult =
  | { ok: true; sample: GeoSample }
  | { ok: false; failure: GeoFailure }

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation
}

export async function getCurrentLocation(opts?: PositionOptions): Promise<GeoResult> {
  if (!isGeolocationSupported()) {
    return { ok: false, failure: { kind: 'unsupported' } }
  }

  return new Promise<GeoResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          sample: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: Math.round(pos.coords.accuracy ?? 0),
            timestamp: pos.timestamp,
          },
        })
      },
      (err) => {
        let failure: GeoFailure
        switch (err.code) {
          case err.PERMISSION_DENIED:
            failure = { kind: 'permission_denied' }
            break
          case err.POSITION_UNAVAILABLE:
            failure = { kind: 'unavailable' }
            break
          case err.TIMEOUT:
            failure = { kind: 'timeout' }
            break
          default:
            failure = { kind: 'unknown', message: err.message }
        }
        resolve({ ok: false, failure })
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 15_000,
        ...opts,
      },
    )
  })
}

export function geoFailureLabel(f: GeoFailure): string {
  switch (f.kind) {
    case 'unsupported':
      return 'This device does not support location services.'
    case 'permission_denied':
      return 'Location permission was denied. You can still continue manually.'
    case 'unavailable':
      return 'Could not determine your location. Try again outdoors with GPS enabled.'
    case 'timeout':
      return 'Location request timed out. Please try again.'
    case 'unknown':
      return f.message || 'An unknown location error occurred.'
  }
}
