/**
 * Haversine distance between two geographic coordinates.
 * Returns metres. Pure function — no deps.
 *
 * Formula: a = sin²(Δφ/2) + cos(φ1)·cos(φ2)·sin²(Δλ/2)
 *          c = 2·atan2(√a, √(1−a))
 *          d = R·c
 *
 * R = 6_371_000 m (mean Earth radius).
 */
export function haversineMetres(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))

  return R * c
}

/** Default on-site arrival radius in metres. Configurable via UI in future. */
export const DEFAULT_ARRIVAL_RADIUS_M = 200

export function isOnSite(
  here: { lat: number; lng: number },
  site: { lat: number; lng: number },
  radiusM = DEFAULT_ARRIVAL_RADIUS_M,
): boolean {
  return haversineMetres(here, site) <= radiusM
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return '—'
  if (metres < 1) return '<1m'
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(metres < 10000 ? 2 : 1)}km`
}
