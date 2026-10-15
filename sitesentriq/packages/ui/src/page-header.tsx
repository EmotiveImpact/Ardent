import type { ReactNode } from 'react'

/**
 * Canonical page-header treatment used at the top of every dashboard
 * route. Locks in the visual contract that 87 inline `<h1>` declarations
 * across `apps/web/src/routes/**` used to repeat by hand:
 *
 *   <h1 className="text-[22px] font-semibold text-text-primary tracking-[-0.02em]">…</h1>
 *
 * Plus the optional supporting slots that always travelled with it:
 *   - a `<Breadcrumbs />` row above the title
 *   - a `text-sm text-text-muted` subtitle below
 *   - a right-aligned action group (edit / delete / new buttons)
 *
 * Deliberately accepts breadcrumbs / actions as `ReactNode` slots rather
 * than bringing the actual breadcrumb / button primitives into the UI
 * package — keeps this primitive free of cross-package dependencies and
 * lets each app keep its own routing-aware Breadcrumbs component.
 *
 * Reference: `apps/web/src/routes/clients/[id].tsx` — the canonical
 * shape (breadcrumbs row, title + subtitle, actions on the right).
 */
export interface PageHeaderProps {
  /** Page title. Renders as the semantic `<h1>` for the route. */
  title: string
  /** Optional supporting line below the title. */
  subtitle?: string
  /** Optional right-aligned action group — typically a row of buttons. */
  actions?: ReactNode
  /** Optional breadcrumbs row rendered above the title. */
  breadcrumbs?: ReactNode
  /** Escape-hatch for one-off layout tweaks. */
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  const rootClass = ['space-y-3', className ?? ''].filter(Boolean).join(' ')

  return (
    <div className={rootClass}>
      {breadcrumbs ? <div>{breadcrumbs}</div> : null}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-headline font-semibold text-text-primary tracking-[-0.02em]">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-body text-text-muted mt-1">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}
