import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search, Wrench } from 'lucide-react'
import { Panel, PanelHeader, Well, PageHeader } from '@/components/ui/panel'
import { Badge, Chip } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { clock, jobStatus, pounds, priority as priorityMeta, shortDate } from '@kit'
import { useBook } from '@/data/ardent'
import type { JobStatus } from '@/data/model'
import { find, isDone, jobNet } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { NewJobDialog } from '@/components/new-job-dialog'
import { Button } from '@/components/ui/button'

const groups: Record<string, JobStatus[]> = {
  all: [],
  live: ['booked', 'en_route', 'on_site', 'paused'],
  pipeline: ['enquiry', 'quoted'],
  money: ['complete', 'invoiced', 'paid'],
}

export function Jobs() {
  const [group, setGroup] = useState('all')
  const [q, setQ] = useState('')
  const { data: book } = useBook()
  const rows = useMemo(() => {
    if (!book) return []
    const { customers, sites } = book
    const term = q.trim().toLowerCase()
    return [...book.jobs].sort((a, b) => b.start.localeCompare(a.start)).filter((j) => {
      if (groups[group].length && !groups[group].includes(j.status)) return false
      if (!term) return true
      const c = find(customers, j.customerId)
      const s = find(sites, j.siteId)
      return [j.ref, j.title, c?.name, s?.postcode, s?.line1].some((v) => v?.toLowerCase().includes(term))
    })
  }, [group, q, book])

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader
        eyebrow="Every job, enquiry to paid"
        title="Jobs"
        aside={
          <NewJobDialog>
            <Button variant="ember" size="sm">New job</Button>
          </NewJobDialog>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={group} onValueChange={setGroup}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="pipeline">Enquiries and quotes</TabsTrigger>
            <TabsTrigger value="money">To bill</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by job, customer, postcode"
            className="h-9 w-full rounded-md bg-surface pr-3 pl-8 text-[13px] outline-none placeholder:text-faint"
          />
        </label>
      </div>

      <Panel>
        <PanelHeader icon={<Wrench />} title={`${rows.length} jobs`} />
        <Well className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="text-muted">
              <tr className="border-b ">
                {['Job', 'What', 'Customer', 'Site', 'When', 'Crew', 'Priority', 'Value', 'Status'].map((h) => (
                  <th key={h} className={`h-10 px-3 font-normal ${h === 'Value' || h === 'Status' ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const c = find(book?.customers, j.customerId)
                const s = find(book?.sites, j.siteId)
                return (
                  <tr key={j.id} className={cn('group border-b transition-opacity last:border-0 hover:bg-white/[0.02] hover:opacity-100', isDone(j) && 'opacity-55')}>
                    <td className="h-12 px-3">
                      <Link to={`/jobs/${j.id}`} className="font-mono text-[12px] text-foreground group-hover:text-white">
                        {j.ref}
                      </Link>
                    </td>
                    <td className="px-3">
                      <Link to={`/jobs/${j.id}`}>{j.title}</Link>
                    </td>
                    <td className="px-3 text-muted">{c && <Link to={`/customers/${c.id}`} className="hover:text-foreground">{c.name}</Link>}</td>
                    <td className="px-3">
                      <Chip>{s?.postcode}</Chip>
                    </td>
                    <td className="px-3 font-mono text-[12px] whitespace-nowrap text-muted">
                      {shortDate(j.start)} · {clock(j.start)}
                    </td>
                    <td className="px-3">
                      <div className="flex -space-x-1.5">
                        {j.operatorIds.length ? (
                          j.operatorIds.map((id) => <Avatar key={id} initials={find(book?.operators, id)?.initials ?? '?'} />)
                        ) : (
                          <span className="text-faint">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3">
                      <Badge tone={priorityMeta[j.priority].tone}>{priorityMeta[j.priority].label}</Badge>
                    </td>
                    <td className="px-3 text-right font-mono tabular">{jobNet(j) ? pounds(jobNet(j)) : '·'}</td>
                    <td className="px-3 text-right">
                      <Badge tone={jobStatus[j.status].tone} dot>
                        {jobStatus[j.status].label}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Well>
      </Panel>
    </div>
  )
}
