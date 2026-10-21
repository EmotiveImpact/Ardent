import * as React from 'react'
import { pressAgain, useHold } from '@/lib/use-hold'
import { cn } from '@/lib/utils'

/**
 * Commit button for actions that matter. Press and hold (pointer, Space or Enter):
 * an ember bar fills, and the action fires only when it is full. Let go early and it drains.
 * Pressing twice works too, for anyone who can't hold.
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
  const { progress, armed, props } = useHold({ ms, onCommit, disabled, label: typeof label === 'string' ? label : 'Confirm' })
  return (
    <button
      {...props}
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
      <span className={cn('caps text-[11px] transition-colors', progress > 0.5 ? 'text-black' : 'text-foreground')}>{armed ? pressAgain : label}</span>
    </button>
  )
}

export { HoldButton }
