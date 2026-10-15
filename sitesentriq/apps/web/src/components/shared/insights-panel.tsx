import { Link } from 'react-router'
import { Card, Chip } from '@haumea/ui'
import {
  ShieldAlert,
  Clock,
  TrendingUp,
  Users,
  Activity,
  ArrowRight,
  Sparkles,
  Info,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useInsights } from '@/hooks/use-insights'
import { formatCurrency } from '@haumea/utils'
import { SkeletonBox } from '@/components/shared/skeletons'
import { featureFlags } from '@/lib/feature-flags'

type Severity = 'info' | 'success' | 'warning' | 'danger'

interface InsightCardProps {
  icon: LucideIcon
  title: string
  metric: string
  detail: string
  severity: Severity
  link: string
  linkLabel?: string
  /** Tooltip explainer — what the signal means + how it's computed. */
  tooltip?: string
  /** When true, render a small "BETA" chip in the top-right of the card. */
  beta?: boolean
}

const severityStyles: Record<Severity, { bar: string; text: string; iconBg: string; iconColor: string }> = {
  info: {
    bar: 'bg-metric-teal',
    text: 'text-metric-teal',
    iconBg: 'bg-metric-teal/10',
    iconColor: 'text-metric-teal',
  },
  success: {
    bar: 'bg-status-compliant',
    text: 'text-metric-green',
    iconBg: 'bg-status-compliant/10',
    iconColor: 'text-metric-green',
  },
  warning: {
    bar: 'bg-status-due-soon',
    text: 'text-metric-amber',
    iconBg: 'bg-status-due-soon/10',
    iconColor: 'text-metric-amber',
  },
  danger: {
    bar: 'bg-status-overdue',
    text: 'text-metric-rose',
    iconBg: 'bg-status-overdue/10',
    iconColor: 'text-metric-rose',
  },
}

function InsightCard({ icon: Icon, title, metric, detail, severity, link, linkLabel = 'Investigate', tooltip, beta }: InsightCardProps) {
  const s = severityStyles[severity]
  return (
    <Card className="relative !p-0 !gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default overflow-hidden group hover:border-border-strong transition-colors">
      {/* The coloured left-edge bar that used to live here was removed —
          the tinted icon tile already conveys severity, the bar just
          added visual noise. `severityStyles[].bar` is intentionally
          kept in case we want to bring it back as a subtle border-color
          override later. */}

      {/* Top-right adornments: optional BETA chip + info tooltip.
          We use a native title attribute for the tooltip — HeroUI v3's compound
          Tooltip API is unforgiving about non-Pressable children, and a title
          attr is universally accessible across all five themes. */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
        {beta && (
          <Chip size="sm" variant="soft" className="h-5 px-1.5 text-[10px] font-semibold text-text-muted bg-surface-elevated border border-border-default">
            BETA
          </Chip>
        )}
        {tooltip && (
          <span
            aria-label={`About ${title}: ${tooltip}`}
            title={tooltip}
            className="text-text-muted hover:text-text-secondary transition-colors p-0.5 rounded inline-flex"
          >
            <Info size={12} />
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg ${s.iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon size={16} className={s.iconColor} />
          </div>
          <div className="flex-1 min-w-0 pr-8">
            <p className="text-micro font-medium text-text-muted uppercase tracking-[0.04em]">{title}</p>
            <p className={`text-title font-bold tracking-[-0.02em] leading-tight mt-1 ${s.text}`}>
              {metric}
            </p>
            <p className="text-caption text-text-secondary mt-1.5 line-clamp-2">{detail}</p>
            <Link
              to={link}
              className="inline-flex items-center gap-1 mt-2.5 text-caption font-medium text-brand-500 hover:text-brand-400 transition-colors"
            >
              {linkLabel} <ArrowRight size={11} />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

interface InsightsPanelProps {
  /** Compact = vertical sidebar layout, Full = grid layout */
  variant?: 'compact' | 'full'
  showHeader?: boolean
}

export function InsightsPanel({ variant = 'compact', showHeader = true }: InsightsPanelProps) {
  const { isLoading, risk, overrun, revenue, atRisk, capacity } = useInsights()

  if (isLoading) {
    return (
      <Card className="!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default !p-5 min-h-[200px]">
        <div className="space-y-3">
          <SkeletonBox className="h-5 w-32" />
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-3/4" />
          <SkeletonBox className="h-4 w-5/6" />
          <SkeletonBox className="h-4 w-2/3" />
        </div>
      </Card>
    )
  }

  // Build insight cards from data
  const cards: InsightCardProps[] = []

  if (risk) {
    const sev: Severity = risk.score >= 80 ? 'success' : risk.score >= 60 ? 'warning' : 'danger'
    cards.push({
      icon: ShieldAlert,
      title: 'Compliance Risk Score',
      metric: `${risk.score}%`,
      detail:
        risk.total === 0
          ? 'No compliance items tracked yet.'
          : `${risk.overdue} overdue, ${risk.dueSoon} due soon across ${risk.total} items`,
      severity: sev,
      link: '/dashboard/compliance',
      linkLabel: 'View compliance',
      tooltip: 'A weighted health score across all tracked compliance items — overdue and non-compliant weigh more than due-soon.',
    })
  }

  if (overrun) {
    cards.push({
      icon: Clock,
      title: 'Overrun Watch',
      metric: `${overrun.count}`,
      detail:
        overrun.count === 0
          ? 'All open jobs on schedule.'
          : `${overrun.count} job${overrun.count !== 1 ? 's' : ''} running past their scheduled window`,
      severity: overrun.count === 0 ? 'success' : overrun.count > 5 ? 'danger' : 'warning',
      link: '/dashboard/jobs',
      linkLabel: 'Review jobs',
      tooltip: 'Open jobs whose scheduled date has slipped past a sensible buffer for their status.',
    })
  }

  if (revenue) {
    // Revenue card framing depends on the insightsForecast flag. When OFF (default)
    // we show a directional trend (▲ +X%) and never lead with the £ figure — the
    // underlying linear regression is not a forecast and the CEO doesn't want it
    // sold as one. When the flag is ON we surface the projected £ for power users.
    const trendPct = revenue.trend
    const trendArrow = trendPct >= 0 ? '\u25B2' : '\u25BC' // ▲ / ▼
    const trendLabel = `${trendArrow} ${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(0)}%`
    const enoughData = revenue.monthly.some((v) => v > 0)

    if (featureFlags.insightsForecast) {
      cards.push({
        icon: TrendingUp,
        title: 'Revenue Trend',
        metric: enoughData ? formatCurrency(revenue.forecast) : '—',
        detail: enoughData
          ? `Projected next month · ${trendArrow} ${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(0)}% vs last month`
          : 'Not enough invoice history yet.',
        severity: trendPct >= 0 ? 'success' : 'warning',
        link: '/dashboard/invoices',
        linkLabel: 'View invoices',
        tooltip: 'Projected revenue for next month from a linear regression on the last 6 months of invoice totals.',
      })
    } else {
      cards.push({
        icon: TrendingUp,
        title: 'Revenue Trend',
        metric: enoughData ? `${trendLabel}` : '—',
        detail: enoughData
          ? 'vs prior 6 months — trend signal, not a forecast'
          : 'Not enough invoice history yet.',
        severity: trendPct >= 0 ? 'success' : 'warning',
        link: '/dashboard/invoices',
        linkLabel: 'View invoices',
        tooltip: 'Direction of revenue across the last 6 months of invoices — directional only, not a prediction.',
        beta: true,
      })
    }
  }

  if (atRisk) {
    cards.push({
      icon: Users,
      title: 'At-Risk Clients',
      metric: `${atRisk.count}`,
      detail:
        atRisk.count === 0
          ? 'All client accounts in good standing.'
          : atRisk.clients[0]
          ? `${atRisk.clients[0].name}${atRisk.count > 1 ? ` +${atRisk.count - 1} more` : ''}`
          : `${atRisk.count} client${atRisk.count !== 1 ? 's' : ''} need attention`,
      severity: atRisk.count === 0 ? 'success' : atRisk.count > 3 ? 'danger' : 'warning',
      link: '/dashboard/clients',
      linkLabel: 'Review clients',
      tooltip: 'Clients with a high share of overdue compliance or multiple unpaid invoices.',
    })
  }

  if (capacity) {
    const sev: Severity =
      capacity.utilization > 90
        ? 'danger'
        : capacity.utilization > 75
        ? 'warning'
        : capacity.utilization < 30
        ? 'info'
        : 'success'
    cards.push({
      icon: Activity,
      title: 'Capacity Heatmap',
      metric: `${capacity.utilization}%`,
      detail:
        capacity.totalEngineers === 0
          ? 'No active engineers to schedule.'
          : `${capacity.overBooked} over-booked · ${capacity.underBooked} under-booked · next 14 days`,
      severity: sev,
      link: '/dashboard/scheduler',
      linkLabel: 'Open scheduler',
      tooltip: 'Share of engineer-day slots booked across the next 14 days, with over- and under-booked tallies.',
    })
  }

  const containerClass =
    variant === 'full'
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
      : 'space-y-3'

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-brand-500" />
            <h3 className="text-label font-semibold text-text-primary">Smart Insights</h3>
          </div>
          {variant === 'compact' && (
            <Link
              to="/dashboard/insights"
              className="text-micro font-medium text-brand-500 hover:text-brand-400 flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight size={10} />
            </Link>
          )}
        </div>
      )}
      {cards.length === 0 ? (
        <Card className="!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default !p-5 text-center">
          <p className="text-label text-text-muted">No insights yet — add data to see suggestions.</p>
        </Card>
      ) : (
        <div className={containerClass}>
          {cards.map((c) => (
            <InsightCard key={c.title} {...c} />
          ))}
        </div>
      )}
    </div>
  )
}
