import type { HTMLAttributes } from 'react'
import { cn } from '@haumea/utils'

/**
 * Themed pulse box. Uses surface-elevated tinted via opacity so it
 * adapts to all 5 themes without hardcoded colors.
 */
export function SkeletonBox({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded bg-surface-elevated/70',
        className
      )}
      {...rest}
    />
  )
}
