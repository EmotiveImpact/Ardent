// Wave 14 / Task 114 — Site portal: recent visits list.
// B9 (May 2026) — surface a downloadable link for each service report
// so site leads can pull the signed copy + any PDF the engineer uploaded.
// Previously the report was visible but not actionable from this page.
import { Chip } from '@haumea/ui'
import { Calendar, Download, FileText } from 'lucide-react'
import { useTenantJobs, useTenantServiceReports, useTenantDocuments, signTenantFile } from '@/lib/site-portal/hooks'
import { toast } from 'sonner'

async function openSignedTenantFile(kind: 'document' | 'service_report', id: string) {
  const url = await signTenantFile(kind, id)
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
  else toast.error('Could not open the file — please try again.')
}
import { formatDate } from '@haumea/utils'
import { ListSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

const STATUS_CHIP_COLOR: Record<string, 'default' | 'accent' | 'success' | 'warning'> = {
  completed: 'success',
  scheduled: 'accent',
  in_progress: 'warning',
  pending: 'default',
}

export default function SiteVisitsPage() {
  const { data: jobs, isLoading } = useTenantJobs({ limit: 100 })
  const { data: reports } = useTenantServiceReports()
  // Engineers often attach the full PDF report as a Document with job_id
  // set, so cross-reference per-job here. service_reports.signature_url is
  // the only file URL on the report row itself.
  const { data: documents } = useTenantDocuments()

  if (isLoading) {
    return <ListSkeleton rows={6} />
  }

  const reportsByJob = new Map<string, typeof reports>()
  for (const r of reports ?? []) {
    const arr = reportsByJob.get(r.job_id) ?? []
    arr.push(r as never)
    reportsByJob.set(r.job_id, arr)
  }

  // Group job-scoped documents by job_id so we can surface them inline
  // with each visit. Property-level / asset-level docs live on the
  // dedicated Documents page already.
  const jobDocsByJob = new Map<string, typeof documents>()
  for (const d of documents ?? []) {
    if (!d.job_id) continue
    const arr = jobDocsByJob.get(d.job_id) ?? []
    arr.push(d as never)
    jobDocsByJob.set(d.job_id, arr)
  }

  const visible = jobs ?? []
  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Visits" subtitle="Recent activity at your site, including service reports." />
      </div>

      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-body font-semibold text-text-primary">
            All visits ({visible.length})
          </h2>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-text-muted">
            <Calendar size={32} strokeWidth={1.5} className="mb-2" />
            <p className="text-label">No visits recorded yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {visible.map((job) => {
              const visitReports = reportsByJob.get(job.id) ?? []
              const visitDocs = jobDocsByJob.get(job.id) ?? []
              return (
                <li key={job.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-label font-medium text-text-primary">
                        {job.title}
                      </p>
                      {job.description && (
                        <p className="text-caption text-text-muted mt-0.5 max-w-prose">
                          {job.description}
                        </p>
                      )}
                      <div className="text-micro text-text-muted mt-1.5 flex flex-wrap gap-x-3">
                        <span>Raised {formatDate(job.created_at)}</span>
                        {job.scheduled_date && (
                          <span>· Scheduled {formatDate(job.scheduled_date)}</span>
                        )}
                        {job.completed_date && (
                          <span>· Completed {formatDate(job.completed_date)}</span>
                        )}
                      </div>
                      {visitReports.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {visitReports.map((r: any) => {
                            // signature_url is a RAW path in a PRIVATE bucket, so
                            // we can't link it directly — sign on click via the
                            // sign-tenant-file edge function (tenant-RLS-checked).
                            const hasFile = !!(r.signature_url as string | undefined)
                            return (
                              <li
                                key={r.id}
                                className="text-micro inline-flex items-center gap-1.5 flex-wrap"
                              >
                                <FileText size={11} className="text-text-muted" />
                                <span className="text-text-secondary">
                                  Service report · {formatDate(r.submitted_at)}
                                </span>
                                {r.outcome && (
                                  <Chip
                                    variant="soft"
                                    size="sm"
                                    color={
                                      r.outcome === 'pass'
                                        ? 'success'
                                        : r.outcome === 'fail'
                                        ? 'danger'
                                        : 'warning'
                                    }
                                  >
                                    {r.outcome}
                                  </Chip>
                                )}
                                {hasFile && (
                                  <button
                                    type="button"
                                    onClick={() => openSignedTenantFile('service_report', r.id)}
                                    aria-label={`Download signed service report from ${formatDate(r.submitted_at)}`}
                                    className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                                  >
                                    <Download size={11} /> Download
                                  </button>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      {visitDocs.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {visitDocs.map((d: any) => (
                            <li
                              key={d.id}
                              className="text-micro inline-flex items-center gap-1.5 flex-wrap"
                            >
                              <FileText size={11} className="text-text-muted" />
                              <button
                                type="button"
                                onClick={() => openSignedTenantFile('document', d.id)}
                                aria-label={`Download document ${d.name}`}
                                className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                              >
                                <Download size={11} /> {d.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <Chip
                      variant="soft"
                      color={STATUS_CHIP_COLOR[job.status] ?? 'default'}
                      size="sm"
                      className="whitespace-nowrap"
                    >
                      {job.status.replace(/_/g, ' ')}
                    </Chip>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
