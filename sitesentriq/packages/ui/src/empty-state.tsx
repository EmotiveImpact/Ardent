import type { ReactNode } from 'react'
import { cn } from './radix/primitives'

export interface EmptyStateProps {
  /** Optional icon element, e.g. `<Inbox />` from lucide-react. Rendered muted inside a tinted circle. */
  icon?: ReactNode
  /** Primary heading line. */
  title: string
  /** Supporting one-liner below the title. */
  description?: string
  /** Optional CTA — typically a Button or Link. Rendered below the copy. */
  action?: ReactNode
  className?: string
}

/**
 * Shared empty-state for list pages, panels, and table bodies.
 *
 * Centered layout: a muted icon in a rounded `bg-surface-elevated` circle,
 * a semibold title, a muted description, and an optional action below.
 * Uses design-system tokens only so it tracks every theme.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        className,
      )}
    >
      {icon != null && (
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface-elevated text-text-muted [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <p className="text-body font-semibold text-text-primary">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-caption text-text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
