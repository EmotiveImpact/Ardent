import { useEffect, useRef, useState } from 'react'
import { animate, useInView, useMotionValue } from 'framer-motion'

interface AnimatedCounterProps {
  /** End value to count up to */
  value: number
  /** Animation duration in seconds */
  duration?: number
  /** Decimal places to round to */
  decimals?: number
  /** Optional formatter — runs after rounding */
  format?: (n: number) => string
  /** Optional prefix (e.g. "£") */
  prefix?: string
  /** Optional suffix (e.g. "%") */
  suffix?: string
  className?: string
}

/**
 * Counts up from 0 to `value` once, when scrolled into view.
 * Uses framer-motion's animate + useMotionValue for smooth interpolation.
 */
export function AnimatedCounter({
  value,
  duration = 1.1,
  decimals = 0,
  format,
  prefix,
  suffix,
  className,
}: AnimatedCounterProps) {
  const motionValue = useMotionValue(0)
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [display, setDisplay] = useState<string>(() =>
    formatNumber(0, decimals, format, prefix, suffix),
  )

  useEffect(() => {
    if (!inView) return
    const controls = animate(motionValue, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (latest) => {
        setDisplay(formatNumber(latest, decimals, format, prefix, suffix))
      },
    })
    return () => controls.stop()
  }, [inView, value, duration, decimals, format, prefix, suffix, motionValue])

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  )
}

function formatNumber(
  n: number,
  decimals: number,
  format?: (n: number) => string,
  prefix?: string,
  suffix?: string,
): string {
  const rounded = decimals > 0 ? Number(n.toFixed(decimals)) : Math.round(n)
  const core = format ? format(rounded) : rounded.toLocaleString('en-GB')
  return `${prefix ?? ''}${core}${suffix ?? ''}`
}
