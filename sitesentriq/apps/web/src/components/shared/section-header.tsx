import type { ReactNode } from 'react'

type SectionHeaderVariant = 'panel' | 'page'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  /** Right-aligned action — usually a Button or Link */
  action?: ReactNode
  /** Optional leading icon node */
  icon?: ReactNode
  /**
   * Visual variant.
   * - "panel" (default): h2 at 14px — for cards / panel headers.
   * - "page": h1 at text-headline (28px)/semibold — for top-of-page titles
   *           (matches the PageHeader primitive + DESIGN.md §5).
   */
  variant?: SectionHeaderVariant
  className?: string
}

/**
 * Re-usable section heading: title + optional subtitle + optional action.
 * Use at the top of a panel (default) or page (variant="page").
 */
export function SectionHeader({
  title,
  subtitle,
  action,
  icon,
  variant = 'panel',
  className,
}: SectionHeaderProps) {
  const isPage = variant === 'page'

  const titleEl = isPage ? (
    <h1 className="text-headline font-semibold text-text-primary tracking-[-0.02em]">
      {title}
    </h1>
  ) : (
    <h2 className="text-body font-semibold text-text-primary tracking-tight">
      {title}
    </h2>
  )

  const subtitleEl = subtitle ? (
    isPage ? (
      <p className="mt-0.5 text-label text-text-muted">{subtitle}</p>
    ) : (
      <p className="text-caption text-text-muted mt-0.5">{subtitle}</p>
    )
  ) : null

  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 ${className ?? ''}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        {icon && <span className="mt-0.5 text-text-accent shrink-0">{icon}</span>}
        <div className="min-w-0">
          {titleEl}
          {subtitleEl}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
