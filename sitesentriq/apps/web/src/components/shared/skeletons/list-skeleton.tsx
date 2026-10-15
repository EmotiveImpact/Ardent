import { AppCard } from '@haumea/ui'
import { SkeletonBox } from './skeleton-base'

interface ListSkeletonProps {
  rows?: number
  /** Show a leading avatar/icon block per row. */
  withAvatar?: boolean
  /** Wrap rows in an AppCard container (default true). */
  framed?: boolean
}

/**
 * Vertical list skeleton: avatar + 2 text lines per row.
 * Matches notification feeds, contact lists, activity rows.
 */
export function ListSkeleton({
  rows = 5,
  withAvatar = true,
  framed = true,
}: ListSkeletonProps) {
  const inner = (
    <div className="divide-y divide-border-subtle">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          {withAvatar && <SkeletonBox className="h-9 w-9 rounded-full shrink-0" />}
          <div className="flex-1 space-y-2 min-w-0">
            <SkeletonBox className="h-4 w-2/5" />
            <SkeletonBox className="h-3 w-3/5" />
          </div>
          <SkeletonBox className="h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  )

  return framed ? (
    <AppCard padding="none" role="status" aria-label="Loading list">
      {inner}
      <span className="sr-only">Loading…</span>
    </AppCard>
  ) : (
    <div role="status" aria-label="Loading list">
      {inner}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
