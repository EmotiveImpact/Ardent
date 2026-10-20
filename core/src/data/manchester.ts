/*
 * South and central Manchester, simplified for the crew map. Points are [lat, lng],
 * traced by hand from the real road and river lines. Swap for live map tiles once
 * the backend has a map provider.
 */

export type LatLng = [number, number]
export type Line = { kind: 'motorway' | 'primary' | 'secondary' | 'river' | 'canal'; points: LatLng[] }

export const mapBounds = { north: 53.515, south: 53.385, west: -2.38, east: -2.12 }

export const lines: Line[] = [
  // M60, west and south of the ring
  { kind: 'motorway', points: [[53.515, -2.358], [53.5, -2.352], [53.484, -2.336], [53.47, -2.352], [53.457, -2.338], [53.444, -2.325], [53.425, -2.311], [53.412, -2.288], [53.405, -2.27], [53.399, -2.24], [53.401, -2.215], [53.406, -2.195], [53.41, -2.166], [53.425, -2.14], [53.445, -2.12]] },
  // M602 into Salford
  { kind: 'motorway', points: [[53.484, -2.336], [53.481, -2.31], [53.479, -2.292], [53.477, -2.276]] },
  // Mancunian Way
  { kind: 'motorway', points: [[53.474, -2.266], [53.47, -2.255], [53.468, -2.243], [53.469, -2.226], [53.473, -2.214]] },
  // M56 spur
  { kind: 'motorway', points: [[53.405, -2.27], [53.395, -2.282], [53.385, -2.3]] },
  // City centre inner ring
  { kind: 'primary', points: [[53.487, -2.252], [53.489, -2.236], [53.483, -2.222], [53.474, -2.226], [53.472, -2.245], [53.476, -2.259], [53.487, -2.252]] },
  // A56 Chester Road
  { kind: 'primary', points: [[53.472, -2.257], [53.462, -2.274], [53.452, -2.295], [53.444, -2.31], [53.428, -2.321], [53.41, -2.326], [53.385, -2.338]] },
  // A5103 Princess Road
  { kind: 'primary', points: [[53.468, -2.245], [53.458, -2.248], [53.448, -2.252], [53.436, -2.258], [53.42, -2.262], [53.405, -2.27]] },
  // A34 Oxford Road and Kingsway
  { kind: 'primary', points: [[53.474, -2.238], [53.463, -2.232], [53.452, -2.225], [53.441, -2.219], [53.425, -2.219], [53.41, -2.222], [53.399, -2.226], [53.385, -2.23]] },
  // A6 Stockport Road
  { kind: 'primary', points: [[53.474, -2.228], [53.468, -2.218], [53.457, -2.201], [53.443, -2.192], [53.428, -2.181], [53.414, -2.165], [53.405, -2.155]] },
  // A57 Hyde Road
  { kind: 'primary', points: [[53.471, -2.216], [53.466, -2.196], [53.462, -2.175], [53.456, -2.14], [53.452, -2.12]] },
  // A62 Oldham Road
  { kind: 'primary', points: [[53.486, -2.23], [53.494, -2.209], [53.503, -2.188], [53.515, -2.165]] },
  // A664 Rochdale Road
  { kind: 'primary', points: [[53.489, -2.236], [53.5, -2.229], [53.515, -2.222]] },
  // A57 Regent Road and Eccles
  { kind: 'primary', points: [[53.477, -2.259], [53.478, -2.276], [53.481, -2.3], [53.484, -2.336], [53.488, -2.38]] },
  // A6 Salford Crescent and Broad Street
  { kind: 'primary', points: [[53.484, -2.25], [53.487, -2.27], [53.494, -2.284], [53.505, -2.3], [53.515, -2.31]] },
  // A5081 Trafford Park Road
  { kind: 'secondary', points: [[53.462, -2.285], [53.465, -2.305], [53.468, -2.32], [53.472, -2.345]] },
  // Wilmslow Road through Rusholme, Withington and Didsbury
  { kind: 'secondary', points: [[53.452, -2.225], [53.445, -2.226], [53.434, -2.229], [53.425, -2.232], [53.416, -2.232], [53.405, -2.236]] },
  // Mauldeth Road, west to east
  { kind: 'secondary', points: [[53.438, -2.272], [53.44, -2.255], [53.441, -2.219], [53.442, -2.193], [53.441, -2.17]] },
  // Barlow Moor Road and Chorlton
  { kind: 'secondary', points: [[53.445, -2.29], [53.44, -2.276], [53.43, -2.258], [53.42, -2.24], [53.416, -2.232]] },
  // Upper Chorlton Road and Seymour Grove
  { kind: 'secondary', points: [[53.462, -2.274], [53.452, -2.272], [53.445, -2.276], [53.438, -2.272]] },
  // Moss Lane East and Hathersage Road
  { kind: 'secondary', points: [[53.46, -2.262], [53.461, -2.245], [53.46, -2.228], [53.458, -2.21], [53.457, -2.201]] },
  // School Lane and Burnage Lane
  { kind: 'secondary', points: [[53.428, -2.235], [53.43, -2.214], [53.428, -2.181]] },
  // Ashton Old Road
  { kind: 'secondary', points: [[53.473, -2.214], [53.476, -2.19], [53.479, -2.165], [53.484, -2.13]] },
  // Great Ancoats and Ashton New Road
  { kind: 'secondary', points: [[53.484, -2.226], [53.483, -2.205], [53.484, -2.18], [53.488, -2.15]] },
  // River Irwell
  { kind: 'river', points: [[53.515, -2.276], [53.503, -2.268], [53.495, -2.262], [53.488, -2.253], [53.483, -2.256], [53.479, -2.26], [53.475, -2.266], [53.472, -2.275]] },
  // Manchester Ship Canal
  { kind: 'river', points: [[53.472, -2.275], [53.469, -2.29], [53.473, -2.302], [53.469, -2.315], [53.468, -2.33], [53.472, -2.352], [53.466, -2.38]] },
  // River Mersey
  { kind: 'river', points: [[53.413, -2.12], [53.412, -2.15], [53.407, -2.178], [53.402, -2.205], [53.404, -2.232], [53.408, -2.255], [53.413, -2.272], [53.425, -2.292], [53.434, -2.318], [53.44, -2.345], [53.447, -2.38]] },
  // Bridgewater Canal
  { kind: 'canal', points: [[53.475, -2.258], [53.47, -2.268], [53.463, -2.28], [53.455, -2.292], [53.448, -2.301], [53.437, -2.31], [53.425, -2.318], [53.41, -2.332]] },
  // Rochdale and Ashton canals
  { kind: 'canal', points: [[53.477, -2.241], [53.481, -2.233], [53.484, -2.222], [53.482, -2.2], [53.48, -2.175]] },
]

export const districts: { name: string; at: LatLng }[] = [
  { name: 'City centre', at: [53.4805, -2.2445] },
  { name: 'Salford', at: [53.4925, -2.29] },
  { name: 'Trafford Park', at: [53.4715, -2.33] },
  { name: 'Old Trafford', at: [53.4575, -2.286] },
  { name: 'Stretford', at: [53.4445, -2.3185] },
  { name: 'Chorlton', at: [53.4405, -2.2795] },
  { name: 'Moss Side', at: [53.4605, -2.2525] },
  { name: 'Rusholme', at: [53.4555, -2.2165] },
  { name: 'Withington', at: [53.4325, -2.243] },
  { name: 'Didsbury', at: [53.4115, -2.2205] },
  { name: 'Levenshulme', at: [53.4465, -2.181] },
  { name: 'Gorton', at: [53.4675, -2.168] },
  { name: 'Ancoats', at: [53.4895, -2.2195] },
  { name: 'Heaton Chapel', at: [53.4245, -2.1695] },
  { name: 'Sale', at: [53.4245, -2.335] },
]

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

/** Where each van is right now. En route vans sit part way to their job. */
export const vanAt: Record<string, LatLng> = {
  opr_01: places.sit_01,
  opr_02: [53.4552, -2.2148],
  opr_03: [53.4612, -2.2652],
  opr_04: places.yard,
}
