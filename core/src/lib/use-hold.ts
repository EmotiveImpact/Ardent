import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'

/**
 * Press and hold to commit, with a second way in for anyone who can't hold steady
 * or uses a screen reader: press once and the button asks to be pressed again
 * within a few seconds. Holding fills a bar and fires when it's full; letting go
 * early drains it twice as fast.
 */
export function useHold({ ms = 1200, onCommit, disabled, label }: { ms?: number; onCommit: () => void; disabled?: boolean; label: string }) {
  const [progress, setProgress] = useState(0)
  const [armed, setArmed] = useState(false)
  const raf = useRef(0)
  const value = useRef(0)
  const last = useRef(0)
  const held = useRef(false)
  // The click that follows letting go of a full hold isn't a second press.
  const swallow = useRef(false)
  const disarm = useRef(0)
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })

  const fire = () => {
    setArmed(false)
    clearTimeout(disarm.current)
    navigator.vibrate?.(20)
    commit.current()
  }

  const tick = (t: number) => {
    const dt = last.current ? t - last.current : 0
    last.current = t
    value.current = Math.min(1, Math.max(0, value.current + (held.current ? dt / ms : (-2 * dt) / ms)))
    setProgress(value.current)
    if (value.current >= 1 && held.current) {
      held.current = false
      swallow.current = true
      value.current = 0
      last.current = 0
      setProgress(0)
      fire()
      return
    }
    if (held.current || value.current > 0) raf.current = requestAnimationFrame(tick)
    else last.current = 0
  }

  const start = () => {
    if (disabled || held.current) return
    held.current = true
    swallow.current = false
    cancelAnimationFrame(raf.current)
    last.current = 0
    raf.current = requestAnimationFrame(tick)
  }
  const stop = () => {
    held.current = false
  }
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      clearTimeout(disarm.current)
    },
    [],
  )

  const props: ButtonHTMLAttributes<HTMLButtonElement> = {
    type: 'button',
    disabled,
    onPointerDown: start,
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onKeyDown: (e) => {
      // A held key repeats clicks; only the first press counts.
      if (e.repeat) return e.preventDefault()
      if (e.key === ' ' || e.key === 'Enter') start()
    },
    onKeyUp: (e) => (e.key === ' ' || e.key === 'Enter') && stop(),
    onClick: () => {
      if (disabled) return
      if (swallow.current) {
        swallow.current = false
        return
      }
      if (armed) return fire()
      setArmed(true)
      clearTimeout(disarm.current)
      disarm.current = window.setTimeout(() => setArmed(false), 4000)
    },
    onBlur: () => setArmed(false),
    onContextMenu: (e) => e.preventDefault(),
    'aria-label': armed ? `${label}. Press again to confirm.` : `${label}. Press and hold, or press twice, to confirm.`,
  }

  return { progress, armed, props }
}

/** What a hold button says once pressed: a plain ask to press again. */
export const pressAgain = 'Press again to confirm'
