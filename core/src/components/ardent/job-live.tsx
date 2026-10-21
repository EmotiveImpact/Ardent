import { clock, pounds, totals } from '@kit'
import { useQuery, type Book } from '@/data/ardent'
import type { Job } from '@/data/model'
import { useNow } from '@/hooks/use-now'
import { find, jobContext } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { Card, ChecksRow, RowButton, StageTrack, StepRings, type Step } from './parts'

/** Everything the crew have sent in for one job: time, photos, notes, signatures. */
export function useJobField(jobId: string | undefined) {
  return useQuery(
    async (c) => {
      if (!jobId) return undefined
      const [time, photos, notes, signatures] = await Promise.all([c.time.forJob(jobId), c.photos.forJob(jobId), c.notes.forJob(jobId), c.signatures.forJob(jobId)])
      return { time, photos, notes, signatures }
    },
    [jobId],
  )
}

export type JobField = NonNullable<ReturnType<typeof useJobField>['data']>

const past = (s: Job['status']) => ['complete', 'invoiced', 'paid'].includes(s)

/**
 * The job's steps, worked out from what the van has actually sent in:
 * set off, arrived, checks, photos, sign-off.
 */
export function jobSteps(job: Job, book: Book, field?: JobField): Step[] {
  const { customer } = jobContext(job, book)
  const first = <T,>(xs: T[], at: (x: T) => string) => [...xs].sort((a, b) => at(a).localeCompare(at(b)))[0]
  const travel = first(field?.time.filter((t) => t.kind === 'travel') ?? [], (t) => t.start)
  const labour = first(field?.time.filter((t) => t.kind === 'labour') ?? [], (t) => t.start)
  const checksLeft = job.checks.filter((c) => c.state === 'pending' || c.state === 'fail').length
  const after = field?.photos.filter((p) => p.stage === 'after') ?? []
  const sig = field?.signatures[0]
  const lastCheck = job.checks.length ? `${job.checks.length - checksLeft} of ${job.checks.length}` : undefined
  const raw: [string, boolean, string | undefined][] = [
    ['Set off', !!travel || ['on_site', 'paused'].includes(job.status) || past(job.status), travel && clock(travel.start)],
    ['Arrived on site', !!labour || past(job.status), labour && clock(labour.start)],
    [job.checks.length ? `Checks, ${lastCheck} done` : 'Checks', job.checks.length > 0 && checksLeft === 0, undefined],
    [`Photos${field?.photos.length ? `, ${field.photos.length} in` : ''}`, after.length > 0, after[0] && clock(after[0].takenAt)],
    [`Sign-off with ${customer?.name.split(' ')[0] ?? 'the customer'}`, !!sig || past(job.status), sig && clock(sig.at)],
  ]
  const active = ['en_route', 'on_site', 'paused'].includes(job.status)
  const live = active ? raw.findIndex(([, done]) => !done) : -1
  return raw.map(([title, done, time], i) => ({ title, time, state: done ? 'done' : i === live ? 'live' : 'next' }))
}

/** The big clock: time on the tools since they arrived, ticking. */
export function OnSiteClock({ job, field, className }: { job: Job; field?: JobField; className?: string }) {
  const now = useNow()
  const labour = field?.time.filter((t) => t.kind === 'labour').sort((a, b) => a.start.localeCompare(b.start))[0]
  const from = Date.parse(labour?.start ?? job.start)
  const ms = Math.max(0, now - from)
  const s = Math.floor(ms / 1000)
  const text = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':')
  return (
    <span className={cn('op-number text-ember', className)} role="timer" aria-label={`On site for ${Math.floor(s / 3600)} hours ${Math.floor(s / 60) % 60} minutes`}>
      {text}
    </span>
  )
}

/** Today's job sheet: whose job, where, the clock, the line, the steps and the checks. */
export function LiveJobSheet({ job, book }: { job: Job; book: Book }) {
  const { data: field } = useJobField(job.id)
  const { customer, site, crew } = jobContext(job, book)
  const lead = crew[0]
  const onSite = job.status === 'on_site' || job.status === 'paused'
  const quote = book.quotes.find((q) => q.jobId === job.id && q.status !== 'declined')
  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        <p className="cap">
          {lead ? `${lead.name.split(' ')[0]}'s job` : 'Nobody on it yet'} <span className="text-faint">·</span> {job.ref}
        </p>
        <h3 className="mt-2.5 text-[17px]">{job.title}</h3>
        <p className="mt-1 text-[13px] text-muted">
          {customer?.name}, {site?.line1}, {site?.postcode}
        </p>
      </div>
      {onSite ? (
        <p className="flex items-baseline gap-3">
          <OnSiteClock job={job} field={field} className="text-[44px] sm:text-[52px]" />
          <span className="cap">{job.status === 'paused' ? 'On hold' : 'On site'}</span>
        </p>
      ) : (
        <p className="flex items-baseline gap-3">
          <span className="op-number text-[44px]">{clock(job.start)}</span>
          <span className="cap">{job.status === 'en_route' ? `On the road${lead?.etaMinutes ? `, ${lead.etaMinutes} min away` : ''}` : past(job.status) ? 'Done' : 'Booked for'}</span>
        </p>
      )}
      <StageTrack job={job} />
      <StepRings steps={jobSteps(job, book, field)} />
      <ChecksRow job={job} />
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="cap">
          {quote ? `Quoted ${pounds(totals({ lines: quote.lines }).total, { always: true })}` : `Priced ${pounds(totals(job).total, { always: true })}`}
          <span className="ml-4">{field?.photos.length ?? 0} photos</span>
        </p>
        <div className="flex gap-2">
          {customer?.phone && <RowButton onClick={() => (window.location.href = `tel:${customer.phone.replace(/\s/g, '')}`)}>Call {customer.name.split(' ')[0]}</RowButton>}
          <RowButton to={`/jobs/${job.id}`}>Open job</RowButton>
        </div>
      </div>
    </Card>
  )
}

/** Crew tiles under the map: who, what they're doing, which job. */
export function CrewTiles({ book, onPick, picked }: { book: Book; onPick?: (jobId: string) => void; picked?: string }) {
  const word: Record<string, [string, 'ok' | 'info' | 'warn' | 'faint']> = {
    on_site: ['On site', 'ok'],
    en_route: ['On the road', 'info'],
    delayed: ['Held up', 'warn'],
    on_call: ['In the yard', 'faint'],
    workshop: ['In the workshop', 'faint'],
    off_shift: ['Off today', 'faint'],
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {book.operators.map((o) => {
        const job = find(book.jobs, o.currentJobId)
        const [w, tone] = word[o.state] ?? ['', 'faint']
        const detail = o.state === 'delayed' && o.etaMinutes ? `${w}, ${o.etaMinutes} min late` : o.state === 'en_route' && o.etaMinutes ? `${w}, ${o.etaMinutes} min away` : w
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => job && onPick?.(job.id)}
            className={cn('flex items-center gap-3 rounded-[12px] bg-surface px-3.5 py-3 text-left outline-none transition-colors hover:bg-[#161616] focus-visible:ring-2 focus-visible:ring-ring/60', picked && job?.id === picked && 'bg-raised hover:bg-raised')}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-raised font-mono text-[11px]">{o.initials}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px]">{o.name}</span>
                <span className="font-mono text-[11px] text-muted">{job?.ref}</span>
              </span>
              <span className="mt-1 flex items-center gap-2 text-[12.5px] text-muted">
                <span className={cn('size-[7px] shrink-0 rounded-full', { ok: 'bg-ok', info: 'bg-info', warn: 'bg-warn', faint: 'bg-[#6b6b6b]' }[tone])} />
                <span className="truncate">{detail}</span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

