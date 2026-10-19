import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Dashboard } from '@/routes/dashboard'
import { MixOne, MixTwo, MixThree } from '@/routes/mixes'
import { LiveBoard } from '@/components/dashboard/live-board'
import { PageHeader } from '@/components/ui/panel'
import { Avatar } from '@/components/ui/avatar'
import { HoldButton } from '@/components/ui/hold-button'
import { useNow } from '@/hooks/use-now'
import { duration } from '@/lib/format'
import { cn } from '@/lib/utils'

/* Three candidate looks for the Today screen, side by side, so Edem can pick one. */

type Column = 'unassigned' | 'booked' | 'en_route' | 'on_site' | 'signed_off'

type Card = {
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

const columns: { key: Column; label: string }[] = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'booked', label: 'Booked' },
  { key: 'en_route', label: 'En route' },
  { key: 'on_site', label: 'On site' },
  { key: 'signed_off', label: 'Signed off' },
]

const seed: Card[] = [
  { id: 'c1', ref: 'J-1047', title: 'Leak under kitchen sink', postcode: 'M14 5AL', when: 'Now', col: 'unassigned', emergency: true },
  { id: 'c2', ref: 'J-1052', title: 'No hot water, flat 12', postcode: 'M14 5AL', when: '12:00', col: 'unassigned', high: true },
  { id: 'c3', ref: 'J-1048', title: 'Annual CP12, 4 appliances', postcode: 'M3 4LP', when: '15:30', who: 'DM', col: 'booked' },
  { id: 'c4', ref: 'J-1049', title: 'Hang fire door, fit closer', postcode: 'M4 6DE', when: '11:00', who: 'TB', col: 'booked' },
  { id: 'c5', ref: 'J-1045', title: 'Consumer unit upgrade', postcode: 'M19 2RF', when: '10:00', who: 'KA', col: 'en_route', eta: 12 },
  { id: 'c6', ref: 'J-1050', title: 'Boiler service, 4471', postcode: 'M21 9TT', when: '09:30', who: 'RH', col: 'en_route', eta: 38, late: true },
  { id: 'c7', ref: 'J-1042', title: 'Combi boiler swap', postcode: 'M20 6BT', when: '08:00', who: 'DM', col: 'on_site', since: '2026-10-18T08:00:00Z' },
  { id: 'c8', ref: 'J-1044', title: 'EICR, Block B', postcode: 'M15 4PR', when: '08:30', who: 'LW', col: 'on_site', since: '2026-10-18T08:30:00Z' },
  { id: 'c9', ref: 'J-1040', title: 'Fire alarm test, Unit 3', postcode: 'M17 1SN', when: '07:30', who: 'TB', col: 'signed_off' },
  { id: 'c10', ref: 'J-1041', title: 'LOLER inspection', postcode: 'M17 1SN', when: '07:00', who: 'LW', col: 'signed_off' },
]

/** Board state shared by looks B and C: drag a card into another column to move it. */
function useBoard() {
  const [cards, setCards] = useState(seed)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Column | null>(null)
  const move = (id: string, col: Column) => {
    const card = cards.find((c) => c.id === id)
    if (!card || card.col === col) return
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, col, who: c.who ?? (col !== 'unassigned' ? 'TB' : undefined) } : c)))
    const label = columns.find((c) => c.key === col)!.label
    toast.success(`${card.ref} moved to ${label}`, {
      description: !card.who && col !== 'unassigned' ? 'Assigned to Tom Byrne, nearest free van.' : undefined,
    })
  }
  const dropProps = (col: Column) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(col)
    },
    onDragLeave: () => setOver((o) => (o === col ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      move(e.dataTransfer.getData('text/plain'), col)
      setOver(null)
      setDragging(null)
    },
  })
  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/plain', id)
      e.dataTransfer.effectAllowed = 'move'
      setDragging(id)
    },
    onDragEnd: () => {
      setDragging(null)
      setOver(null)
    },
  })
  return { cards, dragging, over, dropProps, dragProps, move }
}

function ViewToggle({ view, setView, calm }: { view: 'map' | 'board'; setView: (v: 'map' | 'board') => void; calm?: boolean }) {
  return (
    <div className="flex gap-1.5">
      {(['map', 'board'] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={cn(
            'h-8 rounded-md px-3 text-[13px] transition-colors',
            calm ? 'font-sans' : 'caps text-[10px]',
            view === v ? 'bg-white text-black' : 'bg-raised text-foreground hover:bg-[#242424]',
          )}
        >
          {v === 'map' ? 'Map' : 'Board'}
        </button>
      ))}
    </div>
  )
}

function Live({ card }: { card: Card }) {
  const now = useNow(1000)
  if (card.col === 'on_site' && card.since) return <>{duration(now - Date.parse(card.since))}</>
  if (card.col === 'en_route' && card.eta) return <>ETA {card.eta}m</>
  return <>{card.when}</>
}

/* ---------------------------------------------------------------- Look B */

function OperatorBoard() {
  const b = useBoard()
  const [view, setView] = useState<'map' | 'board'>('board')
  const [open, setOpen] = useState<string | null>('c1')
  const unassigned = b.cards.filter((c) => c.col === 'unassigned').length
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader
        eyebrow="Morning, Edem. Sunday 18 October"
        title="TODAY"
        aside={
          <>
            <span className="caps flex h-8 items-center gap-2 rounded-md bg-surface px-3 text-muted">
              <span className="size-1.5 rounded-full bg-ok" />4 vans out
            </span>
            <ViewToggle view={view} setView={setView} />
          </>
        }
      />
      {view === 'map' ? (
        <LiveBoard />
      ) : (
        <div className="animate-rise grid grid-cols-1 gap-2 rounded-xl bg-surface/90 p-1.5 sm:grid-cols-2 xl:grid-cols-5">
          {columns.map((col) => {
            const list = b.cards.filter((c) => c.col === col.key)
            const done = col.key === 'signed_off'
            return (
              <section
                key={col.key}
                {...b.dropProps(col.key)}
                className={cn('flex min-h-[420px] flex-col rounded-lg bg-inset p-1.5 transition-colors', b.over === col.key && 'bg-[#141414]')}
              >
                <header className="flex h-9 items-center justify-between px-1.5">
                  <h2 className="caps text-muted">{col.label}</h2>
                  <span className={cn('font-mono text-[12px] tabular', col.key === 'unassigned' && unassigned ? 'text-foreground' : 'text-faint')}>
                    {String(list.length).padStart(2, '0')}
                  </span>
                </header>
                <div className={cn('flex flex-col gap-1.5', done && 'opacity-55')}>
                  {list.map((c) => (
                    <article
                      key={c.id}
                      {...b.dragProps(c.id)}
                      onClick={() => setOpen(open === c.id ? null : c.id)}
                      className={cn(
                        'animate-rise group relative cursor-grab overflow-hidden rounded-md bg-surface p-2.5 shadow-[0_8px_20px_-12px_#000] transition-[background-color,opacity,transform] hover:bg-[#161616] active:cursor-grabbing',
                        b.dragging === c.id && 'scale-[0.98] opacity-40',
                      )}
                    >
                      {c.emergency && <span className="absolute inset-y-0 left-0 w-[3px] bg-ember shadow-[0_0_12px_var(--ember)]" />}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-faint">{c.ref}</span>
                        {c.emergency ? (
                          <span className="caps text-[9px] text-ember">Emergency</span>
                        ) : c.late ? (
                          <span className="caps text-[9px] text-warn">Running late</span>
                        ) : c.high ? (
                          <span className="caps text-[9px] text-muted">High</span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-[13px] leading-snug text-foreground">{c.title}</p>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <span className="rounded-[4px] bg-raised px-1.5 py-0.5 font-mono text-[10px]">{c.postcode}</span>
                        <span className="font-mono text-[11px] text-muted tabular">
                          <Live card={c} />
                        </span>
                        <span className="ml-auto">
                          {c.who ? (
                            <Avatar initials={c.who} className="size-5 text-[9px]" />
                          ) : (
                            <span className="caps text-[9px] text-faint">No one</span>
                          )}
                        </span>
                      </div>
                      {open === c.id && c.col === 'unassigned' && (
                        <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                          <HoldButton
                            label={c.emergency ? 'Hold to send Tom' : 'Hold to assign Tom'}
                            className="h-9 rounded-md"
                            ms={900}
                            onCommit={() => b.move(c.id, 'en_route')}
                          />
                        </div>
                      )}
                    </article>
                  ))}
                  {!list.length && <p className="px-1.5 py-6 text-center text-[12px] text-faint">Drop a job here</p>}
                </div>
              </section>
            )
          })}
        </div>
      )}
      <p className="px-1 text-[12px] text-faint">Drag a card to move it. Tap an unassigned job to send someone.</p>
    </div>
  )
}

/* ---------------------------------------------------------------- Look C */

function CalmToday() {
  const b = useBoard()
  const [view, setView] = useState<'map' | 'board'>('board')
  const now = useNow(1000)
  const stats = [
    { label: 'Done', value: '24 of 31' },
    { label: 'Avg. response', value: '1h 42m' },
    { label: 'Invoiced', value: '£8,420' },
    { label: 'Certs overdue', value: '7', bad: true },
  ]
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-8 pt-2">
      <div className="animate-rise flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-medium tracking-[-0.01em]">Today</h1>
          <p className="mt-1 text-[13px] text-muted">Sunday 18 October. 4 vans out, 2 jobs waiting for someone.</p>
        </div>
        <ViewToggle view={view} setView={setView} calm />
      </div>

      <dl className="animate-rise grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4" style={{ '--i': 1 } as React.CSSProperties}>
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">{s.label}</dt>
            <dd className={cn('mt-1.5 font-mono text-[22px] font-light tabular', s.bad ? 'text-danger' : 'text-foreground')}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {view === 'map' ? (
        <LiveBoard />
      ) : (
        <div className="animate-rise grid grid-cols-1 gap-x-3 gap-y-6 sm:grid-cols-2 xl:grid-cols-5" style={{ '--i': 2 } as React.CSSProperties}>
          {columns.map((col) => {
            const list = b.cards.filter((c) => c.col === col.key)
            const done = col.key === 'signed_off'
            return (
              <section key={col.key} {...b.dropProps(col.key)} className={cn('min-h-[160px] rounded-lg transition-colors', b.over === col.key && 'bg-white/[0.02]')}>
                <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                  {col.label}
                  <span className="text-muted">{list.length}</span>
                </h2>
                <div className={cn('flex flex-col gap-2', done && 'opacity-50')}>
                  {list.map((c) => (
                    <article
                      key={c.id}
                      {...b.dragProps(c.id)}
                      className={cn(
                        'cursor-grab rounded-md bg-[#101010] px-3 py-3 transition-[background-color,opacity] hover:bg-[#151515] active:cursor-grabbing',
                        b.dragging === c.id && 'opacity-40',
                      )}
                    >
                      <p className="flex items-center gap-2 text-[13px] text-foreground">
                        {c.emergency && <span className="size-1.5 shrink-0 rounded-full bg-ember" />}
                        <span className="truncate">{c.title}</span>
                      </p>
                      <p className="mt-1.5 font-mono text-[11px] text-faint tabular">
                        {c.postcode}
                        <span className="px-1.5">·</span>
                        {c.col === 'on_site' && c.since ? duration(now - Date.parse(c.since)) : c.col === 'en_route' && c.eta ? `${c.eta}m away` : c.when}
                        <span className="px-1.5">·</span>
                        <span className={cn(c.emergency && 'text-ember', c.late && 'text-warn')}>
                          {c.emergency ? 'Emergency' : c.late ? 'Late' : (c.who ?? 'No one yet')}
                        </span>
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <section className="animate-rise" style={{ '--i': 3 } as React.CSSProperties}>
        <h2 className="mb-3 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">Needs a look</h2>
        <div className="flex flex-col gap-2">
          {[
            ['Kofi Asante', 'NICEIC registration lapses 2 Nov', 'Chasing'],
            ['J-1050', 'Ryan is 38 minutes behind on the boiler service', 'Customer told'],
            ['Northgate Lettings', 'Invoice 12 days overdue, £1,840', 'Reminder sent'],
          ].map(([who, what, state]) => (
            <div key={what} className="flex items-center gap-4 rounded-md bg-[#101010] px-3 py-3 text-[13px]">
              <span className="w-40 shrink-0 truncate text-muted">{who}</span>
              <span className="min-w-0 flex-1 truncate">{what}</span>
              <span className="hidden font-mono text-[11px] text-faint sm:block">{state}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ---------------------------------------------------------------- Switcher */

const looks = [
  { key: 'a', name: 'A', label: 'Current Core' },
  { key: 'b', name: 'B', label: 'Board, operator' },
  { key: 'c', name: 'C', label: 'Calm' },
  { key: '1', name: '1', label: 'A with a board' },
  { key: '2', name: '2', label: 'Board first' },
  { key: '3', name: '3', label: 'Calm A' },
] as const

export function Looks() {
  const [params, setParams] = useSearchParams()
  const look = (params.get('look') ?? '1') as (typeof looks)[number]['key']
  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-3 bg-background/85 px-1 pb-3 backdrop-blur">
        <p className="caps text-faint">Compare looks</p>
        <div className="flex flex-wrap gap-1 rounded-lg bg-surface p-1">
          {looks.map((l) => (
            <button
              key={l.key}
              onClick={() => setParams({ look: l.key })}
              className={cn(
                'flex h-8 items-center gap-2 rounded-md px-3 text-[13px] transition-colors',
                look === l.key ? 'bg-white text-black' : 'text-muted hover:text-foreground',
              )}
            >
              <span className="font-mono text-[11px] opacity-60">{l.name}</span>
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div key={look}>{{ a: <Dashboard />, b: <OperatorBoard />, c: <CalmToday />, '1': <MixOne />, '2': <MixTwo />, '3': <MixThree /> }[look]}</div>
    </div>
  )
}
