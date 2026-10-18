import { ChevronsUpDown, ListFilter, ShieldAlert } from 'lucide-react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { exceptions } from '@/data/mock'
import type { Exception } from '@/data/model'
import { time } from '@/lib/format'
import { useState } from 'react'
import { toast } from 'sonner'

const outcomeTone: Record<Exception['outcome'], 'danger' | 'warn' | 'info' | 'neutral'> = {
  blocked: 'danger',
  chasing: 'warn',
  overridden: 'info',
  resolved: 'neutral',
}

export function ExceptionsTable() {
  const [rows, setRows] = useState(exceptions)
  const resolve = (id: string) => {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, outcome: 'resolved' } : x)))
    toast('Marked resolved', { action: { label: 'Undo', onClick: () => setRows(exceptions) } })
  }
  return (
    <Panel>
      <PanelHeader
        icon={<ShieldAlert />}
        title="Compliance exceptions"
        actions={
          <Button variant="outline" size="xs">
            <ListFilter /> Filter
          </Button>
        }
      />
      <Well className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="h-10 px-3 font-normal">
                <span className="inline-flex items-center gap-1">
                  Time <ChevronsUpDown className="size-3.5" />
                </span>
              </th>
              <th className="px-3 font-normal">Who</th>
              <th className="px-3 font-normal">Rule</th>
              <th className="px-3 font-normal">Detail</th>
              <th className="px-3 text-right font-normal">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ex, i) => (
              <tr
                key={ex.id}
                className="group border-b border-line/70 transition-[opacity,background-color] last:border-0 hover:bg-white/[0.025]"
                style={{ opacity: ex.outcome === 'resolved' ? 0.5 : 1 - i * 0.04 }}
              >
                <td className="h-11 px-3 font-mono text-[12px] whitespace-nowrap">{time(ex.at)}</td>
                <td className="px-3 whitespace-nowrap">{ex.who}</td>
                <td className="px-3">{ex.rule}</td>
                <td className="px-3 text-muted">{ex.detail}</td>
                <td className="px-3 text-right">
                  <span className="inline-flex items-center gap-2">
                    {ex.outcome !== 'resolved' && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => resolve(ex.id)}
                      >
                        Resolve
                      </Button>
                    )}
                    <Badge tone={outcomeTone[ex.outcome]} className="capitalize">
                      {ex.outcome}
                    </Badge>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Well>
    </Panel>
  )
}
