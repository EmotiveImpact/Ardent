import { useState } from 'react'
import { Skeleton } from '@haumea/ui'
import { AppCard } from '@haumea/ui'
import {
  ChevronDown,
  Minus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useComplianceScore } from '@/hooks/use-compliance-score'
import { COMPLIANCE_SCORE_WEIGHTS } from '@/lib/compliance-score/calculate'

interface BreakdownStatProps {
  label: string
  value: number
  weight: number
}

function BreakdownStat({ label, value, weight }: BreakdownStatProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tracking-tight text-text-primary">
        {value}
        <span className="ml-0.5 text-micro font-normal text-text-muted">%</span>
      </p>
      <p className="mt-0.5 text-[10px] text-text-muted">{Math.round(weight * 100)}% weight</p>
    </div>
  )
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2.5 py-1 text-caption font-medium text-text-secondary">
        <Minus size={12} strokeWidth={2.4} />
        no change
      </span>
    )
  }
  const positive = delta > 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium ${
        positive ? 'bg-status-compliant/10 text-status-compliant' : 'bg-status-overdue/10 text-status-overdue'
      }`}
    >
      {positive ? <TrendingUp size={12} strokeWidth={2.4} /> : <TrendingDown size={12} strokeWidth={2.4} />}
      {positive ? '+' : ''}
      {delta} vs yesterday
    </span>
  )
}

function scoreToneClasses(score: number): string {
  if (score >= 85) return 'text-status-compliant'
  if (score >= 70) return 'text-brand-500'
  if (score >= 50) return 'text-status-due-soon'
  return 'text-status-overdue'
}

export function DashboardComplianceScoreCard() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useComplianceScore()
  const [showCalc, setShowCalc] = useState(false)
  const [recomputing, setRecomputing] = useState(false)

  const canRecompute = profile?.role === 'org_admin' || profile?.role === 'super_admin'

  const handleRecompute = async () => {
    if (!profile?.organisation_id) return
    setRecomputing(true)
    try {
      const { data: resp, error } = await supabase.functions.invoke('compute-compliance-scores', {
        body: { organisation_ids: [profile.organisation_id] },
      })
      if (error) throw error
      if (resp?.error) throw new Error(resp.error)
      await queryClient.invalidateQueries({ queryKey: ['compliance-score'] })
      toast.success('Compliance score refreshed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not recompute score')
    } finally {
      setRecomputing(false)
    }
  }

  return (
    <AppCard padding="lg" className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(560px circle at 12% 0%, rgba(20,184,154,0.10), transparent 55%), radial-gradient(420px circle at 100% 100%, rgba(20,184,154,0.06), transparent 60%)',
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-caption font-medium uppercase tracking-[0.08em] text-brand-500 whitespace-nowrap">
              <Sparkles size={12} strokeWidth={2.4} className="shrink-0" />
              Compliance Score
            </p>
            <p className="mt-1 text-label text-text-secondary">
              Your single, daily measure of operational compliance health.
            </p>
          </div>
          {canRecompute && data ? (
            <button
              type="button"
              onClick={handleRecompute}
              disabled={recomputing}
              title={recomputing ? 'Recomputing…' : 'Recompute compliance score'}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-default bg-surface-elevated text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Recompute compliance score"
            >
              <RefreshCcw size={14} className={recomputing ? 'animate-spin' : ''} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-16 w-40" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        ) : !data ? (
          <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-dashed border-border-default bg-surface-elevated/60 px-4 py-5">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-500/10 text-brand-500">
              <ShieldCheck size={18} strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-body font-semibold text-text-primary">
                Score will appear here after your first daily snapshot
              </p>
              <p className="mt-0.5 text-caption text-text-muted">
                The score runs automatically each day. Once the first run lands, you&apos;ll see today&apos;s number, the delta vs yesterday, and the four sub-metrics that produced it.
              </p>
            </div>
            {canRecompute ? (
              <button
                type="button"
                onClick={handleRecompute}
                disabled={recomputing}
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-card px-2.5 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw size={12} className={recomputing ? 'animate-spin' : ''} strokeWidth={2.2} />
                {recomputing ? 'Computing...' : 'Compute first snapshot now'}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-3">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-[60px] font-semibold leading-none tracking-[-0.04em] ${scoreToneClasses(data.score)}`}
                  aria-label={`Compliance score ${data.score} out of 100`}
                >
                  {data.score}
                </span>
                <span className="text-[16px] font-medium text-text-muted">/ 100</span>
              </div>
              <div className="flex flex-col gap-1">
                <DeltaPill delta={data.deltaVsYesterday} />
                <span className="text-micro text-text-muted">Last updated {data.lastUpdated}</span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <BreakdownStat label="Compliance" value={data.breakdown.compliance} weight={COMPLIANCE_SCORE_WEIGHTS.compliance} />
              <BreakdownStat label="PPM on time" value={data.breakdown.ppm_on_time} weight={COMPLIANCE_SCORE_WEIGHTS.ppm_on_time} />
              <BreakdownStat label="Pass rate" value={data.breakdown.pass_rate} weight={COMPLIANCE_SCORE_WEIGHTS.pass_rate} />
              <BreakdownStat label="Action health" value={data.breakdown.action_health} weight={COMPLIANCE_SCORE_WEIGHTS.action_health} />
            </div>
          </>
        )}

        <div className="mt-4 border-t border-border-subtle pt-3">
          <button
            type="button"
            onClick={() => setShowCalc((s) => !s)}
            className="flex items-center gap-1 text-caption font-medium text-text-accent transition-opacity hover:opacity-80"
            aria-expanded={showCalc}
          >
            <ChevronDown size={12} className={`transition-transform ${showCalc ? 'rotate-180' : ''}`} />
            How is this calculated?
          </button>
          {showCalc ? (
            <ul className="mt-2 space-y-1 text-caption text-text-secondary">
              <li><strong>Compliance ({Math.round(COMPLIANCE_SCORE_WEIGHTS.compliance * 100)}%)</strong> - share of compliance items currently in compliant or due soon status.</li>
              <li><strong>PPM on time ({Math.round(COMPLIANCE_SCORE_WEIGHTS.ppm_on_time * 100)}%)</strong> - share of PPM jobs in the last 90 days completed on or before their scheduled date.</li>
              <li><strong>Pass rate ({Math.round(COMPLIANCE_SCORE_WEIGHTS.pass_rate * 100)}%)</strong> - share of completed jobs (last 90 days) with outcome = pass.</li>
              <li><strong>Action health ({Math.round(COMPLIANCE_SCORE_WEIGHTS.action_health * 100)}%)</strong> - 100 minus 5 points per open critical action older than 7 days, floored at 0.</li>
              <li className="pt-1 text-text-muted">The headline is the weighted average of all four, rounded to the nearest whole number. A new snapshot is recorded once per day.</li>
            </ul>
          ) : null}
        </div>
      </div>
    </AppCard>
  )
}
