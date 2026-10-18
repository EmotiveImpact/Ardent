import { useMemo, useState, type CSSProperties } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, FileBadge2, ShieldCheck } from 'lucide-react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Badge, Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { byId, certificates, customers, sites } from '@/data/mock'
import type { Certificate } from '@/data/model'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/use-now'

const TODAY = Date.parse('2026-10-18')
const daysFrom = (iso: string) => Math.round((Date.parse(iso) - TODAY) / 86_400_000)

const stateMeta: Record<Certificate['state'], { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral'; bar: string }> = {
  overdue: { label: 'Overdue', tone: 'danger', bar: 'bg-danger' },
  due_soon: { label: 'Due soon', tone: 'warn', bar: 'bg-warn' },
  valid: { label: 'Valid', tone: 'ok', bar: 'bg-ok' },
  draft: { label: 'Draft', tone: 'neutral', bar: 'bg-faint' },
}

function Score({ value }: { value: number }) {
  const v = useCountUp(value, 1200)
  const r = 44
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--raised)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--ember)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ filter: 'drop-shadow(0 0 6px var(--ember))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[28px] leading-none tabular">{Math.round(v)}</span>
        <span className="mt-1 text-[10px] tracking-wider text-faint uppercase">Score</span>
      </div>
    </div>
  )
}

export function Certificates() {
  const [filter, setFilter] = useState<'all' | Certificate['state']>('all')
  const [booked, setBooked] = useState<Set<string>>(new Set())
  const counts = useMemo(
    () => ({
      overdue: certificates.filter((c) => c.state === 'overdue').length,
      due_soon: certificates.filter((c) => c.state === 'due_soon').length,
      valid: certificates.filter((c) => c.state === 'valid').length,
    }),
    [],
  )
  const total = certificates.length
  const score = Math.round(((counts.valid + counts.due_soon * 0.6) / total) * 100)
  const order: Certificate['state'][] = ['overdue', 'due_soon', 'valid', 'draft']
  const rows = certificates
    .filter((c) => filter === 'all' || c.state === filter)
    .sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || Date.parse(a.expires) - Date.parse(b.expires))

  const book = (c: Certificate) => {
    setBooked((s) => new Set(s).add(c.id))
    const site = byId(sites, c.siteId)
    toast.success(`${c.kind} renewal booked`, { description: `${site?.line1}, Tue 20 Oct 09:00. Customer sent a confirmation.` })
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <Panel style={{ '--i': 0 } as CSSProperties}>
        <PanelHeader icon={<ShieldCheck />} title="Compliance position" />
        <Well className="flex flex-col gap-5 p-4 sm:flex-row sm:items-center">
          <Score value={score} />
          <div className="min-w-0 flex-1">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-raised">
              {(['overdue', 'due_soon', 'valid'] as const).map((k) => (
                <span key={k} className={cn('h-full transition-all', stateMeta[k].bar)} style={{ width: `${(counts[k] / total) * 100}%` }} />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {(['overdue', 'due_soon', 'valid'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(filter === k ? 'all' : k)}
                  className={cn(
                    'rounded-lg bg-surface px-3 py-2.5 text-left transition-colors',
                    filter === k && 'bg-raised',
                  )}
                >
                  <span className="flex items-center gap-2 text-[12px] text-muted">
                    <span className={cn('size-1.5 rounded-full', stateMeta[k].bar)} />
                    {stateMeta[k].label}
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
              <tr className="border-b ">
                <th className="h-10 px-3 font-normal">Type</th>
                <th className="px-3 font-normal">Site</th>
                <th className="px-3 font-normal">Customer</th>
                <th className="px-3 font-normal">Expires</th>
                <th className="px-3 text-right font-normal">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const site = byId(sites, c.siteId)
                const d = daysFrom(c.expires)
                const isBooked = booked.has(c.id) || !!c.jobId
                return (
                  <tr key={c.id} className="group border-b last:border-0 hover:bg-white/[0.025]">
                    <td className="h-12 px-3">
                      <Chip>{c.kind}</Chip>
                    </td>
                    <td className="px-3">
                      {site?.line1} <span className="ml-1 font-mono text-[11px] text-faint">{site?.postcode}</span>
                    </td>
                    <td className="px-3 text-muted">{byId(customers, site?.customerId)?.name}</td>
                    <td className="px-3 font-mono text-[12px] whitespace-nowrap">
                      {shortDate(c.expires)}
                      <span className={cn('ml-2', d < 0 ? 'text-danger' : d <= 30 ? 'text-warn' : 'text-faint')}>
                        {d < 0 ? `${-d}d late` : d === 0 ? 'today' : `in ${d}d`}
                      </span>
                    </td>
                    <td className="px-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        {c.state !== 'valid' &&
                          (isBooked ? (
                            <Badge tone="info">Renewal booked</Badge>
                          ) : (
                            <Button size="xs" variant="outline" className="h-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => book(c)}>
                              <CalendarPlus /> Book renewal
                            </Button>
                          ))}
                        <Badge tone={stateMeta[c.state].tone} dot>
                          {stateMeta[c.state].label}
                        </Badge>
                      </span>
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
