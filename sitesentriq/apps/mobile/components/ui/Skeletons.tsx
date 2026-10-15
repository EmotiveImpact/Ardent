// Premium loading placeholders — HeroUI Skeleton shimmer in the shape of the
// real content, so loads feel instant instead of a blank spinner. Theme-aware
// (bg-surface/border-border auto-switch light/dark).
import { View } from 'react-native'
import { Skeleton } from 'heroui-native'
import { cardShadow } from './primitives'

/** A shimmer placeholder shaped like a JobCard. Use while a job list loads. */
export function JobListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: 10, marginTop: 4 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          className="rounded-2xl border border-border bg-surface p-3.5"
          style={cardShadow}
        >
          <View className="mb-2.5 flex-row items-center justify-between">
            <Skeleton variant="shimmer" className="h-5 w-14 rounded-full" />
            <Skeleton variant="shimmer" className="h-5 w-20 rounded-full" />
          </View>
          <Skeleton variant="shimmer" className="mb-2 h-4 w-3/5 rounded-md" />
          <Skeleton variant="shimmer" className="h-3.5 w-2/5 rounded-md" />
        </View>
      ))}
    </View>
  )
}
