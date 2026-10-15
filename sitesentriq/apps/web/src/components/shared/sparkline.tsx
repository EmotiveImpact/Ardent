import { useId, useMemo } from 'react'

interface SparklineProps {
  /** Array of numeric values, oldest → newest */
  data: number[]
  /** Stroke colour (CSS colour). Defaults to brand amber */
  color?: string
  /** Height in pixels */
  height?: number
  /** Whether to show a soft fill under the line */
  fill?: boolean
  className?: string
}

/**
 * Tiny line chart used inside KPI tiles. No axes, no tooltip — just shape.
 *
 * Wave 17 perf — was previously a recharts <ResponsiveContainer><AreaChart>>
 * which pulled the entire 369 KB recharts bundle into the dashboard
 * initial chunk graph just to render <8 points of trend. Now it's a
 * hand-rolled SVG path: 0 KB of dependencies, same visual.
 */
export function Sparkline({
  data,
  color = 'var(--color-metric-amber)',
  height = 36,
  fill = true,
  className,
}: SparklineProps) {
  const gradientId = useId()

  const { linePath, areaPath } = useMemo(() => {
    if (data.length < 2) return { linePath: '', areaPath: '' }
    // Render in a 100×100 viewBox; preserveAspectRatio=none lets us
    // stretch horizontally without distorting the vertical scale
    // perceptibly at sparkline sizes.
    const VW = 100
    const VH = 100
    const min = Math.min(...data)
    const max = Math.max(...data)
    const span = max - min || 1 // avoid /0 for flat lines
    const stepX = VW / (data.length - 1)
    // Pad 4px top/bottom so the stroke isn't clipped against the
    // viewBox edge — sparklines look better with breathing room.
    const PAD = 6
    const usable = VH - PAD * 2

    const points = data.map((v, i) => {
      const x = i * stepX
      const y = VH - PAD - ((v - min) / span) * usable
      return [x, y] as const
    })

    const lineD = points
      .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
      .join(' ')

    // Close the area down to the bottom edge for the gradient fill.
    const areaD = `${lineD} L ${VW} ${VH} L 0 ${VH} Z`

    return { linePath: lineD, areaPath: areaD }
  }, [data])

  if (!data.length) {
    return <div style={{ height }} className={className} />
  }

  return (
    <div style={{ height, width: '100%' }} className={className}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-hidden="true"
      >
        {fill && (
          <>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
          </>
        )}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
