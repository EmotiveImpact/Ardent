import { Link, useParams } from 'react-router'
import { ArrowLeft, MapPin, Phone } from 'lucide-react'
import { JobSheet } from '@/components/dashboard/job-sheet'
import { Panel, PanelHeader, Row, Well } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/badge'
import { byId, customers, jobs, sites } from '@/data/mock'
import { formatGBP } from '@/lib/utils'

export function JobDetail() {
  const { id } = useParams()
  const job = byId(jobs, id)
  if (!job) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted">
        That job does not exist.
        <Button variant="outline" size="sm" asChild>
          <Link to="/jobs">Back to jobs</Link>
        </Button>
      </div>
    )
  }
  const customer = byId(customers, job.customerId)
  const site = byId(sites, job.siteId)
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" asChild className="self-start">
          <Link to="/jobs">
            <ArrowLeft /> All jobs
          </Link>
        </Button>
        <JobSheet job={job} />
      </div>
      <div className="flex flex-col gap-3 lg:pt-11">
        <Panel>
          <PanelHeader icon={<Phone />} title="Customer" />
          <Well className="divide-y divide-line">
            <Row label="Name">{customer?.name}</Row>
            <Row label="Phone">
              <Chip>{customer?.phone}</Chip>
            </Row>
            <Row label="Owes">
              <span className="font-mono">{formatGBP(customer?.balance ?? 0)}</span>
            </Row>
          </Well>
        </Panel>
        <Panel>
          <PanelHeader icon={<MapPin />} title="Site" />
          <Well className="divide-y divide-line">
            <Row label="Address">{site?.line1}</Row>
            <Row label="Town">{site?.town}</Row>
            <Row label="Postcode">
              <Chip>{site?.postcode}</Chip>
            </Row>
            {site?.accessNotes && (
              <p className="px-3 py-3 text-[13px] text-muted">
                <span className="text-foreground">Access: </span>
                {site.accessNotes}
              </p>
            )}
          </Well>
        </Panel>
        {job.notes && (
          <Panel>
            <PanelHeader title="Notes" />
            <Well className="p-3 text-[13px] text-muted">{job.notes}</Well>
          </Panel>
        )}
      </div>
    </div>
  )
}
