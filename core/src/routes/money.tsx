import { useState, type CSSProperties } from 'react'
import { toast } from 'sonner'
import { Banknote, FileText, Hourglass, PoundSterling, Send, TrendingUp } from 'lucide-react'
import { Panel, PanelHeader, Well, PageHeader } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { byId, customers, invoiceTotal, invoices, quotes, weeklyCash } from '@/data/mock'
import type { Invoice, Quote } from '@/data/model'
import { shortDate } from '@/lib/format'
import { cn, formatGBP } from '@/lib/utils'
import { useCountUp } from '@/hooks/use-now'

const invoiceTone: Record<Invoice['status'], 'neutral' | 'info' | 'warn' | 'ok' | 'danger'> = {
  draft: 'neutral',
  sent: 'info',
  part_paid: 'warn',
  paid: 'ok',
  overdue: 'danger',
  void: 'neutral',
}
const quoteTone: Record<Quote['status'], 'neutral' | 'info' | 'ok' | 'danger' | 'warn'> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'ok',
  declined: 'danger',
  expired: 'warn',
}
const label = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).replace('_', '')

function Stat({ icon, title, pence, note, tone, index }: { icon: React.ReactNode; title: string; pence: number; note: string; tone?: string; index: number }) {
  const v = useCountUp(pence)
  return (
    <Panel style={{ '--i': index } as CSSProperties}>
      <PanelHeader icon={icon} title={title} />
      <Well className="px-3 py-3">
        <p className={cn('font-mono text-[26px] leading-none tracking-tight tabular', tone)}>{formatGBP(Math.round(v))}</p>
      </Well>
      <p className="px-2.5 pt-2.5 pb-1 text-[12px] text-muted">{note}</p>
    </Panel>
  )
}

function CashChart() {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...weeklyCash.flatMap((w) => [w.invoiced, w.paid]))
  const h = hover ?? weeklyCash.length - 1
  return (
    <Panel style={{ '--i': 4 } as CSSProperties}>
      <PanelHeader
        icon={<TrendingUp />}
        title="Cash in, last 8 weeks"
        actions={
          <span className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-ember" /> Paid
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-[#3a3a3a]" /> Invoiced
            </span>
          </span>
        }
      />
      <Well className="flex flex-1 flex-col p-4">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="font-mono text-[22px] tabular">£{weeklyCash[h].paid.toLocaleString('en-GB')}</span>
          <span className="text-[12px] text-muted">paid w/c {weeklyCash[h].week}</span>
          <span className="ml-auto font-mono text-[12px] text-faint">invoiced £{weeklyCash[h].invoiced.toLocaleString('en-GB')}</span>
        </div>
        <div className="flex min-h-44 flex-1 items-end gap-3" onMouseLeave={() => setHover(null)}>
          {weeklyCash.map((w, i) => (
            <div key={w.week} className="flex h-full flex-1 flex-col justify-end gap-2" onMouseEnter={() => setHover(i)}>
              <div className="flex flex-1 items-end justify-center gap-1">
                <span
                  className="animate-grow w-full max-w-4 rounded-t-[3px] bg-[#333]"
                  style={{ '--i': i, height: `${(w.invoiced / max) * 100}%`, '--o': h === i ? 1 : 0.6 } as CSSProperties}
                />
                <span
                  className="animate-grow w-full max-w-4 rounded-t-[3px] bg-gradient-to-t from-ember/50 to-ember"
                  style={
                    {
                      '--i': i,
                      height: `${(w.paid / max) * 100}%`,
                      '--o': h === i ? 1 : 0.55,
                      boxShadow: h === i ? '0 0 16px -2px var(--ember)' : undefined,
                    } as CSSProperties
                  }
                />
              </div>
              <span className={cn('text-center font-mono text-[10px] text-faint', h === i && 'text-foreground')}>{w.week}</span>
            </div>
          ))}
        </div>
      </Well>
    </Panel>
  )
}

export function Money() {
  const [tab, setTab] = useState('invoices')
  const [rows, setRows] = useState(invoices)
  const outstanding = rows.filter((i) => ['sent', 'part_paid', 'overdue'].includes(i.status)).reduce((s, i) => s + invoiceTotal(i) - i.paidAmount, 0)
  const overdue = rows.filter((i) => i.status === 'overdue').reduce((s, i) => s + invoiceTotal(i) - i.paidAmount, 0)
  const paid = weeklyCash.slice(-4).reduce((s, w) => s + w.paid * 100, 0)
  const pipeline = quotes.filter((q) => q.status === 'sent').reduce((s, q) => s + q.lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0), 0)

  const chase = (inv: Invoice) => {
    toast.success(`Reminder sent for ${inv.ref}`, { description: `${byId(customers, inv.customerId)?.name} by text and email.` })
  }
  const send = (inv: Invoice) => {
    setRows((r) => r.map((x) => (x.id === inv.id ? { ...x, status: 'sent', issuedAt: '2026-10-18T10:03:00Z', dueAt: '2026-11-01T00:00:00Z' } : x)))
    toast.success(`${inv.ref} sent`, { description: 'Due 1 Nov. Card link included.' })
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader eyebrow="Invoices, payments and cash in" title="Money" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat index={0} icon={<Hourglass />} title="Outstanding" pence={outstanding} note={`${rows.filter((i) => ['sent', 'part_paid', 'overdue'].includes(i.status)).length} invoices waiting`} />
        <Stat index={1} icon={<PoundSterling />} title="Overdue" pence={overdue} tone="text-danger" note="Northgate Lettings, 12 days late" />
        <Stat index={2} icon={<Banknote />} title="Paid, last 4 weeks" pence={paid} tone="text-ok" note="Average 6 days to pay" />
        <Stat index={3} icon={<FileText />} title="Quotes out" pence={pipeline} note="1 quote awaiting a yes" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <CashChart />
        <Panel style={{ '--i': 5 } as CSSProperties}>
          <PanelHeader
            icon={<FileText />}
            title={
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="h-8">
                  <TabsTrigger value="invoices">Invoices</TabsTrigger>
                  <TabsTrigger value="quotes">Quotes</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            className="h-11"
          />
          <Well className="overflow-x-auto">
            {tab === 'invoices' ? (
              <table className="w-full min-w-[620px] text-left text-[13px]">
                <thead className="text-muted">
                  <tr className="border-b ">
                    <th className="h-10 px-3 font-normal">Invoice</th>
                    <th className="px-3 font-normal">Customer</th>
                    <th className="px-3 font-normal">Due</th>
                    <th className="px-3 text-right font-normal">Amount</th>
                    <th className="px-3 text-right font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => (
                    <tr key={inv.id} className="group border-b last:border-0 hover:bg-white/[0.025]">
                      <td className="h-12 px-3 font-mono text-[12px]">{inv.ref}</td>
                      <td className="px-3">{byId(customers, inv.customerId)?.name}</td>
                      <td className={cn('px-3 font-mono text-[12px] text-muted', inv.status === 'overdue' && 'text-danger')}>
                        {inv.dueAt ? shortDate(inv.dueAt) : '·'}
                      </td>
                      <td className="px-3 text-right font-mono tabular">
                        {formatGBP(invoiceTotal(inv))}
                        {inv.status === 'part_paid' && <span className="block text-[11px] text-faint">{formatGBP(inv.paidAmount)} paid</span>}
                      </td>
                      <td className="px-3 text-right">
                        <span className="inline-flex items-center gap-2">
                          {inv.status === 'draft' && (
                            <Button size="xs" variant="outline" className="h-6 opacity-0 group-hover:opacity-100" onClick={() => send(inv)}>
                              <Send /> Send
                            </Button>
                          )}
                          {(inv.status === 'overdue' || inv.status === 'part_paid') && (
                            <Button size="xs" variant="outline" className="h-6 opacity-0 group-hover:opacity-100" onClick={() => chase(inv)}>
                              Chase
                            </Button>
                          )}
                          <Badge tone={invoiceTone[inv.status]} dot>
                            {label(inv.status)}
                          </Badge>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[620px] text-left text-[13px]">
                <thead className="text-muted">
                  <tr className="border-b ">
                    <th className="h-10 px-3 font-normal">Quote</th>
                    <th className="px-3 font-normal">For</th>
                    <th className="px-3 font-normal">Customer</th>
                    <th className="px-3 font-normal">Valid to</th>
                    <th className="px-3 text-right font-normal">Value</th>
                    <th className="px-3 text-right font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q) => (
                    <tr key={q.id} className="border-b last:border-0 hover:bg-white/[0.025]">
                      <td className="h-12 px-3 font-mono text-[12px]">{q.ref}</td>
                      <td className="px-3">{q.lines[0]?.description}</td>
                      <td className="px-3 text-muted">{byId(customers, q.customerId)?.name}</td>
                      <td className="px-3 font-mono text-[12px] text-muted">{shortDate(q.validUntil)}</td>
                      <td className="px-3 text-right font-mono tabular">{formatGBP(q.lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0))}</td>
                      <td className="px-3 text-right">
                        <Badge tone={quoteTone[q.status]} dot>
                          {label(q.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Well>
        </Panel>
      </div>
    </div>
  )
}
