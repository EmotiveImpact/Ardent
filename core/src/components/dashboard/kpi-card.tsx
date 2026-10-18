import type { ReactNode } from 'react'
import { MoreHorizontal, TrendingDown, TrendingUp } from 'lucide-react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function SparkBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values)
  return (
    <div className="flex h-10 items-end gap-[3px]" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[5px] rounded-[1.5px]"
          style={{
            height: `${Math.max(14, (v / max) * 100)}%`,
            background: color,
            opacity: 0.45 + (i / values.length) * 0.55,
          }}
        />
      ))}
    </div>
  )
}

export function KpiCard({
  icon,
  title,
  value,
  unit,
  prefix,
  series,
  color,
  caption,
  delta,
  good,
}: {
  icon: ReactNode
  title: string
  value: string
  unit?: string
  prefix?: string
  series: number[]
  color: string
  caption: string
  delta: string
  /** Whether the movement is good news, which sets the arrow colour. */
  good: boolean
}) {
  const Arrow = delta.startsWith('-') ? TrendingDown : TrendingUp
  return (
    <Panel>
      <PanelHeader
        icon={icon}
        title={title}
        actions={
          <Button variant="ghost" size="icon-sm" className="size-7" aria-label={`${title} options`}>
            <MoreHorizontal />
          </Button>
        }
      />
      <Well className="flex items-center justify-between px-3 py-3">
        <p className="flex items-baseline gap-1.5 font-mono tabular">
          {prefix && <span className="text-lg text-muted">{prefix}</span>}
          <span className="text-[28px] leading-none tracking-tight text-foreground">{value}</span>
          {unit && <span className="text-[15px] text-muted">{unit}</span>}
        </p>
        <SparkBars values={series} color={color} />
      </Well>
      <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1 text-[12px] text-muted">
        <span className="truncate">{caption}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Arrow className={cn('size-3.5', good ? 'text-ok' : 'text-danger')} />
          <span className={cn('font-mono', good ? 'text-ok' : 'text-danger')}>{delta}</span>
          <span>vs last Sun</span>
        </span>
      </div>
    </Panel>
  )
}
