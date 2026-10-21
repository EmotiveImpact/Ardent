/* Where the demo firm's yard and sites are, for placing them on the street map. Points are [lat, lng]. */

export type LatLng = [number, number]

/** Real positions for the demo's yard and sites. */
export const places = {
  yard: [53.4662, -2.3148] as LatLng,
  sit_01: [53.4172, -2.2318] as LatLng, // 14 Alder Road, Didsbury
  sit_02: [53.4532, -2.2248] as LatLng, // Wilmslow Road, Rusholme
  sit_03: [53.4778, -2.2528] as LatLng, // Quay Street, Castlefield
  sit_04: [53.4418, -2.1968] as LatLng, // Mauldeth Road, Levenshulme
  sit_05: [53.4232, -2.1802] as LatLng, // Heaton Close, Stockport
  sit_06: [53.4848, -2.2262] as LatLng, // Brindle Street, Ancoats
}
