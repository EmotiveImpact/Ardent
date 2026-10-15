// Strategic 1 follow-up — 30-day sparkline for the public Trust URL.
//
// Lazy-imported by /trust/:slug so the recharts bundle (~80 KB gzipped)
// doesn't block the hero score from painting. We deliberately render
// nothing until lazy resolution finishes — the page shows a skeleton
// in the parent's <Suspense> fallback.
//
// Wave A4 polish — repainted to use CSS-variable design tokens so the
// chart stays on-brand across light/dark/midnight/glass/luxe themes
// (previously hard-coded slate + hex stroke colours broke contrast on
// the dark themes).

import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts'

interface Point {
  date: string
  score: number
}

interface Props {
  points: Point[]
  band: 'exceptional' | 'strong' | 'fair' | 'needs_work'
}

// Map each band to a CSS custom property defined in src/index.css.
// `var(--…)` is read at paint time so theme switches re-tint the line
// without a remount.
const STROKE_VAR_BY_BAND: Record<Props['band'], string> = {
  exceptional: 'var(--color-status-compliant)',
  strong: 'var(--color-status-compliant)',
  fair: 'var(--color-status-due-soon)',
  needs_work: 'var(--color-status-overdue)',
}

function formatTooltipDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return iso
  }
}

interface TooltipPayloadEntry {
  payload?: Point
  value?: number
}

interface TooltipPropsLike {
  active?: boolean
  payload?: TooltipPayloadEntry[]
}

function MiniTooltip({ active, payload }: TooltipPropsLike) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]?.payload
  const value = payload[0]?.value
  if (!p || typeof value !== 'number') return null
  return (
    <div className="rounded-md bg-surface-elevated text-text-primary border border-border-default text-micro px-2 py-1 shadow-md">
      <div className="font-mono tabular-nums">{value} / 100</div>
      <div className="text-text-muted text-[10px]">{formatTooltipDate(p.date)}</div>
    </div>
  )
}

export default function ScoreSparkline({ points, band }: Props) {
  const stroke = STROKE_VAR_BY_BAND[band]
  return (
    <div className="h-[80px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            content={<MiniTooltip />}
            cursor={{ stroke: 'var(--color-text-muted)', strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke={stroke}
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4, fill: stroke, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
