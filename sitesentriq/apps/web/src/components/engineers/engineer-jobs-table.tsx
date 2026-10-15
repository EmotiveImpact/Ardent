import { Link } from 'react-router'
import { Chip } from '@haumea/ui'
import { AppCard } from '@haumea/ui'

import { formatDate } from '@haumea/utils'

export interface EngineerJobHistory {
  id: string
  title: string
  scheduled_date?: string | null
  status?: string | null
  outcome?: string | null
  properties?: { name?: string | null } | null
}

export function EngineerJobsTable({ jobs }: { jobs: EngineerJobHistory[] }) {
  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table aria-label="Job history" className="w-full">
            <thead><tr>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Job Title</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Property</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Date</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Status</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Outcome</th>
            </tr></thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} id={job.id} className="border-b border-border-default transition-colors last:border-0 hover:bg-surface-page/50">
                  <td className="px-4 py-3">
                    <Link to={`/dashboard/jobs/${job.id}`} className="text-label font-medium text-brand-500 transition-colors hover:text-brand-600">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-label text-text-secondary">{job.properties?.name || '-'}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">{job.scheduled_date ? formatDate(job.scheduled_date) : '-'}</td>
                  <td className="px-4 py-3">
                    <Chip
                      variant="soft"
                      color={job.status === 'completed' ? 'success' : job.status === 'scheduled' ? 'accent' : job.status === 'in_progress' ? 'warning' : job.status === 'failed_access' ? 'danger' : 'default'}
                      size="sm"
                    >
                      {(job.status || '').replace(/_/g, ' ')}
                    </Chip>
                  </td>
                  <td className="px-4 py-3">
                    {job.outcome ? (
                      <Chip
                        variant="soft"
                        color={job.outcome === 'pass' ? 'success' : job.outcome === 'fail' ? 'danger' : job.outcome === 'incomplete' ? 'warning' : 'default'}
                        size="sm"
                      >
                        {job.outcome === 'n_a' ? 'N/A' : job.outcome}
                      </Chip>
                    ) : (
                      <span className="text-label text-text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>
    </AppCard>
  )
}
