import { ShieldAlert } from 'lucide-react'
import { clock, shortDate, ukDay } from '@kit'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { useQuery } from '@/data/ardent'
import type { Exception } from '@/data/model'
import { today } from '@/lib/jobs'

const outcomeTone: Record<Exception['outcome'], 'danger' | 'warn' | 'info' | 'neutral'> = {
  blocked: 'danger',
  chasing: 'warn',
  overridden: 'info',
  resolved: 'neutral',
}
const outcomeWord: Record<Exception['outcome'], string> = { blocked: 'Blocked', chasing: 'Chasing', overridden: 'Overridden', resolved: 'Resolved' }

/** What needs the office, worked out by the engine from the records: lapsed cards, late vans, overdue certificates and invoices, paused jobs. */
export function ExceptionsTable() {
  const { data: rows = [], loading } = useQuery((c) => c.attention.list())
  const day = today()
  return (
    <Panel>
      <PanelHeader icon={<ShieldAlert />} title={`Needs attention${rows.length ? ` · ${rows.length}` : ''}`} />
      <Well className="overflow-x-auto">
        {!rows.length ? (
          <p className="px-3 py-8 text-center text-[13px] text-faint">{loading ? 'Checking the records' : 'Nothing needs you right now.'}</p>
        ) : (
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead className="text-muted">
              <tr className="border-b">
                <th className="h-10 px-3 font-normal">When</th>
                <th className="px-3 font-normal">Who</th>
                <th className="px-3 font-normal">What</th>
                <th className="px-3 font-normal">Detail</th>
                <th className="px-3 text-right font-normal">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ex, i) => (
                <tr key={ex.id} className="border-b transition-[opacity,background-color] last:border-0 hover:bg-white/[0.025]" style={{ opacity: 1 - Math.min(i, 8) * 0.04 }}>
                  <td className="h-11 px-3 font-mono text-[12px] whitespace-nowrap">{ukDay(ex.at) === day ? clock(ex.at) : shortDate(ex.at)}</td>
                  <td className="px-3 whitespace-nowrap">{ex.who}</td>
                  <td className="px-3">{ex.rule}</td>
                  <td className="px-3 text-muted">{ex.detail}</td>
                  <td className="px-3 text-right">
                    <Badge tone={outcomeTone[ex.outcome]}>{outcomeWord[ex.outcome]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Well>
    </Panel>
  )
}
