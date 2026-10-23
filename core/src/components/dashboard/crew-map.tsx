import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Map as StreetMap } from 'maplibre-gl'
import { createPortal } from 'react-dom'
import { Crosshair, Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { Job, Operator, OperatorState, Site } from '@/data/model'
import { places, type LatLng } from '@/data/manchester'
import { find, onDay, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { SendToScreen } from '@/components/send-to-screen'
import { clock } from '@kit'
import { startStreetMap } from './street-map'

/* A black street map of south Manchester with every van placed and wired back to the yard. */

export type MapView = 'streets' | 'heat' | 'routes'

const views: { key: MapView; label: string }[] = [
  { key: 'streets', label: 'Streets' },
  { key: 'heat', label: 'Work' },
  { key: 'routes', label: 'Routes' },
]

const stateColour: Record<OperatorState, string> = {
  on_site: 'var(--ok)',
  en_route: 'var(--info)',
  delayed: 'var(--warn)',
  on_call: '#8a8a8a',
  workshop: '#6b6b6b',
  off_shift: '#444',
}
const stateLabel: Record<OperatorState, string> = {
  on_site: 'On site',
  en_route: 'En route',
  delayed: 'Delayed',
  on_call: 'On call',
  workshop: 'Workshop',
  off_shift: 'Off shift',
}

type Point = readonly [number, number]

/** A gentle arc between two screen points, bowed to one side. */
function arc([x0, y0]: Point, [x1, y1]: Point, bow = 0.18) {
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const dx = x1 - x0
  const dy = y1 - y0
  return `M${x0} ${y0}Q${mx - dy * bow} ${my + dx * bow} ${x1} ${y1}`
}

/** Metres across one screen pixel at this zoom (MapLibre draws 512px tiles). */
const metresPerPixel = (zoom: number, lat: number) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom)

function Marker({ op, job, x, y, onSelect }: { op: Operator; job?: Job; x: number; y: number; onSelect?: (id: string) => void }) {
  const colour = stateColour[op.state]
  const atYard = op.state === 'on_call'
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => job && onSelect?.(job.id)}
      className="group absolute flex -translate-x-1/2 -translate-y-1/2 items-center"
      style={{ left: x, top: atYard ? y - 36 : y, '--c': colour } as React.CSSProperties}
    >
      <span className="relative flex">
        {op.state !== 'on_call' && <span className="absolute inset-0 animate-pulse-ring rounded-full" style={{ background: colour }} />}
        <Avatar initials={op.initials} className="relative size-7 bg-[#141414] text-[11px] shadow-[0_0_0_2px_var(--c)]" />
      </span>
      <span
        className="pointer-events-none absolute left-9 flex items-center gap-2 rounded-md bg-[#111]/95 px-2 py-1 text-[12px] whitespace-nowrap shadow-xl shadow-black/60 transition-colors group-hover:bg-[#1a1a1a]"
      >
        {op.name.split(' ')[0]}
        <span className="text-[11px]" style={{ color: colour }}>
          {stateLabel[op.state]}
          {op.etaMinutes ? ` · ${op.etaMinutes}m` : ''}
        </span>
        {job && <span className="font-mono text-[11px] text-faint">{job.ref}</span>}
      </span>
    </button>
  )
}

/** Where a site sits: its own coordinates, else the yard. */
const siteAt = (site: Site | undefined): LatLng => (site && Number.isFinite(site.lat) && Math.abs(site.lat) > 1 ? [site.lat, site.lng] : places.yard)

/** Where a van is: at the job when on site, part way there when travelling, else the yard. */
function vanFor(op: Operator, site: Site | undefined): LatLng {
  const to = siteAt(site)
  if (op.state === 'on_site') return to
  if (op.state === 'en_route' || op.state === 'delayed') {
    const t = op.state === 'delayed' ? 0.45 : 0.6
    return [places.yard[0] + (to[0] - places.yard[0]) * t, places.yard[1] + (to[1] - places.yard[1]) * t]
  }
  return places.yard
}

export function CrewMap({ operators, jobs, sites, onSelect, className, wall }: { operators: Operator[]; jobs: Job[]; sites: Site[]; onSelect?: (id: string) => void; className?: string; /** On the wall itself: no Send to screen. */ wall?: boolean }) {
  const day = today()
  const jobOf = (op: Operator) => find(jobs, op.currentJobId)
  const vanAt = Object.fromEntries(operators.map((op) => [op.id, vanFor(op, find(sites, jobOf(op)?.siteId))])) as Record<string, LatLng>
  const booked = jobs.filter((j) => j.status === 'booked' && onDay(j.start, day))
  // Jobs done at each site, for the Work view.
  const workload = sites.map((s) => ({ at: siteAt(s), jobs: jobs.filter((j) => j.siteId === s.id).length }))
  const box = useRef<HTMLDivElement>(null)
  const streetBox = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 480 })
  const [view, setView] = useState<MapView>('streets')
  const [full, setFull] = useState(false)
  const [street, setStreet] = useState<StreetMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [, setMoved] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e.contentRect.width > 0 && e.contentRect.height > 0 && setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
    // The map remounts when it moves in and out of full screen, so watch the new element.
  }, [full])

  // Every place on the map, for fitting the view around the crew.
  const everyone = [places.yard, ...Object.values(vanAt), ...sites.map(siteAt)]
  const fitAll = (m: StreetMap, animate = true) => {
    const lats = everyone.map((p) => p[0])
    const lngs = everyone.map((p) => p[1])
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 70, bottom: 60, left: 60, right: 150 }, animate, maxZoom: 14 },
    )
  }

  useEffect(() => {
    const el = streetBox.current
    if (!el) return
    let map: StreetMap | undefined
    let gone = false
    let frame = 0
    setFailed(false)
    startStreetMap(el, [places.yard[1], places.yard[0]])
      .then((m) => {
        map = m
        if (gone) return m.remove()
        fitAll(m, false)
        // Markers follow the streets as the map moves, redrawn once a frame.
        m.on('move', () => {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(() => setMoved((n) => n + 1))
        })
        setStreet(m)
      })
      .catch((e) => {
        console.warn('Street map unavailable', e)
        if (!gone) setFailed(true)
      })
    return () => {
      gone = true
      cancelAnimationFrame(frame)
      map?.remove()
      setStreet(null)
    }
    // The map remounts when it moves in and out of full screen, so start again on the new element.
  }, [full])

  // Fill the screen: browser fullscreen where allowed, and a fixed overlay either way (embedded pages often block the API).
  const toggleFull = () => {
    if (full) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      setFull(false)
    } else {
      setFull(true)
      document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false)
    const onExit = () => !document.fullscreenElement && setFull(false)
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onExit)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onExit)
    }
  }, [full])

  const map = (
    <div ref={box} className={cn('h-full w-full overflow-hidden bg-[#030303] select-none', full ? 'fixed inset-0 z-[70] h-dvh w-screen' : 'relative', className)}>
      {/* MapLibre adds its own classes to the inner element, so React only styles the outer one. */}
      <div className={cn('absolute inset-0 transition-opacity duration-500', street ? 'opacity-100' : 'opacity-0')}>
        <div ref={streetBox} className="size-full" />
      </div>
      {!street && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className={cn('cap text-[11px]', !failed && 'animate-pulse')}>{failed ? 'The map could not load' : 'Loading the map'}</span>
        </div>
      )}
      {street && overlay(street)}
      {street && full && (
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-3 rounded-md bg-[#0d0d0d]/90 px-3 py-2 backdrop-blur">
          <span className="caps text-foreground">Crew on the road</span>
          <span className="font-mono text-[11px] text-faint">Esc to close</span>
        </div>
      )}
    </div>
  )

  /** Everything drawn over the streets, placed by the street map's own projection. Called, not mounted, so markers keep their place between frames. */
  function overlay(street: StreetMap) {
    const at = (p: LatLng): Point => {
      const { x, y } = street.project([p[1], p[0]])
      return [x, y]
    }
    const yard = at(places.yard)
    const perPixel = metresPerPixel(street.getZoom(), places.yard[0])
    const zoomBy = (steps: number) => street.easeTo({ zoom: street.getZoom() + steps, duration: 250 })
    return (
      <>
        {/* Routes and Work quieten the streets so the crew stand out. */}
        {view !== 'streets' && <div className={cn('pointer-events-none absolute inset-0 bg-black', view === 'routes' ? 'opacity-60' : 'opacity-35')} />}

        <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${size.w} ${size.h}`} aria-label="Map of south Manchester with crew positions">
          <defs>
            <radialGradient id="heat">
              <stop offset="0" stopColor="var(--ember)" stopOpacity="0.55" />
              <stop offset="0.45" stopColor="var(--ember)" stopOpacity="0.18" />
              <stop offset="1" stopColor="var(--ember)" stopOpacity="0" />
            </radialGradient>
            <filter id="map-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Each job at a site spreads the glow about 340 metres. */}
          {view === 'heat' &&
            workload.map((w, i) => {
              const [x, y] = at(w.at)
              return <circle key={i} cx={x} cy={y} r={(w.jobs * 340) / perPixel} fill="url(#heat)" />
            })}

          {/* Lines back to the yard */}
          {operators.map((op, i) => {
            if (op.state === 'on_call' || op.state === 'off_shift') return null
            const d = arc(yard, at(vanAt[op.id]), i % 2 ? -0.16 : 0.16)
            const colour = stateColour[op.state]
            const job = jobOf(op)
            const dest = job && at(siteAt(find(sites, job.siteId)))
            const moving = op.state === 'en_route' || op.state === 'delayed'
            return (
              <g key={op.id}>
                <path d={d} fill="none" stroke={colour} strokeOpacity={0.18} strokeWidth={5} />
                <path d={d} fill="none" stroke={colour} strokeWidth={1.5} strokeDasharray={op.state === 'delayed' ? '5 5' : undefined} />
                {moving && dest && (
                  <>
                    <path d={arc(at(vanAt[op.id]), dest, 0.1)} fill="none" stroke={colour} strokeOpacity={0.6} strokeWidth={1} strokeDasharray="2 4" />
                    <circle cx={dest[0]} cy={dest[1]} r={6} fill="none" stroke={colour} strokeWidth={1.25} />
                  </>
                )}
                <circle r={3} fill={colour} filter="url(#map-glow)">
                  <animateMotion dur={moving ? '5s' : '7s'} repeatCount="indefinite" path={d} begin={`${i * 0.6}s`} />
                </circle>
              </g>
            )
          })}

          {/* Booked sites still to visit today */}
          {booked.map((j) => {
            const [x, y] = at(siteAt(find(sites, j.siteId)))
            return <circle key={j.id} cx={x} cy={y} r={4} fill="#000" stroke="#777" strokeWidth={1.25} />
          })}
        </svg>

        {booked.map((j) => {
          const [x, y] = at(siteAt(find(sites, j.siteId)))
          return (
            <span key={j.id} className="pointer-events-none absolute font-mono text-[11px] text-muted" style={{ left: x + 8, top: y - 7 }}>
              {j.ref} · {clock(j.start)}
            </span>
          )
        })}

        {/* Yard */}
        <div className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: yard[0], top: yard[1] }}>
          <span className="size-3 rotate-45 rounded-[2px] bg-white shadow-[0_0_16px_#ffffff80]" />
          <span className="caps mt-2 text-[11px] text-foreground">Yard</span>
        </div>

        {operators.map((op) => {
          const [x, y] = at(vanAt[op.id])
          return <Marker key={op.id} op={op} job={jobOf(op)} x={x} y={y} onSelect={onSelect} />
        })}

        {/* View types */}
        <div className="absolute top-3 right-3 flex gap-1 rounded-lg bg-[#0d0d0d]/90 p-1 backdrop-blur">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={cn('h-7 rounded-md px-2.5 text-[12px] transition-colors', view === v.key ? 'bg-white text-black' : 'text-muted hover:text-foreground')}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Zoom */}
        <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg bg-[#0d0d0d]/90 p-1 backdrop-blur">
          <button aria-label="Zoom in" onClick={() => zoomBy(0.6)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground">
            <Plus className="size-4" />
          </button>
          <button aria-label="Zoom out" onClick={() => zoomBy(-0.6)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground">
            <Minus className="size-4" />
          </button>
          <button
            aria-label={full ? 'Exit full screen' : 'Full screen'}
            onClick={toggleFull}
            className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground"
          >
            {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button aria-label="Fit everyone" onClick={() => fitAll(street)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground">
            <Crosshair className="size-4" />
          </button>
          {!wall && <SendToScreen variant="icon" />}
        </div>

        {/* Legend; on phones the markers say their state, so only the map credit stays. */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-md bg-[#0d0d0d]/90 px-2.5 py-1.5 text-[11px] whitespace-nowrap text-muted backdrop-blur">
          {view === 'heat' ? (
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="size-2.5 rounded-full bg-[radial-gradient(var(--ember),transparent_70%)]" />
              Jobs by site
            </span>
          ) : (
            (['on_site', 'en_route', 'delayed'] as const).map((st) => (
              <span key={st} className="hidden items-center gap-1.5 sm:flex">
                <span className="h-[2px] w-3 rounded-full" style={{ background: stateColour[st] }} />
                {stateLabel[st]}
              </span>
            ))
          )}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-[11px] text-faint hover:text-muted">
            © OpenStreetMap
          </a>
        </div>
      </>
    )
  }

  // Panels use transforms, which trap fixed elements, so the full-screen map moves to the body.
  return full ? createPortal(map, document.body) : map
}
