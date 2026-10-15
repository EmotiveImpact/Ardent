import { AppCard } from '@haumea/ui'
import { SkeletonBox } from './skeleton-base'

interface CardGridSkeletonProps {
  count?: number
  columns?: 2 | 3 | 4
}

const columnClass = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const

export function CardGridSkeleton({ count = 6, columns = 3 }: CardGridSkeletonProps) {
  return (
    <div
      className={`grid grid-cols-1 ${columnClass[columns]} gap-4`}
      role="status"
      aria-label="Loading cards"
    >
      {Array.from({ length: count }).map((_, i) => (
        <AppCard key={i} padding="md">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SkeletonBox className="h-5 w-32" />
              <SkeletonBox className="h-5 w-16 rounded-full" />
            </div>
            <SkeletonBox className="h-4 w-3/4" />
            <SkeletonBox className="h-4 w-1/2" />
            <div className="flex justify-between pt-2">
              <SkeletonBox className="h-3 w-20" />
              <SkeletonBox className="h-3 w-12" />
            </div>
          </div>
        </AppCard>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  )
}
