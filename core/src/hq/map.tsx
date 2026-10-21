import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Map as StreetMap } from 'maplibre-gl'
import { Crosshair, Minus, Plus } from 'lucide-react'
import { jobStatus, operatorState } from '@kit'
import { startStreetMap } from '@/components/dashboard/street-map'
import type { FirmSummary, LiveJob, LiveVan } from '@/data/hq'
import { cn } from '@/lib/utils'
import { isDone, isLive, vanColour } from './parts'

/*
 * The master map: every job today and every van now, across every firm, on
 * Ardent's black street map. Pins that land on top of each other are drawn
 * as one numbered group (tap it to zoom in), or, once zoomed right in or when
 * they share a spot (a van parked at its job), fanned out round the spot.
 */

export type Picked = { kind: 'job' | 'van'; id: string }

/** Greater Manchester, for when there is nothing to fit. */
const MANCHESTER: [number, number] = [-2.2426, 53.4808]

interface Item {
  key: string
  kind: 'job' | 'van'
  id: string
  lat: number
  lng: number
  /** Who gets to lead a group: emergencies first, then live work, vans, booked, done. */
  rank: number
  job?: LiveJob
  van?: LiveVan
}

interface Placed extends Item {
  x: number
  y: number
}

type Drawn = { kind: 'one'; item: Placed; x: number; y: number; from?: [number, number] } | { kind: 'group'; items: Placed[]; x: number; y: number }

const rankJob = (j: LiveJob) => (j.priority === 'emergency' && !isDone(j.status) ? 0 : isLive(j.status) ? 1 : j.status === 'booked' ? 3 : 4)

/** Group pins closer than `r` pixels; leaders are taken in rank order so an emergency is never buried. */
function layout(items: Placed[], r: number, zoom: number): Drawn[] {
  const sorted = [...items].sort((a, b) => a.rank - b.rank)
  const taken = new Set<string>()
  const out: Drawn[] = []
  for (const lead of sorted) {
    if (taken.has(lead.key)) continue
    taken.add(lead.key)
    const group = [lead]
    for (const o of sorted) {
      if (taken.has(o.key)) continue
      if (Math.hypot(o.x - lead.x, o.y - lead.y) < r) {
        group.push(o)
        taken.add(o.key)
      }
    }
    if (group.length === 1) {
      out.push({ kind: 'one', item: lead, x: lead.x, y: lead.y })
      continue
    }
    const cx = group.reduce((s, g) => s + g.x, 0) / group.length
    const cy = group.reduce((s, g) => s + g.y, 0) / group.length
    const spread = Math.max(...group.map((g) => Math.hypot(g.x - cx, g.y - cy)))
    // Zoomed right in, or sharing one spot: fan them out round it so each can be tapped.
    if (zoom >= 14 || spread < 6 || group.length <= 2) {
      const ring = 16 + group.length * 3.5
      group.forEach((g, i) => {
        const a = (i / group.length) * Math.PI * 2 - Math.PI / 2
        out.push({ kind: 'one', item: g, x: cx + Math.cos(a) * ring, y: cy + Math.sin(a) * ring, from: [g.x, g.y] })
      })
    } else {
      out.push({ kind: 'group', items: group, x: cx, y: cy })
    }
  }
  return out
}

const JOB_FILL = {
  booked: '#050505',
  en_route: 'var(--info)',
  on_site: 'var(--ok)',
  paused: 'var(--warn)',
} as Record<string, string>

function JobPin({ job, picked, big, onPick }: { job: LiveJob; picked: boolean; big: boolean; onPick: () => void }) {
  const done = isDone(job.status) || job.status === 'cancelled'
  const emergency = job.priority === 'emergency' && !done
  const fill = emergency ? 'var(--danger)' : done ? '#4a4a4a' : (JOB_FILL[job.status] ?? '#777')
  const ring = job.status === 'booked' && !emergency ? '#9a9a9a' : 'transparent'
  const size = big ? (done ? 12 : 18) : done ? 9 : 13
  const label = `${job.ref}, ${job.title}, ${job.firmName}, ${emergency ? 'emergency, ' : ''}${jobStatus[job.status].label}`
  return (
    <button type="button" aria-label={label} onPointerDown={(e) => e.stopPropagation()} onClick={onPick} className="group relative flex size-8 items-center justify-center outline-none focus-visible:[&>span:first-child]:shadow-[0_0_0_3px_var(--ember)]">
      {emergency && <span className="absolute animate-pulse-ring rounded-full bg-danger" style={{ width: size, height: size }} />}
      <span
        className="relative rounded-full transition-shadow"
        style={{
          width: size,
          height: size,
          background: fill,
          boxShadow: `inset 0 0 0 ${job.status === 'booked' && !emergency ? 1.5 : 0}px ${ring}, 0 0 0 2px #030303${picked ? ', 0 0 0 4px #fff' : ''}`,
        }}
      />
      {(emergency && big) || picked ? (
        <span className={cn('pointer-events-none absolute left-7 rounded-md bg-[#111]/95 px-2 py-1 font-mono whitespace-nowrap shadow-xl shadow-black/60', big ? 'text-[14px]' : 'text-[11px]', emergency ? 'text-danger' : 'text-foreground')}>{job.ref}</span>
      ) : (
        <span className="pointer-events-none absolute left-7 hidden flex-col gap-0.5 rounded-md bg-[#111]/95 px-2.5 py-1.5 text-left whitespace-nowrap shadow-xl shadow-black/60 group-hover:flex group-focus-visible:flex">
          <span className="text-[12px] text-foreground">
            <span className="font-mono text-muted">{job.ref}</span> {job.title}
          </span>
          <span className="text-[11px] text-muted">
            {job.firmName} · {emergency ? 'Emergency · ' : ''}
            {jobStatus[job.status].label}
          </span>
        </span>
      )}
    </button>
  )
}

function VanPin({ van, picked, big, onPick }: { van: LiveVan; picked: boolean; big: boolean; onPick: () => void }) {
  const colour = vanColour[van.state]
  const moving = van.state === 'en_route' || van.state === 'delayed'
  const label = `${van.name}, ${van.firmName}, ${operatorState[van.state].label}${van.etaMinutes ? `, ${van.etaMinutes} minutes away` : ''}`
  return (
    <button type="button" aria-label={label} onPointerDown={(e) => e.stopPropagation()} onClick={onPick} className={cn('group relative flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring', van.from === 'base' && 'opacity-75')}>
      {moving && <span className="absolute inset-0 animate-pulse-ring rounded-full" style={{ background: colour }} />}
      <span
        className={cn('relative flex items-center justify-center rounded-full bg-[#141414] font-mono text-foreground', big ? 'size-9 text-[12px]' : 'size-[26px] text-[10px]')}
        style={{ boxShadow: `0 0 0 2px ${colour}${picked ? ', 0 0 0 4.5px #fff' : ''}` }}
      >
        {van.initials}
      </span>
      <span className="pointer-events-none absolute left-9 hidden flex-col gap-0.5 rounded-md bg-[#111]/95 px-2.5 py-1.5 text-left whitespace-nowrap shadow-xl shadow-black/60 group-hover:flex group-focus-visible:flex">
        <span className="text-[12px] text-foreground">{van.name}</span>
        <span className="text-[11px]" style={{ color: colour }}>
          {operatorState[van.state].label}
          {van.etaMinutes ? ` · ${van.etaMinutes} min away` : ''}
          <span className="text-muted"> · {van.firmName}</span>
        </span>
      </span>
    </button>
  )
}

function GroupPin({ items, big, onOpen }: { items: Placed[]; big: boolean; onOpen: () => void }) {
  const emergency = items.some((i) => i.rank === 0)
  const jobs = items.filter((i) => i.kind === 'job').length
  const vans = items.length - jobs
  const size = (big ? 44 : 32) + Math.min(14, items.length * 1.2)
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onOpen}
      aria-label={`${jobs} ${jobs === 1 ? 'job' : 'jobs'} and ${vans} ${vans === 1 ? 'van' : 'vans'} here${emergency ? ', with an emergency' : ''}. Zoom in`}
      className="group relative flex items-center justify-center rounded-full bg-[#161616]/95 font-mono text-foreground shadow-[0_6px_24px_rgba(0,0,0,.7)] outline-none transition-colors hover:bg-[#222] focus-visible:ring-2 focus-visible:ring-ring"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${emergency ? 'var(--danger)' : '#3a3a3a'}, 0 6px 24px rgba(0,0,0,.7)` }}
    >
      <span className={big ? 'text-[16px]' : 'text-[12px]'}>{items.length}</span>
      {emergency && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-danger shadow-[0_0_0_2px_#030303]" />}
      <span className="pointer-events-none absolute top-full mt-2 hidden rounded-md bg-[#111]/95 px-2 py-1 text-[11px] whitespace-nowrap text-muted shadow-xl group-hover:block">
        {jobs} {jobs === 1 ? 'job' : 'jobs'}, {vans} {vans === 1 ? 'van' : 'vans'}. Tap to zoom in
      </span>
    </button>
  )
}

export function HqMap({
  jobs,
  vans,
  firms = [],
  picked,
  onPick,
  fitKey,
  big = false,
  controls,
  className,
}: {
  jobs: LiveJob[]
  vans: LiveVan[]
  /** For the firms' names over their patches when zoomed out. */
  firms?: FirmSummary[]
  picked?: Picked
  onPick?: (p: Picked | undefined) => void
  /** Fit the view again when this changes (a firm filter, say). */
  fitKey?: string
  /** The wall: bigger pins for reading across a room. */
  big?: boolean
  controls?: ReactNode
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [street, setStreet] = useState<StreetMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [, setMoved] = useState(0)

  const items: Item[] = [
    ...jobs.filter((j) => Number.isFinite(j.lat) && Math.abs(j.lat) > 1).map((j) => ({ key: `j_${j.id}`, kind: 'job' as const, id: j.id, lat: j.lat, lng: j.lng, rank: rankJob(j), job: j })),
    ...vans.filter((v) => Number.isFinite(v.lat) && Math.abs(v.lat) > 1).map((v) => ({ key: `v_${v.id}`, kind: 'van' as const, id: v.id, lat: v.lat, lng: v.lng, rank: 2, van: v })),
  ]
  const latest = useRef(items)
  latest.current = items
  const firmsRef = useRef(firms)
  firmsRef.current = firms

  const fit = (m: StreetMap, animate = true) => {
    const pts = latest.current.length ? latest.current.map((i) => [i.lng, i.lat]) : firmsRef.current.map((f) => [f.centre.lng, f.centre.lat])
    if (!pts.length) return m.easeTo({ center: MANCHESTER, zoom: 10.5, animate })
    const lngs = pts.map((p) => p[0])
    const lats = pts.map((p) => p[1])
    const wide = (box.current?.clientWidth ?? 800) > 640
    m.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      // On the wall the big numbers sit over the top of the map, so leave room under them.
      { padding: wide ? { top: big ? 200 : 80, bottom: big ? 100 : 70, left: 70, right: 70 } : { top: big ? 190 : 60, bottom: 50, left: 36, right: 36 }, animate, maxZoom: 14 },
    )
  }

  useEffect(() => {
    const el = box.current?.querySelector<HTMLDivElement>('[data-street]')
    if (!el) return
    let map: StreetMap | undefined
    let gone = false
    let frame = 0
    startStreetMap(el, MANCHESTER)
      .then((m) => {
        map = m
        if (gone) return m.remove()
        fit(m, false)
        const redraw = () => {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(() => setMoved((n) => n + 1))
        }
        m.on('move', redraw)
        m.on('resize', redraw)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new filter: fit what's left.
  const fitted = useRef(fitKey)
  useEffect(() => {
    if (!street || fitted.current === fitKey) return
    fitted.current = fitKey
    fit(street)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, street])

  // Picked from a list: bring it into view.
  const pickedItem = picked && items.find((i) => i.kind === picked.kind && i.id === picked.id)
  useEffect(() => {
    if (!street || !pickedItem) return
    const p = street.project([pickedItem.lng, pickedItem.lat])
    const el = box.current
    const inView = el && p.x > 60 && p.y > 60 && p.x < el.clientWidth - 60 && p.y < el.clientHeight - 60
    if (!inView || street.getZoom() < 12.5) street.easeTo({ center: [pickedItem.lng, pickedItem.lat], zoom: Math.max(street.getZoom(), 13.5), duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.kind, picked?.id, street])

  const zoomBy = (steps: number) => street?.easeTo({ zoom: street.getZoom() + steps, duration: 250 })
  const openGroup = (g: Placed[]) => {
    if (!street) return
    const lngs = g.map((i) => i.lng)
    const lats = g.map((i) => i.lat)
    street.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 110, maxZoom: Math.max(15, street.getZoom() + 1.5), duration: 600 },
    )
  }

  let drawn: Drawn[] = []
  let zoom = 0
  if (street) {
    zoom = street.getZoom()
    // Only what's in view gets a pin: one off the edge could be scrolled to inside the clipped box.
    const w = box.current?.clientWidth ?? 0
    const h = box.current?.clientHeight ?? 0
    const placed = items
      .map((i) => {
        const { x, y } = street.project([i.lng, i.lat])
        return { ...i, x, y }
      })
      .filter((i) => i.x > -30 && i.y > -30 && i.x < w + 30 && i.y < h + 30)
    drawn = layout(placed, big ? 34 : 24, zoom)
  }
  const patchNames = street && zoom < 12.2 ? firms.map((f) => ({ f, p: street.project([f.centre.lng, f.centre.lat]) })) : []
  const pick = (i: Item) => onPick?.(picked && picked.kind === i.kind && picked.id === i.id ? undefined : { kind: i.kind, id: i.id })

  return (
    <div ref={box} onScroll={(e) => e.currentTarget.scrollTo(0, 0)} className={cn('relative isolate h-full w-full overflow-hidden bg-[#030303] select-none', className)}>
      <div className={cn('absolute inset-0 transition-opacity duration-500', street ? 'opacity-100' : 'opacity-0')}>
        <div data-street className="size-full" />
      </div>
      {!street && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
          <span className={cn('cap text-[11px]', !failed && 'animate-pulse')}>{failed ? 'The map could not load. The lists still work.' : 'Loading the map'}</span>
        </div>
      )}
      {street && (
        <>
          {patchNames.map(({ f, p }) => (
            <span key={f.id} className={cn('caps pointer-events-none absolute -translate-x-1/2 translate-y-6 text-center whitespace-nowrap text-faint/55', big ? 'text-[11px]' : 'text-[9.5px]')} style={{ left: p.x, top: p.y }}>
              {f.name}
            </span>
          ))}
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
            {drawn.map((d) =>
              d.kind === 'one' && d.from ? (
                <g key={`l_${d.item.key}`}>
                  <line x1={d.from[0]} y1={d.from[1]} x2={d.x} y2={d.y} stroke="#ffffff40" strokeWidth={1} />
                  <circle cx={d.from[0]} cy={d.from[1]} r={2.5} fill="#ffffff80" />
                </g>
              ) : null,
            )}
          </svg>
          {drawn.map((d) => (
            <div key={d.kind === 'one' ? d.item.key : `g_${d.items[0].key}`} className={cn('absolute -translate-x-1/2 -translate-y-1/2', d.kind === 'one' && d.item.rank === 0 ? 'z-20' : 'z-10')} style={{ left: d.x, top: d.y }}>
              {d.kind === 'group' ? (
                <GroupPin items={d.items} big={big} onOpen={() => openGroup(d.items)} />
              ) : d.item.job ? (
                <JobPin job={d.item.job} big={big} picked={picked?.kind === 'job' && picked.id === d.item.id} onPick={() => pick(d.item)} />
              ) : (
                <VanPin van={d.item.van!} big={big} picked={picked?.kind === 'van' && picked.id === d.item.id} onPick={() => pick(d.item)} />
              )}
            </div>
          ))}
        </>
      )}

      {controls && <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">{controls}</div>}

      {street && (
        <div className="absolute right-3 bottom-3 z-30 flex flex-col gap-1 rounded-lg bg-[#0d0d0d]/90 p-1 backdrop-blur">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(0.7)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground">
            <Plus className="size-4" />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-0.7)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground">
            <Minus className="size-4" />
          </button>
          <button type="button" aria-label="Fit everything" onClick={() => fit(street)} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-raised hover:text-foreground">
            <Crosshair className="size-4" />
          </button>
        </div>
      )}

      <div className={cn('absolute bottom-3 left-3 z-30 flex items-center gap-3 rounded-md bg-[#0d0d0d]/90 px-2.5 py-1.5 whitespace-nowrap text-muted backdrop-blur', big ? 'text-[13px]' : 'text-[11px]')}>
        {(
          [
            ['On site', 'var(--ok)'],
            ['On the road', 'var(--info)'],
            ['Booked', 'hollow'],
            ['Done', '#4a4a4a'],
            ['Emergency', 'var(--danger)'],
          ] as const
        ).map(([label, c]) => (
          <span key={label} className="hidden items-center gap-1.5 lg:flex">
            <span className="size-2 rounded-full" style={c === 'hollow' ? { boxShadow: 'inset 0 0 0 1.5px #9a9a9a' } : { background: c }} />
            {label}
          </span>
        ))}
        <span className="hidden items-center gap-1.5 lg:flex">
          <span className="flex size-3.5 items-center justify-center rounded-full bg-[#141414] shadow-[0_0_0_1.5px_#8a8a8a]" />
          Van
        </span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-[11px] text-faint hover:text-muted">
          © OpenStreetMap
        </a>
      </div>
    </div>
  )
}
