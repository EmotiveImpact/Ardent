import { motion } from 'framer-motion'
import { Link } from 'react-router'
import { EASE_OUT, DURATION } from '@/lib/motion'
import type { LucideIcon } from 'lucide-react'
import { Sparkline } from './sparkline'
import { TrendChip } from './trend-chip'
import { AnimatedCounter } from './animated-counter'

export type KpiAccent = 'brand' | 'green' | 'amber' | 'rose' | 'violet' | 'teal'

const ACCENT_MAP: Record<KpiAccent, { stroke: string; iconBg: string; iconText: string }> = {
  brand: {
    stroke: 'var(--color-metric-amber)',
    iconBg: 'bg-brand-500/10',
    iconText: 'text-brand-500',
  },
  green: {
    stroke: 'var(--color-metric-green)',
    iconBg: 'bg-status-compliant/10',
    iconText: 'text-status-compliant',
  },
  amber: {
    stroke: 'var(--color-status-due-soon)',
    iconBg: 'bg-status-due-soon/10',
    iconText: 'text-status-due-soon',
  },
  rose: {
    stroke: 'var(--color-metric-rose)',
    iconBg: 'bg-status-overdue/10',
    iconText: 'text-status-overdue',
  },
  violet: {
    stroke: 'var(--color-metric-violet)',
    iconBg: 'bg-metric-violet/10',
    iconText: 'text-metric-violet',
  },
  teal: {
    stroke: 'var(--color-metric-teal)',
    iconBg: 'bg-metric-teal/10',
    iconText: 'text-metric-teal',
  },
}

interface KpiTileProps {
  label: string
  /** Numeric value (animated). For a string-only display use `displayValue` */
  value: number
  /** Optional formatted display value — overrides the animated counter */
  displayValue?: string
  /** Decimal places for the counter */
  decimals?: number
  /** Prefix (e.g. £) */
  prefix?: string
  /** Suffix (e.g. %) */
  suffix?: string
  /** Percent change vs previous period */
  delta?: number
  /** Custom delta label (overrides %) */
  deltaLabel?: string
  /** When true, lower delta is "better" — used for overdue/aging KPIs */
  inverseDelta?: boolean
  /** Sparkline data array (oldest → newest). Pass empty array to hide */
  sparkline?: number[]
  /** Accent colour — drives icon background + sparkline stroke */
  accent?: KpiAccent
  icon: LucideIcon
  /** Where to navigate when clicked */
  to?: string
  /** Stagger delay in seconds (entrance animation) */
  delay?: number
}

/**
 * One cell of the dashboard KPI grid:
 * label + animated big number + optional trend chip + optional sparkline.
 * Wraps in a router Link if `to` is provided.
 */
export function KpiTile({
  label,
  value,
  displayValue,
  decimals = 0,
  prefix,
  suffix,
  delta,
  deltaLabel,
  inverseDelta = false,
  sparkline,
  accent = 'brand',
  icon: Icon,
  to,
  delay = 0,
}: KpiTileProps) {
  const accentMeta = ACCENT_MAP[accent]

  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, delay, ease: EASE_OUT }}
      whileHover={{ y: -2 }}
      className="relative h-full bg-surface-card border border-border-default rounded-xl p-4 overflow-hidden hover:border-border-strong transition-colors"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-micro font-medium uppercase tracking-[0.06em] text-text-muted">
          {label}
        </span>
        <span
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${accentMeta.iconBg}`}
        >
          <Icon size={14} className={accentMeta.iconText} strokeWidth={2} />
        </span>
      </div>

      {/* Value row */}
      <div className="flex items-baseline gap-2 leading-none">
        <span className="text-[26px] font-semibold tracking-[-0.025em] text-text-primary">
          {displayValue !== undefined ? (
            displayValue
          ) : (
            <AnimatedCounter
              value={value}
              decimals={decimals}
              prefix={prefix}
              suffix={suffix}
            />
          )}
        </span>
        {typeof delta === 'number' && (
          <TrendChip delta={delta} inverse={inverseDelta} label={deltaLabel} />
        )}
      </div>

      {/* Sparkline */}
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparkline} color={accentMeta.stroke} height={32} />
        </div>
      )}
    </motion.div>
  )

  if (to) {
    return (
      <Link to={to} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl">
        {inner}
      </Link>
    )
  }
  return inner
}
