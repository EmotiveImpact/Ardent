import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface TrendChipProps {
  /** Percent change vs previous period (e.g. 4.2 means +4.2%) */
  delta: number
  /** When true, a higher delta is "bad" (e.g. overdue items) — flips colour mapping */
  inverse?: boolean
  /** Optional plain-language label, replaces "%" string */
  label?: string
  className?: string
}

/**
 * Tiny up/down/flat indicator shown next to a KPI number.
 * Uses status tokens so it adapts to all themes.
 */
export function TrendChip({ delta, inverse = false, label, className }: TrendChipProps) {
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const isGood =
    direction === 'flat'
      ? null
      : inverse
        ? direction === 'down'
        : direction === 'up'

  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus

  const colorClass =
    isGood === null
      ? 'text-text-muted bg-surface-elevated'
      : isGood
        ? 'text-status-compliant bg-status-compliant/10'
        : 'text-status-overdue bg-status-overdue/10'

  const sign = delta > 0 ? '+' : ''
  const text = label ?? `${sign}${delta.toFixed(1)}%`

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${colorClass} ${className ?? ''}`}
    >
      <Icon size={10} strokeWidth={2.5} />
      {text}
    </span>
  )
}
