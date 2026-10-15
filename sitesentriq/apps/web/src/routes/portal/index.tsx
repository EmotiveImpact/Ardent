import { lazy, Suspense } from 'react'
import { Link } from 'react-router'
import { DashboardSkeleton } from '@/components/shared/skeleton'
import { CalendarDays, AlertCircle, MapPin } from 'lucide-react'
import { Chip } from '@haumea/ui'
import { SkeletonBox } from '@/components/shared/skeletons'
import { useAuth } from '@/hooks/use-auth'
import { useProperties } from '@/hooks/use-properties'
import { usePropertiesWithStatus } from '@/hooks/use-properties-with-status'
import { useComplianceItems, useComplianceStats } from '@/hooks/use-compliance'
import { useJobs } from '@/hooks/use-jobs'
import { toLocalYmd } from '@/lib/time-tracking/compute'
import { useInvoices } from '@/hooks/use-invoices'
import { Timeline } from '@/components/shared/timeline'
import { formatDate } from '@haumea/utils'
import { usePortalProperty } from '@/components/layout/portal-layout'
import { useOrgBranding } from '@/lib/branding/hooks'
import type { JobWithRelations } from '@haumea/types'
import { PageHeader } from '@haumea/ui'

const PortfolioMap = lazy(() =>
  import('@/components/shared/portfolio-map').then((m) => ({ default: m.PortfolioMap })),
)

export default function PortalDashboardPage() {
  const { profile } = useAuth()
  const { selectedPropertyId, setSelectedPropertyId } = usePortalProperty()
  const { data: branding } = useOrgBranding(profile?.organisation_id ?? null)
  const welcomeMessage =
    branding?.branding_enabled && branding.portal_welcome_message
      ? branding.portal_welcome_message
      : null
  // Honour the global site switcher across every KPI/panel, not just the map.
  // useJobs/useInvoices/useComplianceItems accept a property_id; useProperties
  // and useComplianceStats don't, so those two are narrowed client-side below.
  const propFilter = selectedPropertyId ?? undefined
  // Defence-in-depth on top of RLS (00096): a client_admin carries a client_id,
  // so scope portal queries to it explicitly. NULL for staff (preview) → no
  // extra filter. RLS remains the real boundary; this stops a missing predicate
  // from ever silently widening the view again.
  const clientFilter = profile?.client_id ?? undefined
  const { data: properties, isLoading: propertiesLoading } = useProperties(clientFilter)
  const { data: propertiesWithStatus } = usePropertiesWithStatus({ clientId: clientFilter })
  const { data: complianceStats, isLoading: statsLoading } = useComplianceStats()
  const { data: complianceItems } = useComplianceItems(
    propFilter ? { property_id: propFilter } : undefined,
  )

  const mapProperties = (propertiesWithStatus ?? [])
    .filter((p) => (selectedPropertyId ? p.id === selectedPropertyId : true))
    .map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
      status: p.status,
      clientName: p.clients?.name ?? undefined,
      propertyType: p.site_type ?? undefined,
    }))
  const today = toLocalYmd(new Date())
  const { data: upcomingJobs, isLoading: jobsLoading } = useJobs({ date: today, property_id: propFilter })
  // Invoices are account-level (never carry a property_id), so the site switcher
  // does NOT narrow them — filtering would zero the count for any selected site.
  const { data: invoices, isLoading: invoicesLoading } = useInvoices({ status: 'sent', client_id: clientFilter })

  const isLoading = propertiesLoading || statsLoading || jobsLoading || invoicesLoading

  // When a single site is selected, the org-wide useProperties() count and the
  // aggregate useComplianceStats() no longer match the filtered view, so narrow
  // them here: properties → 1 (the selected one), compliance breakdown → counted
  // from the already-property-filtered complianceItems by status.
  const totalProperties = selectedPropertyId
    ? (properties?.some((p) => p.id === selectedPropertyId) ? 1 : 0)
    : properties?.length ?? 0

  const breakdown = (() => {
    if (!selectedPropertyId) {
      return {
        compliant: complianceStats?.compliant ?? 0,
        due_soon: complianceStats?.due_soon ?? 0,
        overdue: complianceStats?.overdue ?? 0,
        non_compliant: complianceStats?.non_compliant ?? 0,
      }
    }
    const acc = { compliant: 0, due_soon: 0, overdue: 0, non_compliant: 0 }
    for (const item of (complianceItems ?? []) as Array<{ status?: string }>) {
      const s = item.status as keyof typeof acc
      if (s in acc) acc[s]++
    }
    return acc
  })()

  const compliantCount = breakdown.compliant
  const upcomingVisitsCount = upcomingJobs?.filter(
    (j: JobWithRelations) => j.status === 'scheduled' || j.status === 'in_progress'
  ).length ?? 0
  const openInvoicesCount = invoices?.length ?? 0

  // Compliance breakdown for bar. Use the SUM of the breakdown buckets as the
  // denominator (not complianceItems.length) — the breakdown comes from the
  // uncapped useComplianceStats() while the items list is .limit(200)-capped, so
  // for >200-item portfolios the segment widths would otherwise sum past 100%.
  const totalCompliance =
    (breakdown.compliant + breakdown.due_soon + breakdown.overdue + breakdown.non_compliant) || 1
  const compliantPct = (breakdown.compliant / totalCompliance) * 100
  const dueSoonPct = (breakdown.due_soon / totalCompliance) * 100
  const overduePct = (breakdown.overdue / totalCompliance) * 100
  const nonCompliantPct = (breakdown.non_compliant / totalCompliance) * 100

  const nextVisits = (upcomingJobs ?? [])
    .filter((j: JobWithRelations) => j.status === 'scheduled' || j.status === 'in_progress')
    .slice(0, 5)

  if (isLoading) return <DashboardSkeleton />

  const stats = [
    { label: 'Properties', value: totalProperties, color: 'text-metric-teal' },
    { label: 'Compliant Items', value: compliantCount, color: 'text-metric-green' },
    { label: 'Upcoming Visits', value: upcomingVisitsCount, color: 'text-metric-amber' },
    { label: 'Open Invoices', value: openInvoicesCount, color: 'text-metric-violet' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title={profile?.full_name ? `Welcome, ${profile.full_name}` : 'Welcome'} />
        {welcomeMessage && (
          <p className="text-label text-text-secondary mt-2 max-w-3xl whitespace-pre-line">
            {welcomeMessage}
          </p>
        )}
      </div>

      {/* Need urgent help? CTA */}
      <div className="bg-surface-card border border-border-default rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={18} className="text-brand-500" />
          </div>
          <div>
            <h2 className="text-body font-semibold text-text-primary">Need urgent help?</h2>
            <p className="text-caption text-text-muted mt-0.5">
              Boiler down, leak, lift broken? Raise a call-out and our team will triage it.
            </p>
          </div>
        </div>
        <Link
          to="/portal/raise-call-out"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-label font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-colors whitespace-nowrap"
        >
          <AlertCircle size={14} />
          Raise a Call-Out
        </Link>
      </div>

      {/* Stat numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-surface-card border border-border-default rounded-xl px-5 py-4"
          >
            <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">
              {stat.label}
            </p>
            <p className={`text-headline font-bold ${stat.color} mt-1 leading-tight`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Portfolio Map */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-text-muted" />
            <h2 className="text-body font-semibold text-text-primary">Portfolio Map</h2>
          </div>
          <Link
            to="/portal/portfolio"
            className="text-caption font-medium text-brand-500 hover:text-brand-600 transition-colors"
          >
            Full screen →
          </Link>
        </div>
        <div className="p-3">
          <Suspense
            fallback={<SkeletonBox className="w-full rounded-lg" style={{ height: '400px' }} />}
          >
            <PortfolioMap
              properties={mapProperties}
              height="400px"
              onPropertyClick={(id) => setSelectedPropertyId(id)}
            />
          </Suspense>
        </div>
      </div>

      {/* Compliance overview */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">Compliance Overview</h2>
        </div>
        <div className="px-5 py-4">
          <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-page">
            {compliantPct > 0 && (
              <div className="bg-status-compliant transition-all" style={{ width: `${compliantPct}%` }} title={`Compliant: ${breakdown.compliant}`} />
            )}
            {dueSoonPct > 0 && (
              <div className="bg-status-due-soon transition-all" style={{ width: `${dueSoonPct}%` }} title={`Due Soon: ${breakdown.due_soon}`} />
            )}
            {overduePct > 0 && (
              <div className="bg-status-overdue transition-all" style={{ width: `${overduePct}%` }} title={`Overdue: ${breakdown.overdue}`} />
            )}
            {nonCompliantPct > 0 && (
              <div className="bg-status-non-compliant transition-all" style={{ width: `${nonCompliantPct}%` }} title={`Non-Compliant: ${breakdown.non_compliant}`} />
            )}
          </div>
          <div className="flex gap-5 mt-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-caption text-text-muted"><span className="w-2 h-2 rounded-full bg-status-compliant inline-block" /> Compliant ({breakdown.compliant})</span>
            <span className="flex items-center gap-1.5 text-caption text-text-muted"><span className="w-2 h-2 rounded-full bg-status-due-soon inline-block" /> Due Soon ({breakdown.due_soon})</span>
            <span className="flex items-center gap-1.5 text-caption text-text-muted"><span className="w-2 h-2 rounded-full bg-status-overdue inline-block" /> Overdue ({breakdown.overdue})</span>
            <span className="flex items-center gap-1.5 text-caption text-text-muted"><span className="w-2 h-2 rounded-full bg-status-non-compliant inline-block" /> Non-Compliant ({breakdown.non_compliant})</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Visits */}
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="px-5 py-4 border-b border-border-subtle">
            <h2 className="text-body font-semibold text-text-primary">Upcoming Visits</h2>
          </div>
          <div className="px-5 py-4">
            {nextVisits.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-text-muted">
                <CalendarDays size={24} strokeWidth={1.5} className="mb-1.5" />
                <p className="text-label text-text-muted">No upcoming visits scheduled</p>
              </div>
            ) : (
              <div className="space-y-0">
                {nextVisits.map((job: JobWithRelations) => (
                  <div key={job.id} className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0">
                    <div>
                      <p className="text-label font-medium text-text-secondary">{job.title}</p>
                      <p className="text-caption text-text-muted mt-0.5">{job.properties?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-label text-text-secondary">{job.scheduled_date ? formatDate(job.scheduled_date) : 'TBD'}</p>
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="px-5 py-4 border-b border-border-subtle">
            <h2 className="text-body font-semibold text-text-primary">Recent Activity</h2>
          </div>
          <div className="px-5 py-4">
            <Timeline />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const chipColor: 'default' | 'accent' | 'success' | 'warning' = (
    {
      scheduled: 'accent' as const,
      in_progress: 'warning' as const,
      completed: 'success' as const,
      cancelled: 'default' as const,
    }[status] ?? 'default'
  )
  return (
    <span className="mt-0.5 inline-block">
      <Chip variant="soft" color={chipColor} size="sm" className="capitalize">
        {status.replace('_', ' ')}
      </Chip>
    </span>
  )
}
