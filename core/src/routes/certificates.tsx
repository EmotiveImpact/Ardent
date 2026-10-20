import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { CalendarPlus, FileBadge2, ShieldCheck } from 'lucide-react'
import { certificateState, shortDate, ukToIso } from '@kit'
import { Panel, PanelHeader, Well, PageHeader } from '@/components/ui/panel'
import { Badge, Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useArdent, useBook } from '@/data/ardent'
import type { Certificate, CertificateKind, ComplianceCheck, Trade } from '@/data/model'
import { act } from '@/lib/act'
import { addDays, find, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/use-now'

const daysFrom = (day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86_400_000)
const bar: Record<Certificate['state'], string> = { overdue: 'bg-danger', due_soon: 'bg-warn', valid: 'bg-ok', draft: 'bg-faint' }
const order: Certificate['state'][] = ['overdue', 'due_soon', 'valid', 'draft']

/** The trade and checks a renewal visit needs. */
const renewal: Record<CertificateKind, { trade: Trade; title: string; hours: number; checks: ComplianceCheck['key'][] }> = {
  CP12: { trade: 'gas', title: 'Landlord gas safety check (CP12)', hours: 1, checks: ['registration', 'gas_tightness'] },
  'Boiler service': { trade: 'heating', title: 'Annual boiler service', hours: 1, checks: ['registration', 'gas_tightness'] },
  EICR: { trade: 'electrical', title: 'Electrical installation condition report', hours: 3, checks: ['registration', 'eicr'] },
  PAT: { trade: 'electrical', title: 'PAT testing', hours: 2, checks: [] },
  BS5839: { trade: 'fire', title: 'Fire alarm service (BS 5839)', hours: 2, checks: [] },
  Unvented: { trade: 'plumbing', title: 'Unvented cylinder service', hours: 1, checks: [] },
}
const checkName: Record<ComplianceCheck['key'], string> = { rams: 'RAMS', permit: 'Permit', registration: 'Registration', gas_tightness: 'Tightness test', eicr: 'Electrical cert', photos: 'Photos', signature: 'Customer sign-off' }

function Score({ value }: { value: number }) {
  const v = useCountUp(value, 1200)
  const r = 44
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--raised)" strokeWidth="6" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--ember)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ filter: 'drop-shadow(0 0 6px var(--ember))' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[28px] leading-none tabular">{Math.round(v)}%</span>
        <span className="mt-1 text-[10px] tracking-wider text-faint uppercase">In date</span>
      </div>
    </div>
  )
}

export function Certificates() {
  const { client } = useArdent()
  const { data: book } = useBook()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'all' | Certificate['state']>('all')
  const certs = book?.certificates ?? []
  const counts = { overdue: 0, due_soon: 0, valid: 0, draft: 0 }
  for (const c of certs) counts[c.state]++
  const total = Math.max(1, certs.length - counts.draft)
  const score = Math.round(((counts.valid + counts.due_soon) / total) * 100)
  const rows = certs.filter((c) => filter === 'all' || c.state === filter).sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.expires.localeCompare(b.expires))

  /** A renewal visit already in the book for this site and kind of work. */
  const booked = (c: Certificate) => {
    const r = renewal[c.kind]
    return book?.jobs.find((j) => j.siteId === c.siteId && j.title === r.title && !['complete', 'invoiced', 'paid', 'cancelled'].includes(j.status))
  }

  const bookRenewal = async (c: Certificate) => {
    const site = find(book?.sites, c.siteId)
    if (!site) return
    const r = renewal[c.kind]
    const start = ukToIso(addDays(today(), 1), '09:00')
    const job = await act(
      client.jobs.create({
        title: r.title,
        trade: r.trade,
        status: 'booked',
        priority: c.state === 'overdue' ? 'high' : 'normal',
        customerId: site.customerId,
        siteId: site.id,
        operatorIds: [],
        start,
        end: new Date(Date.parse(start) + r.hours * 3_600_000).toISOString(),
        lines: [],
        checks: (['rams', ...r.checks, 'photos', 'signature'] as ComplianceCheck['key'][]).map((key) => ({ key, label: checkName[key], state: 'pending' })),
        notes: `Renewal of ${c.kind}, expires ${c.expires}.`,
      }),
      (j) => `${j.ref} booked for tomorrow 09:00. Pick who goes on the schedule.`,
    )
    if (job) navigate(`/jobs/${job.id}`)
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader
        eyebrow="Renewals your customers rely on"
        title="Certificates"
        aside={
          <span className="caps flex h-8 items-center gap-2 rounded-md bg-surface px-3 text-muted">
            <span className={cn('size-1.5 rounded-full', counts.overdue ? 'bg-danger' : 'bg-ok')} />
            {counts.overdue} overdue
          </span>
        }
      />
      <Panel style={{ '--i': 0 } as CSSProperties}>
        <PanelHeader icon={<ShieldCheck />} title="Where you stand" />
        <Well className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center">
          <Score value={book ? score : 0} />
          <div className="min-w-0 flex-1">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-raised">
              {(['overdue', 'due_soon', 'valid'] as const).map((k) => (
                <span key={k} className={cn('h-full transition-all', bar[k])} style={{ width: `${(counts[k] / total) * 100}%` }} />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {(['overdue', 'due_soon', 'valid'] as const).map((k) => (
                <button key={k} onClick={() => setFilter(filter === k ? 'all' : k)} className={cn('rounded-lg bg-surface px-3 py-2.5 text-left transition-colors hover:bg-raised', filter === k && 'bg-raised')}>
                  <span className="flex items-center gap-2 text-[12px] text-muted">
                    <span className={cn('size-1.5 rounded-full', bar[k])} />
                    {certificateState[k].label}
                  </span>
                  <span className="mt-1 block font-mono text-[22px] leading-none tabular">{counts[k]}</span>
                </button>
              ))}
            </div>
          </div>
        </Well>
      </Panel>

      <Panel style={{ '--i': 1 } as CSSProperties}>
        <PanelHeader
          icon={<FileBadge2 />}
          title="Certificates"
          actions={
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList className="h-8">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="overdue">Overdue</TabsTrigger>
                <TabsTrigger value="due_soon">Due soon</TabsTrigger>
                <TabsTrigger value="valid">Valid</TabsTrigger>
              </TabsList>
            </Tabs>
          }
          className="h-11"
        />
        <Well className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-muted">
              <tr className="border-b">
                <th className="h-10 px-3 font-normal">Type</th>
                <th className="px-3 font-normal">Site</th>
                <th className="px-3 font-normal">Customer</th>
                <th className="px-3 font-normal">Expires</th>
                <th className="px-3 text-right font-normal">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const site = find(book?.sites, c.siteId)
                const customer = find(book?.customers, site?.customerId)
                const d = daysFrom(c.expires)
                const visit = booked(c)
                return (
                  <tr key={c.id} className="group border-b last:border-0 hover:bg-white/[0.025]">
                    <td className="h-12 px-3">
                      <Chip>{c.kind}</Chip>
                    </td>
                    <td className="px-3">
                      {site?.line1} <span className="ml-1 font-mono text-[11px] text-faint">{site?.postcode}</span>
                    </td>
                    <td className="px-3 text-muted">{customer && <Link to={`/customers/${customer.id}`} className="hover:text-foreground">{customer.name}</Link>}</td>
                    <td className="px-3 font-mono text-[12px] whitespace-nowrap">
                      {shortDate(`${c.expires}T12:00:00Z`)}
                      <span className={cn('ml-2', d < 0 ? 'text-danger' : d <= 30 ? 'text-warn' : 'text-faint')}>{d < 0 ? `${-d}d late` : d === 0 ? 'today' : `in ${d}d`}</span>
                    </td>
                    <td className="px-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        {c.state !== 'valid' &&
                          (visit ? (
                            <Link to={`/jobs/${visit.id}`}>
                              <Badge tone="info">Renewal booked {shortDate(visit.start)}</Badge>
                            </Link>
                          ) : (
                            <Button size="xs" variant="outline" className="h-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => void bookRenewal(c)}>
                              <CalendarPlus /> Book renewal
                            </Button>
                          ))}
                        <Badge tone={certificateState[c.state].tone} dot>
                          {certificateState[c.state].label}
                        </Badge>
                      </span>
                    </td>
                  </tr>
                )
              })}
              {book && !rows.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-faint">
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Well>
      </Panel>
    </div>
  )
}
