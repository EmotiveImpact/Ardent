import { useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { HoldButton } from '@/components/ui/hold-button'
import { useNow } from '@/hooks/use-now'
import { duration } from '@/lib/format'
import { cn } from '@/lib/utils'

/* Today's jobs as a board. Calm cards (look C) carrying the working detail of look B. */

export type Column = 'unassigned' | 'booked' | 'en_route' | 'on_site' | 'signed_off'

export type BoardCard = {
  id: string
  ref: string
  title: string
  postcode: string
  when: string
  who?: string
  col: Column
  emergency?: boolean
  high?: boolean
  eta?: number
  late?: boolean
  since?: string
}

export const columns: { key: Column; label: string }[] = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'booked', label: 'Booked' },
  { key: 'en_route', label: 'En route' },
  { key: 'on_site', label: 'On site' },
  { key: 'signed_off', label: 'Signed off' },
]

/** The overview has less room, so it folds the five stages into three. */
const lanes: { label: string; cols: Column[]; drop: Column }[] = [
  { label: 'Waiting', cols: ['unassigned', 'booked'], drop: 'booked' },
  { label: 'Out now', cols: ['en_route', 'on_site'], drop: 'en_route' },
  { label: 'Signed off', cols: ['signed_off'], drop: 'signed_off' },
]

let cards: BoardCard[] = [
  { id: 'c1', ref: 'J-1053', title: 'Leak under kitchen sink, flat 2', postcode: 'M14 5AL', when: 'Now', col: 'unassigned', emergency: true },
  { id: 'c2', ref: 'J-1052', title: 'No hot water, flat 12', postcode: 'M14 5AL', when: '12:00', col: 'unassigned', high: true },
  { id: 'c4', ref: 'J-1049', title: 'Hang fire door, fit closer', postcode: 'M4 6DE', when: '11:00', who: 'TB', col: 'booked' },
  { id: 'c3', ref: 'J-1048', title: 'Annual CP12, 4 appliances', postcode: 'M3 4LP', when: '15:30', who: 'DM', col: 'booked' },
  { id: 'c5', ref: 'J-1045', title: 'Consumer unit upgrade', postcode: 'M19 2RF', when: '10:00', who: 'KA', col: 'en_route', eta: 12 },
  { id: 'c6', ref: 'J-1047', title: 'Leak under kitchen sink', postcode: 'M14 5AL', when: '09:30', who: 'RH', col: 'en_route', eta: 38, late: true },
  { id: 'c7', ref: 'J-1042', title: 'Combi boiler swap', postcode: 'M20 6BT', when: '08:00', who: 'DM', col: 'on_site', since: '2026-10-18T08:00:00Z' },
  { id: 'c9', ref: 'J-1040', title: 'Fire alarm test, Unit 3', postcode: 'M17 1SN', when: '07:30', who: 'TB', col: 'signed_off' },
  { id: 'c10', ref: 'J-1041', title: 'LOLER inspection', postcode: 'M17 1SN', when: '07:00', who: 'TB', col: 'signed_off' },
]

// One shared board so a move on Overview shows on Dispatch too.
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const setCards = (next: BoardCard[]) => {
  cards = next
  listeners.forEach((l) => l())
}

export function moveCard(id: string, col: Column) {
  const card = cards.find((c) => c.id === id)
  if (!card || card.col === col) return
  const assigned = !card.who && col !== 'unassigned'
  setCards(cards.map((c) => (c.id === id ? { ...c, col, who: c.who ?? (assigned ? 'TB' : undefined), eta: col === 'en_route' && assigned ? 9 : c.eta } : c)))
  toast.success(`${card.ref} moved to ${columns.find((c) => c.key === col)!.label}`, {
    description: assigned ? 'Tom Byrne is the nearest free van, 9 min away.' : undefined,
  })
}

export const useBoardCards = () => useSyncExternalStore(subscribe, () => cards)

function LiveDetail({ card }: { card: BoardCard }) {
  const now = useNow(1000)
  if (card.col === 'on_site' && card.since) return <>{duration(now - Date.parse(card.since))}</>
  if (card.col === 'en_route' && card.eta) return <>{card.eta}m away</>
  return <>{card.when}</>
}

function Card({
  card,
  selected,
  onSelect,
  dragging,
  setDragging,
}: {
  card: BoardCard
  selected?: boolean
  onSelect?: (ref: string) => void
  dragging: boolean
  setDragging: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const flag = card.emergency ? ['Emergency', 'text-ember'] : card.late ? ['Running late', 'text-warn'] : card.high ? ['High', 'text-muted'] : null
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(card.id)
      }}
      onDragEnd={() => setDragging(null)}
      onClick={() => {
        onSelect?.(card.ref)
        if (card.col === 'unassigned') setOpen((o) => !o)
      }}
      className={cn(
        'animate-rise relative cursor-grab overflow-hidden rounded-md bg-[#101010] px-3 py-2.5 transition-[background-color,opacity] hover:bg-[#161616] active:cursor-grabbing',
        selected && 'bg-[#181818]',
        dragging && 'opacity-40',
      )}
    >
      {card.emergency && <span className="absolute inset-y-0 left-0 w-[2px] bg-ember" />}
      <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
        <span className="text-faint">{card.ref}</span>
        {flag && <span className={flag[1]}>{flag[0]}</span>}
      </div>
      <p className="mt-1 truncate text-[13px] text-foreground">{card.title}</p>
      <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-faint tabular">
        <span className="rounded-[4px] bg-raised px-1.5 py-0.5 text-[10px] text-foreground">{card.postcode}</span>
        <span>
          <LiveDetail card={card} />
        </span>
        <span className="ml-auto">{card.who ? <Avatar initials={card.who} className="size-5 text-[9px]" /> : 'No one yet'}</span>
      </div>
      {open && card.col === 'unassigned' && (
        <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
          <HoldButton label="Hold to send Tom" className="h-9 rounded-md" ms={900} onCommit={() => moveCard(card.id, 'en_route')} />
        </div>
      )}
    </article>
  )
}

/**
 * `lanes` folds the board into three columns for tight spaces; `full` shows all five stages.
 * Drag a card between columns to move it. Tap an unassigned job to send someone.
 */
export function JobBoard({ layout, selectedRef, onSelect, className }: { layout: 'lanes' | 'full'; selectedRef?: string; onSelect?: (ref: string) => void; className?: string }) {
  const all = useBoardCards()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const groups = layout === 'full' ? columns.map((c) => ({ label: c.label, cols: [c.key], drop: c.key })) : lanes

  return (
    <div className={cn('grid gap-2', layout === 'full' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-5' : 'grid-cols-1 sm:grid-cols-3', className)}>
      {groups.map((g) => {
        const list = all.filter((c) => g.cols.includes(c.col))
        const waiting = g.cols.includes('unassigned') && list.some((c) => c.col === 'unassigned')
        return (
          <section
            key={g.label}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(g.label)
            }}
            onDragLeave={() => setOver((o) => (o === g.label ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              moveCard(e.dataTransfer.getData('text/plain'), g.drop)
              setOver(null)
              setDragging(null)
            }}
            className={cn('flex min-h-[200px] flex-col rounded-lg p-1.5 transition-colors', over === g.label ? 'bg-white/[0.03]' : 'bg-transparent')}
          >
            <header className="flex h-8 items-center gap-2 px-1.5">
              <h3 className="caps text-muted">{g.label}</h3>
              <span className={cn('font-mono text-[12px] tabular', waiting ? 'text-foreground' : 'text-faint')}>{list.length}</span>
            </header>
            <div className={cn('flex flex-col gap-1.5', g.cols[0] === 'signed_off' && 'opacity-50')}>
              {list.map((c) => (
                <Card
                  key={c.id}
                  card={c}
                  selected={selectedRef === c.ref}
                  onSelect={onSelect}
                  dragging={dragging === c.id}
                  setDragging={setDragging}
                />
              ))}
              {!list.length && <p className="py-8 text-center text-[12px] text-faint">Drop a job here</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
