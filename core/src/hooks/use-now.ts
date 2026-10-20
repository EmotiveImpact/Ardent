import { useEffect, useState } from 'react'

/**
 * Demo clock. The mock day is fixed at 18 Oct 10:03 UTC so the board, the
 * schedule and the timers agree; it then ticks in real time from page load.
 * Swap for Date.now() once data is live.
 */
const BASE = Date.parse('2026-10-18T10:03:00Z')
const loadedAt = Date.now()

export const demoNow = () => BASE + (Date.now() - loadedAt)

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(demoNow)
  useEffect(() => {
    const id = setInterval(() => setNow(demoNow()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs)
      setValue(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])
  return value
}
