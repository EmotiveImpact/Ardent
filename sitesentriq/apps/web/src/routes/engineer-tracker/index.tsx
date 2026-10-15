import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import { Clock3, MapPinned, Navigation, Route, Timer, UsersRound } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { EmptyState } from '@/components/shared/empty-state'
import type { PortfolioMapProperty } from '@/components/shared/portfolio-map'
import { SectionHeader } from '@/components/shared/section-header'
import { useEngineerTracker, type EngineerTrackerRow } from '@/hooks/use-engineer-tracker'
import { formatDate } from '@haumea/utils'
import { SkeletonBox, TableSkeleton } from '@/components/shared/skeletons'

const PortfolioMap = lazy(() =>
  import('@/components/shared/portfolio-map').then((m) => ({ default: m.PortfolioMap })),
)

const STATUS_COLORS: Record<EngineerTrackerRow['movementStatus'], 'default' | 'accent' | 'success' | 'warning'> = {
  available: 'success',
  travelling: 'accent',
  on_site: 'warning',
  offline: 'default',
}

export default function EngineerTrackerPage() {
  const { data: rows, isLoading, error } = useEngineerTracker()

  const activeRows = rows ?? []
  const mapProperties: PortfolioMapProperty[] = activeRows
    .filter((row) => typeof row.latitude === 'number' && typeof row.longitude === 'number' && row.propertyId)
    .map((row) => ({
      id: row.propertyId!,
      name: `${row.engineerName} → ${row.propertyName ?? 'Next job'}`,
      address: row.propertyAddress ?? '',
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.movementStatus === 'on_site' ? 'due_soon' : row.movementStatus === 'travelling' ? 'unknown' : 'compliant',
      clientName: row.currentJobTitle ?? undefined,
      propertyType: `ETA ${row.etaLabel}`,
    }))

  const stats = {
    travelling: activeRows.filter((row) => row.movementStatus === 'travelling').length,
    onSite: activeRows.filter((row) => row.movementStatus === 'on_site').length,
    travelMinutes: activeRows.reduce((sum, row) => sum + row.travelMinutesToday, 0),
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Engineer Tracker' },
        ]}
      />

      <SectionHeader
        variant="page"
        title="Engineer Tracker"
        subtitle="Live travel state, job-to-job movement, ETA and client-facing arrival context"
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/scheduler">
              <Route size={14} />
              Open Scheduler
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={<Navigation size={17} />} label="Travelling" value={stats.travelling} />
        <StatCard icon={<MapPinned size={17} />} label="On site" value={stats.onSite} />
        <StatCard icon={<Timer size={17} />} label="Travel logged today" value={`${stats.travelMinutes} mins`} />
      </div>

      {error && (
        <div className="rounded-xl border border-status-overdue/30 bg-status-overdue/10 p-4 text-label text-status-overdue">
          {(error as Error).message}
        </div>
      )}

      <AppCard padding="md">
        <div className="flex items-center gap-2 mb-4">
          <MapPinned size={16} className="text-brand-500" />
          <h2 className="text-body font-semibold text-text-primary">Online Location Map</h2>
        </div>
        <Suspense
          fallback={<SkeletonBox className="w-full rounded-lg" style={{ height: '420px' }} />}
        >
          <PortfolioMap properties={mapProperties} height="420px" hideBanner />
        </Suspense>
      </AppCard>

      <section className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} showHeader={false} showSearch={false} />
        ) : activeRows.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No engineers to track"
            description="Add engineers and assign them to jobs to see travel state and ETA."
          />
        ) : (
          <table aria-label="Engineer movement tracker" className="overflow-hidden">
              <thead><tr>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Engineer</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Movement</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Current / Next Job</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Client ETA</th>
                <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Travel Today</th>
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Last Seen</th>
              </tr></thead>
              <tbody>
                {activeRows.map((row) => (
                  <tr key={row.id} id={row.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-page transition-colors">
                    <td className="py-3 px-4">
                      <Link to={`/dashboard/engineers/${row.id}`} className="text-label font-medium text-brand-500 hover:text-brand-600">
                        {row.engineerName}
                      </Link>
                      <p className="text-micro text-text-muted">{row.trade || 'General'}</p>
                    </td>
                    <td className="py-3 px-4">
                      <Chip variant="soft" color={STATUS_COLORS[row.movementStatus] ?? 'default'} size="sm">
                        {row.movementStatus.replace('_', ' ')}
                      </Chip>
                    </td>
                    <td className="py-3 px-4">
                      {row.currentJobId ? (
                        <Link to={`/dashboard/jobs/${row.currentJobId}`} className="text-label font-medium text-text-primary hover:text-brand-600">
                          {row.currentJobTitle}
                        </Link>
                      ) : (
                        <span className="text-label text-text-muted">Unassigned</span>
                      )}
                      <p className="text-micro text-text-muted">{row.propertyName || 'No property'}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 text-label text-text-secondary">
                        <Clock3 size={13} />
                        {row.etaLabel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary text-right">
                      {row.travelMinutesToday} mins
                    </td>
                    <td className="py-3 px-4 text-label text-text-secondary">
                      {row.lastSeenAt ? formatDate(row.lastSeenAt) : 'No ping'}
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <AppCard padding="md">
      <div className="flex items-center justify-between mb-3">
        <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">{label}</span>
        <span className="text-brand-500">{icon}</span>
      </div>
      <p className="text-[26px] font-semibold tracking-[-0.03em] text-text-primary">{value}</p>
    </AppCard>
  )
}
