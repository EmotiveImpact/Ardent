// Wave 14 / Task 114 — Site portal overview page.
import { Link } from 'react-router'
import { useState } from 'react'
import { AlertCircle, ClipboardCheck, Wrench, FileText } from 'lucide-react'
import { Chip } from '@haumea/ui'
import { useAuth } from '@/hooks/use-auth'
import { KpiGridSkeleton, ListSkeleton } from '@/components/shared/skeletons'
import {
  useTenantProperty,
  useTenantJobs,
  useTenantCompliance,
} from '@/lib/site-portal/hooks'
import { useOrgBranding } from '@/lib/branding/hooks'
import { PageHeader } from '@haumea/ui'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  due: 'Due',
}

export default function SiteOverviewPage() {
  const { profile } = useAuth()
  const { data: branding } = useOrgBranding(profile?.organisation_id ?? null)
  const { data: property, isLoading: propertyLoading } = useTenantProperty()
  const { data: jobs, isLoading: jobsLoading } = useTenantJobs({ limit: 30 })
  const { data: compliance, isLoading: complianceLoading } = useTenantCompliance()
  const [now] = useState(() => Date.now())

  const welcomeMessage =
    branding?.branding_enabled && branding.portal_welcome_message
      ? branding.portal_welcome_message
      : null

  const isLoading = propertyLoading || jobsLoading || complianceLoading
  if (isLoading) {
    return (
      <div className="space-y-6">
        <KpiGridSkeleton count={4} />
        <ListSkeleton rows={5} />
      </div>
    )
  }

  const last30 = new Date(now - 30 * 86400000).toISOString()
  const recentJobsCount = (jobs ?? []).filter((j) => j.created_at >= last30).length
  const openActions = (jobs ?? []).filter(
    (j) => j.status !== 'completed' && j.status !== 'cancelled'
  )

  const total = compliance?.length ?? 0
  const compliantCount = (compliance ?? []).filter((c) => c.status === 'compliant').length
  const compliancePct = total === 0 ? 100 : Math.round((compliantCount / total) * 100)

  const recentJobs = (jobs ?? []).slice(0, 5)

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title={property?.name ?? 'Your site'} />
        <p className="text-label text-text-muted mt-1">
          {property?.clients?.name ? `${property.clients.name} · ` : ''}
          {property?.address}
        </p>
        {welcomeMessage && (
          <p className="text-label text-text-secondary mt-3 max-w-3xl whitespace-pre-line">
            {welcomeMessage}
          </p>
        )}
      </div>

      {/* Need urgent help CTA */}
      <div className="bg-surface-card border border-border-default rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={18} className="text-brand-500" />
          </div>
          <div>
            <h2 className="text-body font-semibold text-text-primary">Need help?</h2>
            <p className="text-caption text-text-muted mt-0.5">
              Boiler down, leak, lift broken? Raise a call-out and we'll triage it.
            </p>
          </div>
        </div>
        <Link
          to="/site/raise-callout"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-label font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-colors whitespace-nowrap"
        >
          <AlertCircle size={14} />
          Raise a Call-Out
        </Link>
      </div>

      {/* 3 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          icon={<ClipboardCheck size={18} className="text-status-compliant" />}
          label="Compliance"
          value={`${compliancePct}%`}
          subtext={`${compliantCount} of ${total} items compliant`}
          to="/site/compliance"
        />
        <KpiCard
          icon={<Wrench size={18} className="text-metric-amber" />}
          label="Jobs (last 30d)"
          value={String(recentJobsCount)}
          subtext={`${openActions.length} still open`}
          to="/site/visits"
        />
        <KpiCard
          icon={<FileText size={18} className="text-metric-violet" />}
          label="Open actions"
          value={String(openActions.length)}
          subtext="Visits + tasks not yet complete"
          to="/site/visits"
        />
      </div>

      {/* Recent jobs */}
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-body font-semibold text-text-primary">Recent jobs</h2>
          <Link
            to="/site/visits"
            className="text-caption font-medium text-brand-500 hover:text-brand-600 transition-colors"
          >
            View all →
          </Link>
        </div>
        <div className="px-5 py-4">
          {recentJobs.length === 0 ? (
            <p className="text-label text-text-muted text-center py-6">
              No jobs yet. Raise a call-out if you need something fixed.
            </p>
          ) : (
            <div className="space-y-0">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-label font-medium text-text-secondary truncate">
                      {job.title}
                    </p>
                    <p className="text-micro text-text-muted mt-0.5">
                      {new Date(job.created_at).toLocaleDateString()}
                      {job.scheduled_date ? ` · scheduled ${new Date(job.scheduled_date).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <Chip variant="soft" color="default" size="sm">
                    {STATUS_LABELS[job.status] ?? job.status}
                  </Chip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  subtext,
  to,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtext: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="block bg-surface-card border border-border-default rounded-xl px-5 py-4 hover:bg-surface-page transition-colors"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-surface-page flex items-center justify-center">
          {icon}
        </div>
        <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">
          {label}
        </p>
      </div>
      <p className="text-headline font-bold text-text-primary leading-tight">{value}</p>
      <p className="text-micro text-text-muted mt-0.5">{subtext}</p>
    </Link>
  )
}
