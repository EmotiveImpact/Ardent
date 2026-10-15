import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  /** Lucide icon component (renders at 28px inside a 64px tinted circle). */
  icon: LucideIcon
  title: string
  description?: string
  /** Optional CTA — typically a Button or Link. */
  action?: ReactNode
  className?: string
}

/**
 * Shared empty-state for list pages and panels.
 * Centered layout with brand-tinted icon medallion, title, description, and optional CTA.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}
    >
      <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-elevated border border-border-subtle mb-4">
        <Icon size={28} strokeWidth={1.5} className="text-text-muted" aria-hidden="true" />
      </div>
      <h2 className="text-title font-semibold text-text-primary">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-body text-text-secondary">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
