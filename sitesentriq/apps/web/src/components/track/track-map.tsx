// Public live-tracking map — lazy-loaded so Leaflet never lands in the
// /track entry chunk. Mirrors the lazy pattern used for the dashboard
// PortfolioMap, but trimmed to a single moving "engineer" marker plus an
// optional destination pin.
//
// This module is imported via React.lazy() from track/[token].tsx so the
// ~150kb of Leaflet + tiles only download once the customer actually has a
// live position to show (status === 'travelling').
//
// Privacy note: this map only ever renders the position the public-job-eta
// edge function chose to surface. It receives no addresses, names, or job
// internals — only { lat, lng } it's told to plot.

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface TrackMapPosition {
  lat: number
  lng: number
  /** GPS accuracy radius in metres, when reported. */
  accuracyM: number | null
}

export interface TrackMapDestination {
  lat: number
  lng: number
}

interface TrackMapProps {
  /** Live engineer position. Updates re-centre + move the marker. */
  engineer: TrackMapPosition
  /** Optional destination/site marker. */
  destination?: TrackMapDestination | null
  height?: string
}

const LIGHT_TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}

/** Read a CSS custom property with a hard fallback for SSR/tests. */
function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** Pulsing engineer "live" marker — a filled dot with an animated halo. */
function buildEngineerIcon(color: string): L.DivIcon {
  const html = `
    <span class="track-engineer-pin" style="--track-pin-color:${color};">
      <span class="track-engineer-pin__halo"></span>
      <span class="track-engineer-pin__dot"></span>
    </span>
  `
  return L.divIcon({
    className: 'track-engineer-pin-wrapper',
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

/** Static destination teardrop pin. */
function buildDestinationIcon(color: string): L.DivIcon {
  const html = `
    <svg width="26" height="34" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M15 0C7.268 0 1 6.268 1 14c0 9.5 13 23 14 23s14-13.5 14-23c0-7.732-6.268-14-14-14z"
            fill="${color}" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
      <circle cx="15" cy="14" r="5" fill="white"/>
    </svg>
  `
  return L.divIcon({
    className: 'track-destination-pin',
    html,
    iconSize: [26, 34],
    iconAnchor: [13, 32],
  })
}

/**
 * Imperatively manages the engineer marker, optional accuracy circle, and
 * destination marker. Using the Leaflet API directly (rather than
 * <Marker> children) lets us move the existing marker in place on each
 * position update for a smooth "it's tracking" feel instead of remounting.
 */
function TrackLayers({ engineer, destination }: { engineer: TrackMapPosition; destination?: TrackMapDestination | null }) {
  const map = useMap()
  const engineerMarkerRef = useRef<L.Marker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const destMarkerRef = useRef<L.Marker | null>(null)

  // Destination marker — set once (and updated if it ever changes).
  useEffect(() => {
    if (!destination) {
      if (destMarkerRef.current) {
        map.removeLayer(destMarkerRef.current)
        destMarkerRef.current = null
      }
      return
    }
    const icon = buildDestinationIcon(readToken('--color-status-compliant', '#22c55e'))
    if (!destMarkerRef.current) {
      destMarkerRef.current = L.marker([destination.lat, destination.lng], { icon }).addTo(map)
    } else {
      destMarkerRef.current.setLatLng([destination.lat, destination.lng])
    }
  }, [map, destination])

  // Engineer marker + accuracy halo — moved in place on each update.
  useEffect(() => {
    const latlng: L.LatLngExpression = [engineer.lat, engineer.lng]
    const color = readToken('--color-status-due-soon', '#f59e0b')

    if (!engineerMarkerRef.current) {
      engineerMarkerRef.current = L.marker(latlng, {
        icon: buildEngineerIcon(color),
        zIndexOffset: 1000,
      }).addTo(map)
    } else {
      engineerMarkerRef.current.setLatLng(latlng)
    }

    if (typeof engineer.accuracyM === 'number' && engineer.accuracyM > 0) {
      if (!accuracyRef.current) {
        accuracyRef.current = L.circle(latlng, {
          radius: engineer.accuracyM,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.08,
        }).addTo(map)
      } else {
        accuracyRef.current.setLatLng(latlng)
        accuracyRef.current.setRadius(engineer.accuracyM)
      }
    } else if (accuracyRef.current) {
      map.removeLayer(accuracyRef.current)
      accuracyRef.current = null
    }

    // Keep both engineer and destination in view; otherwise centre on the
    // engineer. panTo gives a smooth glide on each position update.
    if (destination) {
      try {
        map.fitBounds(
          L.latLngBounds([
            [engineer.lat, engineer.lng],
            [destination.lat, destination.lng],
          ]),
          { padding: [48, 48], maxZoom: 15, animate: true },
        )
      } catch {
        map.panTo(latlng, { animate: true })
      }
    } else {
      map.panTo(latlng, { animate: true })
    }
  }, [map, engineer.lat, engineer.lng, engineer.accuracyM, destination])

  // Clean up all layers on unmount.
  useEffect(() => {
    return () => {
      if (engineerMarkerRef.current) map.removeLayer(engineerMarkerRef.current)
      if (accuracyRef.current) map.removeLayer(accuracyRef.current)
      if (destMarkerRef.current) map.removeLayer(destMarkerRef.current)
    }
  }, [map])

  return null
}

export default function TrackMap({ engineer, destination, height = '260px' }: TrackMapProps) {
  return (
    <div
      className="rounded-xl overflow-hidden border border-border-default bg-surface-card"
      style={{ height }}
    >
      <MapContainer
        center={[engineer.lat, engineer.lng]}
        zoom={14}
        scrollWheelZoom={false}
        attributionControl
        style={{ height: '100%', width: '100%', backgroundColor: 'var(--color-surface-page)' }}
      >
        <TileLayer url={LIGHT_TILES.url} attribution={LIGHT_TILES.attribution} />
        <TrackLayers engineer={engineer} destination={destination} />
      </MapContainer>
    </div>
  )
}
