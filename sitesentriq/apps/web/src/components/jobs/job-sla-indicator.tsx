// Live SLA countdown chip for the job header (00117, W2-T6). Ticks once a
// minute — countdown granularity is minutes, so anything faster is waste.

import { useEffect, useState } from 'react'
import { Chip } from '@haumea/ui'
import { Timer } from 'lucide-react'
import { slaState, formatCountdown, SLA_STATE_LABEL, SLA_STATE_COLOR, type SlaJobFields } from '@/lib/contract-sla'

export function JobSlaIndicator({ job }: { job: SlaJobFields }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const state = slaState(job, now)
  if (state === 'no_sla') return null

  let detail: string | null = null
  if (state === 'on_track' || state === 'at_risk') {
    if (job.sla_response_met_at == null && job.target_response_at) {
      detail = `respond in ${formatCountdown(job.target_response_at, now)}`
    } else if (job.target_fix_at) {
      detail = `fix in ${formatCountdown(job.target_fix_at, now)}`
    }
  } else if (state === 'fix_breached' && job.target_fix_at && !job.sla_fix_met_at) {
    detail = formatCountdown(job.target_fix_at, now)
  }

  return (
    <Chip variant="soft" color={SLA_STATE_COLOR[state]} size="sm">
      <span className="inline-flex items-center gap-1">
        <Timer size={11} aria-hidden />
        {SLA_STATE_LABEL[state]}
        {detail ? <span className="opacity-80">· {detail}</span> : null}
      </span>
    </Chip>
  )
}
