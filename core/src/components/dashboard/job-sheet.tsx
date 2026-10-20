import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { CheckCircle2, CircleDashed, ClipboardList, MoreHorizontal, PenLine, ShieldCheck, XCircle } from 'lucide-react'
import { Panel, PanelHeader, Row, SectionLabel, Well } from '@/components/ui/panel'
import { Badge, Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HoldButton } from '@/components/ui/hold-button'
import { byId, customers, operators, jobTotal, sites } from '@/data/mock'
import type { ComplianceCheck, Job } from '@/data/model'
import { duration, priorityMeta, statusMeta, time } from '@/lib/format'
import { useNow } from '@/hooks/use-now'
import { cn } from '@/lib/utils'
import type { JobStatus } from '@/data/model'
import { formatGBP } from '@/lib/utils'

const checkIcon: Record<ComplianceCheck['state'], React.ReactNode> = {
  pass: <CheckCircle2 className="size-4 text-ok" />,
  fail: <XCircle className="size-4 text-danger" />,
  pending: <CircleDashed className="size-4 text-warn" />,
  'n/a': <CircleDashed className="size-4 text-faint" />,
}

const track: { key: JobStatus; label: string }[] = [
  { key: 'booked', label: 'Booked' },
  { key: 'en_route', label: 'En route' },
  { key: 'on_site', label: 'On site' },
  { key: 'complete', label: 'Done' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'paid', label: 'Paid' },
]

function ProgressTrack({ job }: { job: Job }) {
  const now = useNow()
  const at = track.findIndex((t) => t.key === job.status)
  const live = job.status === 'on_site' || job.status === 'en_route'
  const elapsed = now - Date.parse(job.start)
  const planned = Date.parse(job.end) - Date.parse(job.start)
  const pct = Math.min(100, Math.max(0, (elapsed / planned) * 100))
  return (
    <div className="mt-2 rounded-lg bg-surface p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="caps text-faint">{job.status === 'on_site' ? 'On the tools for' : live ? statusMeta[job.status].label + ' for' : 'Status'}</p>
          <p className="mt-1 font-mono text-[26px] leading-none tracking-tight tabular">
            {live ? duration(elapsed) : statusMeta[job.status].label}
          </p>
          {job.status === 'complete' && (
            <span className="animate-spring caps mt-2 inline-flex h-6 items-center rounded-[5px] bg-ok/15 px-2 text-ok">Job done</span>
          )}
        </div>
        {live && (
          <div className="text-right font-mono text-[12px] text-muted">
            <span className="text-foreground">{Math.round(pct)}%</span> of booked time
            <p className="text-faint">ends {time(job.end)}</p>
          </div>
        )}
      </div>
      {live && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ember/60 to-ember shadow-[0_0_12px_var(--ember)] transition-[width] duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <ol className="mt-3 grid grid-cols-6 gap-1">
        {track.map((t, i) => (
          <li key={t.key} className="flex flex-col gap-1.5">
            <span
              className={cn(
                'h-[3px] rounded-full bg-raised',
                i < at && 'bg-foreground/40',
                i === at && 'bg-ember shadow-[0_0_8px_var(--ember)]',
              )}
            />
            <span className={cn('truncate text-[10px] text-faint', i === at && 'text-foreground', i < at && 'text-muted')}>{t.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Token({ children }: { children: React.ReactNode }) {
  return <Chip className="h-7 bg-raised px-2.5 font-sans text-[12px]">{children}</Chip>
}

export function JobSheet({ job: initial }: { job: Job }) {
  const [status, setStatus] = useState(initial.status)
  const job = { ...initial, status }
  const finish = () => {
    setStatus('complete')
    toast.success(`${job.ref} marked done`, {
      description: 'Sign-off photos saved. Invoice is ready to send.',
      action: { label: 'Undo', onClick: () => setStatus(initial.status) },
    })
  }
  const customer = byId(customers, job.customerId)
  const site = byId(sites, job.siteId)
  const crew = job.operatorIds.map((id) => byId(operators, id)?.name).join(', ')
  const net = jobTotal(job)
  return (
    <Panel className="h-full">
      <PanelHeader
        icon={<ClipboardList />}
        title={
          <span className="flex items-center gap-2">
            Live job sheet
            <span className="font-mono text-muted">{job.ref}</span>
          </span>
        }
        actions={
          <Button variant="outline" size="xs" asChild>
            <Link to={`/jobs/${job.id}`}>
              <PenLine /> Edit job
            </Link>
          </Button>
        }
      />
      <Well className="flex-1 overflow-y-auto px-2 pb-2">
        <ProgressTrack job={job} />
        {job.status === 'on_site' && <HoldButton label="Hold to finish job" onCommit={finish} className="mt-1.5" />}
        <SectionLabel>1. Intake</SectionLabel>
        <div className="divide-y divide-line rounded-lg bg-surface">
          <Row label="Job">
            <span className="truncate">{job.title}</span>
            <Badge tone={statusMeta[job.status].tone} dot>
              {statusMeta[job.status].label}
            </Badge>
          </Row>
          <Row label="Customer">
            <span>{customer?.name}</span>
          </Row>
          <Row label="Site">
            <span className="text-muted">{site?.line1}</span>
            <Chip>{site?.postcode}</Chip>
          </Row>
          <Row label="Window">
            <Chip>
              {time(job.start)} to {time(job.end)}
            </Chip>
          </Row>
          <Row label="Crew">
            <span>{crew || 'Unassigned'}</span>
          </Row>
        </div>

        <SectionLabel>2. Compliance gates</SectionLabel>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          {job.checks.map((c) => (
            <div key={c.key} className="rounded-lg bg-surface p-1">
              <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
                <ShieldCheck className="size-4 text-muted" />
                {c.label}
              </div>
              <div className="flex items-center justify-between rounded-md bg-inset px-2 py-2 text-[12px]">
                <span className="truncate text-muted">{c.detail ?? c.state}</span>
                {checkIcon[c.state]}
              </div>
            </div>
          ))}
        </div>

        <SectionLabel>3. Rules on this job</SectionLabel>
        <div className="rounded-lg bg-surface p-1">
          <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
            Rule <Chip>01</Chip>
            <span className="text-faint">·</span>
            <Badge tone={priorityMeta[job.priority].tone}>{priorityMeta[job.priority].label}</Badge>
            <Button variant="outline" size="icon-sm" className="ml-auto size-7" aria-label="Rule options">
              <MoreHorizontal />
            </Button>
          </div>
          <div className="rounded-md bg-inset">
            <div className="m-2 flex flex-wrap items-center gap-1.5 rounded-md bg-surface p-2 font-mono text-[12px] text-muted">
              IF <span className="text-faint">[</span>
              <Token>Trade</Token>
              <span className="text-faint">]</span> == <span className="text-faint">[</span>
              <Token>Gas</Token>, <Token>Boiler</Token>
              <span className="text-faint">]</span>
            </div>
            <Row label="Require">
              <Chip>Benchmark</Chip>
              <Chip>CP12</Chip>
            </Row>
            <Row label="Hold invoice until">
              <Chip>Tightness pass</Chip>
            </Row>
            <Row label="Notify">
              <Chip>Warranty reg.</Chip>
            </Row>
          </div>
        </div>

        <SectionLabel>4. Price</SectionLabel>
        <div className="divide-y divide-line rounded-lg bg-surface">
          {job.lines.map((l) => (
            <Row key={l.id} label={<span className="text-foreground/90">{l.description}</span>}>
              <span className="font-mono text-[12px] text-muted">
                {l.quantity} × {formatGBP(l.unitPrice)}
              </span>
              <span className="w-20 font-mono tabular">{formatGBP(l.quantity * l.unitPrice)}</span>
            </Row>
          ))}
          <Row label="Total inc. VAT">
            <span className="font-mono text-[15px] tabular text-foreground">{formatGBP(net * 1.2)}</span>
          </Row>
        </div>
      </Well>
    </Panel>
  )
}
