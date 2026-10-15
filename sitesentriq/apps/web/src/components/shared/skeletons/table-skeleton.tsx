import { AppCard } from '@haumea/ui'
import { SkeletonBox } from './skeleton-base'

interface TableSkeletonProps {
  rows?: number
  cols?: number
  /** Show a header row (titles + actions) above the table. */
  showHeader?: boolean
  /** Show a search bar above the table. */
  showSearch?: boolean
}

/**
 * Skeleton matching the typical list page: title + actions, search,
 * then a table card with rows. Mirrors the real layout so swap-in feels stable.
 */
export function TableSkeleton({
  rows = 6,
  cols = 4,
  showHeader = true,
  showSearch = true,
}: TableSkeletonProps) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading content">
      {showHeader && (
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <SkeletonBox className="h-6 w-44" />
            <SkeletonBox className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <SkeletonBox className="h-9 w-24 rounded-lg" />
            <SkeletonBox className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      )}

      {showSearch && <SkeletonBox className="h-10 w-full max-w-md rounded-lg" />}

      <AppCard padding="none" className="overflow-hidden">
        {/* Header row */}
        <div
          className="grid gap-4 px-4 py-3 border-b border-border-subtle bg-surface-elevated/40"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <SkeletonBox key={`h-${i}`} className="h-3 w-20" />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="grid gap-4 px-4 py-3.5 border-b border-border-subtle last:border-0"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonBox
                key={`c-${r}-${c}`}
                className={`h-4 ${c === 0 ? 'w-3/4' : c === cols - 1 ? 'w-16' : 'w-full max-w-[180px]'}`}
              />
            ))}
          </div>
        ))}
      </AppCard>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
