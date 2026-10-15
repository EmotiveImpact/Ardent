import { Link } from 'react-router'
import { Chip, Button } from '@haumea/ui'
import { ClipboardList, BarChart3, ChevronRight, Wrench, Plus, Star, Globe2 } from 'lucide-react'
import { useReports } from '@/hooks/use-reports'
import { useReportTemplates } from '@/lib/reports/templates'
import { useAuthContext } from '@/contexts/auth-context'
import { formatDate } from '@haumea/utils'
import { getDataset } from '@/lib/reports/datasets'
import type { ServiceReportWithRelations } from '@haumea/types'
import { TableSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

export default function ReportsPage() {
  const { data: reports, isLoading } = useReports()
  const { data: templates } = useReportTemplates()
  const { profile } = useAuthContext()

  const myTemplates = (templates ?? []).filter((t) => !t.is_system && t.created_by_user_id === profile?.id)
  const orgTemplates = (templates ?? []).filter((t) => t.is_org_wide || t.is_system)

  return (
    <div className="space-y-6">
      <PageHeader title="Service Reports" />

      {/* Advanced Reports Card */}
      <Link
        to="/dashboard/reports/advanced"
        className="block bg-surface-card border border-border-default rounded-xl p-5 hover:border-border-strong hover:shadow-md transition-all group"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
            <BarChart3 size={22} strokeWidth={1.5} className="text-text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary group-hover:text-text-accent transition-colors">
              Advanced Reports
            </h2>
            <p className="text-label text-text-muted mt-0.5">
              Per-engineer, per-client, and compliance analytics with CSV export
            </p>
          </div>
          <ChevronRight size={18} className="text-text-muted group-hover:text-text-primary transition-colors flex-shrink-0" />
        </div>
      </Link>

      {/* Custom report builder + saved templates */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
              <Wrench size={18} strokeWidth={1.5} className="text-text-accent" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Custom Reports</h2>
              <p className="text-caption text-text-muted">Drag-drop builder for ad-hoc reports across any dataset</p>
            </div>
          </div>
          <Button asChild variant="primary" size="sm">
            <Link to="/dashboard/reports/builder">
              <Plus size={14} /> New custom report
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-subtle">
          <div className="p-4">
            <div className="flex items-center gap-1.5 mb-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
              <Star size={11} /> My saved reports
            </div>
            {myTemplates.length === 0 ? (
              <p className="text-caption text-text-muted">You haven't saved any reports yet.</p>
            ) : (
              <ul className="space-y-1">
                {myTemplates.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/dashboard/reports/builder?template=${t.id}`}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-surface-page group"
                    >
                      <div className="min-w-0">
                        <div className="text-label font-medium text-text-primary truncate group-hover:text-text-accent transition-colors">{t.name}</div>
                        <div className="text-micro text-text-muted truncate">{getDataset(t.dataset)?.label ?? t.dataset}</div>
                      </div>
                      <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5 mb-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">
              <Globe2 size={11} /> Org-wide & built-in
            </div>
            {orgTemplates.length === 0 ? (
              <p className="text-caption text-text-muted">No shared templates yet.</p>
            ) : (
              <ul className="space-y-1">
                {orgTemplates.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/dashboard/reports/builder?template=${t.id}`}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-surface-page group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-label font-medium text-text-primary truncate group-hover:text-text-accent transition-colors">{t.name}</span>
                          {t.is_system && (
                            <Chip size="sm" variant="soft" color="default">Built-in</Chip>
                          )}
                        </div>
                        <div className="text-micro text-text-muted truncate">{t.description ?? getDataset(t.dataset)?.label ?? t.dataset}</div>
                      </div>
                      <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={5} showHeader={false} showSearch={false} />
      ) : !reports?.length ? (
        <div className="bg-surface-card border border-border-default rounded-xl p-5">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
              <ClipboardList size={24} strokeWidth={1.5} className="text-text-muted" />
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">No service reports yet</h2>
            <p className="text-label text-text-muted">
              Reports are automatically created when engineers complete jobs.
            </p>
          </div>
        </div>
      ) : (
        <table aria-label="Service Reports" className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <thead><tr>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Job Title</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Engineer</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Outcome</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Submitted</th>
              <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
            </tr></thead>
            <tbody>
              {reports.map((report: ServiceReportWithRelations) => (
                <tr key={report.id} id={report.id} className="border-b border-border-subtle hover:bg-surface-page">
                  <td className="px-4 py-3 text-label font-medium text-text-primary">
                    {report.jobs?.title || 'Untitled Job'}
                  </td>
                  <td className="px-4 py-3 text-label text-text-secondary">
                    {report.jobs?.properties?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-label text-text-secondary">
                    {report.profiles?.full_name || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {report.outcome ? (
                      <Chip
                        variant="soft"
                        color={report.outcome === 'pass' ? 'success' : report.outcome === 'fail' ? 'danger' : 'warning'}
                        size="sm"
                      >
                        {report.outcome.charAt(0).toUpperCase() + report.outcome.slice(1)}
                      </Chip>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-label text-text-secondary">
                    {report.submitted_at ? formatDate(report.submitted_at) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/dashboard/reports/${report.id}`}
                      className="text-label font-medium text-navy-950 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      )}
    </div>
  )
}
