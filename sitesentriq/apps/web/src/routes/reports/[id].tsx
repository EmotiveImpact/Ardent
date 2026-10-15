import { useParams, Link } from 'react-router'
import { Chip } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { ArrowLeft, FileText } from 'lucide-react'
import { useReport } from '@/hooks/use-reports'
import { formatDate } from '@haumea/utils'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { DetailPageSkeleton } from '@/components/shared/skeletons'

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: report, isLoading } = useReport(id || '')

  if (isLoading) {
    return <DetailPageSkeleton withTabs={false} />
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <Link to="/dashboard/reports" className="inline-flex items-center gap-1 text-caption text-text-muted hover:text-text-secondary">
          <ArrowLeft size={14} /> Back to Reports
        </Link>
        <AppCard padding="md">
          <div className="flex flex-col items-center justify-center py-12">
            <FileText size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
            <p className="text-label text-text-muted">Report not found.</p>
          </div>
        </AppCard>
      </div>
    )
  }

  const checklist = report.checklist as { checked?: boolean; label?: string; name?: string }[] | null

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Reports', path: '/dashboard/reports' },
        { label: report.jobs?.title || 'Service Report' },
      ]} />

      <PageHeader title={`Report:${report.jobs?.title || 'Service Report'}`} />

      {/* Details */}
      <AppCard padding="md">
        <h2 className="text-body font-semibold text-text-primary mb-4">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Engineer</dt>
            <dd className="text-label text-text-secondary mt-0.5">{report.profiles?.full_name || '-'}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Email</dt>
            <dd className="text-label text-text-secondary mt-0.5">{report.profiles?.email || '-'}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Property</dt>
            <dd className="text-label text-text-secondary mt-0.5">{report.jobs?.properties?.name || '-'}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Address</dt>
            <dd className="text-label text-text-secondary mt-0.5">{report.jobs?.properties?.address || '-'}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Submitted</dt>
            <dd className="text-label text-text-secondary mt-0.5">
              {report.submitted_at ? formatDate(report.submitted_at) : '-'}
            </dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Outcome</dt>
            <dd className="mt-0.5">
              {report.outcome ? (
                <Chip
                  variant="soft"
                  color={
                    report.outcome === 'pass'
                      ? 'success'
                      : report.outcome === 'fail'
                        ? 'danger'
                        : 'warning'
                  }
                  size="sm"
                >
                  {report.outcome.charAt(0).toUpperCase() + report.outcome.slice(1)}
                </Chip>
              ) : (
                '-'
              )}
            </dd>
          </div>
        </dl>
      </AppCard>

      {/* Job Description */}
      {report.jobs?.description && (
        <AppCard padding="md">
          <h2 className="text-body font-semibold text-text-primary mb-4">Job Description</h2>
          <p className="text-label text-text-secondary whitespace-pre-wrap">{report.jobs.description}</p>
        </AppCard>
      )}

      {/* Notes */}
      <AppCard padding="md">
        <h2 className="text-body font-semibold text-text-primary mb-4">Notes</h2>
        {report.notes ? (
          <p className="text-label text-text-secondary whitespace-pre-wrap">{report.notes}</p>
        ) : (
          <p className="text-label text-text-muted">No notes recorded.</p>
        )}
      </AppCard>

      {/* Checklist */}
      {checklist && Array.isArray(checklist) && checklist.length > 0 && (
        <AppCard padding="md">
          <h2 className="text-body font-semibold text-text-primary mb-4">Checklist</h2>
          <ul className="space-y-2">
            {checklist.map((item: { checked?: boolean; label?: string; name?: string }, index: number) => (
              <li key={index} className="flex items-center gap-2">
                <span className={`w-5 h-5 flex items-center justify-center rounded border text-micro ${
                  item.checked
                    ? 'bg-status-compliant/10 border-status-compliant text-status-compliant'
                    : 'border-border-default'
                }`}>
                  {item.checked ? '✓' : ''}
                </span>
                <span className={`text-label ${item.checked ? 'text-text-secondary' : 'text-text-muted'}`}>
                  {item.label || item.name || JSON.stringify(item)}
                </span>
              </li>
            ))}
          </ul>
        </AppCard>
      )}

      {/* Signature */}
      <AppCard padding="md">
        <h2 className="text-body font-semibold text-text-primary mb-4">Signature</h2>
        {report.signature_url ? (
          <img
            src={report.signature_url}
            alt="Signature"
            className="max-w-xs border border-border-default rounded-lg"
          />
        ) : (
          <p className="text-label text-text-muted">No signature recorded.</p>
        )}
      </AppCard>
    </div>
  )
}
