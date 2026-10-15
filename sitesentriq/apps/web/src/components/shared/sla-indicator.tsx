// SLA indicator — reusable chip / breakdown for jobs.
//
// `compact` mode: a single small chip. Worst-leg state, with a one-liner
// time string ("2h 15m left" / "breached 47m ago").
// Full mode: 2-row breakdown (Response / Completion) with target timestamps,
// chips, and a small progress meter.

import { motion } from 'framer-motion'
import { Chip } from '@haumea/ui'
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  getSlaStatus,
  worstLegState,
  formatRemaining,
  type SlaJobLike,
  type SlaPolicy,
  type SlaState,
} from '@/lib/sla'

interface Props {
  job: SlaJobLike
  policy?: SlaPolicy | null
  compact?: boolean
}

const STATE_COLOR: Record<SlaState, 'success' | 'warning' | 'danger' | 'default' | 'accent'> = {
  met: 'success',
  pending: 'accent',
  at_risk: 'warning',
  breached: 'danger',
  no_policy: 'default',
}

const STATE_LABEL: Record<SlaState, string> = {
  met: 'Met',
  pending: 'On track',
  at_risk: 'At risk',
  breached: 'Breached',
  no_policy: 'No SLA',
}

// Wave G1 — leading icon per state so the chip carries a non-color signal
// (colour-blind users + SR readers still pick up severity from the glyph).
function StateIcon({ state }: { state: SlaState }) {
  if (state === 'breached') return <AlertTriangle size={11} aria-hidden />
  if (state === 'met') return <CheckCircle2 size={11} aria-hidden />
  return <Clock size={11} aria-hidden />
}

export function SlaIndicator({ job, policy, compact = false }: Props) {
  const status = getSlaStatus(job, policy ?? undefined)
  const worst = worstLegState(status)
  const hasAnyTarget =
    job.response_target_at != null || job.completion_target_at != null

  // Compact mode — one chip.
  if (compact) {
    if (!hasAnyTarget) {
      return (
        <Chip variant="soft" color="default" size="sm">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            No SLA
          </span>
        </Chip>
      )
    }
    // Pick the leg that's actually relevant: completion if it's already met or
    // job is completed, otherwise show the in-flight leg.
    const isCompleted = job.status === 'completed'
    const showResponse =
      !isCompleted && status.response !== 'met' && status.response !== 'no_policy'
    const remaining = showResponse
      ? status.responseRemaining
      : status.completionRemaining

    return (
      <Chip variant="soft" color={STATE_COLOR[worst]} size="sm">
        <span className="inline-flex items-center gap-1">
          {worst === 'breached' ? (
            <AlertTriangle size={11} />
          ) : worst === 'met' ? (
            <CheckCircle2 size={11} />
          ) : (
            <Clock size={11} />
          )}
          {STATE_LABEL[worst]}
          {remaining != null && worst !== 'no_policy' && (
            <span className="text-text-muted">· {formatRemaining(remaining)}</span>
          )}
        </span>
      </Chip>
    )
  }

  // Full mode — 2-row breakdown.
  return (
    <div className="space-y-3">
      {!hasAnyTarget ? (
        <div className="flex items-center gap-2 text-caption text-text-muted">
          <Clock size={13} />
          No SLA policy applied to this job.
        </div>
      ) : (
        <>
          <SlaLegRow
            label="Response"
            target={job.response_target_at ?? null}
            actual={job.response_at ?? null}
            state={status.response}
            remaining={status.responseRemaining}
          />
          <SlaLegRow
            label="Completion"
            target={job.completion_target_at ?? null}
            actual={
              job.status === 'completed' ? job.completed_date ?? null : null
            }
            state={status.completion}
            remaining={status.completionRemaining}
          />
        </>
      )}
      {policy && (
        <p className="text-micro text-text-muted">
          Policy: <span className="text-text-secondary">{policy.name}</span>
          {policy.business_hours_only && ' · business hours only'}
        </p>
      )}
    </div>
  )
}

function SlaLegRow({
  label,
  target,
  actual,
  state,
  remaining,
}: {
  label: string
  target: string | null
  actual: string | null
  state: SlaState
  remaining: number | null
}) {
  if (!target) {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] w-24">
          {label}
        </span>
        <span className="text-caption text-text-muted">—</span>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] w-24">
          {label}
        </span>
        <Chip variant="soft" color={STATE_COLOR[state]} size="sm">
          <span className="inline-flex items-center gap-1">
            <StateIcon state={state} />
            {STATE_LABEL[state]}
          </span>
        </Chip>
      </div>
      <div className="flex items-center justify-between gap-3 text-caption">
        <span className="text-text-muted">
          target {formatTs(target)}
          {actual && (
            <>
              {' · '}
              <span className="text-text-secondary">
                {state === 'breached' ? 'late' : 'done'} {formatTs(actual)}
              </span>
            </>
          )}
        </span>
        <span
          className={
            state === 'breached'
              ? 'text-status-overdue font-medium'
              : state === 'at_risk'
                ? 'text-status-due-soon font-medium'
                : 'text-text-secondary'
          }
        >
          {formatRemaining(remaining)}
        </span>
      </div>
      {state !== 'no_policy' && state !== 'met' && (
        <SlaProgressBar state={state} remaining={remaining} target={target} />
      )}
    </div>
  )
}

function SlaProgressBar({
  state,
  remaining,
  target,
}: {
  state: SlaState
  remaining: number | null
  target: string
}) {
  // Fill = clamped 0..100. Heuristic: 100% when remaining ≤ 0 (breached);
  // otherwise show how much of the assumed window has been consumed.
  let pct = 0
  if (remaining != null) {
    const targetTs = Date.parse(target)
    if (!Number.isNaN(targetTs)) {
      // assume the SLA window is `remaining + (windowEstimate)`. We don't have
      // start time on the job row; fall back to 24h window estimate so the bar
      // is visually meaningful even without context.
      const estimateWindowMin = Math.max(60, Math.abs(remaining) * 5)
      const consumed = estimateWindowMin - remaining
      pct = Math.max(0, Math.min(100, (consumed / estimateWindowMin) * 100))
    }
  }
  const barColor =
    state === 'breached'
      ? 'bg-status-overdue'
      : state === 'at_risk'
        ? 'bg-status-due-soon'
        : 'bg-brand-500'
  return (
    <div className="h-1 rounded-full bg-surface-page overflow-hidden">
      <motion.div
        className={`h-full ${barColor}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}

function formatTs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  // Compact local form: "26 Apr 14:32"
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
