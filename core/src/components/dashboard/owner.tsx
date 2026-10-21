import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { X } from 'lucide-react'
import { jobStatus, operatorState, pounds, relative, shortDate, trade as TRADE, window as timeWindow } from '@kit'
import { Card, Readout, RowButton, SectionHead } from '@/components/ardent/parts'
import { capDate, capDay, isLate } from '@/components/ardent/money-lib'
import { SendToScreen } from '@/components/send-to-screen'
import { useQuery, type Book } from '@/data/ardent'
import type { LiveBoard, LiveJob, LiveVan } from '@/data/hq'
import type { ActionEntry, Approval, PaymentsOverview, ServicePlan } from '@/data/model'
import { HqMap, type Picked } from '@/hq/map'
import { Chip, Dot, isDone, isLive, jobTone, State, Tag, toneText, vanColour } from '@/hq/parts'
import { emergencyOpen, fits, SHOWS, useLiveFilters } from '@/hq/show'
import { useNow } from '@/hooks/use-now'
import { addDays, find, invoiceOwed, invoiceTotal, jobNet, today, weekStart } from '@/lib/jobs'
import type { Need } from '@/lib/needs'
import { AGE_LABELS, ardentWeek, boardOf, cashIn, crewRows, first, inMonth, invoicedIn, invoicedLastMonthToDate, LATE_FLOOR, lastMonths, latePayers, money, monthWeeks, owedByAge, quoteFigures, quotesWonByWeek, say, stalePhones, thisMonth } from '@/lib/owner'
import { cn } from '@/lib/utils'

/*
 * The owner's Today: the firm's own live map, drawn the way Ardent HQ draws
 * every firm's, with what needs a look beside it; the month in money; the
 * crew's month; and what's coming. Everything here is worked out from the
 * firm's own records: nothing is estimated.
 */

const ALL_APPROVALS: Approval['status'][] = ['waiting', 'approved', 'rejected', 'stale']

export interface OwnerExtras {
  payments?: PaymentsOverview
  plans: ServicePlan[]
  approvals: Approval[]
  log: ActionEntry[]
}

/** Something on the owner's map side that wants a look, with where to deal with it. */
export interface Look {
  id: string
  tone: 'danger' | 'warn' | 'info'
  title: string
  note: string
  action: string
  to: string
  /** Picks it out on the map. */
  jobId?: string
}

/** Everything the owner's view reads beyond the book. Skipped for everyone else. */
export function useOwner(book: Book | undefined, needs: Need[] | undefined, firm: { id: string; name: string } | undefined) {
  const on = !!firm
  const now = useNow(30_000)
  const { data: extras } = useQuery(
    (c) =>
      on
        ? Promise.all([c.payments.get().catch(() => undefined), c.plans.list().catch(() => []), c.approvals.list({ status: ALL_APPROVALS }).catch(() => []), c.log.list({ limit: 300 }).catch(() => [])]).then(
            ([payments, plans, approvals, log]) => ({ payments, plans, approvals, log }) as OwnerExtras,
          )
        : Promise.resolve(undefined),
    [on],
  )
  const board = useMemo(() => (book && firm ? boardOf(book, firm, now) : undefined), [book, firm?.id, firm?.name, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const look = book && board && needs ? needsALook(book, board, needs, extras) : undefined
  return { extras, board, look }
}

/**
 * For one firm, what HQ would flag on its map: emergencies nobody has reached,
 * running late or over, phones gone quiet, plus the money and papers the
 * owner has to move. Built on the same "Needs you" list as the bell.
 */
export function needsALook(book: Book, board: LiveBoard, needs: Need[], extras?: OwnerExtras): Look[] {
  const out: Look[] = []
  const stale = stalePhones(book.operators)

  for (const j of board.jobs.filter((x) => x.flag && x.flag !== "Engineer's phone not syncing")) {
    out.push({
      id: `flag_${j.id}`,
      tone: emergencyOpen(j) ? 'danger' : j.status === 'paused' ? 'info' : 'warn',
      title: `${j.title}, ${j.ref}`,
      note: `${j.flag}. ${j.area}.`,
      action: 'Open',
      to: `/jobs/${j.id}`,
      jobId: j.id,
    })
  }
  for (const o of stale) {
    out.push({
      id: `sync_${o.id}`,
      tone: 'warn',
      title: `${first(o.name)}'s phone hasn't synced since ${new Date(o.location!.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`,
      note: 'Their place on the map may be out of date. Give them a ring.',
      action: 'Crew',
      to: '/crew',
      jobId: o.currentJobId,
    })
  }

  const flagged = new Set(board.jobs.filter((j) => j.flag).map((j) => j.id))
  const lateCerts = needs.filter((n) => n.id.startsWith('att_cert_'))
  for (const n of needs) {
    if (n.id.startsWith('un_')) {
      const id = n.id.slice(3)
      if (flagged.has(id)) continue
      out.push({
        id: n.id,
        tone: n.tone === 'warn' ? 'warn' : 'info',
        title: n.title,
        note: n.meta.join(', '),
        action: n.action,
        to: n.to,
        jobId: board.jobs.some((j) => j.id === id) ? id : undefined,
      })
    } else if (n.id.startsWith('att_job_')) {
      const id = n.id.slice(8)
      if (flagged.has(id)) continue
      out.push({
        id: n.id,
        tone: 'warn',
        title: n.title,
        note: n.meta.join(', '),
        action: n.action,
        to: n.to,
        jobId: id,
      })
    } else if (n.id.startsWith('att_inv_')) {
      const inv = find(book.invoices, n.id.slice(8))
      if (!inv || invoiceOwed(inv) < LATE_FLOOR) continue
      out.push({
        id: n.id,
        tone: 'warn',
        title: n.title,
        note: `${inv.ref}, due ${shortDate(inv.dueAt!)}`,
        action: n.action,
        to: n.to,
      })
    } else if (n.id.startsWith('att_reg_') && n.tone === 'danger') {
      out.push({
        id: n.id,
        tone: 'danger',
        title: n.title,
        note: `${n.meta.join(', ')}. They can't sign that work off until it's renewed.`,
        action: n.action,
        to: n.to,
      })
    } else if (n.id === 'approvals') {
      out.push({
        id: n.id,
        tone: 'info',
        title: n.title,
        note: `${n.meta.join(', ')}. Nothing goes out without your yes.`,
        action: n.action,
        to: n.to,
      })
    }
  }
  if (lateCerts.length > 2) {
    const oldest = [...book.certificates].filter((c) => c.state === 'overdue').sort((a, b) => a.expires.localeCompare(b.expires))[0]
    const site = find(book.sites, oldest?.siteId)
    out.push({
      id: 'certs',
      tone: 'danger',
      title: `${lateCerts.length} certificates have run out`,
      note: oldest ? `The oldest: ${oldest.kind} at ${site?.line1 ?? 'a site'}, ${shortDate(oldest.expires)}.` : 'Book the visits in.',
      action: 'Look',
      to: '/certificates',
    })
  } else {
    for (const n of lateCerts)
      out.push({
        id: n.id,
        tone: 'danger',
        title: n.title,
        note: n.meta.join(', '),
        action: n.action,
        to: n.to,
      })
  }

  for (const d of extras?.payments?.disputes.filter((x) => x.status === 'needs_reply') ?? []) {
    out.push({
      id: `dsp_${d.id}`,
      tone: 'danger',
      title: `A customer disputed ${pounds(d.amount)} with their bank`,
      note: `${d.reason}. Reply by ${shortDate(d.replyBy)}; the evidence is ready.`,
      action: 'Reply',
      to: '/money',
    })
  }
  for (const p of extras?.plans.filter((x) => x.status === 'payment_failed') ?? []) {
    const who = find(book.customers, p.customerId)
    out.push({
      id: `dd_${p.id}`,
      tone: 'warn',
      title: `${who?.name ?? 'A customer'}'s Direct Debit failed`,
      note: `${p.ref}, ${pounds(p.monthly)} a month${p.lastFailedAt ? `, failed ${shortDate(p.lastFailedAt)}` : ''}.`,
      action: 'Look',
      to: '/money',
    })
  }

  const rank = { danger: 0, warn: 1, info: 2 }
  return out.sort((a, b) => rank[a.tone] - rank[b.tone])
}

/** The day and the money in one sentence, for the owner. */
export function ownerSummary(book: Book, extras: OwnerExtras | undefined, look: number, greeting: string, name?: string) {
  const month = thisMonth()
  const cash = cashIn(book, extras?.payments?.charges)
    .filter((x) => inMonth(x.at, month))
    .reduce((s, x) => s + x.amount, 0)
  const owed = book.invoices.filter((i) => ['sent', 'part_paid', 'overdue'].includes(i.status)).reduce((s, i) => s + invoiceOwed(i), 0)
  const bits = [cash ? `${money(cash)} in this month` : 'Nothing in yet this month', `${money(owed)} owed`, look ? `${say(look).toLowerCase()} ${look === 1 ? 'thing needs' : 'things need'} a look` : 'nothing needs a look']
  const last = bits.pop()
  return `${greeting}${name ? `, ${name}` : ''}. ${bits.join(', ')}, and ${last}.`
}

export function OwnerView({ book, board, look, extras, clock, wall }: { book: Book; board: LiveBoard; look: Look[]; extras?: OwnerExtras; clock?: ReactNode; wall?: boolean }) {
  return (
    <>
      <MonthReadouts book={book} extras={extras} />
      <LiveMap book={book} board={board} look={look} clock={clock} wall={wall} />
      <CrewMonth book={book} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ComingUp book={book} extras={extras} />
        {extras && <ArdentsWeek book={book} extras={extras} />}
      </div>
    </>
  )
}

/* ---------- The business, this month ---------- */

const wc = (w: string) => `w/c ${shortDate(w)}`
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'Europe/London' }).replace('Sept', 'Sep')

function MonthReadouts({ book, extras }: { book: Book; extras?: OwnerExtras }) {
  const month = thisMonth()
  const weeks = monthWeeks()
  const sum = (list: { amount: number }[]) => list.reduce((s, x) => s + x.amount, 0)

  const invoiced = invoicedIn(book, month)
  const invoicedTotal = invoiced.reduce((s, i) => s + invoiceTotal(i), 0)
  const lastMonth = invoicedLastMonthToDate(book)

  const cash = cashIn(book, extras?.payments?.charges)
  const cashMonth = cash.filter((x) => inMonth(x.at, month))
  const fromPlans = sum(cashMonth.filter((x) => x.through === 'plan'))
  const cashWeek = (w: string) => sum(cashMonth.filter((x) => weekStart(today(Date.parse(x.at))) === w))

  const owing = book.invoices.filter((i) => ['sent', 'part_paid', 'overdue'].includes(i.status))
  const owed = owing.reduce((s, i) => s + invoiceOwed(i), 0)
  const late = owing.filter((i) => isLate(i)).reduce((s, i) => s + invoiceOwed(i), 0)

  const q = quoteFigures(book)
  const qWeeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today()), (i - 7) * 7))

  const months = lastMonths(8)
  const average = (m: string) => {
    const list = invoicedIn(book, m)
    return list.length ? list.reduce((s, i) => s + invoiceTotal(i), 0) / list.length : 0
  }
  const avg = invoiced.length ? invoicedTotal / invoiced.length : 0

  return (
    <section aria-label="The business, this month">
      <SectionHead
        title={
          <>
            The business <span className="text-faint">·</span>{' '}
            {new Date().toLocaleDateString('en-GB', {
              month: 'long',
              timeZone: 'Europe/London',
            })}
          </>
        }
        aside="Money is with VAT, from your invoices and payments"
      />
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Readout
          index={0}
          label="Work invoiced"
          count={invoicedTotal}
          format={money}
          bars={weeks.map((w) => invoicedIn(book, month, w).reduce((s, i) => s + invoiceTotal(i), 0))}
          labels={weeks.map(wc)}
          barFormat={money}
          note={`${money(lastMonth)} by this day in ${monthName(lastMonths(2)[0])}`}
          action={{ label: 'Money', to: '/money' }}
        />
        <Readout
          index={1}
          label="Cash in"
          count={sum(cashMonth)}
          format={money}
          bars={weeks.map(cashWeek)}
          labels={weeks.map(wc)}
          barFormat={money}
          note={cashMonth.length ? (fromPlans ? `${cashMonth.length} in, ${money(fromPlans)} from plans` : `${cashMonth.length} ${cashMonth.length === 1 ? 'payment' : 'payments'}`) : 'Nothing paid in yet'}
          action={{ label: 'Payments', to: '/money' }}
        />
        <Readout index={2} label="Owed to you" count={owed} format={money} bars={owedByAge(book)} labels={AGE_LABELS} barFormat={money} note={late ? `${money(late)} of it late` : 'Nothing late'} action={{ label: 'Chase', to: '/money' }} />
        {q.rate !== undefined ? (
          <Readout
            index={3}
            label="Quotes won"
            count={q.rate}
            unit="%"
            bars={quotesWonByWeek(book, qWeeks)}
            labels={qWeeks.map(wc)}
            barFormat={(n) => `${n} won`}
            note={`${q.won} of ${q.answered} won, ${money(q.outValue)} out`}
            action={{ label: 'Quotes', to: '/money?tab=quotes' }}
          />
        ) : (
          <Readout index={3} label="Quotes won" value="--" bars={quotesWonByWeek(book, qWeeks)} labels={qWeeks.map(wc)} barFormat={(n) => `${n} won`} note={`None answered, ${money(q.outValue)} out`} action={{ label: 'Quotes', to: '/money?tab=quotes' }} />
        )}
        <Readout
          index={4}
          label="Average job"
          count={avg}
          format={money}
          bars={months.map(average)}
          labels={months.map(monthName)}
          barFormat={money}
          note={invoiced.length ? `Across ${invoiced.length} ${invoiced.length === 1 ? 'invoice' : 'invoices'}` : 'Nothing invoiced yet'}
          action={{ label: 'Jobs', to: '/jobs' }}
        />
      </div>
    </section>
  )
}

/* ---------- The live map ---------- */

function LiveMap({ book, board, look, clock, wall }: { book: Book; board: LiveBoard; look: Look[]; clock?: ReactNode; wall?: boolean }) {
  const f = useLiveFilters()
  const jobs = board.jobs.filter((j) => fits(j, f.show))
  const vans = f.vans ? board.vans : []
  const picked: Picked | undefined = f.jobId ? { kind: 'job', id: f.jobId } : f.vanId ? { kind: 'van', id: f.vanId } : undefined
  const pick = (p?: Picked) =>
    f.set({
      job: p?.kind === 'job' ? p.id : undefined,
      van: p?.kind === 'van' ? p.id : undefined,
    })
  const job = picked?.kind === 'job' ? board.jobs.find((j) => j.id === picked.id) : undefined
  const van = picked?.kind === 'van' ? board.vans.find((v) => v.id === picked.id) : undefined
  const done = board.jobs.filter((j) => isDone(j.status)).length
  const live = board.jobs.filter((j) => isLive(j.status)).length

  const sheet = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (picked) sheet.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [picked?.kind, picked?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="Live map" className="flex flex-col gap-3">
      <SectionHead
        title={
          <>
            Live <span className="text-faint">·</span> {board.jobs.length} {board.jobs.length === 1 ? 'job' : 'jobs'} today
          </>
        }
        aside={!wall && `${done} done, ${live} under way, ${board.vans.length} on shift. Pick a job or a van to open it`}
        className="pb-0"
      />
      <div className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Show on the map">
        {SHOWS.map((s) => (
          <Chip key={s.key} on={f.show === s.key} onClick={() => f.set({ show: s.key === 'all' ? undefined : s.key })} tone={s.key === 'emergency' ? 'danger' : s.key === 'live' ? 'ok' : undefined} count={board.jobs.filter((j) => fits(j, s.key)).length}>
            {s.label}
          </Chip>
        ))}
        <Chip on={f.vans} onClick={() => f.set({ vans: f.vans ? 'off' : undefined })} count={board.vans.length}>
          Vans
        </Chip>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative h-[440px] min-w-0 overflow-hidden rounded-[14px] bg-inset sm:h-[560px]">
          <HqMap jobs={jobs} vans={vans} picked={picked} onPick={pick} oneFirm fitKey={f.show} controls={!wall && <SendToScreen path="/wall" className="bg-[#0d0d0d]/90 backdrop-blur hover:bg-raised" />} />
          {clock}
        </div>

        <aside className="flex min-w-0 flex-col gap-3 [overflow-anchor:none] xl:h-[560px] xl:overflow-y-auto xl:pr-1" aria-label="Beside the map">
          <div ref={sheet} className="flex scroll-mt-24 flex-col gap-3 empty:hidden">
            {job && <JobPanel job={job} book={book} board={board} onClose={() => pick(undefined)} onPick={pick} />}
            {van && <VanPanel van={van} board={board} onClose={() => pick(undefined)} onPick={pick} />}
            {picked && !job && !van && (
              <Card className="flex items-center justify-between gap-3 p-4 text-[13px] text-muted">
                That {picked.kind} is not on today's map any more.
                <button type="button" className="text-foreground hover:underline" onClick={() => pick(undefined)}>
                  Clear
                </button>
              </Card>
            )}
          </div>
          <NeedsALook look={look} onPick={(id) => pick({ kind: 'job', id })} />
        </aside>
      </div>
    </section>
  )
}

function NeedsALook({ look, onPick }: { look: Look[]; onPick: (jobId: string) => void }) {
  return (
    <Card className="p-4">
      <SectionHead
        title={
          <>
            Needs a look <span className="text-faint">·</span> <span className="text-foreground">{look.length}</span>
          </>
        }
        className="pb-1"
      />
      {look.length === 0 && <p className="py-4 text-[13px] text-muted">Nothing needs a look. The day is running itself.</p>}
      <ol className="rows">
        {look.map((x) => {
          const text = (
            <>
              <Dot tone={x.tone} className="mt-[7px]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-[20px]">{x.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{x.note}</span>
              </span>
            </>
          )
          return (
            <li key={x.id} className="flex items-start gap-2 py-2.5">
              {x.jobId ? (
                <button
                  type="button"
                  onClick={() => onPick(x.jobId!)}
                  title="Show it on the map"
                  className="-mx-2 -my-1 flex min-w-0 flex-1 items-start gap-3 rounded-[10px] px-2 py-1 text-left outline-none transition-colors hover:bg-raised focus-visible:bg-raised"
                >
                  {text}
                </button>
              ) : (
                <span className="flex min-w-0 flex-1 items-start gap-3">{text}</span>
              )}
              <RowButton to={x.to} className="h-[30px] px-3 text-[12.5px]">
                {x.action}
              </RowButton>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function PanelHead({ eyebrow, title, onClose }: { eyebrow: ReactNode; title: ReactNode; onClose: () => void }) {
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

function Facts({ rows }: { rows: [string, ReactNode][] }) {
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

function JobPanel({ job, book, board, onClose, onPick }: { job: LiveJob; book: Book; board: LiveBoard; onClose: () => void; onPick: (p: Picked) => void }) {
  const full = find(book.jobs, job.id)
  const billed = book.invoices.filter((i) => i.jobId === job.id && i.status !== 'void')
  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHead
        eyebrow="Job"
        title={
          <>
            <span className="font-mono text-[15px] text-muted">{job.ref}</span> {job.title}
          </>
        }
        onClose={onClose}
      />
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
                  const v = board.vans.find((x) => x.id === o.id)
                  return (
                    <button key={o.id} type="button" onClick={() => v && onPick({ kind: 'van', id: v.id })} disabled={!v} className="flex items-center gap-2 text-left hover:underline disabled:no-underline">
                      <span className="font-mono text-[11px] text-muted">{o.initials}</span> {o.name}
                      {v && (
                        <span className="text-[12px]" style={{ color: vanColour[v.state] }}>
                          {operatorState[v.state].label}
                          {v.etaMinutes ? `, ${v.etaMinutes} min` : ''}
                        </span>
                      )}
                    </button>
                  )
                })}
              </span>
            ) : (
              <span className="text-warn">Nobody yet</span>
            ),
          ],
          ['Customer', job.customer || <span className="text-muted">Not given</span>],
          ['Address', job.address],
          [
            'Work',
            full ? (
              <>
                <span className="font-mono text-[13px]">{pounds(jobNet(full))}</span> <span className="text-muted">before VAT</span>
              </>
            ) : (
              '--'
            ),
          ],
          ['Invoice', billed.length ? billed.map((i) => `${i.ref}, ${i.status === 'draft' ? 'draft' : i.status === 'paid' ? 'paid' : `${pounds(invoiceOwed(i))} owed`}`).join('; ') : <span className="text-muted">Not yet</span>],
        ]}
      />
      <div className="flex flex-wrap gap-2 pt-1">
        <RowButton to={`/jobs/${job.id}`}>Open job</RowButton>
      </div>
    </Card>
  )
}

const fromWord = {
  van: "From the engineer's phone",
  job: 'Placed at the job they are on',
  base: 'On standby from home or the yard',
} as const

function VanPanel({ van, board, onClose, onPick }: { van: LiveVan; board: LiveBoard; onClose: () => void; onPick: (p: Picked) => void }) {
  const job = van.jobId ? board.jobs.find((j) => j.id === van.jobId) : undefined
  return (
    <Card className="flex flex-col gap-3 p-5">
      <PanelHead eyebrow="Van" title={van.name} onClose={onClose} />
      <span className="inline-flex items-center gap-2 text-[13px]">
        <span className="size-[7px] rounded-full" style={{ background: vanColour[van.state] }} />
        {operatorState[van.state].label}
        {van.etaMinutes ? `, ${van.etaMinutes} min away` : ''}
      </span>
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
          ...(job ? ([['Where', job.area]] as [string, ReactNode][]) : []),
          ['Position', fromWord[van.from]],
          ...(van.seenAt ? ([['Last seen', relative(van.seenAt)]] as [string, ReactNode][]) : []),
        ]}
      />
      <div className="flex flex-wrap gap-2 pt-1">
        {job && <RowButton to={`/jobs/${job.id}`}>Open job</RowButton>}
        <RowButton to="/crew">Crew</RowButton>
      </div>
    </Card>
  )
}

/* ---------- The crew, this month ---------- */

const crewCols = 'lg:grid-cols-[minmax(180px,1.3fr)_84px_104px_minmax(150px,1fr)_minmax(170px,1.2fr)]'

function CrewMonth({ book }: { book: Book }) {
  const rows = crewRows(book)
  return (
    <section aria-label="The crew, this month">
      <SectionHead
        title={
          <>
            The crew <span className="text-faint">·</span> this month
          </>
        }
        aside="A job two people worked is split between them"
      />
      <Card className="px-4 pt-2 pb-2 sm:px-5">
        <div className={cn('cap hidden gap-4 py-3 whitespace-nowrap lg:grid', crewCols)}>
          <span>Engineer</span>
          <span className="text-right">Jobs done</span>
          <span className="text-right">Invoiced</span>
          <span>Booked this week</span>
          <span>Papers</span>
        </div>
        <ol className="rows">
          {rows.map((r) => {
            const job = find(book.jobs, r.op.currentJobId)
            const filled = Math.min(10, Math.round(r.bookedPct / 10))
            const tone = r.op.state === 'on_site' ? 'ok' : r.op.state === 'en_route' ? 'info' : r.op.state === 'delayed' ? 'warn' : 'faint'
            return (
              <li key={r.op.id}>
                <Link
                  to={job ? `/jobs/${job.id}` : '/crew'}
                  title={job ? `Open ${job.ref}` : 'Open Crew'}
                  className={cn('-mx-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 rounded-lg px-2 py-3.5 outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-ring/60 lg:items-center', crewCols)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-raised font-mono text-[11px]">{r.op.initials}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px]">{r.op.name}</span>
                      <span className={cn('mt-0.5 flex items-center gap-1.5 truncate text-[12px]', toneText[tone])}>
                        <Dot tone={tone} />
                        <span className="truncate">
                          {operatorState[r.op.state].label}
                          {job && <span className="text-muted">, {job.ref}</span>}
                        </span>
                      </span>
                    </span>
                  </span>
                  <span className="text-right lg:block">
                    <span className="op-number text-[20px]">{r.done}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-muted lg:hidden">done</span>
                  </span>
                  <span className="col-span-2 flex items-center justify-between gap-3 lg:col-span-1 lg:block lg:text-right">
                    <span className="cap lg:hidden">Invoiced</span>
                    <span className="font-mono text-[13px]">{money(r.invoiced)}</span>
                  </span>
                  <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                    <span aria-hidden className="flex flex-1 gap-[3px]">
                      {Array.from({ length: 10 }, (_, i) => (
                        <span key={i} className={cn('h-[3px] flex-1 rounded-full', i < filled ? 'bg-foreground' : 'bg-line-strong')} />
                      ))}
                    </span>
                    <span className="w-[84px] shrink-0 text-right font-mono text-[12px] text-muted">
                      {Math.round(r.hoursWeek)}h <span className="text-foreground">{r.bookedPct}%</span>
                    </span>
                  </span>
                  <span className="col-span-2 flex min-w-0 flex-wrap gap-1.5 lg:col-span-1">
                    {r.papers.length ? (
                      r.papers.map((p) => (
                        <Tag key={p.number} tone={p.left < 0 ? 'danger' : p.left <= 30 ? 'warn' : 'neutral'} className="normal-case">
                          {p.body} {p.left < 0 ? 'run out' : p.left <= 30 ? `${p.left} days left` : `to ${capDay(p.expires)}`}
                        </Tag>
                      ))
                    ) : (
                      <span className="text-[12.5px] text-faint">None on file</span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      </Card>
    </section>
  )
}

/* ---------- Coming at you ---------- */

interface Coming {
  id: string
  when: string
  whenTone?: 'danger' | 'warn'
  title: string
  meta: string[]
  action: string
  to: string
}

function ComingUp({ book, extras }: { book: Book; extras?: OwnerExtras }) {
  const day = today()
  const items: Coming[] = []
  for (const d of extras?.payments?.disputes.filter((x) => x.status === 'needs_reply').sort((a, b) => a.replyBy.localeCompare(b.replyBy)) ?? []) {
    items.push({
      id: `d_${d.id}`,
      when: `BY ${capDate(d.replyBy)}`,
      whenTone: 'danger',
      title: `Reply to a ${pounds(d.amount)} card dispute`,
      meta: [d.reason],
      action: 'Reply',
      to: '/money',
    })
  }
  for (const p of extras?.plans.filter((x) => x.status === 'payment_failed') ?? []) {
    const who = find(book.customers, p.customerId)
    items.push({
      id: `p_${p.id}`,
      when: p.lastFailedAt ? capDate(p.lastFailedAt) : '--',
      whenTone: 'warn',
      title: `${who?.name ?? 'A customer'}'s Direct Debit failed`,
      meta: [p.ref, `${pounds(p.monthly)} a month`, who?.phone ?? ''].filter(Boolean),
      action: 'Look',
      to: '/money',
    })
  }
  for (const l of latePayers(book).slice(0, 3)) {
    items.push({
      id: `l_${l.customerId}`,
      when: `${l.days}D LATE`,
      whenTone: 'warn',
      title: `Ring ${l.name}, ${pounds(l.owed)} owed`,
      meta: [l.oldest.ref, `due ${capDate(l.oldest.dueAt!)}`, l.phone ?? ''].filter(Boolean),
      action: 'Chase',
      to: `/invoices/${l.oldest.id}`,
    })
  }
  const dated: (Coming & { day: string })[] = []
  const soon = book.certificates.filter((c) => c.state === 'due_soon' && c.expires >= day && c.expires <= addDays(day, 30)).sort((a, b) => a.expires.localeCompare(b.expires))
  for (const c of soon) {
    const site = find(book.sites, c.siteId)
    dated.push({
      day: c.expires,
      id: `c_${c.id}`,
      when: capDay(c.expires),
      title: `${c.kind} at ${site?.line1 ?? 'a site'} runs out`,
      meta: [site?.postcode ?? '', find(book.customers, site?.customerId)?.name ?? ''].filter(Boolean),
      action: 'Book',
      to: `/jobs/new?site=${c.siteId}&for=${encodeURIComponent(c.kind)}`,
    })
  }
  for (const r of crewRows(book)) {
    for (const p of r.papers.filter((x) => x.left >= 0 && x.left <= 30))
      dated.push({
        day: p.expires,
        id: `r_${r.op.id}_${p.number}`,
        when: capDay(p.expires),
        title: `${first(r.op.name)}'s ${p.body} runs out`,
        meta: [p.number, `${p.left} days`],
        action: 'Renew',
        to: '/crew',
      })
  }
  items.push(...dated.sort((a, b) => a.day.localeCompare(b.day)))

  return (
    <Card>
      <SectionHead title="Coming at you" aside="Disputes, failed Direct Debits, late payers, then the next 30 days" />
      {items.length === 0 && <p className="py-6 text-[14px] text-muted">Nothing coming up in the next 30 days.</p>}
      <ol className="rows">
        {items.map((x) => (
          <li key={x.id} className="flex items-center gap-4 py-3">
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
              <span className={cn('shrink-0 font-mono text-[11px] tracking-[.06em] sm:w-[74px]', x.whenTone === 'danger' ? 'text-danger' : x.whenTone === 'warn' ? 'text-warn' : 'text-muted')}>{x.when}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] sm:truncate">{x.title}</span>
                <span className="mt-1 block truncate font-mono text-[11px] tracking-[.08em] text-muted uppercase">{x.meta.join('   ')}</span>
              </span>
            </span>
            <RowButton to={x.to}>{x.action}</RowButton>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/* ---------- What Ardent did this week ---------- */

function ArdentsWeek({ book, extras }: { book: Book; extras: OwnerExtras }) {
  const w = ardentWeek(book, extras.approvals, extras.log)
  const kinds = [
    [w.draftedKinds.invoices, 'invoice', 'invoices'],
    [w.draftedKinds.reminders, 'reminder', 'reminders'],
    [w.draftedKinds.quotes, 'quote', 'quotes'],
    [w.draftedKinds.refunds, 'refund', 'refunds'],
  ] as const
  const made = kinds.filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
  const figures: { label: string; value: number; note: string }[] = [
    {
      label: 'Drafted for you',
      value: w.drafted,
      note: made.length ? made.join(', ') : 'Nothing new this week',
    },
    {
      label: 'You said yes',
      value: w.saidYes,
      note: w.saidNo ? `${w.saidNo} said no` : 'And none said no',
    },
    {
      label: 'Reminders sent',
      value: w.remindersSent,
      note: 'To customers who owe',
    },
    {
      label: 'Waiting for you',
      value: w.waiting,
      note: w.waiting ? 'Nothing goes without your yes' : 'All caught up',
    },
  ]
  return (
    <Card>
      <SectionHead
        title={
          <>
            What Ardent did <span className="text-faint">·</span> this week
          </>
        }
        aside={
          <Link to="/approvals" className="text-muted hover:text-foreground">
            Approvals
          </Link>
        }
      />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 pt-2">
        {figures.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-2">
            <dt className="cap truncate">{f.label}</dt>
            <dd className="op-number text-[28px]">{f.value}</dd>
            <dd className="text-[12.5px] text-muted sm:truncate">{f.note}</dd>
          </div>
        ))}
      </dl>
      {w.onItsOwn > 0 && (
        <p className="pt-5 text-[12.5px] text-muted">
          {w.onItsOwn} more {w.onItsOwn === 1 ? 'thing' : 'things'} done by itself, under your rules. Each is in the log on Approvals.
        </p>
      )}
      <Link to="/approvals" className="mt-5 inline-block text-[13px] text-foreground hover:underline sm:hidden">
        Open Approvals
      </Link>
    </Card>
  )
}
