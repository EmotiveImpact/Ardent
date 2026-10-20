import { Link, useNavigate } from 'react-router'
import { CheckCircle2, CircleDashed, ClipboardList, PenLine, ShieldCheck, XCircle } from 'lucide-react'
import { checkState, clock, duration, jobStatus, pounds, relative, totals, window as timeWindow } from '@kit'
import { Panel, PanelHeader, Row, SectionLabel, Well } from '@/components/ui/panel'
import { Badge, Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HoldButton } from '@/components/ui/hold-button'
import { useArdent, useQuery, type Book } from '@/data/ardent'
import type { ComplianceCheck, Job, JobStatus } from '@/data/model'
import { useNow } from '@/hooks/use-now'
import { act } from '@/lib/act'
import { find, jobContext } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const checkIcon: Record<ComplianceCheck['state'], React.ReactNode> = {
  pass: <CheckCircle2 className="size-4 text-ok" />,
  fail: <XCircle className="size-4 text-danger" />,
  pending: <CircleDashed className="size-4 text-warn" />,
  'n/a': <CircleDashed className="size-4 text-faint" />,
}
const nextCheck: Record<ComplianceCheck['state'], ComplianceCheck['state']> = { pending: 'pass', pass: 'fail', fail: 'n/a', 'n/a': 'pending' }

const track: { key: JobStatus; label: string }[] = [
  { key: 'booked', label: 'Booked' },
  { key: 'en_route', label: 'En route' },
  { key: 'on_site', label: 'On site' },
  { key: 'complete', label: 'Done' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'paid', label: 'Paid' },
]

function ProgressTrack({ job, clockedFrom }: { job: Job; clockedFrom?: string }) {
  const now = useNow()
  const at = track.findIndex((t) => t.key === (job.status === 'paused' ? 'on_site' : job.status))
  const live = job.status === 'on_site' || job.status === 'en_route'
  const from = Date.parse(clockedFrom ?? job.start)
  const elapsed = Math.max(0, now - from)
  const planned = Math.max(1, Date.parse(job.end) - Date.parse(job.start))
  const pct = Math.min(100, Math.max(0, (elapsed / planned) * 100))
  return (
    <div className="mt-2 rounded-lg bg-surface p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="caps text-faint">{job.status === 'on_site' ? 'On the tools for' : live ? `${jobStatus[job.status].label} for` : 'Status'}</p>
          <p className="mt-1 font-mono text-[26px] leading-none tracking-tight tabular">{live ? duration(elapsed) : jobStatus[job.status].label}</p>
          {job.status === 'complete' && <span className="animate-spring caps mt-2 inline-flex h-6 items-center rounded-[5px] bg-ok/15 px-2 text-ok">Job done</span>}
          {job.status === 'paid' && <span className="animate-spring caps mt-2 inline-flex h-6 items-center rounded-[5px] bg-ember/15 px-2 text-ember">Paid</span>}
        </div>
        {live && (
          <div className="text-right font-mono text-[12px] text-muted">
            <span className="text-foreground">{Math.round(pct)}%</span> of booked time
            <p className="text-faint">ends {clock(job.end)}</p>
          </div>
        )}
      </div>
      {live && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-gradient-to-r from-ember/60 to-ember shadow-[0_0_12px_var(--ember)] transition-[width] duration-1000" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ol className="mt-3 grid grid-cols-6 gap-1">
        {track.map((t, i) => (
          <li key={t.key} className="flex flex-col gap-1.5">
            <span className={cn('h-[3px] rounded-full bg-raised', i < at && 'bg-foreground/40', i === at && 'bg-ember shadow-[0_0_8px_var(--ember)]')} />
            <span className={cn('truncate text-[10px] text-faint', i === at && 'text-foreground', i < at && 'text-muted')}>{t.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The next thing the office does with this job, if there is one. */
function NextStep({ job }: { job: Job }) {
  const { client } = useArdent()
  const navigate = useNavigate()
  if (job.status === 'on_site') return <HoldButton label="Hold to finish job" onCommit={() => void act(client.jobs.setStatus(job.id, 'complete'), `${job.ref} marked done`)} className="mt-1.5" />
  if (job.status === 'complete')
    return (
      <Button
        variant="ember"
        className="mt-1.5 h-11 w-full"
        disabled={!job.lines.length}
        onClick={async () => {
          const inv = await act(client.invoices.create(job.id), (i) => `${i.ref} drafted`)
          if (inv) navigate(`/money?invoice=${inv.id}`)
        }}
      >
        {job.lines.length ? 'Draft the invoice' : 'Add the work done before invoicing'}
      </Button>
    )
  if (job.status === 'enquiry')
    return (
      <Button
        variant="outline"
        className="mt-1.5 h-11 w-full"
        onClick={async () => {
          const q = await act(client.quotes.create(job.id), (x) => `${x.ref} drafted`)
          if (q) navigate(`/money?tab=quotes&quote=${q.id}`)
        }}
      >
        Write a quote
      </Button>
    )
  return null
}

export function JobSheet({ job, book, title = 'Live job sheet', linked = true }: { job: Job; book: Book; title?: string; linked?: boolean }) {
  const { client } = useArdent()
  const { customer, site, crew } = jobContext(job, book)
  const { data: field } = useQuery(
    async (c) => {
      const [notes, photos, time] = await Promise.all([c.notes.forJob(job.id), c.photos.forJob(job.id), c.time.forJob(job.id)])
      return { notes, photos, time }
    },
    [job.id],
  )
  const running = field?.time.find((t) => !t.end && t.kind === 'labour')
  const sums = totals(job)
  return (
    <Panel className="h-full">
      <PanelHeader
        icon={<ClipboardList />}
        title={
          <span className="flex items-center gap-2">
            {title}
            <span className="font-mono text-muted">{job.ref}</span>
          </span>
        }
        actions={
          linked && (
          <Button variant="outline" size="xs" asChild>
            <Link to={`/jobs/${job.id}`}>
              <PenLine /> Open job
            </Link>
          </Button>
          )
        }
      />
      <Well className="flex-1 overflow-y-auto px-2 pb-2">
        <ProgressTrack job={job} clockedFrom={running?.start} />
        <NextStep job={job} />
        <SectionLabel>Job</SectionLabel>
        <div className="divide-y divide-line rounded-lg bg-surface">
          <Row label="Job">
            <span className="truncate">{job.title}</span>
            <Badge tone={jobStatus[job.status].tone} dot>
              {jobStatus[job.status].label}
            </Badge>
          </Row>
          <Row label="Customer">
            {customer ? <Link to={`/customers/${customer.id}`} className="hover:text-white">{customer.name}</Link> : <span className="text-faint">Unknown</span>}
          </Row>
          <Row label="Site">
            <span className="truncate text-muted">{site?.line1}</span>
            <Chip>{site?.postcode}</Chip>
          </Row>
          <Row label="Window">
            <Chip>{timeWindow(job.start, job.end)}</Chip>
          </Row>
          <Row label="Crew">
            <span>{crew.map((o) => o.name).join(', ') || 'No one yet'}</span>
          </Row>
          {site?.accessNotes && (
            <Row label="Access">
              <span className="text-muted">{site.accessNotes}</span>
            </Row>
          )}
        </div>

        {job.checks.length > 0 && (
          <>
            <SectionLabel>Checks</SectionLabel>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {job.checks.map((c) => (
                <button
                  key={c.key}
                  title="Click to change"
                  onClick={() => void act(client.jobs.setCheck(job.id, c.key, nextCheck[c.state], c.detail))}
                  className="rounded-lg bg-surface p-1 text-left transition-colors hover:bg-[#161616]"
                >
                  <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
                    <ShieldCheck className="size-4 text-muted" />
                    <span className="truncate">{c.label}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-inset px-2 py-2 text-[12px]">
                    <span className="truncate text-muted">{c.detail ?? checkState[c.state].label}</span>
                    {checkIcon[c.state]}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {field && (field.notes.length > 0 || field.photos.length > 0) && (
          <>
            <SectionLabel>From site</SectionLabel>
            <div className="divide-y divide-line rounded-lg bg-surface">
              {field.photos.length > 0 && (
                <Row label="Photos">
                  <span className="font-mono">{field.photos.length}</span>
                </Row>
              )}
              {[...field.notes]
                .sort((a, b) => b.at.localeCompare(a.at))
                .slice(0, 3)
                .map((n) => (
                  <div key={n.id} className="px-3 py-2.5 text-[13px]">
                    <p className="text-foreground">{n.body}</p>
                    <p className="mt-1 text-[12px] text-faint">
                      {find(book.operators, n.operatorId)?.name ?? 'Crew'}, {relative(n.at)}
                    </p>
                  </div>
                ))}
            </div>
          </>
        )}

        <SectionLabel>Price</SectionLabel>
        <div className="divide-y divide-line rounded-lg bg-surface">
          {job.lines.map((l) => (
            <Row key={l.id} label={<span className="text-foreground/90">{l.description}</span>}>
              <span className="font-mono text-[12px] text-muted">
                {l.quantity} × {pounds(l.unitPrice, { always: true })}
              </span>
              <span className="w-20 font-mono tabular">{pounds(l.quantity * l.unitPrice, { always: true })}</span>
            </Row>
          ))}
          {!job.lines.length && <p className="px-3 py-3 text-[13px] text-faint">Nothing priced yet.</p>}
          {job.lines.length > 0 && (
            <Row label="Total inc. VAT">
              <span className="font-mono text-[15px] tabular text-foreground">{pounds(sums.total, { always: true })}</span>
            </Row>
          )}
        </div>
      </Well>
    </Panel>
  )
}
