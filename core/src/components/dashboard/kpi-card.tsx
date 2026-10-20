import { useState, type CSSProperties, type ReactNode } from 'react'
import { Panel, PanelHeader, Well } from '@/components/ui/panel'
import { useCountUp } from '@/hooks/use-now'
import { cn } from '@/lib/utils'

function SparkBars({ values, color, labels }: { values: number[]; color: string; labels: string[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...values)
  return (
    <div className="relative hidden h-11 items-end gap-[3px] sm:flex" onMouseLeave={() => setHover(null)}>
      {hover !== null && (
        <span className="absolute -top-7 right-0 rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-foreground shadow-lg">
          {labels[hover]} · {values[hover]}
        </span>
      )}
      {values.map((v, i) => (
        <span
          key={i}
          onMouseEnter={() => setHover(i)}
          className={cn('animate-grow w-[6px] rounded-[1.5px] transition-[filter]', hover === i && 'brightness-150')}
          style={
            {
              '--i': i,
              '--o': hover === null || hover === i ? 0.45 + (i / values.length) * 0.55 : 0.25,
              height: `${Math.max(14, (v / max) * 100)}%`,
              background: `linear-gradient(to top, color-mix(in oklab, ${color} 55%, transparent), ${color})`,
              boxShadow: i === values.length - 1 ? `0 0 12px -2px ${color}` : undefined,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function KpiCard({
  icon,
  title,
  value,
  format,
  unit,
  prefix,
  series,
  labels,
  color,
  note,
  index = 0,
}: {
  icon: ReactNode
  title: string
  value: number
  format: (n: number) => string
  unit?: string
  prefix?: string
  /** Oldest first, worked out from the records. */
  series: number[]
  labels: string[]
  color: string
  /** One line of context under the number. */
  note: ReactNode
  index?: number
}) {
  const shown = useCountUp(value)
  return (
    <Panel style={{ '--i': index } as CSSProperties}>
      <PanelHeader icon={icon} title={title} />
      <Well className="flex items-center justify-between px-3 py-3">
        <p className="flex items-baseline gap-1.5 font-mono tabular">
          {prefix && <span className="text-lg text-muted">{prefix}</span>}
          <span className="text-[22px] leading-none tracking-tight text-foreground sm:text-[28px]">{format(shown)}</span>
          {unit && <span className="text-[15px] text-muted">{unit}</span>}
        </p>
        <SparkBars values={series} color={color} labels={labels} />
      </Well>
      <div className="truncate px-2.5 pt-2.5 pb-1 text-[12px] text-muted">{note}</div>
    </Panel>
  )
}
