import { SkeletonBox } from './skeleton-base'

interface TimelineSkeletonProps {
  items?: number
}

/**
 * Vertical timeline skeleton: dot + connecting line + content per item.
 * Mirrors the Timeline component layout.
 */
export function TimelineSkeleton({ items = 4 }: TimelineSkeletonProps) {
  return (
    <div className="space-y-1" role="status" aria-label="Loading timeline">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <SkeletonBox className="h-6 w-6 rounded-full shrink-0" />
            {i < items - 1 && (
              <SkeletonBox className="w-px flex-1 my-1 min-h-[36px] rounded-none" />
            )}
          </div>
          <div className="flex-1 pb-5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBox className="h-4 w-40" />
              <SkeletonBox className="h-3 w-20" />
            </div>
            <SkeletonBox className="h-3 w-3/4" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
