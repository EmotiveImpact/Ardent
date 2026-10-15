import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AppCard, FormSelect } from '@haumea/ui'
import { Link2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useUpdateJob } from '@/hooks/use-jobs'

type LinkJob = { id: string; job_number: string | null; title: string; status?: string }

/**
 * Linked Tasks (V1 #3) — shows this job's parent task (if any) and its child
 * tasks (e.g. defect/remedial jobs raised from it), and lets you link it to a
 * parent. Parent candidates are other jobs at the same property.
 */
export function JobLinkedTasks({
  jobId,
  propertyId,
  parentJobId,
}: {
  jobId: string
  propertyId?: string | null
  parentJobId?: string | null
}) {
  const updateJob = useUpdateJob()

  const { data: children } = useQuery({
    queryKey: ['jobs', 'children', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, title, status')
        .eq('parent_job_id', jobId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as LinkJob[]
    },
  })

  const { data: parent } = useQuery({
    queryKey: ['jobs', 'parent', parentJobId],
    enabled: !!parentJobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, title')
        .eq('id', parentJobId!)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as LinkJob | null
    },
  })

  const { data: candidates } = useQuery({
    queryKey: ['jobs', 'link-candidates', propertyId, jobId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_number, title')
        .eq('property_id', propertyId!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []).filter((j) => j.id !== jobId) as LinkJob[]
    },
  })

  const setParent = (value: string) =>
    updateJob.mutate({ id: jobId, parent_job_id: value || null } as Parameters<typeof updateJob.mutate>[0])

  const label = (j: LinkJob) => `${j.job_number ? `${j.job_number} · ` : ''}${j.title}`

  return (
    <AppCard padding="md">
      <div className="flex items-center gap-2 mb-4">
        <Link2 size={16} className="text-text-muted" />
        <h2 className="text-body font-semibold text-text-primary">Linked Tasks</h2>
      </div>

      {/* Parent */}
      <div className="mb-4">
        <p className="text-caption font-medium uppercase tracking-[0.04em] text-text-muted mb-1.5">Parent Task</p>
        {parent ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border-default bg-surface-page px-3 py-2">
            <Link to={`/dashboard/jobs/${parent.id}`} className="text-label text-text-accent hover:underline truncate">
              {label(parent)}
            </Link>
            <button
              onClick={() => setParent('')}
              className="p-1 rounded hover:bg-surface-card text-text-muted hover:text-status-overdue transition-colors shrink-0"
              title="Unlink parent"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <FormSelect
            ariaLabel="Link to parent task"
            placeholder="Link to a parent task…"
            value={undefined}
            onChange={(v) => setParent(v)}
            options={(candidates ?? []).map((j) => ({ value: j.id, label: label(j) }))}
          />
        )}
      </div>

      {/* Children */}
      <div>
        <p className="text-caption font-medium uppercase tracking-[0.04em] text-text-muted mb-1.5">Sub-tasks</p>
        {children && children.length > 0 ? (
          <ul className="space-y-1.5">
            {children.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/dashboard/jobs/${c.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-default bg-surface-page px-3 py-2 hover:bg-surface-elevated transition-colors"
                >
                  <span className="text-label text-text-secondary truncate">{label(c)}</span>
                  {c.status && (
                    <span className="text-caption text-text-muted shrink-0">{c.status.replace(/_/g, ' ')}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-label text-text-muted">No sub-tasks linked to this job.</p>
        )}
      </div>
    </AppCard>
  )
}
