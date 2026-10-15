import { AppCard } from '@haumea/ui'
import { SkeletonBox } from './skeleton-base'

interface DetailPageSkeletonProps {
  /** Show a tabs row below the header. */
  withTabs?: boolean
  /** Number of right-side info cards. */
  sideCards?: number
}

/**
 * Skeleton for a typical detail page: breadcrumb, header, status,
 * 2-column body (tabs/content + sidebar with info cards).
 */
export function DetailPageSkeleton({ withTabs = true, sideCards = 2 }: DetailPageSkeletonProps) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading details">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <SkeletonBox className="h-3 w-16" />
        <SkeletonBox className="h-3 w-3 rounded-full" />
        <SkeletonBox className="h-3 w-24" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <SkeletonBox className="h-7 w-72" />
          <div className="flex gap-2">
            <SkeletonBox className="h-5 w-20 rounded-full" />
            <SkeletonBox className="h-5 w-24 rounded-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <SkeletonBox className="h-9 w-24 rounded-lg" />
          <SkeletonBox className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {withTabs && (
        <div className="flex gap-1.5 border-b border-border-subtle">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBox key={i} className="h-8 w-24 rounded-md" />
          ))}
        </div>
      )}

      {/* Body */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          <AppCard padding="md">
            <div className="space-y-3">
              <SkeletonBox className="h-5 w-40" />
              <SkeletonBox className="h-4 w-full" />
              <SkeletonBox className="h-4 w-11/12" />
              <SkeletonBox className="h-4 w-9/12" />
              <SkeletonBox className="h-4 w-10/12" />
            </div>
          </AppCard>
          <AppCard padding="md">
            <div className="space-y-3">
              <SkeletonBox className="h-5 w-32" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <SkeletonBox className="h-3 w-20" />
                    <SkeletonBox className="h-4 w-32" />
                  </div>
                ))}
              </div>
            </div>
          </AppCard>
        </div>

        {/* Side column */}
        <div className="space-y-4">
          {Array.from({ length: sideCards }).map((_, i) => (
            <AppCard key={i} padding="md">
              <div className="space-y-3">
                <SkeletonBox className="h-4 w-24" />
                <SkeletonBox className="h-4 w-full" />
                <SkeletonBox className="h-4 w-3/4" />
              </div>
            </AppCard>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}
