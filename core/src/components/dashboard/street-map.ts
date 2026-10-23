import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'

/*
 * The real street map under the crew: OpenStreetMap data drawn in Ardent's own black style.
 *
 * Tiles come free from OpenFreeMap (no account, no key). A prototype build can carry its own
 * tiles instead: set VITE_MAP_PACK to a packed file made by scripts/map-pack.py and the map
 * reads from that, so it works where outside tile servers are out of reach.
 */

const PACK = import.meta.env.VITE_MAP_PACK as string | undefined
const OFM = 'https://tiles.openfreemap.org'

const road = (classes: string[]) => ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], classes, true, false]] as const
const area = (layer: string, classes: string[]) => ({
  source: 'osm',
  'source-layer': layer,
  filter: ['all', ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false], ['match', ['get', 'class'], classes, true, false]],
})
/** Line width that grows with zoom, in pixels at z10, z14 and z18. */
const width = (a: number, b: number, c: number) => ['interpolate', ['exponential', 1.5], ['zoom'], 10, a, 14, b, 18, c]
const name = ['coalesce', ['get', 'name:en'], ['get', 'name']]

function style(): StyleSpecification {
  const label = { 'text-font': ['Noto Sans Regular'], 'text-transform': 'uppercase', 'text-letter-spacing': 0.18 } as const
  return {
    version: 8,
    glyphs: PACK ? 'pack://fonts/{fontstack}/{range}' : `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      osm: PACK
        ? { type: 'vector', tiles: ['pack://tiles/{z}/{x}/{y}'], minzoom: 8, maxzoom: 14, attribution: '© OpenMapTiles © OpenStreetMap contributors' }
        : { type: 'vector', url: `${OFM}/planet` },
    },
    layers: [
      { id: 'ground', type: 'background', paint: { 'background-color': '#030303' } },
      { id: 'built', type: 'fill', ...area('landuse', ['residential', 'commercial', 'industrial', 'retail']), paint: { 'fill-color': '#080808' } },
      { id: 'green', type: 'fill', ...area('landcover', ['grass', 'wood']), paint: { 'fill-color': '#060906' } },
      { id: 'parks', type: 'fill', source: 'osm', 'source-layer': 'park', paint: { 'fill-color': '#070a07' } },
      { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'], paint: { 'fill-color': '#0a1116' } },
      { id: 'rivers', type: 'line', source: 'osm', 'source-layer': 'waterway', paint: { 'line-color': '#0c1419', 'line-width': width(0.8, 1.6, 4) } },
      { id: 'rail', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['rail', 'transit']), minzoom: 12, paint: { 'line-color': '#1a1a1a', 'line-width': 1, 'line-dasharray': [3, 3] } },
      { id: 'streets', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['minor', 'service']), minzoom: 12, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#141414', 'line-width': width(0.3, 1, 7) } },
      { id: 'roads', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['secondary', 'tertiary']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1e1e1e', 'line-width': width(0.6, 1.6, 10) } },
      { id: 'main-roads', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['primary', 'trunk']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#282828', 'line-width': width(1, 2.4, 14) } },
      { id: 'motorways', type: 'line', source: 'osm', 'source-layer': 'transportation', filter: road(['motorway']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#363636', 'line-width': width(1.4, 3, 16) } },
      {
        id: 'road-names',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'transportation_name',
        minzoom: 14,
        layout: { 'symbol-placement': 'line', 'text-field': name, 'text-size': 10, 'text-font': ['Noto Sans Regular'], 'text-letter-spacing': 0.04 },
        paint: { 'text-color': '#4a4a4a', 'text-halo-color': '#030303', 'text-halo-width': 1.2 },
      },
      {
        id: 'districts',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['suburb', 'town', 'village', 'quarter', 'neighbourhood'], true, false],
        minzoom: 11,
        layout: { ...label, 'text-field': name, 'text-size': 9.5, 'text-max-width': 8 },
        paint: { 'text-color': '#474747', 'text-halo-color': '#030303', 'text-halo-width': 1 },
      },
      {
        id: 'city',
        type: 'symbol',
        source: 'osm',
        'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'city'],
        layout: { ...label, 'text-field': name, 'text-size': 11 },
        paint: { 'text-color': '#5c5c5c', 'text-halo-color': '#030303', 'text-halo-width': 1 },
      },
    ],
  } as StyleSpecification
}

/** The pack is base64 text, since static hosts that refuse unknown binary files still serve text. */
const fromText = async (r: Response) => Uint8Array.from(atob(await r.text()), (c) => c.charCodeAt(0)).buffer
const gunzip = (data: ArrayBuffer) => new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()

let packed: Promise<{ index: Record<string, [number, number]>; data: ArrayBuffer }> | undefined

/** Teach MapLibre to read tiles and letters out of the packed file. Done once per page. */
function readFromPack(maplibre: typeof import('maplibre-gl')) {
  if (!PACK || packed) return
  const at = (file: string) => new URL(`${PACK}${file}`, document.baseURI).href
  packed = Promise.all([fetch(at('.json')).then((r) => r.json()), fetch(at('.tiles.txt')).then(fromText).then(gunzip)]).then(([index, data]) => ({ index, data }))
  maplibre.addProtocol('pack', async ({ url }) => {
    const [, kind, ...rest] = url.replace('pack://', '/').split('/')
    // Only the letter ranges English needs are packed; any other range comes back blank.
    if (kind === 'fonts') return { data: await fetch(at(`-fonts/${rest[1]}.txt`)).then((r) => (r.ok ? fromText(r) : new ArrayBuffer(0))) }
    const { index, data } = await packed!
    const hit = index[rest.join('-')]
    // Outside the packed area the ground is simply empty.
    return { data: hit ? data.slice(hit[0], hit[0] + hit[1]) : new ArrayBuffer(0) }
  })
}

/** Where the packed tiles reach, so the map can't be dragged off into nothing. */
const PACK_BOUNDS: [[number, number], [number, number]] = [
  [-2.5, 53.33],
  [-2.04, 53.57],
]

/** Start a street map in the element, or give up quietly so the drawn map can stand in. */
export async function startStreetMap(container: HTMLElement, center: [number, number]): Promise<MapLibreMap> {
  const [maplibre] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
  readFromPack(maplibre)
  const map = new maplibre.Map({
    container,
    style: style(),
    center,
    zoom: 12,
    minZoom: 9,
    maxZoom: 17,
    maxBounds: PACK ? PACK_BOUNDS : undefined,
    // The credit sits in the map's legend instead.
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    fadeDuration: 0,
  })
  map.touchZoomRotate.disableRotation()
  await new Promise<void>((resolve, reject) => {
    map.once('load', () => resolve())
    map.once('error', (e) => reject(e.error))
  })
  return map
}
