import { useMemo, useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Eye } from 'lucide-react'
import { certificateState, checkState, clock, dayDate, invoiceStatus, jobStatus, operatorState, pounds, quoteStatus, shortDate, totals, trade as TRADE, window as timeWindow, type Tone } from '@kit'
import { topicName, describeCheck, describeReply } from '@kit/questions.ts'
import { automationJobs, AREAS } from '@engine/office.ts'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { fieldClass } from '@/components/ui/field'
import type { FirmAccount, LiveJob } from '@/data/hq'
import type { AutomationArea, Invoice, Job, JobStatus, Level, Operator } from '@/data/model'
import { cn } from '@/lib/utils'
import { useEvery, useHqQuery } from './data'
import { HqMap, type Picked } from './map'
import { Chip, Dot, Failed, healthTone, isDone, isLive, jobTone, Loading, Meter, stageWord, State, Tag, toneText, when, who } from './parts'
import { trades } from './firms'

/*
 * One firm's account, as Ardent's team sees it: today on its own map, every
 * job, the crew and their cards, money, its report questions, how it has set
 * Ardent up, what it uses and pays, its log and its people. Opening it is
 * written in the firm's own log, so the firm can see Ardent looked.
 */

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'crew', label: 'Crew' },
  { key: 'money', label: 'Money' },
  { key: 'questions', label: 'Questions' },
  { key: 'rules', label: 'Rules for Ardent' },
  { key: 'usage', label: 'Usage and bill' },
  { key: 'activity', label: 'Activity' },
  { key: 'people', label: 'People' },
] as const
type Tab = (typeof TABS)[number]['key']

const DAY = 86_400_000

export function Firm() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'today') as Tab
  const jobId = params.get('job') ?? undefined
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }
  const { data: account, error } = useHqQuery((hq) => hq.firm(id), [id])
  const f = account?.firm
  const job = account && jobId ? account.jobs.find((j) => j.id === jobId) : undefined

  return (
    <div className="flex flex-col gap-7 pb-6">
      <PageBar crumbs={[{ label: 'Firms', to: '/firms' }, { label: f?.name ?? 'Firm' }]} />
      {error && !account && <Failed error={error} />}
      {!account && !error && <Loading className="mt-8" />}
      {account && f && (
        <>
          <PageHead
            title={f.name}
            eyebrow={
              <>
                <span>{f.town}</span>
                <span className="text-faint">·</span>
                <span>{trades(f)}</span>
                <span className="text-faint">·</span>
                <span>On Ardent since {shortDate(f.createdAt)}</span>
              </>
            }
            sub={
              <span className="flex flex-col gap-2">
                <span>{f.health.note}</span>
                <span className="inline-flex items-center gap-2 text-[13px] text-muted">
                  <Eye className="size-4 shrink-0" /> Opening a firm's account is recorded in its log.
                </span>
              </span>
            }
            figures={[
              { label: 'Health', value: <span className={cn('text-[22px] sm:text-[26px]', toneText[healthTone[f.health.tone]])}>{f.health.label}</span> },
              { label: 'Stage', value: <span className="text-[22px] sm:text-[26px]">{stageWord[f.stage]}</span> },
              { label: 'Bill', value: pounds(f.bill.total), unit: 'a month' },
            ]}
            className="pb-0 [&_h1]:break-words [&_h1]:text-[24px] sm:[&_h1]:text-[34px]"
          />

          <div role="tablist" aria-label="Firm account" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => set({ tab: t.key === 'today' ? undefined : t.key, job: undefined })}
                className={cn('h-9 shrink-0 rounded-[10px] px-3.5 text-[13px] whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60', tab === t.key ? 'bg-raised text-foreground' : 'text-muted hover:bg-surface hover:text-foreground')}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {tab === 'today' && <TodayTab account={account} onJob={(j) => set({ job: j })} />}
            {tab === 'jobs' && <JobsTab account={account} onJob={(j) => set({ job: j })} />}
            {tab === 'crew' && <CrewTab account={account} />}
            {tab === 'money' && <MoneyTab account={account} />}
            {tab === 'questions' && <QuestionsTab account={account} />}
            {tab === 'rules' && <RulesTab account={account} />}
            {tab === 'usage' && <UsageTab account={account} />}
            {tab === 'activity' && <ActivityTab account={account} />}
            {tab === 'people' && <PeopleTab account={account} />}
          </div>

          <Dialog open={!!job} onOpenChange={(o) => !o && set({ job: undefined })}>
            {job && (
              <DialogContent className="max-h-[90dvh] max-w-[760px] overflow-y-auto p-0">
                <JobSheet job={job} account={account} />
              </DialogContent>
            )}
          </Dialog>
        </>
      )}
    </div>
  )
}

/* ---------- Today ---------- */

const BOARD: { label: string; has: (s: JobStatus) => boolean }[] = [
  { label: 'Booked', has: (s) => s === 'booked' || s === 'enquiry' || s === 'quoted' },
  { label: 'On the road', has: (s) => s === 'en_route' },
  { label: 'On site', has: (s) => s === 'on_site' || s === 'paused' },
  { label: 'Done', has: isDone },
]

function TodayTab({ account, onJob }: { account: FirmAccount; onJob: (id: string) => void }) {
  useEvery(20_000)
  const { data: board, error } = useHqQuery((hq) => hq.live(account.firm.id), [account.firm.id])
  const [picked, setPicked] = useState<Picked>()
  const pick = (p?: Picked) => {
    setPicked(p)
    if (p?.kind === 'job') onJob(p.id)
  }
  return (
    <div className="flex flex-col gap-4">
      <Failed error={error} />
      <div className="relative h-[52vh] min-h-[320px] overflow-hidden rounded-[14px] bg-inset lg:h-[460px]">
        {board ? <HqMap jobs={board.jobs} vans={board.vans} picked={picked} onPick={pick} /> : <div className="size-full animate-pulse bg-surface/40" />}
      </div>
      {board && board.jobs.length === 0 && <Card className="py-10 text-center text-[14px] text-muted">{account.firm.stage === 'setting_up' ? 'Still setting up: no jobs booked for today yet.' : 'No jobs booked for today.'}</Card>}
      {board && board.jobs.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BOARD.map((col) => {
            const jobs = board.jobs.filter((j) => col.has(j.status))
            return (
              <section key={col.label} className="flex min-w-0 flex-col gap-2 rounded-[14px] bg-surface p-2.5">
                <h3 className="cap flex justify-between px-1.5 pt-1.5 pb-1">
                  {col.label} <span className="font-mono tracking-normal">{jobs.length}</span>
                </h3>
                {jobs.length === 0 && <p className="px-1.5 pb-2 text-[12.5px] text-faint">None</p>}
                {jobs.map((j) => (
                  <BoardCard key={j.id} job={j} onOpen={() => onJob(j.id)} />
                ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BoardCard({ job, onOpen }: { job: LiveJob; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex flex-col gap-2 rounded-[10px] bg-inset p-3 text-left outline-none transition-colors hover:bg-[#101010] focus-visible:ring-2 focus-visible:ring-ring/60">
      <span className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted">
        <span>{job.ref}</span>
        <span>{clock(job.start)}</span>
      </span>
      <span className="text-[13.5px] leading-[19px]">{job.title}</span>
      <span className="truncate text-[12px] text-muted">
        {job.customer} · {job.area}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="flex gap-1">
          {job.operators.length ? (
            job.operators.map((o) => (
              <span key={o.id} className="flex size-6 items-center justify-center rounded-full bg-raised font-mono text-[10px]" title={o.name}>
                {o.initials}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-warn">Nobody yet</span>
          )}
        </span>
        {job.priority === 'emergency' && !isDone(job.status) ? <Tag tone="danger">Emergency</Tag> : job.report === 'signed' ? <Tag tone="ok">Signed</Tag> : null}
      </span>
      {job.flag && <span className={cn('text-[12px]', job.priority === 'emergency' ? 'text-danger' : 'text-warn')}>{job.flag}</span>}
    </button>
  )
}

/* ---------- Jobs ---------- */

const JOB_SHOWS: { key: string; label: string; has: (s: JobStatus) => boolean }[] = [
  { key: 'all', label: 'All', has: () => true },
  { key: 'open', label: 'Not booked', has: (s) => s === 'enquiry' || s === 'quoted' },
  { key: 'booked', label: 'Booked', has: (s) => s === 'booked' },
  { key: 'live', label: 'Live now', has: isLive },
  { key: 'done', label: 'Done', has: isDone },
  { key: 'cancelled', label: 'Cancelled', has: (s) => s === 'cancelled' },
]

function JobsTab({ account, onJob }: { account: FirmAccount; onJob: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [show, setShow] = useState('all')
  const filter = JOB_SHOWS.find((s) => s.key === show)!
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const rows = useMemo(
    () =>
      account.jobs.map((j) => {
        const c = account.customers.find((x) => x.id === j.customerId)
        const s = account.sites.find((x) => x.id === j.siteId)
        const crew = j.operatorIds.map((id) => account.operators.find((o) => o.id === id)).filter((o): o is Operator => !!o)
        return { j, c, s, crew, hay: `${j.ref} ${j.title} ${c?.name ?? ''} ${s?.line1 ?? ''} ${s?.town ?? ''} ${s?.postcode ?? ''} ${crew.map((o) => o.name).join(' ')}`.toLowerCase() }
      }),
    [account],
  )
  const list = rows.filter((r) => filter.has(r.j.status) && words.every((w) => r.hay.includes(w) || r.hay.replace(/\s+/g, '').includes(w)))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Find a job" className={cn(fieldClass, 'h-10 w-full sm:w-[320px]')} placeholder="Ref, customer, street, postcode or engineer" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          {JOB_SHOWS.map((s) => (
            <Chip key={s.key} on={show === s.key} onClick={() => setShow(s.key)} count={account.jobs.filter((j) => s.has(j.status)).length}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
      <Card className="p-2">
        {list.length === 0 && <p className="px-3 py-8 text-center text-[14px] text-muted">No jobs match.</p>}
        <ol className="rows">
          {list.map(({ j, c, s, crew }) => (
            <li key={j.id}>
              <button type="button" onClick={() => onJob(j.id)} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left outline-none transition-colors hover:bg-raised/60 focus-visible:bg-raised/60">
                <span className="w-[62px] shrink-0 font-mono text-[12px] text-muted">{j.ref}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{j.title}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {c?.name} · {s?.postcode} <span className="sm:hidden">· {shortDate(j.start)}</span>
                  </span>
                </span>
                <span className="hidden w-[120px] shrink-0 truncate text-[12px] text-muted md:block">{crew.map((o) => o.name.split(' ')[0]).join(', ') || 'Nobody yet'}</span>
                <span className="hidden w-[96px] shrink-0 font-mono text-[12px] text-muted sm:block">{dayDate(j.start)}</span>
                <span className="w-[86px] shrink-0 sm:w-[96px]">
                  <State tone={jobTone(j)} className="text-[12.5px]">
                    {jobStatus[j.status].label}
                  </State>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}

const invoiceTotal = (inv: Pick<Invoice, 'lines' | 'vatRate'>) => totals(inv).total
const invoiceOwed = (inv: Invoice) => Math.max(0, invoiceTotal(inv) - inv.paidAmount)
const late = (inv: Invoice) => ['sent', 'part_paid', 'overdue'].includes(inv.status) && !!inv.dueAt && Date.parse(inv.dueAt) < Date.now()

function invoiceTone(inv: Invoice): { label: string; tone: Tone } {
  if (late(inv) && inv.status !== 'part_paid') return { label: 'Late', tone: 'warn' }
  return invoiceStatus[inv.status]
}

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 px-6 py-4 [&+&]:shadow-[inset_0_1px_0_var(--line)]">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="cap">{title}</h3>
        {aside && <span className="font-mono text-[11px] text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

/** Everything the firm's records hold about one job. */
function JobSheet({ job, account }: { job: Job; account: FirmAccount }) {
  const c = account.customers.find((x) => x.id === job.customerId)
  const s = account.sites.find((x) => x.id === job.siteId)
  const crew = job.operatorIds.map((id) => account.operators.find((o) => o.id === id)).filter((o): o is Operator => !!o)
  const report = account.reports.find((r) => r.jobId === job.id)
  const certs = account.certificates.filter((x) => x.jobId === job.id)
  const invs = account.invoices.filter((x) => x.jobId === job.id)
  const quotes = account.quotes.filter((x) => x.jobId === job.id)
  const t = totals({ lines: job.lines })
  return (
    <div className="flex flex-col pb-3">
      <div className="px-6 pt-6 pb-4">
        <p className="cap">
          {account.firm.name} · {TRADE[job.trade] ?? job.trade}
        </p>
        <DialogTitle className="mt-2.5 pr-8 text-[19px] leading-[25px] font-normal">
          <span className="font-mono text-[16px] text-muted">{job.ref}</span> {job.title}
        </DialogTitle>
        <DialogDescription asChild>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <State tone={jobTone(job)}>{jobStatus[job.status].label}</State>
            {job.priority !== 'normal' && <Tag tone={job.priority === 'emergency' ? 'danger' : job.priority === 'high' ? 'warn' : 'faint'}>{job.priority}</Tag>}
            <span className="font-mono text-[12px] text-muted">
              {dayDate(job.start)} · {timeWindow(job.start, job.end)}
            </span>
          </div>
        </DialogDescription>
      </div>

      <Block title="Who and where">
        <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px]">
          <dt className="text-muted">Customer</dt>
          <dd>
            {c?.name ?? 'Not on record'}
            {c?.phone && <span className="ml-2 font-mono text-[12px] text-muted">{c.phone}</span>}
          </dd>
          <dt className="text-muted">Address</dt>
          <dd>{s ? `${s.line1}, ${s.town} ${s.postcode}` : 'Not on record'}</dd>
          {s?.accessNotes && (
            <>
              <dt className="text-muted">Getting in</dt>
              <dd className="text-muted">{s.accessNotes}</dd>
            </>
          )}
          <dt className="text-muted">Engineers</dt>
          <dd>{crew.length ? crew.map((o) => o.name).join(', ') : <span className="text-warn">Nobody yet</span>}</dd>
        </dl>
      </Block>

      <Block title="Lines" aside={job.lines.length ? `${pounds(t.net)} + VAT` : undefined}>
        {job.lines.length === 0 ? (
          <p className="text-[13px] text-muted">No lines on the job yet.</p>
        ) : (
          <ol className="rows text-[13px]">
            {job.lines.map((l) => (
              <li key={l.id} className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1">{l.description}</span>
                <span className="shrink-0 font-mono text-[12px] text-muted">
                  {l.quantity} × {pounds(l.unitPrice)}
                </span>
                <span className="w-[72px] shrink-0 text-right font-mono">{pounds(Math.round(l.quantity * l.unitPrice))}</span>
              </li>
            ))}
          </ol>
        )}
      </Block>

      {job.checks.length > 0 && (
        <Block title="Checks">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {job.checks.map((k) => (
              <div key={k.key} className="rounded-[10px] bg-inset px-3.5 py-3">
                <span className="cap block truncate text-[11px]">{k.label}</span>
                <span className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                  <span className={cn('truncate', toneText[checkState[k.state].tone])}>{k.detail ?? checkState[k.state].label}</span>
                  <Dot tone={checkState[k.state].tone} />
                </span>
              </div>
            ))}
          </div>
        </Block>
      )}

      <Block title="Job report" aside={report ? (report.status === 'signed' ? `Signed ${report.signedAt ? when(report.signedAt) : ''}` : 'Draft, not signed') : undefined}>
        {!report ? (
          <p className="text-[13px] text-muted">No report from the engineer yet.</p>
        ) : (
          <div className="flex flex-col gap-3 text-[13.5px]">
            {report.sections
              .filter((x) => x.lines.length)
              .map((x) => (
                <div key={x.topic}>
                  <p className="cap text-[10.5px]">{topicName(x.topic)}</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {x.lines.map((l, i) => (
                      <li key={i}>{l.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            {report.readings.length > 0 && (
              <div>
                <p className="cap text-[10.5px]">Readings</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {report.readings.map((r, i) => (
                    <li key={i} className="rounded-[6px] bg-inset px-2 py-1 font-mono text-[12px]">
                      {r.label} {r.value}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.parts.length > 0 && (
              <div>
                <p className="cap text-[10.5px]">Parts</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {report.parts.map((p, i) => (
                    <li key={i}>
                      {p.quantity} × {p.description}
                      <span className="ml-2 text-[12px] text-muted">{p.fromVan ? 'off the van' : 'bought in'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.missing.length > 0 && <p className="text-[12.5px] text-warn">Still missing: {report.missing.map(topicName).join(', ')}</p>}
          </div>
        )}
      </Block>

      {(invs.length > 0 || quotes.length > 0 || certs.length > 0) && (
        <Block title="Paperwork">
          <ul className="rows text-[13px]">
            {quotes.map((q) => (
              <li key={q.id} className="flex items-center gap-3 py-2">
                <span className="w-[70px] font-mono text-[12px] text-muted">{q.ref}</span>
                <span className="flex-1">Quote</span>
                <State tone={quoteStatus[q.status].tone}>{quoteStatus[q.status].label}</State>
                <span className="w-[72px] text-right font-mono">{pounds(totals({ lines: q.lines }).total)}</span>
              </li>
            ))}
            {invs.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-2">
                <span className="w-[70px] font-mono text-[12px] text-muted">{inv.ref}</span>
                <span className="flex-1">Invoice</span>
                <State tone={invoiceTone(inv).tone}>{invoiceTone(inv).label}</State>
                <span className="w-[72px] text-right font-mono">{pounds(invoiceTotal(inv))}</span>
              </li>
            ))}
            {certs.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2">
                <span className="w-[70px] font-mono text-[12px] text-muted">{x.kind}</span>
                <span className="flex-1">Certificate, runs out {shortDate(x.expires)}</span>
                <State tone={certificateState[x.state].tone}>{certificateState[x.state].label}</State>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Notes">
        <p className={cn('text-[13.5px] whitespace-pre-wrap', !job.notes && 'text-muted')}>{job.notes || 'No notes.'}</p>
      </Block>
    </div>
  )
}

/* ---------- Crew ---------- */

const roleWord: Record<Operator['role'], string> = { owner: 'Owner', operator: 'Engineer', subcontractor: 'Subcontractor', freelance: 'Freelance' }

function CrewTab({ account }: { account: FirmAccount }) {
  const now = Date.now()
  if (!account.operators.length) return <Card className="py-10 text-center text-[14px] text-muted">No crew added yet.</Card>
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {account.operators.map((o) => {
        const job = account.jobs.find((j) => j.id === o.currentJobId)
        return (
          <Card key={o.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised font-mono text-[12px]">{o.initials}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{o.name}</p>
                <p className="text-[12.5px] text-muted">
                  {roleWord[o.role]} · {o.trades.map((t) => TRADE[t] ?? t).join(', ')} · <span className="font-mono">{o.van || 'No van'}</span>
                </p>
              </div>
              <State tone={operatorState[o.state].tone}>{operatorState[o.state].label}</State>
            </div>
            {job && (
              <p className="text-[13px] text-muted">
                On <span className="font-mono text-[12px]">{job.ref}</span> <span className="text-foreground">{job.title}</span>
                {o.etaMinutes ? `, ${o.etaMinutes} min away` : ''}
              </p>
            )}
            <div>
              <p className="cap text-[10.5px]">Registrations</p>
              {o.registrations.length === 0 && <p className="mt-1.5 text-[13px] text-muted">None on record.</p>}
              <ul className="rows mt-1">
                {[...o.registrations]
                  .sort((a, b) => a.expires.localeCompare(b.expires))
                  .map((r) => {
                    const days = Math.ceil((Date.parse(r.expires) - now) / DAY)
                    const tone: Tone = days < 0 ? 'danger' : days <= 30 ? 'warn' : 'ok'
                    return (
                      <li key={r.body + r.number} className="flex items-center gap-3 py-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">
                          {r.body} <span className="font-mono text-[12px] text-muted">{r.number}</span>
                        </span>
                        <span className={cn('shrink-0 font-mono text-[12px]', toneText[tone])}>{days < 0 ? `Lapsed ${shortDate(r.expires)}` : days <= 30 ? `Runs out in ${days} ${days === 1 ? 'day' : 'days'}` : `To ${shortDate(r.expires)}`}</span>
                      </li>
                    )
                  })}
              </ul>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ---------- Money ---------- */

function MoneyTab({ account }: { account: FirmAccount }) {
  const name = (id: string) => account.customers.find((c) => c.id === id)?.name ?? ''
  const owing = account.invoices.filter((i) => ['sent', 'part_paid', 'overdue'].includes(i.status))
  const lateOnes = owing.filter((i) => late(i) || i.status === 'overdue')
  const paid30 = account.invoices.filter((i) => i.status === 'paid' && i.issuedAt && Date.now() - Date.parse(i.issuedAt) < 30 * DAY).reduce((s, i) => s + invoiceTotal(i), 0)
  const openQuotes = account.quotes.filter((q) => q.status === 'sent')
  const invoices = [...account.invoices].sort((a, b) => (b.issuedAt ?? '9').localeCompare(a.issuedAt ?? '9'))
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Owed to the firm" value={pounds(owing.reduce((s, i) => s + invoiceOwed(i), 0))} note={`${owing.length} invoices`} />
        <Figure label="Late" value={pounds(lateOnes.reduce((s, i) => s + invoiceOwed(i), 0))} note={`${lateOnes.length} invoices`} tone={lateOnes.length ? 'text-warn' : undefined} />
        <Figure label="Paid, 30 days" value={pounds(paid30)} note="Invoices raised in the last 30 days" />
        <Figure label="Quotes out" value={pounds(openQuotes.reduce((s, q) => s + totals({ lines: q.lines }).total, 0))} note={`${openQuotes.length} waiting for a yes`} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-4">
          <SectionHead title={`Invoices · ${account.invoices.length}`} />
          {invoices.length === 0 && <p className="py-4 text-[13px] text-muted">No invoices yet.</p>}
          <ol className="rows text-[13px]">
            {invoices.map((inv) => {
              const st = invoiceTone(inv)
              return (
                <li key={inv.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-[70px] shrink-0 font-mono text-[12px] text-muted">{inv.ref}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{name(inv.customerId)}</span>
                    <span className="block font-mono text-[11px] text-muted">{inv.dueAt ? `Due ${shortDate(inv.dueAt)}` : inv.issuedAt ? `Sent ${shortDate(inv.issuedAt)}` : 'Not sent'}</span>
                  </span>
                  <State tone={st.tone} className="hidden w-[90px] text-[12.5px] sm:inline-flex">
                    {st.label}
                  </State>
                  <span className="w-[80px] shrink-0 text-right font-mono">
                    {pounds(invoiceTotal(inv))}
                    {inv.paidAmount > 0 && inv.status !== 'paid' && <span className="block text-[11px] text-muted">{pounds(invoiceOwed(inv))} left</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </Card>
        <Card className="p-4">
          <SectionHead title={`Quotes · ${account.quotes.length}`} />
          {account.quotes.length === 0 && <p className="py-4 text-[13px] text-muted">No quotes yet.</p>}
          <ol className="rows text-[13px]">
            {account.quotes.map((q) => (
              <li key={q.id} className="flex items-center gap-3 py-2.5">
                <span className="w-[60px] shrink-0 font-mono text-[12px] text-muted">{q.ref}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{name(q.customerId)}</span>
                  <span className="block font-mono text-[11px] text-muted">Good to {shortDate(q.validUntil)}</span>
                </span>
                <State tone={quoteStatus[q.status].tone} className="text-[12.5px]">
                  {quoteStatus[q.status].label}
                </State>
                <span className="w-[72px] shrink-0 text-right font-mono">{pounds(totals({ lines: q.lines }).total)}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}

function Figure({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="cap truncate">{label}</p>
      <p className={cn('op-number text-[24px] sm:text-[28px]', tone)}>{value}</p>
      {note && <p className="truncate text-[12.5px] text-muted">{note}</p>}
    </Card>
  )
}

/* ---------- Questions ---------- */

function QuestionsTab({ account }: { account: FirmAccount }) {
  const { playbook, own, off } = account.followUps
  const offPlaybook = playbook.filter((r) => off.includes(r.id))
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section>
        <SectionHead title={`Its own questions · ${own.length}`} aside="Asked after Ardent's playbook, only by this firm's engineers" />
        {own.length === 0 && <Card className="p-5 text-[14px] text-muted">None yet. The firm uses Ardent's playbook as it comes.</Card>}
        <div className="flex flex-col gap-3">
          {own.map((r) => (
            <Card key={r.id} className={cn('flex flex-col gap-2.5 p-5', off.includes(r.id) && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="mr-auto text-[15px]">{r.name}</h3>
                {off.includes(r.id) && <Tag>Off</Tag>}
                {r.shared && !r.review && <Tag tone="info">Offered to Ardent</Tag>}
                {r.review?.state === 'adopted' && <Tag tone="ok">In the playbook</Tag>}
                {r.review?.state === 'declined' && <Tag>Kept as its own</Tag>}
              </div>
              <p className="text-[14.5px] leading-[21px]">“{r.ask.replace('{said}', '…what they said…')}”</p>
              <p className="text-[12.5px] text-muted">{r.when.map(describeCheck).join('. ')}.</p>
              <p className="text-[12.5px] text-muted">
                Buttons: {r.replies.map((b) => `${b.label} (${describeReply(b)})`).join(', ')}
              </p>
              <p className="font-mono text-[11px] text-faint uppercase">
                Changed by {r.by} · {when(r.updatedAt)}
              </p>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <SectionHead title={`Playbook switched off · ${offPlaybook.length}`} />
        <Card className="p-4">
          {offPlaybook.length === 0 ? (
            <p className="py-2 text-[14px] text-muted">Every playbook question is on for this firm.</p>
          ) : (
            <ul className="rows">
              {offPlaybook.map((r) => (
                <li key={r.id} className="py-2.5">
                  <p className="text-[14px]">{r.name}</p>
                  <p className="text-[12.5px] text-muted">{r.why}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  )
}

/* ---------- Rules for Ardent ---------- */

const LEVELS = ['Read', 'Draft', 'Approve', 'Auto', 'Never']
const AREA_NAME: Record<AutomationArea, string> = { paperwork: 'Paperwork from the van', money: 'Money', dispatch: 'Dispatch', compliance: 'Compliance', calls: 'Calls and enquiries', brief: 'Morning brief' }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function RulesTab({ account }: { account: FirmAccount }) {
  const a = account.automation
  const jobs = automationJobs(a)
  const own = (key: string) => a.levels[key] !== undefined
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="AI cap" value={pounds(a.limits.aiPence)} note="A month, then Ardent works without AI" />
        <Figure label="Office hours" value={<span className="text-[20px] sm:text-[24px]">{a.officeHours.from} to {a.officeHours.to}</span>} note={a.officeHours.days.map((d) => DAYS[d - 1]).join(', ')} />
        <Figure label="Ardent Voice" value={<span className="text-[20px] sm:text-[24px]">{a.voice ? 'On' : 'Off'}</span>} note={a.voice ? 'All-day answering' : 'After-hours calls only'} />
        <Figure label="Tone" value={<span className="text-[20px] capitalize sm:text-[24px]">{a.tone}</span>} note={`Chases at ${a.chase.first}, ${a.chase.firmer} and ${a.chase.statement} days`} />
      </div>
      <p className="text-[13px] text-muted">The firm's owner sets these in Core. HQ can only read them. Levels the firm changed from Ardent's standard are marked.</p>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {AREAS.map((area) => (
          <Card key={area} className={cn('p-4', !a.areas[area] && 'opacity-60')}>
            <SectionHead title={AREA_NAME[area]} aside={a.areas[area] ? 'On' : 'Off: Ardent does nothing here'} className="pb-1" />
            <ul className="rows">
              {jobs
                .filter((j) => j.area === area)
                .map((j) => (
                  <li key={j.key} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{j.name}</span>
                      {!j.live && <span className="block truncate text-[12px] text-faint">{j.waitsFor}</span>}
                    </span>
                    {own(j.key) && <Tag tone="info">Changed</Tag>}
                    <span className="w-[64px] shrink-0 text-right font-mono text-[12px]">{a.areas[area] ? LEVELS[j.level as Level] : 'Off'}</span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ---------- Usage and bill ---------- */

const unitWord = (n: number, unit: 'pence' | 'minutes' | 'texts') => (unit === 'pence' ? pounds(n) : `${n.toLocaleString('en-GB')} ${unit === 'minutes' ? 'min' : 'texts'}`)

export function UsageLines({ usage }: { usage: FirmAccount['firm']['usage'] }) {
  return (
    <ul className="flex flex-col gap-4">
      {usage.lines.map((l) => (
        <li key={l.key} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span>{l.label}</span>
            <span className="shrink-0 font-mono text-[12px] text-muted">
              <span className="text-foreground">{unitWord(l.used, l.unit)}</span>
              {l.included !== undefined && ` of ${unitWord(l.included, l.unit)}`}
              {l.cap !== undefined && ` · cap ${unitWord(l.cap, l.unit)}`}
            </span>
          </div>
          <Meter used={l.used} of={l.included} cap={l.cap} />
          <p className={cn('text-[12px]', l.over ? 'text-warn' : 'text-muted')}>
            {l.over ? `${unitWord(l.over, l.unit)} over, ${pounds(l.overCost)}. ` : ''}
            {l.note}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function BillLines({ bill }: { bill: FirmAccount['firm']['bill'] }) {
  return (
    <dl className="rows text-[13.5px]">
      <div className="flex justify-between gap-3 py-2">
        <dt>Plan</dt>
        <dd className="font-mono">{pounds(bill.base)}</dd>
      </div>
      <div className="flex justify-between gap-3 py-2">
        <dt>
          Extra engineers <span className="text-muted">({bill.extraEngineers} × {pounds(bill.perEngineer)})</span>
        </dt>
        <dd className="font-mono">{pounds(bill.extraEngineers * bill.perEngineer)}</dd>
      </div>
      {bill.voice !== undefined && (
        <div className="flex justify-between gap-3 py-2">
          <dt>Ardent Voice</dt>
          <dd className="font-mono">{pounds(bill.voice)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3 py-2.5 text-[15px]">
        <dt>A month</dt>
        <dd className="font-mono">{pounds(bill.total)}</dd>
      </div>
    </dl>
  )
}

const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'Europe/London' })

function UsageTab({ account }: { account: FirmAccount }) {
  const f = account.firm
  const hist = account.usageHistory
  const ai = (u: (typeof hist)[number]) => u.lines.find((l) => l.key === 'ai')?.used ?? 0
  const max = Math.max(1, ...hist.map(ai))
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="p-5">
        <SectionHead title={`This month · ${monthName(f.usage.month)}`} aside={f.usage.aiPaused ? <span className="text-warn">AI cap reached: working without AI</span> : f.usage.extraCost ? `${pounds(f.usage.extraCost)} past the plan` : 'Inside the plan'} />
        <UsageLines usage={f.usage} />
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <SectionHead title="Bill" />
          <BillLines bill={f.bill} />
        </Card>
        <Card className="p-5">
          <SectionHead title="AI used, month by month" />
          {hist.length === 0 ? (
            <p className="text-[13px] text-muted">No months yet.</p>
          ) : (
            <div className="flex h-[120px] items-end gap-2">
              {hist.map((u, i) => (
                <div key={u.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${monthName(u.month)}: ${pounds(ai(u))} of AI, ${pounds(u.extraCost)} past the plan`}>
                  <span className="font-mono text-[10px] text-muted">{pounds(Math.round(ai(u) / 100) * 100)}</span>
                  <span className={cn('w-full rounded-[2px]', i === hist.length - 1 ? 'bg-foreground' : 'bg-[#2a2a2a]')} style={{ height: `${Math.max(4, (ai(u) / max) * 70)}%` }} />
                  <span className="font-mono text-[10px] text-faint">{monthName(u.month)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ---------- Activity and people ---------- */

export function LogRows({ entries, firm }: { entries: (FirmAccount['log'][number] & { firmName?: string; firmId?: string })[]; firm?: boolean }) {
  if (!entries.length) return <p className="px-2 py-6 text-[14px] text-muted">Nothing logged yet.</p>
  return (
    <ol className="rows">
      {entries.map((e) => {
        const by = who(e)
        return (
          <li key={e.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
            <span className="w-[120px] shrink-0 font-mono text-[12px] text-muted">{when(e.at)}</span>
            <span className="min-w-0 flex-1 text-[14px]">
              {e.summary}
              {firm && e.firmName && <span className="ml-2 text-[12.5px] text-muted">{e.firmName}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-[12.5px] sm:w-[220px] sm:justify-end">
              {e.level && <Tag>{LEVELS[['read', 'draft', 'approve', 'auto', 'never'].indexOf(e.level)]}</Tag>}
              <span className={cn(by.kind === 'staff' ? 'text-info' : by.kind === 'ardent' ? 'text-muted' : 'text-foreground')}>{by.name}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ActivityTab({ account }: { account: FirmAccount }) {
  return (
    <Card className="p-4">
      <SectionHead title={`The firm's log · ${account.log.length}`} aside="What people in the firm, Ardent and Ardent's team did" />
      <LogRows entries={account.log.slice(0, 200)} />
    </Card>
  )
}

const memberRole = { owner: 'Owner', office: 'Office', field: 'Field' } as const

function PeopleTab({ account }: { account: FirmAccount }) {
  return (
    <Card className="p-4">
      <SectionHead title={`People · ${account.members.length}`} aside={`${account.firm.engineers} engineers, ${account.firm.officeUsers} in the office`} />
      <ul className="rows">
        {account.members.map((m) => (
          <li key={m.email} className="flex items-center gap-3 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised font-mono text-[11px]">
              {m.name
                .split(/\s+/)
                .map((w) => w[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{m.name}</span>
              <span className="block truncate text-[12px] text-muted">{m.email}</span>
            </span>
            <Tag>{memberRole[m.role]}</Tag>
          </li>
        ))}
      </ul>
    </Card>
  )
}
