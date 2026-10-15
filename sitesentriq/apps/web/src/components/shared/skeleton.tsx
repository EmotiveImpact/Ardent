import { AppCard } from '@haumea/ui'

// Animated pulse base — uses surface-elevated so it tints correctly in
// every theme (dark, midnight, glass, luxe).
function SkeletonBox({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-elevated rounded ${className}`} />
}

// Stat card skeleton
export function SkeletonStatCard() {
  return (
    <AppCard padding="md" className="overflow-hidden">
      <SkeletonBox className="h-3 w-24 mb-3" />
      <SkeletonBox className="h-8 w-16 mb-2" />
      <SkeletonBox className="h-3 w-32" />
    </AppCard>
  )
}

// Table row skeleton
export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <SkeletonBox className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

// Full list page skeleton (header + search + table)
export function ListPageSkeleton({ cols = 4, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <SkeletonBox className="h-6 w-40" />
          <SkeletonBox className="h-4 w-64" />
        </div>
        <SkeletonBox className="h-9 w-28 rounded-lg" />
      </div>
      <SkeletonBox className="h-10 w-full rounded-lg" />
      <AppCard padding="none" className="overflow-hidden">
        <table className="w-full">
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} cols={cols} />
            ))}
          </tbody>
        </table>
      </AppCard>
    </div>
  )
}

// Dashboard skeleton
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBox className="h-7 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <SkeletonStatCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AppCard padding="md" className="overflow-hidden">
          <SkeletonBox className="h-5 w-40 mb-4" />
          <SkeletonBox className="h-48 w-full rounded" />
        </AppCard>
        <AppCard padding="md" className="overflow-hidden">
          <SkeletonBox className="h-5 w-40 mb-4" />
          <SkeletonBox className="h-48 w-full rounded" />
        </AppCard>
      </div>
    </div>
  )
}
