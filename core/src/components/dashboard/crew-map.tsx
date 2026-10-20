import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Crosshair, Maximize2, Minimize2, Minus, Plus } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { byId, jobs, operators } from '@/data/mock'
import type { Operator, OperatorState } from '@/data/model'
import { districts, lines, mapBounds, places, vanAt, type LatLng, type Line } from '@/data/manchester'
import { cn } from '@/lib/utils'

/* A black map of south Manchester with every van placed and wired back to the yard. */

export type MapView = 'streets' | 'traffic' | 'heat' | 'routes'

const views: { key: MapView; label: string }[] = [
  { key: 'streets', label: 'Streets' },
  { key: 'traffic', label: 'Traffic' },
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

// Equirectangular projection, scaled so one unit is roughly ten metres.
const K = 10000
const COS = Math.cos((53.45 * Math.PI) / 180)
const px = ([lat, lng]: LatLng) => [(lng - mapBounds.west) * COS * K, (mapBounds.north - lat) * K] as const

/** The area the map opens on: the yard, every van and every site, with a margin. */
const focus = (() => {
  const pts = [places.yard, ...Object.values(vanAt), ...Object.values(places)].map(px)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const pad = 70
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad * 1.6, y0: Math.min(...ys) - pad * 1.8, y1: Math.max(...ys) + pad }
})()

const path = (pts: LatLng[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${px(p)[0].toFixed(1)} ${px(p)[1].toFixed(1)}`).join('')

/** A gentle arc between two points, bowed to one side. */
function arc(a: LatLng, b: LatLng, bow = 0.18) {
  const [x0, y0] = px(a)
  const [x1, y1] = px(b)
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const dx = x1 - x0
  const dy = y1 - y0
  return `M${x0} ${y0}Q${mx - dy * bow} ${my + dx * bow} ${x1} ${y1}`
}

// Mock live traffic: index of the line in `lines`, and how busy it is.
const traffic: Record<number, 'clear' | 'slow' | 'jam'> = { 0: 'clear', 1: 'slow', 2: 'jam', 5: 'jam', 6: 'slow', 7: 'slow', 8: 'slow', 9: 'clear', 13: 'slow' }
const trafficColour = { clear: '#2f7d4f', slow: '#c98a1c', jam: '#d2452f' }

// Jobs done in the last 90 days, by area, for the Work view.
const workload: { at: LatLng; jobs: number }[] = [
  { at: places.sit_01, jobs: 34 },
  { at: places.sit_02, jobs: 52 },
  { at: places.sit_03, jobs: 21 },
  { at: places.sit_04, jobs: 29 },
  { at: places.sit_05, jobs: 16 },
  { at: places.sit_06, jobs: 18 },
  { at: [53.4405, -2.2795], jobs: 24 },
  { at: [53.4325, -2.243], jobs: 31 },
]

function roadStyle(l: Line, i: number, view: MapView) {
  if (l.kind === 'river') return { stroke: '#0c1419', width: 4 }
  if (l.kind === 'canal') return { stroke: '#0c1419', width: 1.6 }
  if (view === 'traffic' && traffic[i]) return { stroke: trafficColour[traffic[i]], width: l.kind === 'motorway' ? 2.4 : 1.8, opacity: 0.7 }
  const dim = view === 'heat' ? 0.55 : 1
  if (l.kind === 'motorway') return { stroke: '#343434', width: 2.4, opacity: dim }
  if (l.kind === 'primary') return { stroke: '#242424', width: 1.6, opacity: dim }
  return { stroke: '#181818', width: 1, opacity: dim }
}

function Marker({ op, x, y, onSelect }: { op: Operator; x: number; y: number; onSelect?: (ref: string) => void }) {
  const job = byId(jobs, op.currentJobId)
  const colour = stateColour[op.state]
  const atYard = op.state === 'on_call'
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => job && onSelect?.(job.ref)}
      className="group absolute flex -translate-x-1/2 -translate-y-1/2 items-center"
      style={{ left: x, top: atYard ? y - 36 : y, '--c': colour } as React.CSSProperties}
    >
      <span className="relative flex">
        {op.state !== 'on_call' && <span className="absolute inset-0 animate-pulse-ring rounded-full" style={{ background: colour }} />}
        <Avatar initials={op.initials} className="relative size-7 bg-[#141414] text-[10px] shadow-[0_0_0_2px_var(--c)]" />
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

export function CrewMap({ onSelect, className }: { onSelect?: (ref: string) => void; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 480 })
  const [view, setView] = useState<MapView>('streets')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [full, setFull] = useState(false)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
    // The map remounts when it moves in and out of full screen, so watch the new element.
  }, [full])

  const base = Math.min(size.w / (focus.x1 - focus.x0), size.h / (focus.y1 - focus.y0))
  const s = base * zoom
  const cx = (focus.x0 + focus.x1) / 2 + pan.x
  const cy = (focus.y0 + focus.y1) / 2 + pan.y
  const vw = size.w / s
  const vh = size.h / s
  const vx = cx - vw / 2
  const vy = cy - vh / 2
  const toScreen = (p: LatLng) => {
    const [x, y] = px(p)
    return { x: (x - vx) * s, y: (y - vy) * s }
  }
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
  const zoomBy = (f: number) => setZoom((z) => Math.min(4, Math.max(0.8, z * f)))

  const onDown = (e: RPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: RPointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setPan((p) => ({ x: p.x - dx / s, y: p.y - dy / s }))
  }
  const onUp = () => (drag.current = null)

  const yard = toScreen(places.yard)
  const label = view === 'routes' ? '#2c2c2c' : '#3a3a3a'

  const map = (
    <div
      ref={box}
      className={cn('h-full w-full cursor-grab touch-none overflow-hidden bg-black select-none active:cursor-grabbing', full ? 'fixed inset-0 z-[70] h-dvh w-screen' : 'relative', className)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={(e) => zoomBy(Math.exp(-e.deltaY * 0.0015))}
    >
      <svg className="absolute inset-0 size-full" viewBox={`${vx} ${vy} ${vw} ${vh}`} preserveAspectRatio="none" aria-label="Map of south Manchester with crew positions">
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

        {view !== 'routes' &&
          lines.map((l, i) => {
            const st = roadStyle(l, i, view)
            return (
              <path
                key={i}
                d={path(l.points)}
                fill="none"
                stroke={st.stroke}
                strokeWidth={st.width}
                strokeOpacity={st.opacity ?? 1}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

        {view === 'heat' &&
          workload.map((w, i) => {
            const [x, y] = px(w.at)
            return <circle key={i} cx={x} cy={y} r={w.jobs * 3.4} fill="url(#heat)" />
          })}

        {/* Lines back to the yard */}
        {operators.map((op, i) => {
          if (op.state === 'on_call' || op.state === 'off_shift') return null
          const d = arc(places.yard, vanAt[op.id], i % 2 ? -0.16 : 0.16)
          const colour = stateColour[op.state]
          const job = byId(jobs, op.currentJobId)
          const dest = job && (places as Record<string, LatLng>)[job.siteId]
          const moving = op.state === 'en_route' || op.state === 'delayed'
          return (
            <g key={op.id}>
              <path d={d} fill="none" stroke={colour} strokeOpacity={0.18} strokeWidth={5} vectorEffect="non-scaling-stroke" />
              <path
                d={d}
                fill="none"
                stroke={colour}
                strokeWidth={1.5}
                strokeDasharray={op.state === 'delayed' ? '5 5' : undefined}
                vectorEffect="non-scaling-stroke"
              />
              {moving && dest && (
                <>
                  <path d={arc(vanAt[op.id], dest, 0.1)} fill="none" stroke={colour} strokeOpacity={0.6} strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
                  <circle cx={px(dest)[0]} cy={px(dest)[1]} r={6 / s} fill="none" stroke={colour} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
                </>
              )}
              <circle r={3 / s} fill={colour} filter="url(#map-glow)">
                <animateMotion dur={moving ? '5s' : '7s'} repeatCount="indefinite" path={d} begin={`${i * 0.6}s`} />
              </circle>
            </g>
          )
        })}

        {/* Booked sites still to visit today */}
        {jobs
          .filter((j) => j.status === 'booked' && j.start.startsWith('2026-10-18'))
          .map((j) => {
            const at = (places as Record<string, LatLng>)[j.siteId]
            if (!at) return null
            const [x, y] = px(at)
            return <circle key={j.id} cx={x} cy={y} r={4 / s} fill="#000" stroke="#777" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
          })}
      </svg>

      {/* District names stay a fixed size whatever the zoom */}
      {districts.map((d) => {
        const p = toScreen(d.at)
        return (
          <span key={d.name} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[9px] tracking-[0.16em] uppercase" style={{ left: p.x, top: p.y, color: label }}>
            {d.name}
          </span>
        )
      })}

      {jobs
        .filter((j) => j.status === 'booked' && j.start.startsWith('2026-10-18'))
        .map((j) => {
          const at = (places as Record<string, LatLng>)[j.siteId]
          if (!at) return null
          const p = toScreen(at)
          return (
            <span key={j.id} className="pointer-events-none absolute font-mono text-[10px] text-muted" style={{ left: p.x + 8, top: p.y - 7 }}>
              {j.ref} · {j.start.slice(11, 16)}
            </span>
          )
        })}

      {/* Yard */}
      <div className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: yard.x, top: yard.y }}>
        <span className="size-3 rotate-45 rounded-[2px] bg-white shadow-[0_0_16px_#ffffff80]" />
        <span className="caps mt-2 text-[9px] text-foreground">Yard</span>
      </div>

      {operators.map((op) => {
        const p = toScreen(vanAt[op.id])
        return <Marker key={op.id} op={op} x={p.x} y={p.y} onSelect={onSelect} />
      })}

      {full && (
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-3 rounded-md bg-[#0d0d0d]/90 px-3 py-2 backdrop-blur">
          <span className="caps text-foreground">Crew on the road</span>
          <span className="font-mono text-[11px] text-faint">Esc to close</span>
        </div>
      )}

      {/* View types */}
      <div className="absolute top-3 right-3 flex gap-1 rounded-lg bg-[#0d0d0d]/90 p-1 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
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
      <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg bg-[#0d0d0d]/90 p-1 backdrop-blur" onPointerDown={(e) => e.stopPropagation()}>
        <button aria-label="Zoom in" onClick={() => zoomBy(1.3)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground">
          <Plus className="size-4" />
        </button>
        <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground">
          <Minus className="size-4" />
        </button>
        <button
          aria-label={full ? 'Exit full screen' : 'Full screen'}
          onClick={toggleFull}
          className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground"
        >
          {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button
          aria-label="Fit everyone"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
          className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground"
        >
          <Crosshair className="size-4" />
        </button>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-md bg-[#0d0d0d]/90 px-2.5 py-1.5 text-[11px] text-muted backdrop-blur">
        {view === 'traffic' ? (
          (['clear', 'slow', 'jam'] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="h-[3px] w-3 rounded-full" style={{ background: trafficColour[t] }} />
              {t === 'clear' ? 'Clear' : t === 'slow' ? 'Slow' : 'Queuing'}
            </span>
          ))
        ) : view === 'heat' ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[radial-gradient(var(--ember),transparent_70%)]" />
            Jobs in the last 90 days
          </span>
        ) : (
          (['on_site', 'en_route', 'delayed'] as const).map((st) => (
            <span key={st} className="flex items-center gap-1.5">
              <span className="h-[2px] w-3 rounded-full" style={{ background: stateColour[st] }} />
              {stateLabel[st]}
            </span>
          ))
        )}
      </div>
    </div>
  )
  // Panels use transforms, which trap fixed elements, so the full-screen map moves to the body.
  return full ? createPortal(map, document.body) : map
}
