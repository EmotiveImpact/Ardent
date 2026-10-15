import { useId, useMemo, useState } from 'react'
import { Skeleton } from '@haumea/ui'
import { TrendingUp } from 'lucide-react'
import { useDashboardKpis } from '@/hooks/use-dashboard-kpis'
import { TrendChip } from '@/components/shared/trend-chip'

/**
 * Hero trend chart for the dashboard. A larger, axis-labelled area chart —
 * the headline data-visualisation the dashboard was missing.
 *
 * Deliberately hand-rolled SVG (like <Sparkline>), NOT recharts: the dashboard
 * was intentionally kept clear of recharts' ~369 KB bundle for load perf. This
 * adds zero dependencies.
 *
 * Two switchable series (Open jobs / Compliance %), both already fetched by the
 * cached useDashboardKpis hook — no extra round-trip.
 */
type SeriesKey = 'jobs' | 'compliance'

export function DashboardTrendChart() {
  const { data, isLoading } = useDashboardKpis()
  const [series, setSeries] = useState<SeriesKey>('jobs')
  const gradientId = useId()

  const meta = useMemo(() => {
    if (!data) return null
    return series === 'jobs'
      ? { label: 'Open jobs', values: data.openJobsSparkline, current: data.openJobs, delta: data.openJobsDelta, suffix: '', color: 'var(--color-metric-amber)' }
      : { label: 'Compliant items', values: data.complianceSparkline, current: data.compliancePct, delta: data.compliancePctDelta, suffix: '%', color: 'var(--color-metric-green)' }
  }, [data, series])

  const geom = useMemo(() => {
    const values = meta?.values ?? []
    if (values.length < 2) return null
    const VW = 100, VH = 100, PAD = 8
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const stepX = VW / (values.length - 1)
    const usable = VH - PAD * 2
    const pts = values.map((v, i) => [i * stepX, VH - PAD - ((v - min) / span) * usable] as const)
    const line = pts.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)).join(' ')
    return { line, area: `${line} L ${VW} ${VH} L 0 ${VH} Z`, min, max }
  }, [meta])

  if (isLoading || !data) return <Skeleton className="h-[208px] rounded-xl" />

  const enoughHistory = (meta?.values?.length ?? 0) >= 2 && geom

  return (
    <section className="bg-surface-card border border-border-default rounded-xl p-5 overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <TrendingUp size={16} className="text-text-accent" />
          </span>
          <div>
            <h2 className="text-body font-semibold text-text-primary leading-tight">{meta?.label} trend</h2>
            <p className="text-micro text-text-muted">Last {meta?.values?.length ?? 0} days</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {meta && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-title font-semibold tracking-[-0.02em] text-text-primary">{meta.current}{meta.suffix}</span>
              {typeof meta.delta === 'number' && <TrendChip delta={meta.delta} />}
            </div>
          )}
          {/* series toggle */}
          <div className="flex rounded-lg border border-border-default overflow-hidden text-micro font-medium">
            {(['jobs', 'compliance'] as SeriesKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSeries(k)}
                className={`px-2.5 py-1 transition-colors ${series === k ? 'bg-surface-page text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}
              >
                {k === 'jobs' ? 'Jobs' : 'Compliance'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {enoughHistory ? (
        <div className="relative" style={{ height: 130 }}>
          {/* baseline grid */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2].map((i) => <div key={i} className="border-t border-border-subtle/60" />)}
          </div>
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${meta?.label} over time`} className="relative">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={meta?.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={meta?.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={geom!.area} fill={`url(#${gradientId})`} stroke="none" />
            <path d={geom!.line} fill="none" stroke={meta?.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* min / max y labels */}
          <span className="absolute top-0 right-1 text-micro text-text-muted">{geom!.max}{meta?.suffix}</span>
          <span className="absolute bottom-0 right-1 text-micro text-text-muted">{geom!.min}{meta?.suffix}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center" style={{ height: 130 }}>
          <TrendingUp size={24} className="text-text-muted mb-2" strokeWidth={1.5} />
          <p className="text-label text-text-secondary">Not enough history yet</p>
          <p className="text-caption text-text-muted">A trend line appears once there are a few days of activity.</p>
        </div>
      )}
    </section>
  )
}
