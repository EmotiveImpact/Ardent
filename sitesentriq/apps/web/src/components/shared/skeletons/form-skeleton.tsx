import { AppCard } from '@haumea/ui'
import { SkeletonBox } from './skeleton-base'

interface FormSkeletonProps {
  fields?: number
  /** Show two fields per row from this index onward (e.g. 2 = first field full width). */
  twoColumnFromIndex?: number
}

export function FormSkeleton({ fields = 6, twoColumnFromIndex = 0 }: FormSkeletonProps) {
  return (
    <AppCard
      padding="md"
      className="max-w-3xl"
      role="status"
      aria-label="Loading form"
    >
      <div className="space-y-5">
        <SkeletonBox className="h-6 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: fields }).map((_, i) => (
            <div
              key={i}
              className={`space-y-1.5 ${i < twoColumnFromIndex ? 'sm:col-span-2' : ''}`}
            >
              <SkeletonBox className="h-3 w-24" />
              <SkeletonBox className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <SkeletonBox className="h-10 w-28 rounded-lg" />
          <SkeletonBox className="h-10 w-24 rounded-lg" />
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </AppCard>
  )
}
