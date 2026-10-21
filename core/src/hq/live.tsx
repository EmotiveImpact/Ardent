import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { X } from 'lucide-react'
import { clock, jobStatus, longDate, operatorState, relative, trade as TRADE, window as timeWindow } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, RowButton, SectionHead } from '@/components/ardent/parts'
import { SendToScreen } from '@/components/send-to-screen'
import type { FirmSummary, HqNeed, LiveBoard, LiveJob, LiveVan } from '@/data/hq'
import { useNow } from '@/hooks/use-now'
import { cn } from '@/lib/utils'
import { useEvery, useHqQuery } from './data'
import { HqMap, type Picked } from './map'
import { Chip, Dot, Failed, isDone, isLive, jobTone, State, Tag, toneText, vanColour } from './parts'

/*
 * Live: the master map. Every job today and every van now across every firm,
 * with what needs a look beside it. Looks again every 20 seconds.
 */

export const SHOWS = [
  { key: 'all', label: 'Everything' },
  { key: 'live', label: 'Live now' },
  { key: 'booked', label: 'Booked' },
  { key: 'done', label: 'Done' },
  { key: 'emergency', label: 'Emergencies' },
] as const
export type Show = (typeof SHOWS)[number]['key']

export const emergencyOpen = (j: LiveJob) => j.priority === 'emergency' && !isDone(j.status)

export function fits(j: LiveJob, show: Show) {
  if (show === 'live') return isLive(j.status)
  if (show === 'booked') return j.status === 'booked'
  if (show === 'done') return isDone(j.status)
  if (show === 'emergency') return emergencyOpen(j)
  return true
}

/** The numbers across the top of the live map and the wall. */
export function counts(board: LiveBoard, firms: FirmSummary[]) {
  return {
    firmsLive: firms.filter((f) => f.stage === 'live').length,
    onShift: board.vans.filter((v) => v.state !== 'off_shift').length,
    engineers: firms.reduce((s, f) => s + f.engineers, 0),
    jobs: board.jobs.length,
    done: board.jobs.filter((j) => isDone(j.status)).length,
    onSite: board.jobs.filter((j) => j.status === 'on_site' || j.status === 'paused').length,
    onRoad: board.jobs.filter((j) => j.status === 'en_route').length,
    emergencies: board.jobs.filter(emergencyOpen).length,
  }
}

/** Firm and state filters, kept in the address so back, forward and the wall keep them. */
export function useLiveFilters() {
  const [params, setParams] = useSearchParams()
  const firmIds = (params.get('firm') ?? '').split(',').filter(Boolean)
  const show = (SHOWS.some((s) => s.key === params.get('show')) ? params.get('show') : 'all') as Show
  const vans = params.get('vans') !== 'off'
  const jobId = params.get('job') ?? undefined
  const vanId = params.get('van') ?? undefined
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }
  return { firmIds, show, vans, jobId, vanId, set, query: params.toString() }
}

export function Live() {
  const now = useNow(15_000)
  useEvery(20_000)
  const { data, error } = useHqQuery((hq) => Promise.all([hq.overview(), hq.live()]))
  const f = useLiveFilters()
  const navigate = useNavigate()
  const [overview, board] = data ?? []

  const inFirms = (x: { firmId: string }) => !f.firmIds.length || f.firmIds.includes(x.firmId)
  const firms = useMemo(() => overview?.firms ?? [], [overview])
  const shownFirms = firms.filter((x) => !f.firmIds.length || f.firmIds.includes(x.id))
  const jobs = (board?.jobs ?? []).filter((j) => inFirms(j) && fits(j, f.show))
  const vans = f.vans ? (board?.vans ?? []).filter(inFirms) : []
  const n = board && counts({ ...board, jobs: board.jobs.filter(inFirms), vans: board.vans.filter(inFirms) }, shownFirms)
  const picked: Picked | undefined = f.jobId ? { kind: 'job', id: f.jobId } : f.vanId ? { kind: 'van', id: f.vanId } : undefined
  const pick = (p?: Picked) => f.set({ job: p?.kind === 'job' ? p.id : undefined, van: p?.kind === 'van' ? p.id : undefined })
  const job = picked?.kind === 'job' ? board?.jobs.find((j) => j.id === picked.id) : undefined
  const van = picked?.kind === 'van' ? board?.vans.find((v) => v.id === picked.id) : undefined

  // What needs a look: the engine's list, then any flagged job it doesn't already cover.
  const needs: (HqNeed & { job?: LiveJob })[] = []
  if (overview && board) {
    for (const x of overview.needs) if (!x.firmId || inFirms({ firmId: x.firmId })) needs.push({ ...x, job: x.jobId ? board.jobs.find((j) => j.id === x.jobId) : undefined })
    for (const j of board.jobs.filter((j) => j.flag && inFirms(j) && !overview.needs.some((x) => x.jobId === j.id))) {
      needs.push({ id: `flag-${j.id}`, firmId: j.firmId, firmName: j.firmName, tone: emergencyOpen(j) ? 'bad' : 'warn', title: `${j.firmName}: ${j.title}`, note: `${j.flag}. ${j.area}.`, go: 'live', jobId: j.id, job: j })
    }
  }
  const openNeed = (x: HqNeed) => {
    if (x.jobId) return pick({ kind: 'job', id: x.jobId })
    if (x.go === 'firm' && x.firmId) return navigate(`/firms/${x.firmId}`)
    if (x.go === 'usage') return navigate(x.firmId ? `/firms/${x.firmId}?tab=usage` : '/usage')
    if (x.go === 'shared') return navigate('/shared')
    if (x.go === 'playbook') return navigate('/playbook')
  }
  const sorted = [...jobs].sort((a, b) => Number(!emergencyOpen(a)) - Number(!emergencyOpen(b)) || Number(!isLive(a.status)) - Number(!isLive(b.status)) || a.start.localeCompare(b.start))
  // Show the sheet as soon as something is picked, on the map or in a list.
  const sheet = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (picked) sheet.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [picked?.kind, picked?.id])
  const wallPath = `/wall${f.firmIds.length ? `?firm=${f.firmIds.join(',')}` : ''}`

  return (
    <div className="flex flex-col gap-4 pt-5 lg:h-[calc(100dvh-108px)] lg:min-h-[660px]">
      <PageBar crumbs={[{ label: 'Live' }, { label: 'Every firm' }]} />

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="cap flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ok" />
              <span className="relative size-1.5 rounded-full bg-ok" />
            </span>
            <span>Live</span>
            <span className="text-faint">·</span>
            <span>{longDate(new Date(now).toISOString())}</span>
            <span className="text-faint">·</span>
            <span className="text-foreground">{clock(new Date(now).toISOString())}</span>
            <span className="hidden text-faint sm:inline">· looks again every 20 seconds</span>
          </p>
          <h1 className="op-title mt-3 text-[26px] text-foreground sm:text-[32px]">Live</h1>
        </div>
        {n && (
          <dl className="grid w-full grid-cols-3 gap-x-5 gap-y-3 sm:w-auto sm:grid-cols-5 sm:gap-x-9">
            <Counter label="Firms live" value={n.firmsLive} />
            <Counter label="On shift" value={n.onShift} unit={`of ${n.engineers}`} />
            <Counter label="Jobs today" value={n.jobs} unit={`${n.done} done`} />
            <Counter label="On site now" value={n.onSite} unit={`${n.onRoad} on road`} />
            <Counter label="Emergencies" value={n.emergencies} tone={n.emergencies ? 'text-danger' : undefined} />
          </dl>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <div className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <Chip on={!f.firmIds.length} onClick={() => f.set({ firm: undefined })}>
            All firms
          </Chip>
          {firms.map((x) => (
            <Chip
              key={x.id}
              on={f.firmIds.includes(x.id)}
              count={board?.jobs.filter((j) => j.firmId === x.id).length}
              onClick={() => {
                const next = f.firmIds.includes(x.id) ? f.firmIds.filter((y) => y !== x.id) : [...f.firmIds, x.id]
                f.set({ firm: next.length && next.length < firms.length ? next.join(',') : undefined })
              }}
            >
              {x.name.split(' ')[0]}
            </Chip>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-line-strong xl:block" />
        <div className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {SHOWS.map((s) => (
            <Chip key={s.key} on={f.show === s.key} onClick={() => f.set({ show: s.key === 'all' ? undefined : s.key })} tone={s.key === 'emergency' ? 'danger' : s.key === 'live' ? 'ok' : undefined}>
              {s.label}
            </Chip>
          ))}
          <Chip on={f.vans} onClick={() => f.set({ vans: f.vans ? 'off' : undefined })}>
            Vans
          </Chip>
        </div>
      </div>

      <Failed error={error} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative h-[58vh] min-h-[340px] overflow-hidden rounded-[14px] bg-inset lg:h-auto">
          {board ? (
            <HqMap jobs={jobs} vans={vans} firms={shownFirms} picked={picked} onPick={pick} fitKey={`${f.firmIds.join(',')}|${f.show}`} controls={<SendToScreen path={wallPath} className="bg-[#0d0d0d]/90 backdrop-blur hover:bg-raised" />} />
          ) : (
            <div className="size-full animate-pulse bg-surface/40" />
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-3 [overflow-anchor:none] lg:overflow-y-auto lg:pr-1" aria-label="Beside the map">
          <div ref={sheet} className="flex scroll-mt-24 flex-col gap-3 empty:hidden">
          {job && <JobSheet job={job} board={board!} onClose={() => pick(undefined)} onPick={pick} />}
          {van && <VanSheet van={van} board={board!} onClose={() => pick(undefined)} onPick={pick} />}
          {picked && !job && !van && board && (
            <Card className="flex items-center justify-between gap-3 p-4 text-[13px] text-muted">
              That {picked.kind} is not on today's map any more.
              <button type="button" className="text-foreground hover:underline" onClick={() => pick(undefined)}>
                Clear
              </button>
            </Card>
          )}
          </div>

          <Card className="p-4">
            <SectionHead title={<>Needs a look <span className="text-faint">·</span> <span className="text-foreground">{overview ? needs.length : ''}</span></>} className="pb-1" />
            {overview && needs.length === 0 && <p className="py-4 text-[13px] text-muted">Nothing needs a look. Every firm's day is running.</p>}
            <ol className="rows">
              {needs.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => openNeed(x)} className="-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-[10px] px-2 py-3 text-left outline-none transition-colors hover:bg-raised focus-visible:bg-raised">
                    <Dot tone={x.tone === 'bad' || (x.job && emergencyOpen(x.job)) ? 'danger' : x.tone === 'warn' ? 'warn' : 'info'} className="mt-[7px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] leading-[20px]">{x.title}</span>
                      <span className="mt-0.5 block text-[12.5px] text-muted">{x.note}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-4">
            <SectionHead title={<>On the map <span className="text-faint">·</span> <span className="text-foreground">{board ? jobs.length : ''}</span></>} aside={SHOWS.find((s) => s.key === f.show)?.label} className="pb-1" />
            {board && jobs.length === 0 && <p className="py-4 text-[13px] text-muted">No jobs today match these filters.</p>}
            <ol className="rows">
              {sorted.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => pick({ kind: 'job', id: j.id })}
                    aria-current={picked?.kind === 'job' && picked.id === j.id ? 'true' : undefined}
                    className={cn('-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-[10px] px-2 py-2.5 text-left outline-none transition-colors hover:bg-raised focus-visible:bg-raised', picked?.kind === 'job' && picked.id === j.id && 'bg-raised')}
                  >
                    <Dot tone={jobTone(j)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px]">
                        <span className="font-mono text-[12px] text-muted">{j.ref}</span> {j.title}
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {j.firmName} · {j.area}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-[11px] text-muted">
                      {clock(j.start)}
                      <span className={cn('block', toneText[jobTone(j)])}>{emergencyOpen(j) ? 'EMERG' : jobStatus[j.status].label.toUpperCase()}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Counter({ label, value, unit, tone }: { label: string; value: number; unit?: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <dt className="cap truncate">{label}</dt>
      <dd className={cn('op-number text-[26px] whitespace-nowrap sm:text-[28px]', tone)}>
        {value}
        {unit && <span className="ml-1.5 font-mono text-[11px] text-muted sm:text-[12px]">{unit}</span>}
      </dd>
    </div>
  )
}

function SheetHead({ eyebrow, title, onClose }: { eyebrow: React.ReactNode; title: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="cap truncate">{eyebrow}</p>
        <h2 className="mt-2 text-[17px] leading-[23px] text-foreground">{title}</h2>
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-raised hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
        <X className="size-4" />
      </button>
    </div>
  )
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="rows">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2.5 text-[13.5px]">
          <dt className="cap pt-0.5">{k}</dt>
          <dd className="min-w-0 break-words text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const reportWord = { draft: 'Started, not signed yet', signed: 'Signed off' } as const

/** One job from the map, as far as the master board knows it. */
function JobSheet({ job, board, onClose, onPick }: { job: LiveJob; board: LiveBoard; onClose: () => void; onPick: (p: Picked) => void }) {
  const vansOn = board.vans.filter((v) => v.jobId === job.id)
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SheetHead eyebrow={<>{job.firmName}</>} title={<><span className="font-mono text-[15px] text-muted">{job.ref}</span> {job.title}</>} onClose={onClose} />
      <div className="flex flex-wrap items-center gap-2">
        <State tone={jobTone(job)}>{jobStatus[job.status].label}</State>
        {job.priority === 'emergency' && <Tag tone="danger">Emergency</Tag>}
        {job.priority === 'high' && <Tag tone="warn">High</Tag>}
        <Tag>{TRADE[job.trade] ?? job.trade}</Tag>
      </div>
      {job.flag && <p className={cn('rounded-[10px] bg-inset px-3.5 py-2.5 text-[13px]', emergencyOpen(job) ? 'text-danger' : 'text-warn')}>{job.flag}</p>}
      <Facts
        rows={[
          ['Window', timeWindow(job.start, job.end)],
          [
            'Engineers',
            job.operators.length ? (
              <span className="flex flex-col gap-1">
                {job.operators.map((o) => {
                  const v = vansOn.find((x) => x.id === o.id) ?? board.vans.find((x) => x.id === o.id)
                  return (
                    <button key={o.id} type="button" onClick={() => v && onPick({ kind: 'van', id: v.id })} disabled={!v} className="flex items-center gap-2 text-left hover:underline disabled:no-underline">
                      <span className="font-mono text-[11px] text-muted">{o.initials}</span> {o.name}
                      {v && <span className="text-[12px]" style={{ color: vanColour[v.state] }}>{operatorState[v.state].label}{v.etaMinutes ? `, ${v.etaMinutes} min` : ''}</span>}
                    </button>
                  )
                })}
              </span>
            ) : (
              <span className="text-warn">Nobody yet</span>
            ),
          ],
          ['Area', job.area],
          ['Address', job.address],
          ['Customer', job.customer || <span className="text-muted">Not given</span>],
          ['Report', job.report ? reportWord[job.report] : <span className="text-muted">None yet</span>],
        ]}
      />
      <div className="flex flex-wrap gap-2 pt-1">
        <RowButton to={`/firms/${job.firmId}?tab=jobs&job=${encodeURIComponent(job.id)}`}>Open firm</RowButton>
      </div>
      <p className="text-[12px] text-faint">Opening a firm's account is recorded in its log.</p>
    </Card>
  )
}

const fromWord = { van: "From the engineer's phone", job: 'Placed at the job it is on', base: 'On standby from home or the yard' } as const

function VanSheet({ van, board, onClose, onPick }: { van: LiveVan; board: LiveBoard; onClose: () => void; onPick: (p: Picked) => void }) {
  const job = van.jobId ? board.jobs.find((j) => j.id === van.jobId) : undefined
  return (
    <Card className="flex flex-col gap-3 p-5">
      <SheetHead eyebrow={van.firmName} title={van.name} onClose={onClose} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 text-[13px]">
          <span className="size-[7px] rounded-full" style={{ background: vanColour[van.state] }} />
          {operatorState[van.state].label}
          {van.etaMinutes ? `, ${van.etaMinutes} min away` : ''}
        </span>
      </div>
      <Facts
        rows={[
          [
            'On',
            job ? (
              <button type="button" onClick={() => onPick({ kind: 'job', id: job.id })} className="text-left hover:underline">
                <span className="font-mono text-[12px] text-muted">{job.ref}</span> {job.title}
              </button>
            ) : (
              <span className="text-muted">No job right now</span>
            ),
          ],
          ...(job ? ([['Where', job.area]] as [string, React.ReactNode][]) : []),
          ['Position', fromWord[van.from]],
          ...(van.seenAt ? ([['Last seen', relative(van.seenAt)]] as [string, React.ReactNode][]) : []),
        ]}
      />
      <div className="flex flex-wrap gap-2 pt-1">
        <RowButton to={`/firms/${van.firmId}?tab=crew`}>Open firm</RowButton>
      </div>
      <p className="text-[12px] text-faint">Opening a firm's account is recorded in its log.</p>
    </Card>
  )
}
