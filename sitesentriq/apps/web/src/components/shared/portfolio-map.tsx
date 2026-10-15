import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { MapPin } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import { EmptyState } from '@/components/shared/empty-state'

export type PortfolioStatus =
  | 'compliant'
  | 'due_soon'
  | 'overdue'
  | 'non_compliant'
  | 'unknown'

export interface PortfolioMapProperty {
  id: string
  name: string
  address: string
  latitude: number | null | undefined
  longitude: number | null | undefined
  status: PortfolioStatus
  clientName?: string
  propertyType?: string
}

interface PortfolioMapProps {
  properties: PortfolioMapProperty[]
  height?: string
  onPropertyClick?: (id: string) => void
  /** Hides empty state and missing-coords banner — useful for embed contexts. */
  hideBanner?: boolean
}

const DARK_THEMES = new Set(['dark', 'midnight', 'glass', 'luxe'])

const LIGHT_TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}

const DARK_TILES = {
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
}

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function colorForStatus(status: PortfolioStatus): string {
  switch (status) {
    case 'compliant':
      return readToken('--color-status-compliant', '#22c55e')
    case 'due_soon':
      return readToken('--color-status-due-soon', '#f59e0b')
    case 'overdue':
    case 'non_compliant':
      return readToken('--color-status-overdue', '#ef4444')
    case 'unknown':
    default:
      return readToken('--color-text-muted', '#6b7280')
  }
}

function buildPinIcon(color: string): L.DivIcon {
  const html = `
    <span class="relative inline-flex items-center justify-center" style="width:30px;height:38px;">
      <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M15 0C7.268 0 1 6.268 1 14c0 9.5 13 23 14 23s14-13.5 14-23c0-7.732-6.268-14-14-14z"
              fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
        <circle cx="15" cy="14" r="5" fill="white"/>
      </svg>
    </span>
  `
  return L.divIcon({
    className: 'portfolio-map-pin',
    html,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -32],
  })
}

interface ClusterMarkerLayerProps {
  properties: PortfolioMapProperty[]
  iconCache: Record<PortfolioStatus, L.DivIcon>
  onPropertyClick?: (id: string) => void
}

function ClusterMarkerLayer({ properties, iconCache, onPropertyClick }: ClusterMarkerLayerProps) {
  const map = useMap()
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      chunkedLoading: true,
      maxClusterRadius: 60,
    }) as L.MarkerClusterGroup
    clusterRef.current = cluster
    map.addLayer(cluster)

    return () => {
      map.removeLayer(cluster)
      clusterRef.current = null
    }
  }, [map])

  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return
    cluster.clearLayers()

    const validBounds: L.LatLngExpression[] = []

    for (const p of properties) {
      if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue
      if (Number.isNaN(p.latitude) || Number.isNaN(p.longitude)) continue
      const latlng: L.LatLngExpression = [p.latitude, p.longitude]
      validBounds.push(latlng)

      const marker = L.marker(latlng, { icon: iconCache[p.status] })
      const popupHtml = renderPopup(p)
      marker.bindPopup(popupHtml, { closeButton: true, maxWidth: 260 })
      marker.on('popupopen', (e) => {
        const root = e.popup.getElement()
        if (!root) return
        const btn = root.querySelector<HTMLButtonElement>('[data-portfolio-action="view"]')
        if (btn && onPropertyClick) {
          btn.onclick = () => onPropertyClick(p.id)
        }
      })
      cluster.addLayer(marker)
    }

    if (validBounds.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(validBounds), { padding: [40, 40], maxZoom: 14 })
      } catch {
        // ignore
      }
    }
  }, [properties, iconCache, onPropertyClick, map])

  return null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderPopup(p: PortfolioMapProperty): string {
  const name = escapeHtml(p.name)
  const address = escapeHtml(p.address || '')
  const client = p.clientName ? escapeHtml(p.clientName) : ''
  const type = p.propertyType ? escapeHtml(p.propertyType) : ''
  const statusLabel = p.status.replace('_', ' ')
  return `
    <div style="min-width:200px;font-family:inherit;">
      <div style="font-weight:600;font-size:13px;color:var(--color-text-primary);margin-bottom:2px;">${name}</div>
      ${address ? `<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:4px;">${address}</div>` : ''}
      ${client ? `<div style="font-size:11px;color:var(--color-text-muted);">${client}${type ? ' · ' + type : ''}</div>` : type ? `<div style="font-size:11px;color:var(--color-text-muted);">${type}</div>` : ''}
      <div style="display:inline-block;margin-top:6px;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;padding:2px 6px;border-radius:9999px;background:${colorForStatus(p.status)};color:white;">${statusLabel}</div>
      <div style="margin-top:8px;">
        <button data-portfolio-action="view"
                style="font-size:12px;font-weight:500;padding:4px 10px;border-radius:6px;background:var(--color-brand-500);color:white;border:none;cursor:pointer;">
          View site →
        </button>
      </div>
    </div>
  `
}

function ThemeAwareTiles({ themeKey }: { themeKey: string }) {
  const isDark = DARK_THEMES.has(themeKey)
  const tile = isDark ? DARK_TILES : LIGHT_TILES
  return <TileLayer key={themeKey} url={tile.url} attribution={tile.attribution} />
}

export function PortfolioMap({
  properties,
  height = '500px',
  onPropertyClick,
  hideBanner = false,
}: PortfolioMapProps) {
  const [themeKey, setThemeKey] = useState<string>(() =>
    typeof document !== 'undefined' ? document.documentElement.dataset.theme || 'dark' : 'dark',
  )

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(() => {
      const next = document.documentElement.dataset.theme || 'dark'
      setThemeKey((prev) => (prev === next ? prev : next))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const validProperties = useMemo(
    () =>
      properties.filter(
        (p) =>
          typeof p.latitude === 'number' &&
          typeof p.longitude === 'number' &&
          !Number.isNaN(p.latitude) &&
          !Number.isNaN(p.longitude),
      ),
    [properties],
  )

  const missingCount = properties.length - validProperties.length

  // Rebuild icon cache whenever theme changes (CSS tokens may differ)
  const iconCache = useMemo<Record<PortfolioStatus, L.DivIcon>>(() => {
    return {
      compliant: buildPinIcon(colorForStatus('compliant')),
      due_soon: buildPinIcon(colorForStatus('due_soon')),
      overdue: buildPinIcon(colorForStatus('overdue')),
      non_compliant: buildPinIcon(colorForStatus('non_compliant')),
      unknown: buildPinIcon(colorForStatus('unknown')),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey])

  // Empty state — no properties at all with coordinates
  if (validProperties.length === 0) {
    return (
      <AppCard padding="none" className="overflow-hidden">
        <EmptyState
          icon={MapPin}
          title="No mapped properties yet"
          description="Add latitude and longitude to your properties to see them on the map."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/properties">Open properties list</Link>
            </Button>
          }
        />
      </AppCard>
    )
  }

  // Default centre — use first valid coord; bounds fitter will override on load
  const initialCenter: L.LatLngExpression = [
    validProperties[0]!.latitude as number,
    validProperties[0]!.longitude as number,
  ]

  return (
    <div className="space-y-2">
      {!hideBanner && missingCount > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface-elevated border border-border-default text-caption text-text-secondary">
          <span>
            <span className="font-medium text-text-primary">{missingCount}</span>{' '}
            {missingCount === 1 ? 'property needs' : 'properties need'} geocoding
          </span>
          <Link
            to="/dashboard/properties?filter=missing-coords"
            className="text-caption font-medium text-brand-500 hover:text-brand-600 transition-colors"
          >
            Add coordinates →
          </Link>
        </div>
      )}
      <div
        className="rounded-xl overflow-hidden border border-border-default bg-surface-card"
        style={{ height }}
      >
        <MapContainer
          center={initialCenter}
          zoom={6}
          scrollWheelZoom
          style={{ height: '100%', width: '100%', backgroundColor: 'var(--color-surface-page)' }}
        >
          <ThemeAwareTiles themeKey={themeKey} />
          <ClusterMarkerLayer
            properties={validProperties}
            iconCache={iconCache}
            onPropertyClick={onPropertyClick}
          />
          {/* Render hidden Markers as accessibility fallback for SSR/test environments */}
          {validProperties.length === 0 && (
            <Marker position={initialCenter}>
              <Popup>No data</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  )
}

export default PortfolioMap
