import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Commit button for actions that matter. Press and hold (pointer, Space or Enter):
 * an ember bar fills, and the action fires only when it is full. Let go early and it drains.
 */
function HoldButton({
  label,
  onCommit,
  ms = 1200,
  className,
  disabled,
}: {
  label: React.ReactNode
  onCommit: () => void
  ms?: number
  className?: string
  disabled?: boolean
}) {
  const [progress, setProgress] = React.useState(0)
  const raf = React.useRef(0)
  const value = React.useRef(0)
  const last = React.useRef(0)
  const held = React.useRef(false)

  const tick = React.useCallback(
    (t: number) => {
      const dt = last.current ? t - last.current : 0
      last.current = t
      // Fill at the hold rate, drain twice as fast.
      value.current = Math.min(1, Math.max(0, value.current + (held.current ? dt / ms : (-2 * dt) / ms)))
      setProgress(value.current)
      if (value.current >= 1 && held.current) {
        held.current = false
        navigator.vibrate?.(20)
        onCommit()
        value.current = 0
        setProgress(0)
        last.current = 0
        return
      }
      if (held.current || value.current > 0) raf.current = requestAnimationFrame(tick)
      else last.current = 0
    },
    [ms, onCommit],
  )

  const start = () => {
    if (disabled || held.current) return
    held.current = true
    cancelAnimationFrame(raf.current)
    last.current = 0
    raf.current = requestAnimationFrame(tick)
  }
  const stop = () => {
    held.current = false
  }
  React.useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={typeof label === 'string' ? `${label}. Press and hold to confirm.` : undefined}
      className={cn(
        'relative isolate flex h-12 w-full touch-none items-center justify-center overflow-hidden rounded-lg bg-raised select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 -z-10 bg-ember shadow-[0_0_24px_var(--ember)]"
        style={{ width: `${progress * 100}%` }}
      />
      <span className={cn('caps text-[11px] transition-colors', progress > 0.5 ? 'text-black' : 'text-foreground')}>{label}</span>
    </button>
  )
}

export { HoldButton }
