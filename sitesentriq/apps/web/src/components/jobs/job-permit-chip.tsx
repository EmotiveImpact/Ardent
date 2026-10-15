// Header chip for flagged permit-to-work jobs (00121, W3-T10).
// Renders nothing unless the job requires a permit.

import { Chip } from '@haumea/ui'
import { FileBadge } from 'lucide-react'
import { useJobPermits } from '@/hooks/use-permits'
import { permitChipState } from '@/lib/permits'

export function JobPermitChip({ jobId, requiresPermit }: { jobId: string; requiresPermit?: boolean }) {
  const { data: permits = [] } = useJobPermits(requiresPermit ? jobId : undefined)
  if (!requiresPermit) return null
  const chip = permitChipState(permits)
  return (
    <Chip variant="soft" color={chip.color} size="sm">
      <span className="inline-flex items-center gap-1">
        <FileBadge size={11} aria-hidden />
        {chip.label}
      </span>
    </Chip>
  )
}
