import { AppCard } from '@haumea/ui'
import { SkeletonBox } from './skeleton-base'

interface KpiRowSkeletonProps {
  count?: number
}

export function KpiRowSkeleton({ count = 4 }: KpiRowSkeletonProps) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      role="status"
      aria-label="Loading metrics"
    >
      {Array.from({ length: count }).map((_, i) => (
        <AppCard key={i} padding="md">
          <SkeletonBox className="h-3 w-24 mb-3" />
          <SkeletonBox className="h-8 w-16 mb-2" />
          <SkeletonBox className="h-3 w-32" />
        </AppCard>
      ))}
      <span className="sr-only">Loading metrics…</span>
    </div>
  )
}
