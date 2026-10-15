import { Link } from 'react-router'
import { Chip, Skeleton } from '@haumea/ui'
import { AppCard, Heading, Text } from '@haumea/ui'
import { MapPin, Navigation } from 'lucide-react'

import { useEngineerTracker } from '@/hooks/use-engineer-tracker'

export function EngineerLocationPanel({ engineerId }: { engineerId: string }) {
  const { data, isLoading } = useEngineerTracker()
  const row = data?.find((item) => item.id === engineerId)

  return (
    <AppCard>
      <div className="mb-4 flex items-center gap-2">
        <Navigation size={16} className="text-brand-500" />
        <Heading level={2} scale="body">
          Live Tracker
        </Heading>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : !row ? (
        <Text scale="caption" tone="muted">
          No live tracker data is available for this engineer yet.
        </Text>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Chip
              variant="soft"
              color={row.movementStatus === 'on_site' ? 'success' : row.movementStatus === 'travelling' ? 'warning' : row.movementStatus === 'available' ? 'accent' : 'default'}
              size="sm"
            >
              {row.movementStatus.replace(/_/g, ' ')}
            </Chip>
            <Text as="span" scale="micro" tone="muted">
              {row.etaLabel}
            </Text>
          </div>
          <div className="rounded-lg bg-surface-page p-3">
            <div className="flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 shrink-0 text-text-muted" />
              <div className="min-w-0">
                <Text scale="caption" weight="medium" className="truncate">
                  {row.propertyName ?? 'No active property'}
                </Text>
                <Text scale="micro" tone="muted" className="mt-0.5">
                  {row.propertyAddress ?? 'No address recorded'}
                </Text>
              </div>
            </div>
          </div>
          {row.currentJobId ? (
            <Link
              to={`/dashboard/jobs/${row.currentJobId}`}
              className="inline-flex text-caption font-medium text-brand-500 transition-colors hover:text-brand-600"
            >
              {row.currentJobTitle ?? 'View current job'}
            </Link>
          ) : null}
        </div>
      )}
    </AppCard>
  )
}
