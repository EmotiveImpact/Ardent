import { Link } from 'react-router'
import { CheckCircle2, CircleDashed, ClipboardList, MoreHorizontal, PenLine, ShieldCheck, XCircle } from 'lucide-react'
import { Panel, PanelHeader, Row, SectionLabel, Well } from '@/components/ui/panel'
import { Badge, Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { byId, customers, engineers, jobTotal, sites } from '@/data/mock'
import type { ComplianceCheck, Job } from '@/data/model'
import { priorityMeta, statusMeta, time } from '@/lib/format'
import { formatGBP } from '@/lib/utils'

const checkIcon: Record<ComplianceCheck['state'], React.ReactNode> = {
  pass: <CheckCircle2 className="size-4 text-ok" />,
  fail: <XCircle className="size-4 text-danger" />,
  pending: <CircleDashed className="size-4 text-warn" />,
  'n/a': <CircleDashed className="size-4 text-faint" />,
}

function Token({ children }: { children: React.ReactNode }) {
  return <Chip className="h-7 bg-surface px-2.5 font-sans text-[12px]">{children}</Chip>
}

export function JobSheet({ job }: { job: Job }) {
  const customer = byId(customers, job.customerId)
  const site = byId(sites, job.siteId)
  const crew = job.engineerIds.map((id) => byId(engineers, id)?.name).join(', ')
  const net = jobTotal(job)
  return (
    <Panel className="h-full">
      <PanelHeader
        icon={<ClipboardList />}
        title={
          <span className="flex items-center gap-2">
            Live job sheet
            <span className="font-mono text-muted">{job.number}</span>
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
        <SectionLabel>1. Intake</SectionLabel>
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
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
            <div key={c.key} className="rounded-lg border border-line bg-surface p-1">
              <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
                <ShieldCheck className="size-4 text-muted" />
                {c.label}
              </div>
              <div className="flex items-center justify-between rounded-md border border-line bg-inset px-2 py-2 text-[12px]">
                <span className="truncate text-muted">{c.detail ?? c.state}</span>
                {checkIcon[c.state]}
              </div>
            </div>
          ))}
        </div>

        <SectionLabel>3. Rules on this job</SectionLabel>
        <div className="rounded-lg border border-line bg-surface p-1">
          <div className="flex items-center gap-2 px-2 py-1.5 text-[13px]">
            Rule <Chip>01</Chip>
            <span className="text-faint">·</span>
            <Badge tone={priorityMeta[job.priority].tone}>{priorityMeta[job.priority].label}</Badge>
            <Button variant="outline" size="icon-sm" className="ml-auto size-7" aria-label="Rule options">
              <MoreHorizontal />
            </Button>
          </div>
          <div className="rounded-md border border-line bg-inset">
            <div className="m-2 flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface p-2 font-mono text-[12px] text-muted">
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
        <div className="divide-y divide-line rounded-lg border border-line bg-surface">
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
