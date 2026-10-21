import { useCallback, useEffect, useState } from 'react'
import { demoPeople } from '@engine/connect.ts'
import { Card, Initials, RowButton, SectionHead, StateDot } from '@/components/ardent/parts'
import { Pill } from '@/components/ardent/book-parts'
import { useArdent, type Book } from '@/data/ardent'
import type { DeclineReason, Job, JobOffer, JobRequest } from '@/data/model'
import { useNow } from '@/hooks/use-now'
import { act } from '@/lib/act'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/*
 * Asking the crew who can take a job, and watching the answers come in: who
 * it's with now and how long they've got, who passed and why, who couldn't
 * be asked. The engine moves it on as offers run out; this looks every few
 * seconds while a request is open.
 */

const LOOK_MS = 3000
const REASON: Record<DeclineReason, string> = { on_a_job: 'On a job', too_far: 'Too far', cant_today: "Can't today" }
const MODES: { key: JobRequest['mode']; label: string; note: string }[] = [
  { key: 'one', label: 'One at a time', note: 'Nearest first, staff before freelancers. 45 seconds each, then the next.' },
  { key: 'all', label: 'Everyone at once', note: 'Everyone who can go sees it together. First to hold accept gets it.' },
]
const first = (name: string) => name.split(' ')[0]

/** The job's requests, newest first, kept current while one is open. */
function useRequests(jobId: string) {
  const { client, version } = useArdent()
  const [rows, setRows] = useState<JobRequest[]>()
  const load = useCallback(() => client.requests.list({ jobId, open: false }).then((r) => setRows([...r].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))), [client, jobId])
  useEffect(() => {
    void load().catch(() => undefined)
  }, [load, version])
  const open = rows?.[0]?.status === 'open'
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => void load().catch(() => undefined), LOOK_MS)
    return () => clearInterval(id)
  }, [open, load])
  return { rows, load }
}

/** Show the board when the job still needs someone, or has been asked about. */
export function wantsRequest(job: Job) {
  return !['complete', 'invoiced', 'paid', 'cancelled'].includes(job.status)
}

export function RequestBoard({ job, book }: { job: Job; book: Book }) {
  const { client } = useArdent()
  const { rows } = useRequests(job.id)
  const [mode, setMode] = useState<JobRequest['mode']>('one')
  const [busy, setBusy] = useState(false)
  const latest = rows?.[0]
  if (!rows) return null
  if (!latest && job.operatorIds.length) return null

  const ask = async () => {
    setBusy(true)
    await act(client.requests.create(job.id, { mode }), (r) => (r.status === 'open' ? `Asking the crew about ${job.ref}` : `No one can be asked about ${job.ref}`))
    setBusy(false)
  }
  const callOff = () => void act(client.requests.withdraw(latest!.id), 'Called off')
  const open = latest?.status === 'open'
  const askAgain = !open && (latest?.status !== 'filled' || !job.operatorIds.length)

  return (
    <Card aria-label="Job request" className="flex flex-col gap-4 p-[22px]">
      <SectionHead
        title={
          <>
            {open && <StateDot tone="warn" className="animate-pulse" />}
            {latest ? 'Job request' : 'Find someone'}
          </>
        }
        aside={latest ? <Summary req={latest} book={book} /> : 'Nobody on this job yet'}
        className="pb-0"
      />
      {latest && <Offers req={latest} book={book} />}
      {latest && latest.skipped.length > 0 && <Skipped req={latest} book={book} />}
      {(!latest || askAgain) && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="How to ask">
            {MODES.map((m) => (
              <Pill key={m.key} on={mode === m.key} onClick={() => setMode(m.key)}>
                {m.label}
              </Pill>
            ))}
          </div>
          <p className="text-[13px] leading-[19px] text-muted">{MODES.find((m) => m.key === mode)!.note} Only those with the trade and in-date papers are asked. It shows on their phone while Ardent Field is open.</p>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void ask()}
              className="inline-flex h-10 items-center rounded-lg bg-ember px-4 text-[13px] font-medium text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              {latest ? 'Ask the crew again' : 'Ask the crew'}
            </button>
          </div>
        </div>
      )}
      {open && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-[13px] text-muted">{latest.mode === 'one' ? 'One at a time, nearest first.' : 'Sent to everyone at once.'} First to accept goes on the job.</p>
          <RowButton onClick={callOff}>Call it off</RowButton>
        </div>
      )}
    </Card>
  )
}

function Summary({ req, book }: { req: JobRequest; book: Book }) {
  if (req.status === 'filled') return <span className="text-ok">Taken by {find(book.operators, req.filledBy)?.name ?? 'the crew'}</span>
  if (req.status === 'unfilled') return <span className="text-danger">No one took it</span>
  if (req.status === 'withdrawn') return <span>Called off</span>
  const asked = req.offers.filter((o) => o.status !== 'waiting').length
  return (
    <span className="font-mono text-[12px]">
      {asked} of {req.offers.length} asked
    </span>
  )
}

function Offers({ req, book }: { req: JobRequest; book: Book }) {
  const now = useNow(req.status === 'open' ? 250 : 60_000)
  if (!req.offers.length) return <p className="text-[13px] text-muted">There was no one to ask. See why below.</p>
  return (
    <ol className="flex flex-col">
      {req.offers.map((o, i) => (
        <OfferRow key={o.operatorId} o={o} req={req} book={book} now={now} first={i === 0} />
      ))}
    </ol>
  )
}

function offerWords(o: JobOffer, now: number) {
  switch (o.status) {
    case 'offered': {
      const left = Math.max(0, Math.ceil((Date.parse(o.expiresAt!) - now) / 1000))
      return { text: `On their phone, ${left}s left`, cls: 'text-foreground', left }
    }
    case 'waiting':
      return { text: 'Next in line', cls: 'text-faint' }
    case 'accepted':
      return { text: 'Accepted', cls: 'text-ok' }
    case 'declined':
      return { text: o.reason ? `Passed: ${REASON[o.reason]}` : 'Passed', cls: 'text-muted' }
    case 'expired':
      return { text: 'Missed it', cls: 'text-muted' }
    default:
      return { text: 'Closed', cls: 'text-faint' }
  }
}

function OfferRow({ o, req, book, now, first: top }: { o: JobOffer; req: JobRequest; book: Book; now: number; first: boolean }) {
  const op = find(book.operators, o.operatorId)
  const w = offerWords(o, now)
  const away = [o.minutes !== undefined ? `${o.minutes} MIN` : '', o.miles !== undefined ? `${o.miles} MI` : ''].filter(Boolean).join(' · ')
  return (
    <li className={cn('flex items-center gap-3.5 py-3', !top && 'shadow-[inset_0_1px_0_var(--line)]')}>
      <Initials className="size-10 rounded-[10px] bg-background font-display text-[11px] tracking-[.14em]">{op?.initials ?? '?'}</Initials>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-[15px]">
          {op?.name ?? 'Someone'}
          {op?.role === 'freelance' && <span className="cap text-[11px] text-muted">Freelance</span>}
          {op?.role === 'subcontractor' && <span className="cap text-[11px] text-muted">Subbie</span>}
        </span>
        <span className={cn('text-[13px]', w.cls)}>{w.text}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        {away && <span className="font-mono text-[11px] text-muted">{away}</span>}
        {o.status === 'offered' && w.left !== undefined && (
          <span className="h-1 w-24 overflow-hidden rounded-full bg-raised" aria-hidden>
            <span className={cn('block h-full rounded-full', w.left <= 10 ? 'bg-warn' : 'bg-foreground')} style={{ width: `${(w.left / req.wait) * 100}%` }} />
          </span>
        )}
        {o.status === 'offered' && op && <DemoAnswer req={req} name={op.name} />}
      </span>
    </li>
  )
}

/** Demo only: play the engineer's phone from here, since there's no phone. */
function DemoAnswer({ req, name }: { req: JobRequest; name: string }) {
  const { demoAs } = useArdent()
  const email = demoPeople.find((p) => p.name === name)?.email
  if (!demoAs || !email) return null
  const as = () => demoAs(email)
  return (
    <span className="flex gap-1.5">
      <button type="button" className="rounded-md bg-raised px-2 py-1 text-[11.5px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60" onClick={() => void act(as().requests.respond(req.id, 'decline', 'too_far'), `${first(name)} passed`)}>
        Pass as {first(name)}
      </button>
      <button type="button" className="rounded-md bg-raised px-2 py-1 text-[11.5px] text-foreground outline-none hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60" onClick={() => void act(as().requests.respond(req.id, 'accept'), `${first(name)} took it`)}>
        Accept as {first(name)}
      </button>
    </span>
  )
}

function Skipped({ req, book }: { req: JobRequest; book: Book }) {
  return (
    <details className="group text-[13px]">
      <summary className="cursor-pointer list-none rounded text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
        Not asked: {req.skipped.length} <span className="text-faint group-open:hidden">(show why)</span>
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {req.skipped.map((s) => (
          <li key={s.operatorId} className="flex justify-between gap-4">
            <span>{find(book.operators, s.operatorId)?.name ?? 'Someone'}</span>
            <span className="text-faint">{s.why}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
