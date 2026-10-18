import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Search, Wrench } from 'lucide-react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Badge, Chip } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { byId, customers, operators, jobTotal, jobs, sites } from '@/data/mock'
import type { JobStatus } from '@/data/model'
import { priorityMeta, shortDate, statusMeta, time } from '@/lib/format'
import { formatGBP } from '@/lib/utils'

const groups: Record<string, JobStatus[]> = {
  all: [],
  live: ['booked', 'en_route', 'on_site', 'paused'],
  pipeline: ['enquiry', 'quoted'],
  money: ['complete', 'invoiced', 'paid'],
}

export function Jobs() {
  const [group, setGroup] = useState('all')
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return jobs.filter((j) => {
      if (groups[group].length && !groups[group].includes(j.status)) return false
      if (!term) return true
      const c = byId(customers, j.customerId)
      const s = byId(sites, j.siteId)
      return [j.ref, j.title, c?.name, s?.postcode].some((v) => v?.toLowerCase().includes(term))
    })
  }, [group, q])

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
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
            className="h-9 w-full rounded-md border border-line bg-surface pr-3 pl-8 text-[13px] outline-none placeholder:text-faint focus:border-line-strong"
          />
        </label>
      </div>

      <Panel>
        <PanelHeader icon={<Wrench />} title={`${rows.length} jobs`} />
        <Well className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="text-muted">
              <tr className="border-b border-line">
                {['Job', 'What', 'Customer', 'Site', 'When', 'Crew', 'Priority', 'Value', 'Status'].map((h) => (
                  <th key={h} className={`h-10 px-3 font-normal ${h === 'Value' || h === 'Status' ? 'text-right' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const c = byId(customers, j.customerId)
                const s = byId(sites, j.siteId)
                return (
                  <tr key={j.id} className="group border-b border-line/70 last:border-0 hover:bg-white/[0.02]">
                    <td className="h-12 px-3">
                      <Link to={`/jobs/${j.id}`} className="font-mono text-[12px] text-foreground group-hover:text-ember">
                        {j.ref}
                      </Link>
                    </td>
                    <td className="px-3">
                      <Link to={`/jobs/${j.id}`}>{j.title}</Link>
                    </td>
                    <td className="px-3 text-muted">{c?.name}</td>
                    <td className="px-3">
                      <Chip>{s?.postcode}</Chip>
                    </td>
                    <td className="px-3 font-mono text-[12px] whitespace-nowrap text-muted">
                      {shortDate(j.start)} · {time(j.start)}
                    </td>
                    <td className="px-3">
                      <div className="flex -space-x-1.5">
                        {j.operatorIds.length ? (
                          j.operatorIds.map((id) => <Avatar key={id} initials={byId(operators, id)?.initials ?? '?'} />)
                        ) : (
                          <span className="text-faint">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3">
                      <Badge tone={priorityMeta[j.priority].tone}>{priorityMeta[j.priority].label}</Badge>
                    </td>
                    <td className="px-3 text-right font-mono tabular">{jobTotal(j) ? formatGBP(jobTotal(j)) : '·'}</td>
                    <td className="px-3 text-right">
                      <Badge tone={statusMeta[j.status].tone} dot>
                        {statusMeta[j.status].label}
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
