// Drive times by road from TomTom's Routing API, for sending the nearest van.
// Only used when the engine is given a key (TOMTOM_API_KEY); each call is one
// billable route, so the engine asks for the nearest few vans only and keeps
// answers for a few minutes.
import type { Platform } from './platform.ts'

const ROUTING = 'https://api.tomtom.com/routing/1/calculateRoute'

export function tomtomDriveMinutes(key: string, fetcher: typeof fetch = fetch): NonNullable<Platform['driveMinutes']> {
  return (from, to) =>
    Promise.all(
      from.map(async (a) => {
        const url = `${ROUTING}/${a.lat},${a.lng}:${to.lat},${to.lng}/json?travelMode=van&traffic=true&routeType=fastest&key=${encodeURIComponent(key)}`
        try {
          const res = await fetcher(url, { signal: AbortSignal.timeout(8000) })
          if (!res.ok) return undefined
          const body = (await res.json()) as { routes?: { summary?: { travelTimeInSeconds?: number } }[] }
          const secs = body.routes?.[0]?.summary?.travelTimeInSeconds
          return typeof secs === 'number' ? secs / 60 : undefined
        } catch {
          return undefined
        }
      }),
    )
}
