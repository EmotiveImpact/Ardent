import { AppCard, FormSelect } from '@haumea/ui'
import { Tag } from 'lucide-react'
import { SERVICE_GROUPS } from '@/lib/constants'
import { useUpdateJob } from '@/hooks/use-jobs'

/**
 * Per-job Service Group editor (V1 #4) so existing jobs can be categorised —
 * the new-job form sets it on create; this lets the office set/change it on any
 * job from the detail page.
 */
export function JobServiceGroup({ jobId, value }: { jobId: string; value?: string | null }) {
  const updateJob = useUpdateJob()
  return (
    <AppCard padding="md">
      <div className="flex items-center gap-2 mb-3">
        <Tag size={16} className="text-text-muted" />
        <h2 className="text-body font-semibold text-text-primary">Service Group</h2>
      </div>
      <FormSelect
        ariaLabel="Service Group"
        placeholder="Select a service group…"
        clearable
        value={value ?? undefined}
        onChange={(v) =>
          updateJob.mutate({ id: jobId, service_group: v || null } as Parameters<typeof updateJob.mutate>[0])
        }
        options={SERVICE_GROUPS.map((g) => ({ value: g, label: g }))}
      />
    </AppCard>
  )
}
