import { SkeletonBox } from './skeleton-base'

interface HeaderBarSkeletonProps {
  withChips?: boolean
  withActions?: boolean
  withSubtitle?: boolean
}

/**
 * Page-header skeleton: title + optional subtitle + optional chips + actions.
 * Use as a header above other skeletons (TableSkeleton showHeader=false, etc.).
 */
export function HeaderBarSkeleton({
  withChips = true,
  withActions = true,
  withSubtitle = true,
}: HeaderBarSkeletonProps) {
  return (
    <div
      className="flex items-start justify-between gap-4 flex-wrap"
      role="status"
      aria-label="Loading header"
    >
      <div className="space-y-2">
        <SkeletonBox className="h-7 w-64" />
        {withSubtitle && <SkeletonBox className="h-4 w-80" />}
        {withChips && (
          <div className="flex gap-2 pt-1">
            <SkeletonBox className="h-5 w-20 rounded-full" />
            <SkeletonBox className="h-5 w-24 rounded-full" />
            <SkeletonBox className="h-5 w-16 rounded-full" />
          </div>
        )}
      </div>
      {withActions && (
        <div className="flex gap-2">
          <SkeletonBox className="h-9 w-24 rounded-lg" />
          <SkeletonBox className="h-9 w-28 rounded-lg" />
        </div>
      )}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
